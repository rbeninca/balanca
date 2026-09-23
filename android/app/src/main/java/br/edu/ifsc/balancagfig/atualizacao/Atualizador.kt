package br.edu.ifsc.balancagfig.atualizacao

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/** Acesso à rede — HttpURLConnection no app, simulado nos testes. */
interface Rede {
    fun obterTexto(url: String): String
    /** Baixa [url] em [destino], chamando [progresso] com (bytes, total ou -1). */
    fun baixar(url: String, destino: File, progresso: (Long, Long) -> Unit)
    /**
     * POST de [corpoJson] em [url], com [chave] no cabeçalho `X-Chave`.
     * Devolve o corpo da resposta (2xx) ou lança — quem chama decide se a falha
     * importa.
     */
    fun publicar(url: String, corpoJson: String, chave: String): String?
}

/** Instala um APK por cima do app. Se der certo o processo é morto pelo Android. */
interface Instalador {
    /** Devolve null em sucesso ou a mensagem de erro. */
    fun instalar(apk: File): String?
}

/** Persistência do estado entre reinícios (SharedPreferences no app). */
interface Armazem {
    fun ler(): String?
    fun gravar(json: String)
}

/**
 * A versão-teto desta instalação, vinda do painel — até onde o box pode ir.
 *
 * `null` é "sem teto", e é também a resposta para todo problema (painel
 * desligado, fora do ar, valor estranho): quem não sabe de alvo nenhum segue o
 * caminho de sempre.
 */
interface FonteAlvo {
    fun alvo(): Versao?
}

enum class Fase { OCIOSA, VERIFICANDO, BAIXANDO, CONFERINDO, INSTALANDO, CONCLUIDA, ERRO }

/**
 * Estado do atualizador. `plano` é a cadeia de versões a percorrer e `indice`
 * o passo atual; fica gravado para retomar depois que o app é reinstalado.
 */
data class EstadoAtualizacao(
    val fase: Fase = Fase.OCIOSA,
    val disponiveis: List<Release> = emptyList(),
    val plano: List<Release> = emptyList(),
    val indice: Int = 0,
    val progresso: Int = 0,
    val erro: String? = null,
    val verificadoEm: Long? = null,
    /** Versão de onde a atualização partiu, para mostrar "de X para Y". */
    val versaoInicial: String? = null,
) {
    val passoAtual: Release? get() = plano.getOrNull(indice)
    val emExecucao: Boolean get() = fase == Fase.BAIXANDO || fase == Fase.CONFERINDO || fase == Fase.INSTALANDO

    fun paraJson(versaoInstalada: Versao): JSONObject = JSONObject()
        .put("instalada", versaoInstalada.toString())
        .put("fase", fase.name.lowercase())
        .put("disponiveis", JSONArray(disponiveis.map { it.paraJson() }))
        .put("plano", JSONArray(plano.map { it.paraJson() }))
        .put("indice", indice)
        .put("progresso", progresso)
        .put("erro", erro ?: JSONObject.NULL)
        .put("verificado_em", verificadoEm ?: JSONObject.NULL)
        .put("versao_inicial", versaoInicial ?: JSONObject.NULL)

    companion object {
        fun deJson(json: String?): EstadoAtualizacao {
            if (json.isNullOrBlank()) return EstadoAtualizacao()
            return try {
                val o = JSONObject(json)
                EstadoAtualizacao(
                    fase = Fase.valueOf(o.optString("fase", "ociosa").uppercase()),
                    disponiveis = lerLista(o.optJSONArray("disponiveis")),
                    plano = lerLista(o.optJSONArray("plano")),
                    indice = o.optInt("indice"),
                    progresso = o.optInt("progresso"),
                    erro = o.optString("erro").takeIf { !o.isNull("erro") && it.isNotEmpty() },
                    verificadoEm = if (o.isNull("verificado_em")) null else o.optLong("verificado_em"),
                    versaoInicial = o.optString("versao_inicial").takeIf { !o.isNull("versao_inicial") && it.isNotEmpty() },
                )
            } catch (_: Exception) {
                EstadoAtualizacao()
            }
        }

        private fun lerLista(a: JSONArray?): List<Release> =
            (0 until (a?.length() ?: 0)).mapNotNull { a!!.optJSONObject(it)?.let(Release::deJson) }
    }
}

/**
 * Atualização automática do app a partir das releases do repositório.
 *
 * Fluxo: [verificar] busca as releases e monta o plano (versões mais novas que
 * a instalada, em ordem). O usuário decide em [iniciar]; a partir daí
 * [executarPendente] baixa, confere o SHA-256 do manifest e instala cada
 * versão. A instalação mata o processo; quando o app volta (MY_PACKAGE_REPLACED
 * ou boot), [retomar] avança o índice e segue até o fim do plano.
 */
class Atualizador(
    private val versaoInstalada: Versao,
    private val rede: Rede,
    private val instalador: Instalador,
    private val armazem: Armazem,
    private val pastaDownload: File,
    private val urlReleases: String,
    /** De onde vem a versão-teto desta instalação; `null` = sem teto (o de sempre). */
    private val fonteAlvo: FonteAlvo? = null,
    private val registrar: (String) -> Unit = {},
    private val agora: () -> Long = System::currentTimeMillis,
) {
    @Volatile var estado: EstadoAtualizacao = EstadoAtualizacao.deJson(armazem.ler())
        private set

    private val executando = AtomicBoolean(false)

    fun estadoJson(): JSONObject = estado.paraJson(versaoInstalada)

    /**
     * Busca as releases e recalcula o plano. Não altera uma execução em curso.
     *
     * O plano é de uma versão só, e não é simplesmente a mais nova: [escolherEstavel]
     * baixa o manifest das candidatas, da mais nova para a mais antiga, e fica
     * com a primeira marcada como estável. Se nenhuma passar — tudo beta, sem
     * manifest ou fora do ar —, o plano fica vazio **sem `erro`**: não há o que
     * instalar não é falha a repetir, e o frontend não deve oferecer "tentar de
     * novo" para isso.
     *
     * O [fonteAlvo] — o painel — pode limitar até onde ir: as candidatas mais
     * novas que o alvo são descartadas antes da escolha. É o que faz um box pular
     * direto para a versão liberada em vez de andar degrau por degrau. Sem alvo
     * (painel desligado, fora do ar ou sem valor), nada muda: vale a mais nova
     * estável, como sempre.
     */
    @Synchronized
    fun verificar(): EstadoAtualizacao {
        if (estado.emExecucao) return estado
        return try {
            val releases = Release.analisarLista(rede.obterTexto(urlReleases))
            val candidatas = PlanoAtualizacao.candidatas(versaoInstalada, releases)
            val alvo = try {
                fonteAlvo?.alvo()
            } catch (e: Exception) {
                registrar("Atualização: alvo indisponível (${e.message}) — seguindo sem ele")
                null
            }
            val noAlvo = if (alvo == null) candidatas else candidatas.filter { it.versao <= alvo }
            val escolhida = escolherEstavel(noAlvo)
            val plano = escolhida?.let { listOf(it) } ?: emptyList()
            val resumo = "Atualização: ${releases.size} release(s) no repositório, ${candidatas.size} mais nova(s) que $versaoInstalada" +
                (alvo?.let { ", alvo $it" } ?: "")
            if (escolhida != null) {
                registrar("$resumo — instalando ${escolhida.versao}")
            } else {
                registrar("$resumo, nenhuma estável — nada a instalar")
            }
            mudar(EstadoAtualizacao(disponiveis = releases, plano = plano, verificadoEm = agora()))
        } catch (e: Exception) {
            registrar("Atualização: falha ao consultar releases (${e.message})")
            mudar(estado.copy(fase = Fase.OCIOSA, erro = "Não foi possível consultar o repositório: ${e.message}"))
        }
    }

    /**
     * A release a instalar: a mais nova cujo manifest declare `estavel: true`.
     *
     * Varre da mais nova para a mais antiga de propósito. As duas recusas
     * esperadas — manifest ausente (release publicada à mão, como a 2.8.4) e
     * manifest que não declara estabilidade (beta) — devem fazer o box **cair
     * para a anterior**, e não ficar sem atualizar. Só quando nenhuma passa é
     * que não há o que instalar.
     *
     * Custa um GET pequeno por candidata recusada. É o preço de o portão ser
     * conferido aqui, no cliente, e não confiado a quem publicou a release.
     */
    private fun escolherEstavel(candidatas: List<Release>): Release? {
        for (c in candidatas) {
            val url = c.urlManifesto
            if (url == null) {
                registrar("Atualização: ${c.versao} está sem manifest.json — ignorada")
                continue
            }
            val manifesto = try {
                Manifesto.deJson(rede.obterTexto(url))
            } catch (e: Exception) {
                registrar("Atualização: manifest de ${c.versao} indisponível (${e.message}) — ignorada")
                continue
            }
            when {
                manifesto == null ->
                    registrar("Atualização: manifest de ${c.versao} não foi entendido — ignorada")
                manifesto.versao != c.versao ->
                    registrar("Atualização: manifest de ${c.versao} é da ${manifesto.versao} — ignorada")
                !manifesto.estavel ->
                    registrar("Atualização: ${c.versao} não está marcada como estável — ignorada")
                else -> return c
            }
        }
        return null
    }

    /** Decisão do usuário: começa a cadeia. false se não há o que instalar ou já está rodando. */
    @Synchronized
    fun iniciar(): Boolean {
        if (estado.emExecucao || estado.plano.isEmpty()) return false
        mudar(estado.copy(fase = Fase.BAIXANDO, indice = 0, progresso = 0, erro = null, versaoInicial = versaoInstalada.toString()))
        return true
    }

    /** Cancela uma execução que ainda não chegou à instalação. */
    @Synchronized
    fun cancelar(): Boolean {
        if (estado.fase == Fase.INSTALANDO) return false
        limparDownloads()
        mudar(estado.copy(fase = Fase.OCIOSA, indice = 0, progresso = 0, erro = null))
        return true
    }

    /**
     * Chamado ao subir o serviço. Se havia instalação em andamento, confere se
     * a versão instalada é a esperada e avança. Devolve true se ainda há passos
     * a executar (o chamador deve rodar [executarPendente] em segundo plano).
     */
    @Synchronized
    fun retomar(): Boolean {
        val e = estado
        return when (e.fase) {
            Fase.INSTALANDO -> {
                val esperada = e.passoAtual?.versao
                if (esperada != null && versaoInstalada == esperada) {
                    registrar("Atualização: ${e.versaoInicial ?: "?"} → $esperada instalada")
                    val proximo = e.indice + 1
                    if (proximo < e.plano.size) {
                        mudar(e.copy(fase = Fase.BAIXANDO, indice = proximo, progresso = 0))
                        true
                    } else {
                        limparDownloads()
                        mudar(e.copy(fase = Fase.CONCLUIDA, indice = proximo, progresso = 100))
                        false
                    }
                } else {
                    limparDownloads()
                    mudar(e.copy(fase = Fase.ERRO, erro = "A instalação de $esperada não se efetivou (instalada: $versaoInstalada)"))
                    false
                }
            }
            Fase.BAIXANDO, Fase.CONFERINDO -> true   // o processo caiu no meio; repete o passo
            else -> false
        }
    }

    /**
     * Executa o passo pendente do plano: baixa, confere e instala. Em sucesso a
     * instalação mata o processo, e o passo seguinte só começa em [retomar].
     */
    fun executarPendente() {
        if (!executando.compareAndSet(false, true)) return
        try {
            val e = estado
            if (!(e.fase == Fase.BAIXANDO || e.fase == Fase.CONFERINDO)) return
            val release = e.passoAtual ?: run { mudar(e.copy(fase = Fase.ERRO, erro = "Plano vazio")); return }
            executarPasso(release)
        } finally {
            executando.set(false)
        }
    }

    private fun executarPasso(release: Release) {
        // Antes de baixar, limpa o que sobrou do passo anterior. O `apk.delete()`
        // do fim deste método nunca chega a rodar quando dá certo: quem instala
        // com sucesso mata este processo. Sem esta linha, cada degrau deixava
        // ~122 MB para trás, e uma cadeia longa enchia o /data.
        limparDownloads()

        val apk = File(pastaDownload, "balancagfig-${release.versao}.apk")
        try {
            pastaDownload.mkdirs()

            // O portão de estabilidade vale de novo aqui, e não só na escolha do
            // plano: o estado é retomável (a instalação mata o processo e o
            // estado gravado sobrevive), então um plano herdado de cliente
            // antigo chega até aqui sem ter passado por `escolherEstavel`.
            // Sem manifest estável com sha256, não instala — é o que impede um
            // box de pegar a v2.8.4, que está no ar sem manifest nenhum.
            val manifesto = release.urlManifesto?.let { Manifesto.deJson(rede.obterTexto(it)) }
                ?: throw IllegalStateException("sem manifest.json — instalação recusada")
            if (!manifesto.estavel) {
                throw IllegalStateException("não está marcada como estável — instalação recusada")
            }
            if (manifesto.sha256.isEmpty()) {
                throw IllegalStateException("manifest sem sha256 — instalação recusada")
            }

            mudar(estado.copy(fase = Fase.BAIXANDO, progresso = 0, erro = null))
            registrar("Atualização: baixando ${release.versao}")
            var ultimoPct = -1
            rede.baixar(release.urlApk, apk) { bytes, total ->
                val pct = if (total > 0) (bytes * 100 / total).toInt() else 0
                if (pct != ultimoPct) { ultimoPct = pct; estado = estado.copy(progresso = pct) }
            }

            mudar(estado.copy(fase = Fase.CONFERINDO, progresso = 100))
            if (manifesto.tamanho > 0 && apk.length() != manifesto.tamanho) {
                throw IllegalStateException("tamanho do APK difere do manifest (${apk.length()} ≠ ${manifesto.tamanho})")
            }
            val sha = sha256(apk)
            if (sha != manifesto.sha256) {
                throw IllegalStateException("SHA-256 do APK não confere com o manifest")
            }

            // Grava INSTALANDO antes de chamar o instalador: se der certo, o processo morre aqui.
            mudar(estado.copy(fase = Fase.INSTALANDO, progresso = 100))
            registrar("Atualização: instalando ${release.versao}")
            val erro = instalador.instalar(apk)
            if (erro != null) throw IllegalStateException(erro)
        } catch (e: Exception) {
            apk.delete()
            registrar("Atualização: falha em ${release.versao}: ${e.message}")
            mudar(estado.copy(fase = Fase.ERRO, erro = "Versão ${release.versao}: ${e.message}"))
        }
    }

    private fun limparDownloads() {
        pastaDownload.listFiles()
            ?.filter { it.name.endsWith(".apk") || it.name.endsWith(".parte") }
            ?.forEach { it.delete() }
    }

    @Synchronized
    private fun mudar(novo: EstadoAtualizacao): EstadoAtualizacao {
        estado = novo
        armazem.gravar(novo.paraJson(versaoInstalada).toString())
        return novo
    }

    companion object {
        const val URL_RELEASES_PADRAO = "https://api.github.com/repos/rbeninca/balanca/releases?per_page=50"

        fun sha256(arquivo: File): String {
            val md = MessageDigest.getInstance("SHA-256")
            arquivo.inputStream().use { entrada ->
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val n = entrada.read(buf)
                    if (n < 0) break
                    md.update(buf, 0, n)
                }
            }
            return md.digest().joinToString("") { "%02x".format(it) }
        }
    }
}

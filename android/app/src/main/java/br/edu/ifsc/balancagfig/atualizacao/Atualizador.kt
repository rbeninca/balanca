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
    private val registrar: (String) -> Unit = {},
    private val agora: () -> Long = System::currentTimeMillis,
) {
    @Volatile var estado: EstadoAtualizacao = EstadoAtualizacao.deJson(armazem.ler())
        private set

    private val executando = AtomicBoolean(false)

    fun estadoJson(): JSONObject = estado.paraJson(versaoInstalada)

    /** Busca as releases e recalcula o plano. Não altera uma execução em curso. */
    @Synchronized
    fun verificar(): EstadoAtualizacao {
        if (estado.emExecucao) return estado
        return try {
            val releases = Release.analisarLista(rede.obterTexto(urlReleases))
            val plano = PlanoAtualizacao.calcular(versaoInstalada, releases)
            registrar("Atualização: ${releases.size} release(s) no repositório, ${plano.size} mais nova(s) que $versaoInstalada")
            mudar(EstadoAtualizacao(disponiveis = releases, plano = plano, verificadoEm = agora()))
        } catch (e: Exception) {
            registrar("Atualização: falha ao consultar releases (${e.message})")
            mudar(estado.copy(fase = Fase.OCIOSA, erro = "Não foi possível consultar o repositório: ${e.message}"))
        }
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
        val apk = File(pastaDownload, "balancagfig-${release.versao}.apk")
        try {
            pastaDownload.mkdirs()
            val manifesto = release.urlManifesto?.let { Manifesto.deJson(rede.obterTexto(it)) }

            mudar(estado.copy(fase = Fase.BAIXANDO, progresso = 0, erro = null))
            registrar("Atualização: baixando ${release.versao}")
            var ultimoPct = -1
            rede.baixar(release.urlApk, apk) { bytes, total ->
                val pct = if (total > 0) (bytes * 100 / total).toInt() else 0
                if (pct != ultimoPct) { ultimoPct = pct; estado = estado.copy(progresso = pct) }
            }

            mudar(estado.copy(fase = Fase.CONFERINDO, progresso = 100))
            if (manifesto != null) {
                if (manifesto.tamanho > 0 && apk.length() != manifesto.tamanho) {
                    throw IllegalStateException("tamanho do APK difere do manifest (${apk.length()} ≠ ${manifesto.tamanho})")
                }
                val sha = sha256(apk)
                if (manifesto.sha256.isNotEmpty() && sha != manifesto.sha256) {
                    throw IllegalStateException("SHA-256 do APK não confere com o manifest")
                }
            } else {
                registrar("Atualização: release ${release.versao} sem manifest.json — instalando sem conferir hash")
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
        pastaDownload.listFiles()?.filter { it.name.endsWith(".apk") }?.forEach { it.delete() }
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

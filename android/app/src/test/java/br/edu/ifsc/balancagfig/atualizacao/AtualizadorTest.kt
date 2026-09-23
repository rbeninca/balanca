package br.edu.ifsc.balancagfig.atualizacao

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class AtualizadorTest {
    @get:Rule val pasta = TemporaryFolder()

    /** Rede simulada: URLs → texto, e APKs → conteúdo. */
    private class RedeFalsa : Rede {
        val textos = HashMap<String, String>()
        val arquivos = HashMap<String, ByteArray>()

        /** Toda URL lida, na ordem — é como os testes contam os GETs de manifest. */
        val lidos = ArrayList<String>()
        var falharDownload = false
        override fun obterTexto(url: String): String {
            lidos += url
            return textos[url] ?: throw IllegalStateException("404 $url")
        }
        override fun baixar(url: String, destino: File, progresso: (Long, Long) -> Unit) {
            if (falharDownload) throw IllegalStateException("rede caiu")
            val dados = arquivos[url] ?: throw IllegalStateException("404 $url")
            destino.writeBytes(dados)
            progresso(dados.size.toLong(), dados.size.toLong())
        }
    }

    private class InstaladorFalso(var erro: String? = null) : Instalador {
        val instalados = ArrayList<String>()
        override fun instalar(apk: File): String? { instalados += apk.name; return erro }
    }

    private class ArmazemFalso : Armazem {
        var json: String? = null
        override fun ler() = json
        override fun gravar(json: String) { this.json = json }
    }

    /** Uma release da API do GitHub, com os assets que [manifesto] mandar. */
    private fun releaseJson(v: String, manifesto: Boolean = true): String {
        val apk = """{"name":"balancagfig-$v.apk","browser_download_url":"https://x/$v/app.apk"}"""
        val man = """{"name":"manifest.json","browser_download_url":"https://x/$v/manifest.json"}"""
        return """{"tag_name":"v$v","draft":false,"prerelease":false,"body":"notas $v","assets":[${if (manifesto) "$apk,$man" else apk}]}"""
    }

    private fun releasesJson(vararg versoes: String) = versoes.joinToString(",", "[", "]") { releaseJson(it) }

    /** Release publicada à mão, sem o asset manifest.json — o caso da v2.8.4. */
    private fun releasesJsonSemManifesto(vararg versoes: String) =
        versoes.joinToString(",", "[", "]") { releaseJson(it, manifesto = false) }

    private fun publicar(
        rede: RedeFalsa,
        versao: String,
        conteudo: ByteArray = "apk $versao".toByteArray(),
        shaErrado: Boolean = false,
        estavel: Boolean = true,
    ) {
        rede.arquivos["https://x/$versao/app.apk"] = conteudo
        val tmp = File(pasta.root, "tmp-$versao"); tmp.writeBytes(conteudo)
        val sha = if (shaErrado) "00" else Atualizador.sha256(tmp)
        rede.textos["https://x/$versao/manifest.json"] =
            """{"versao":"$versao","versionCode":9,"sha256":"$sha","tamanho":${conteudo.size},"estavel":$estavel}"""
    }

    private fun criar(
        instalada: String,
        rede: RedeFalsa,
        inst: InstaladorFalso = InstaladorFalso(),
        armazem: ArmazemFalso = ArmazemFalso(),
        registrar: (String) -> Unit = {},
    ) = Atualizador(
        Versao.analisar(instalada)!!, rede, inst, armazem, File(pasta.root, "dl"), "https://api/releases",
        registrar = registrar, agora = { 1000L },
    )

    @Test
    fun verificarMontaOPlanoComAMaisNova() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.5.0", "2.3.0", "2.4.0") }
        publicar(rede, "2.5.0")
        val a = criar("2.3.0", rede)
        val e = a.verificar()
        assertEquals(Fase.OCIOSA, e.fase)
        // Um passo só, e é o mais novo: as migrações do banco são idempotentes,
        // então passar pela 2.4.0 antes só custaria baixar outro APK inteiro.
        assertEquals(listOf("2.5.0"), e.plano.map { it.versao.toString() })
        assertEquals(1000L, e.verificadoEm)
        assertNull(e.erro)
        assertEquals("2.3.0", a.estadoJson().getString("instalada"))
    }

    @Test
    fun planoDeBoxMuitoAtrasadoTambemEhDeUmPassoSo() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.7.4", "2.7.5", "2.7.6", "2.7.7", "2.7.8", "2.7.9", "2.8.0", "2.8.1") }
        publicar(rede, "2.8.1")
        val e = criar("2.7.4", rede).verificar()
        assertEquals(listOf("2.8.1"), e.plano.map { it.versao.toString() })
    }

    @Test
    fun verificarSemRedeRegistraErroEMantemOcioso() {
        val a = criar("2.3.0", RedeFalsa())
        val e = a.verificar()
        assertEquals(Fase.OCIOSA, e.fase)
        assertNotNull(e.erro)
        assertFalse(a.iniciar())
    }

    @Test
    fun atualizaDaMaisAntigaDiretoParaAMaisNova() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.4.0", "2.5.0") }
        publicar(rede, "2.4.0"); publicar(rede, "2.5.0")
        val armazem = ArmazemFalso()
        val inst = InstaladorFalso()

        // 2.3.0 instalada: usuário decide atualizar
        val a1 = criar("2.3.0", rede, inst, armazem)
        a1.verificar()
        assertTrue(a1.iniciar())
        assertEquals("2.3.0", a1.estado.versaoInicial)
        a1.executarPendente()
        assertEquals(Fase.INSTALANDO, a1.estado.fase)          // gravado antes do pm install
        // Salta a 2.4.0: baixa e instala a 2.5.0 direto.
        assertEquals(listOf("balancagfig-2.5.0.apk"), inst.instalados)

        // o Android matou o processo e reinstalou; app volta como 2.5.0
        val a2 = criar("2.5.0", rede, inst, armazem)
        assertEquals(Fase.INSTALANDO, a2.estado.fase)          // estado veio do armazém
        assertFalse(a2.retomar())                              // fim do plano: era um passo só
        assertEquals(Fase.CONCLUIDA, a2.estado.fase)
        assertEquals("2.3.0", a2.estado.versaoInicial)
        assertEquals(0, File(pasta.root, "dl").listFiles()?.size ?: 0)   // APKs apagados
    }

    // O `apk.delete()` do fim do passo nunca chega a rodar quando a instalação
    // dá certo: quem instala com sucesso mata este processo. Sem limpar antes de
    // baixar, cada degrau deixava o APK inteiro para trás — 122 MB cada, na era
    // do GeckoView.
    @Test
    fun apkDeUmaRodadaAnteriorNaoSeAcumulaNaPasta() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.4.0") }
        publicar(rede, "2.4.0")
        val pastaDl = File(pasta.root, "dl").apply { mkdirs() }
        File(pastaDl, "balancagfig-2.3.0.apk").writeBytes(ByteArray(1024))       // sobra da rodada anterior
        File(pastaDl, "balancagfig-2.4.0.apk.parte").writeBytes(ByteArray(10))   // download interrompido

        val a = criar("2.3.0", rede)
        a.verificar(); a.iniciar(); a.executarPendente()

        assertEquals(Fase.INSTALANDO, a.estado.fase)
        assertEquals(listOf("balancagfig-2.4.0.apk"), pastaDl.listFiles()!!.map { it.name })
    }

    @Test
    fun shaErradoInterrompeSemInstalar() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.4.0") }
        publicar(rede, "2.4.0", shaErrado = true)
        val inst = InstaladorFalso()
        val a = criar("2.3.0", rede, inst)
        a.verificar(); a.iniciar(); a.executarPendente()
        assertEquals(Fase.ERRO, a.estado.fase)
        assertTrue(a.estado.erro!!.contains("SHA-256"))
        assertTrue(inst.instalados.isEmpty())
        assertFalse(File(pasta.root, "dl/balancagfig-2.4.0.apk").exists())
    }

    @Test
    fun falhaDeDownloadViraErroEPodeTentarDeNovo() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.4.0") }
        publicar(rede, "2.4.0")
        val a = criar("2.3.0", rede)
        a.verificar(); a.iniciar()
        rede.falharDownload = true
        a.executarPendente()
        assertEquals(Fase.ERRO, a.estado.fase)
        assertTrue(a.estado.erro!!.contains("rede caiu"))

        rede.falharDownload = false
        a.verificar()
        assertTrue(a.iniciar())
        a.executarPendente()
        assertEquals(Fase.INSTALANDO, a.estado.fase)
    }

    @Test
    fun instaladorRecusandoViraErro() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.4.0") }
        publicar(rede, "2.4.0")
        val a = criar("2.3.0", rede, InstaladorFalso(erro = "INSTALL_FAILED_UPDATE_INCOMPATIBLE"))
        a.verificar(); a.iniciar(); a.executarPendente()
        assertEquals(Fase.ERRO, a.estado.fase)
        assertTrue(a.estado.erro!!.contains("INSTALL_FAILED"))
    }

    @Test
    fun retomarComVersaoInesperadaViraErro() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.4.0") }
        publicar(rede, "2.4.0")
        val armazem = ArmazemFalso()
        val a = criar("2.3.0", rede, InstaladorFalso(), armazem)
        a.verificar(); a.iniciar(); a.executarPendente()
        // app voltou, mas continua 2.3.0 (pm install não efetivou)
        val b = criar("2.3.0", rede, InstaladorFalso(), armazem)
        assertFalse(b.retomar())
        assertEquals(Fase.ERRO, b.estado.fase)
    }

    // Estado herdado de um cliente antigo pode ter no plano uma release sem
    // manifest — é o caso da v2.8.4, publicada à mão. O portão do passo pega
    // isso mesmo sem passar pela escolha do plano: ERRO, instalador intacto.
    // Até a 2.8.4 este mesmo estado instalava sem conferir nada.
    @Test
    fun processoCaidoComPlanoSemManifestoViraErro() {
        val armazem = ArmazemFalso()
        armazem.json = EstadoAtualizacao(
            fase = Fase.BAIXANDO, indice = 0,
            plano = listOf(Release(Versao(2, 4, 0), "v2.4.0", "https://x/2.4.0/app.apk", null, "")),
        ).paraJson(Versao(2, 3, 0)).toString()
        val rede = RedeFalsa(); publicar(rede, "2.4.0")
        val inst = InstaladorFalso()
        val a = criar("2.3.0", rede, inst, armazem)
        assertTrue(a.retomar())
        a.executarPendente()
        assertEquals(Fase.ERRO, a.estado.fase)
        assertTrue(a.estado.erro!!.contains("sem manifest.json"))
        assertTrue(inst.instalados.isEmpty())
        assertFalse(File(pasta.root, "dl/balancagfig-2.4.0.apk").exists())
    }

    @Test
    fun processoCaidoNoMeioDoDownloadRepeteOPasso() {
        val rede = RedeFalsa(); publicar(rede, "2.4.0")
        val armazem = ArmazemFalso()
        armazem.json = EstadoAtualizacao(
            fase = Fase.BAIXANDO, indice = 0,
            plano = listOf(Release(Versao(2, 4, 0), "v2.4.0", "https://x/2.4.0/app.apk", "https://x/2.4.0/manifest.json", "")),
        ).paraJson(Versao(2, 3, 0)).toString()
        val inst = InstaladorFalso()
        val a = criar("2.3.0", rede, inst, armazem)
        assertTrue(a.retomar())
        a.executarPendente()
        assertEquals(listOf("balancagfig-2.4.0.apk"), inst.instalados)
    }

    // A escolhida não é a mais nova: é a mais nova que passa no portão. Uma
    // beta no topo não pode deixar o box parado na versão em que está.
    @Test
    fun maisNovaInstavelCaiParaAEstavelAnterior() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.5.0", "2.4.0") }
        publicar(rede, "2.5.0", estavel = false)
        publicar(rede, "2.4.0")
        val e = criar("2.3.0", rede).verificar()
        assertEquals(listOf("2.4.0"), e.plano.map { it.versao.toString() })
        assertNull(e.erro)
    }

    @Test
    fun todasEstaveisEscolheAMaisNovaEManifestSoDaEscolhidaEhBaixado() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.5.0", "2.4.0") }
        publicar(rede, "2.5.0"); publicar(rede, "2.4.0")
        val e = criar("2.3.0", rede).verificar()
        assertEquals(listOf("2.5.0"), e.plano.map { it.versao.toString() })
        // A varredura para na primeira que passa: o caso normal custa um GET.
        assertEquals(listOf("https://api/releases", "https://x/2.5.0/manifest.json"), rede.lidos)
    }

    @Test
    fun nenhumaCandidataEstavelDeixaPlanoVazio() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.5.0") }
        publicar(rede, "2.5.0", estavel = false)
        val logs = ArrayList<String>()
        val a = criar("2.3.0", rede, registrar = logs::add)
        val e = a.verificar()
        assertTrue(e.plano.isEmpty())
        assertNull(e.erro)              // "nada a instalar" não é falha a repetir
        assertFalse(a.iniciar())
        assertTrue(logs.any { it.contains("nenhuma estável") })
    }

    @Test
    fun candidataSemManifestoEhPulada() {
        val rede = RedeFalsa().apply {
            textos["https://api/releases"] = "[${releaseJson("2.5.0", manifesto = false)},${releaseJson("2.4.0")}]"
        }
        publicar(rede, "2.4.0")
        val e = criar("2.3.0", rede).verificar()
        assertEquals(listOf("2.4.0"), e.plano.map { it.versao.toString() })
    }

    @Test
    fun falhaAoBaixarManifestDeUmaCandidataPulaParaAAnterior() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.5.0", "2.4.0") }
        publicar(rede, "2.4.0")     // o manifest da 2.5.0 não existe: 404
        val e = criar("2.3.0", rede).verificar()
        assertEquals(listOf("2.4.0"), e.plano.map { it.versao.toString() })
    }

    @Test
    fun manifestoDeOutraVersaoEhPulado() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.5.0") }
        rede.textos["https://x/2.5.0/manifest.json"] =
            """{"versao":"2.4.0","versionCode":9,"sha256":"a","tamanho":1,"estavel":true}"""
        assertTrue(criar("2.3.0", rede).verificar().plano.isEmpty())
    }

    // O portão vale de novo na hora de instalar: se a release for desmarcada
    // entre a consulta e a instalação, o passo vira ERRO sem instalar nada.
    @Test
    fun manifestoQueViraInstavelAntesDaInstalacaoNaoInstala() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.4.0") }
        publicar(rede, "2.4.0")
        val inst = InstaladorFalso()
        val a = criar("2.3.0", rede, inst)
        a.verificar(); assertTrue(a.iniciar())
        publicar(rede, "2.4.0", estavel = false)
        a.executarPendente()
        assertEquals(Fase.ERRO, a.estado.fase)
        assertTrue(a.estado.erro!!.contains("estável"))
        assertTrue(inst.instalados.isEmpty())
    }

    @Test
    fun manifestoSemShaNaoInstala() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.4.0") }
        publicar(rede, "2.4.0")
        rede.textos["https://x/2.4.0/manifest.json"] =
            """{"versao":"2.4.0","versionCode":9,"sha256":"","tamanho":0,"estavel":true}"""
        val inst = InstaladorFalso()
        val a = criar("2.3.0", rede, inst)
        a.verificar(); a.iniciar(); a.executarPendente()
        assertEquals(Fase.ERRO, a.estado.fase)
        assertTrue(a.estado.erro!!.contains("sha256"))
        assertTrue(inst.instalados.isEmpty())
    }

    @Test
    fun cancelarAntesDeInstalarLimpaEVoltaAoOcioso() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.4.0") }
        publicar(rede, "2.4.0")
        val a = criar("2.3.0", rede)
        a.verificar(); assertTrue(a.iniciar())
        assertTrue(a.cancelar())
        assertEquals(Fase.OCIOSA, a.estado.fase)
        assertEquals(1, a.estado.plano.size)   // plano continua disponível para nova decisão
    }

    @Test
    fun estadoSerializaEDesserializa() {
        val e = EstadoAtualizacao(
            fase = Fase.CONFERINDO, indice = 1, progresso = 42, erro = "x", verificadoEm = 5L, versaoInicial = "2.3.0",
            plano = listOf(Release(Versao(2, 4, 0), "v2.4.0", "u", "m", "n")),
            disponiveis = listOf(Release(Versao(2, 4, 0), "v2.4.0", "u", null, "n")),
        )
        assertEquals(e, EstadoAtualizacao.deJson(e.paraJson(Versao(2, 3, 0)).toString()))
        assertEquals(EstadoAtualizacao(), EstadoAtualizacao.deJson(null))
        assertEquals(EstadoAtualizacao(), EstadoAtualizacao.deJson("{lixo"))
    }
}

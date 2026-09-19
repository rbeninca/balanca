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
        var falharDownload = false
        override fun obterTexto(url: String) = textos[url] ?: throw IllegalStateException("404 $url")
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

    private fun releasesJson(vararg versoes: String) = versoes.joinToString(",", "[", "]") { v ->
        """{"tag_name":"v$v","draft":false,"prerelease":false,"body":"notas $v","assets":[
             {"name":"balancagfig-$v.apk","browser_download_url":"https://x/$v/app.apk"},
             {"name":"manifest.json","browser_download_url":"https://x/$v/manifest.json"}]}"""
    }

    private fun publicar(rede: RedeFalsa, versao: String, conteudo: ByteArray = "apk $versao".toByteArray(), shaErrado: Boolean = false) {
        rede.arquivos["https://x/$versao/app.apk"] = conteudo
        val tmp = File(pasta.root, "tmp-$versao"); tmp.writeBytes(conteudo)
        val sha = if (shaErrado) "00" else Atualizador.sha256(tmp)
        rede.textos["https://x/$versao/manifest.json"] = """{"versao":"$versao","versionCode":9,"sha256":"$sha","tamanho":${conteudo.size}}"""
    }

    private fun criar(instalada: String, rede: RedeFalsa, inst: InstaladorFalso = InstaladorFalso(), armazem: ArmazemFalso = ArmazemFalso()) =
        Atualizador(Versao.analisar(instalada)!!, rede, inst, armazem, File(pasta.root, "dl"), "https://api/releases", agora = { 1000L })

    @Test
    fun verificarMontaOPlanoComAsVersoesMaisNovas() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.5.0", "2.3.0", "2.4.0") }
        val a = criar("2.3.0", rede)
        val e = a.verificar()
        assertEquals(Fase.OCIOSA, e.fase)
        assertEquals(listOf("2.4.0", "2.5.0"), e.plano.map { it.versao.toString() })
        assertEquals(1000L, e.verificadoEm)
        assertNull(e.erro)
        assertEquals("2.3.0", a.estadoJson().getString("instalada"))
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
    fun cadeiaCompletaPassandoPorCadaVersao() {
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
        assertEquals(listOf("balancagfig-2.4.0.apk"), inst.instalados)

        // o Android matou o processo e reinstalou; app volta como 2.4.0
        val a2 = criar("2.4.0", rede, inst, armazem)
        assertEquals(Fase.INSTALANDO, a2.estado.fase)          // estado veio do armazém
        assertTrue(a2.retomar())                               // ainda há 2.5.0
        assertEquals(Fase.BAIXANDO, a2.estado.fase)
        assertEquals(1, a2.estado.indice)
        a2.executarPendente()
        assertEquals(listOf("balancagfig-2.4.0.apk", "balancagfig-2.5.0.apk"), inst.instalados)

        // volta como 2.5.0: fim do plano
        val a3 = criar("2.5.0", rede, inst, armazem)
        assertFalse(a3.retomar())
        assertEquals(Fase.CONCLUIDA, a3.estado.fase)
        assertEquals("2.3.0", a3.estado.versaoInicial)
        assertEquals(0, File(pasta.root, "dl").listFiles()?.size ?: 0)   // APKs apagados
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

    @Test
    fun processoCaidoNoMeioDoDownloadRepeteOPasso() {
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
        assertEquals(listOf("balancagfig-2.4.0.apk"), inst.instalados)   // sem manifest: instala sem conferir
    }

    @Test
    fun cancelarAntesDeInstalarLimpaEVoltaAoOcioso() {
        val rede = RedeFalsa().apply { textos["https://api/releases"] = releasesJson("2.4.0") }
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

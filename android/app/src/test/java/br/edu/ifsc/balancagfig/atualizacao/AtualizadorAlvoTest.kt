package br.edu.ifsc.balancagfig.atualizacao

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * O teto que o painel impõe ao atualizador.
 *
 * A regra é uma só: o alvo **restringe** o que já seria instalado, nunca amplia.
 * Sem alvo, ou com a fonte fora do ar, o atualizador volta ao comportamento de
 * sempre — que é o que mantém a frota atualizável se o painel sumir.
 */
class AtualizadorAlvoTest {
    @get:Rule val pasta = TemporaryFolder()

    private class RedeFalsa : Rede {
        val textos = HashMap<String, String>()
        val arquivos = HashMap<String, ByteArray>()
        override fun obterTexto(url: String): String = textos[url] ?: throw IllegalStateException("404 $url")
        override fun publicar(url: String, corpoJson: String, chave: String): String? = """{"ok":true}"""
        override fun baixar(url: String, destino: File, progresso: (Long, Long) -> Unit) {
            val dados = arquivos[url] ?: throw IllegalStateException("404 $url")
            destino.writeBytes(dados)
        }
    }

    private class InstaladorFalso : Instalador {
        val instalados = ArrayList<String>()
        override fun instalar(apk: File): String? { instalados += apk.name; return null }
    }

    private class ArmazemFalso : Armazem {
        var json: String? = null
        override fun ler() = json
        override fun gravar(json: String) { this.json = json }
    }

    private fun releaseJson(v: String): String {
        val apk = """{"name":"balancagfig-$v.apk","browser_download_url":"https://x/$v/app.apk"}"""
        val man = """{"name":"manifest.json","browser_download_url":"https://x/$v/manifest.json"}"""
        return """{"tag_name":"v$v","draft":false,"prerelease":false,"body":"notas","assets":[$apk,$man]}"""
    }

    private fun publicar(rede: RedeFalsa, versao: String, estavel: Boolean = true) {
        val conteudo = "apk $versao".toByteArray()
        rede.arquivos["https://x/$versao/app.apk"] = conteudo
        val tmp = File(pasta.root, "tmp-$versao"); tmp.writeBytes(conteudo)
        rede.textos["https://x/$versao/manifest.json"] =
            """{"versao":"$versao","versionCode":9,"sha256":"${Atualizador.sha256(tmp)}","tamanho":${conteudo.size},"estavel":$estavel}"""
    }

    /** Teto fixo, para o teste não depender do formato da resposta do painel. */
    private class AlvoFixo(private val v: Versao?) : FonteAlvo {
        var consultas = 0
        override fun alvo(): Versao? { consultas++; return v }
    }

    private class AlvoQuebrado : FonteAlvo {
        override fun alvo(): Versao? = throw IllegalStateException("painel fora do ar")
    }

    private fun criar(
        instalada: String,
        rede: RedeFalsa,
        fonteAlvo: FonteAlvo? = null,
        inst: InstaladorFalso = InstaladorFalso(),
        registrar: (String) -> Unit = {},
    ) = Atualizador(
        Versao.analisar(instalada)!!, rede, inst, ArmazemFalso(), File(pasta.root, "dl"),
        "https://api/releases", fonteAlvo = fonteAlvo, registrar = registrar, agora = { 1000L },
    )

    private fun redeCom(vararg versoes: String): RedeFalsa =
        RedeFalsa().apply {
            textos["https://api/releases"] = versoes.joinToString(",", "[", "]") { releaseJson(it) }
            versoes.forEach { publicar(this, it) }
        }

    @Test
    fun alvoAbaixoDaMaisNovaEscolheAQueCabe() {
        val rede = redeCom("2.8.7", "2.8.6", "2.8.5")
        val espiao = AlvoFixo(Versao.analisar("2.8.6")!!)
        val e = criar("2.8.5", rede, fonteAlvo = espiao).verificar()

        assertEquals("2.8.6", e.plano.single().versao.toString())
        assertEquals(1, espiao.consultas)
    }

    @Test
    fun alvoIgualAoInstaladoNaoTemOQueFazer() {
        val rede = redeCom("2.8.7", "2.8.6")
        val e = criar("2.8.6", rede, fonteAlvo = AlvoFixo(Versao.analisar("2.8.6")!!)).verificar()

        assertTrue(e.plano.isEmpty())
        assertNull(e.erro)
    }

    @Test
    fun alvoAcimaDaMaisNovaNaoAmpliaNada() {
        val rede = redeCom("2.8.6")
        val e = criar("2.8.5", rede, fonteAlvo = AlvoFixo(Versao.analisar("9.9.9")!!)).verificar()

        assertEquals("2.8.6", e.plano.single().versao.toString())
    }

    @Test
    fun semFonteDeAlvoOComportamentoEODesempre() {
        val rede = redeCom("2.8.7", "2.8.6")
        val e = criar("2.8.5", rede).verificar()

        assertEquals("2.8.7", e.plano.single().versao.toString())
    }

    @Test
    fun alvoNuloLiberaGeral() {
        val rede = redeCom("2.8.7")
        val e = criar("2.8.5", rede, fonteAlvo = AlvoFixo(null)).verificar()

        assertEquals("2.8.7", e.plano.single().versao.toString())
    }

    @Test
    fun fonteQueFalhaNaoDerrubaNemTrava() {
        val rede = redeCom("2.8.7")
        val registro = ArrayList<String>()
        val e = criar("2.8.5", rede, fonteAlvo = AlvoQuebrado(), registrar = { registro += it }).verificar()

        assertEquals("2.8.7", e.plano.single().versao.toString())
        assertTrue(
            "o registro precisa contar que o alvo caiu: $registro",
            registro.any { it.contains("alvo indisponível") },
        )
    }

    @Test
    fun oAlvoNaoFuraOPortaoDeEstabilidade() {
        // Alvo 2.8.5, e a 2.8.6 (estável) fica de fora por causa do alvo. Dentro
        // dele a 2.8.5 não é estável, e o box cai para a 2.8.4 — o portão do
        // manifest continua valendo, o alvo só restringe.
        val rede = redeCom("2.8.6", "2.8.5", "2.8.4")
        publicar(rede, "2.8.5", estavel = false)
        val e = criar("2.8.3", rede, fonteAlvo = AlvoFixo(Versao.analisar("2.8.5")!!)).verificar()

        assertEquals("2.8.4", e.plano.single().versao.toString())
    }

    @Test
    fun oAlvoApareceNoRegistro() {
        val rede = redeCom("2.8.7", "2.8.6")
        val registro = ArrayList<String>()
        criar("2.8.5", rede, fonteAlvo = AlvoFixo(Versao.analisar("2.8.6")!!), registrar = { registro += it })
            .verificar()

        assertTrue("o registro precisa dizer o alvo: $registro", registro.any { it.contains("alvo 2.8.6") })
    }

    @Test
    fun oAlvoEReconsultadoACadaVerificacao() {
        val rede = redeCom("2.8.7")
        val espiao = AlvoFixo(null)
        val a = criar("2.8.5", rede, fonteAlvo = espiao)

        a.verificar()
        a.verificar()

        assertEquals(2, espiao.consultas)
    }
}

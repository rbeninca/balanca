package br.edu.ifsc.balancagfig.painel

import br.edu.ifsc.balancagfig.atualizacao.Rede
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * A batida é acessório: o que estes testes protegem é a promessa de que ela
 * nunca atrapalha — nem quando a rede cai, nem quando não há chave.
 */
class CheckInTest {

    private class RedeFalsa : Rede {
        val publicados = ArrayList<Triple<String, String, String>>()
        var falhar = false
        override fun obterTexto(url: String): String = throw IllegalStateException("não deveria ler")
        override fun baixar(url: String, destino: File, progresso: (Long, Long) -> Unit) =
            throw IllegalStateException("não deveria baixar")
        override fun publicar(url: String, corpoJson: String, chave: String): String? {
            if (falhar) throw IllegalStateException("painel fora do ar")
            publicados += Triple(url, corpoJson, chave)
            return """{"ok":true}"""
        }
    }

    private fun batida(instaladoEm: Long? = 1_700_000_000_000L) = Batida(
        serial = "GFIG-TX9-58EB81E3618C",
        versao = "2.8.501",
        versionCode = 24,
        instaladoEm = instaladoEm,
        modelo = "TX9",
        placa = "gxl",
        ip = mapOf("wlan0" to "192.168.0.50"),
        root = true,
    )

    @Test
    fun publicaNoPainelComAChaveEOCorpoEsperado() {
        val rede = RedeFalsa()
        val ok = CheckIn(rede, "https://painel.exemplo", "segredo").batida(batida())

        assertTrue(ok)
        val (url, corpo, chave) = rede.publicados.single()
        assertEquals("https://painel.exemplo/batida", url)
        assertEquals("segredo", chave)
        val o = JSONObject(corpo)
        assertEquals("GFIG-TX9-58EB81E3618C", o.getString("serial"))
        assertEquals("2.8.501", o.getString("versao"))
        assertEquals(24, o.getInt("versionCode"))
        assertEquals(1_700_000_000_000L, o.getLong("instaladoEm"))
        assertEquals("gxl", o.getString("placa"))
        assertTrue(o.getBoolean("root"))
        assertEquals("192.168.0.50", o.getJSONObject("ip").getString("wlan0"))
    }

    @Test
    fun semInstaladoEmOCampoVaiNulo() {
        val rede = RedeFalsa()
        CheckIn(rede, "https://painel.exemplo", "segredo").batida(batida(instaladoEm = null))

        val o = JSONObject(rede.publicados.single().second)
        assertTrue(o.isNull("instaladoEm"))
    }

    @Test
    fun semChaveNemTocaARede() {
        val rede = RedeFalsa()
        val ok = CheckIn(rede, "https://painel.exemplo", "  ").batida(batida())

        assertFalse(ok)
        assertTrue(rede.publicados.isEmpty())
    }

    @Test
    fun falhaDeRedeViraLogEFalse() {
        val rede = RedeFalsa().apply { falhar = true }
        var registro = ""
        val ok = CheckIn(rede, "https://painel.exemplo", "segredo", registrar = { registro = it }).batida(batida())

        assertFalse(ok)
        assertTrue("a falha precisa aparecer no registro: $registro", registro.contains("batida falhou"))
    }

    @Test
    fun sucessoNaoPoluiORegistro() {
        var registro = ""
        val ok = CheckIn(RedeFalsa(), "https://painel.exemplo", "segredo", registrar = { registro = it }).batida(batida())

        assertTrue(ok)
        assertEquals("", registro)
    }
}

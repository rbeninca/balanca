package br.edu.ifsc.balancagfig.painel

import br.edu.ifsc.balancagfig.atualizacao.Rede
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

class FonteAlvoTest {

    private class RedeFalsa(private val resposta: () -> String) : Rede {
        override fun obterTexto(url: String): String = resposta()
        override fun baixar(url: String, destino: File, progresso: (Long, Long) -> Unit) =
            throw IllegalStateException("não deveria baixar")
        override fun publicar(url: String, corpoJson: String, chave: String): String? =
            throw IllegalStateException("não deveria publicar")
    }

    private fun fonte(json: String) = FonteAlvoHttp(RedeFalsa { json }, "https://painel.exemplo/alvo")

    @Test
    fun leOAlvoDoPainel() {
        assertEquals("2.8.501", fonte("""{"alvo":"2.8.501"}""").alvo().toString())
    }

    @Test
    fun alvoNuloLiberaGeral() {
        assertNull(fonte("""{"alvo":null}""").alvo())
    }

    @Test
    fun campoAusenteLiberaGeral() {
        assertNull(fonte("""{"outra":"coisa"}""").alvo())
    }

    @Test
    fun valorQueNaoEVersaoLiberaGeral() {
        assertNull(fonte("""{"alvo":"a mais nova"}""").alvo())
    }

    @Test
    fun respostaQuebradaLiberaGeral() {
        assertNull(fonte("não é json").alvo())
    }

    @Test
    fun redeForaDoArLiberaGeral() {
        val f = FonteAlvoHttp(RedeFalsa { throw IllegalStateException("sem rede") }, "https://painel.exemplo/alvo")
        assertNull(f.alvo())
    }
}

package br.edu.ifsc.balancagfig.servidor

import fi.iki.elonen.NanoHTTPD
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FinalizadorRespostaTest {

    private fun resposta() =
        NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.OK, "application/json", "{}")

    @Test
    fun `fecha a conexao para o browser nao reusar socket keep-alive encerrado`() {
        // Regressão do "Failed to fetch" ao importar JSON: sem Connection: close,
        // o browser reaproveita um socket que o NanoHTTPD já fechou por ociosidade.
        val r = FinalizadorResposta.finalizar(resposta())
        assertTrue("a resposta deve pedir o fechamento da conexão", r.isCloseConnection)
    }

    @Test
    fun `reflete CORS para qualquer origem`() {
        val r = FinalizadorResposta.finalizar(resposta())
        assertEquals("*", r.getHeader("access-control-allow-origin"))
        assertEquals("GET, POST, PATCH, DELETE, OPTIONS", r.getHeader("access-control-allow-methods"))
        assertEquals("Content-Type, x-chave-api", r.getHeader("access-control-allow-headers"))
        assertEquals("86400", r.getHeader("access-control-max-age"))
    }
}

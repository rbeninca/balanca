package br.edu.ifsc.balancagfig.servidor

import fi.iki.elonen.NanoHTTPD
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ServidorHttpProbeTest {
    @Test
    fun respondeOsProbesDeConectividadeComOSucessoEsperado() {
        assertEquals(NanoHTTPD.Response.Status.NO_CONTENT to "", ServidorHttp.respostaProbe("/generate_204"))
        assertEquals(NanoHTTPD.Response.Status.NO_CONTENT to "", ServidorHttp.respostaProbe("/gen_204"))
        assertEquals("Microsoft Connect Test", ServidorHttp.respostaProbe("/connecttest.txt")!!.second)
        assertEquals("Microsoft NCSI", ServidorHttp.respostaProbe("/ncsi.txt")!!.second)
        assertEquals(true, ServidorHttp.respostaProbe("/hotspot-detect.html")!!.second.contains("Success"))
        assertEquals("success", ServidorHttp.respostaProbe("/success.txt")!!.second)
    }

    @Test
    fun caminhosNormaisNaoSaoProbe() {
        assertNull(ServidorHttp.respostaProbe("/"))
        assertNull(ServidorHttp.respostaProbe("/index.html"))
        assertNull(ServidorHttp.respostaProbe("/assets/index-abc.js"))
    }
}

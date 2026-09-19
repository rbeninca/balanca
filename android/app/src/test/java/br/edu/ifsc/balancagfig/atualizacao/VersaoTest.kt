package br.edu.ifsc.balancagfig.atualizacao

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VersaoTest {
    @Test
    fun analisaComESemPrefixo() {
        assertEquals(Versao(2, 3, 0), Versao.analisar("v2.3.0"))
        assertEquals(Versao(2, 3, 0), Versao.analisar("2.3.0"))
        assertEquals(Versao(2, 3, 0), Versao.analisar(" 2.3 "))
    }

    @Test
    fun rejeitaTagsQueNaoSaoVersao() {
        assertNull(Versao.analisar("v0.1.0a"))
        assertNull(Versao.analisar("firmware-V17"))
        assertNull(Versao.analisar(""))
        assertNull(Versao.analisar(null))
    }

    @Test
    fun comparaNumericamenteENaoComoTexto() {
        assertTrue(Versao.analisar("2.10.0")!! > Versao.analisar("2.9.1")!!)
        assertTrue(Versao.analisar("3.0.0")!! > Versao.analisar("2.99.99")!!)
        assertTrue(Versao.analisar("2.3.1")!! > Versao.analisar("2.3.0")!!)
        assertEquals("2.3.0", Versao(2, 3, 0).toString())
    }
}

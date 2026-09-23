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
    fun analisaCorrecaoComTresDigitos() {
        // Numeração da 2.8.501 em diante: a última casa ganhou três dígitos para
        // não acabar nunca mais. O parser já lia assim — agora está travado.
        assertEquals(Versao(2, 8, 501), Versao.analisar("2.8.501"))
        assertEquals(Versao(2, 8, 501), Versao.analisar("v2.8.501"))
        assertEquals("2.8.501", Versao(2, 8, 501).toString())
    }

    @Test
    fun correcaoComTresDigitosComparaNumericamente() {
        // A última casa é número, não texto — e é por isso que a numeração nova
        // começa na 501: a primeira release de três dígitos precisa ser maior que
        // a 2.8.5, senão quem já está nela não a veria como novidade.
        assertTrue(Versao.analisar("2.8.501")!! > Versao.analisar("2.8.5")!!)
        assertTrue(Versao.analisar("2.8.001")!! < Versao.analisar("2.8.5")!!)
        // "2.8.005" é o mesmo número que "2.8.5" — nunca publicar assim.
        assertEquals(Versao(2, 8, 5), Versao.analisar("2.8.005"))
    }

    @Test
    fun comparaNumericamenteENaoComoTexto() {
        assertTrue(Versao.analisar("2.10.0")!! > Versao.analisar("2.9.1")!!)
        assertTrue(Versao.analisar("3.0.0")!! > Versao.analisar("2.99.99")!!)
        assertTrue(Versao.analisar("2.3.1")!! > Versao.analisar("2.3.0")!!)
        assertEquals("2.3.0", Versao(2, 3, 0).toString())
    }
}

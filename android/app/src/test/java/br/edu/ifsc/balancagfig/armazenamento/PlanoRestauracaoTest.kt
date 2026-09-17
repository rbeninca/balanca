package br.edu.ifsc.balancagfig.armazenamento

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlanoRestauracaoTest {

    @Test
    fun `mesclar insere so as sessoes ausentes no banco`() {
        val plano = PlanoRestauracao.calcular(
            idsBackup = listOf("a", "b", "c"),
            idsBanco = setOf("b"),
            modo = ModoRestauracao.MESCLAR,
        )
        assertFalse(plano.limparTudo)
        assertEquals(listOf("a", "c"), plano.idsAInserir)
    }

    @Test
    fun `mesclar sem novidades nao insere nada`() {
        val plano = PlanoRestauracao.calcular(listOf("a", "b"), setOf("a", "b"), ModoRestauracao.MESCLAR)
        assertFalse(plano.limparTudo)
        assertTrue(plano.idsAInserir.isEmpty())
    }

    @Test
    fun `substituir limpa tudo e insere todas do backup`() {
        val plano = PlanoRestauracao.calcular(listOf("a", "b", "c"), setOf("x", "y"), ModoRestauracao.SUBSTITUIR)
        assertTrue(plano.limparTudo)
        assertEquals(listOf("a", "b", "c"), plano.idsAInserir)
    }

    @Test
    fun `backup vazio nao insere nada em nenhum modo`() {
        assertTrue(PlanoRestauracao.calcular(emptyList(), setOf("a"), ModoRestauracao.MESCLAR).idsAInserir.isEmpty())
        val sub = PlanoRestauracao.calcular(emptyList(), setOf("a"), ModoRestauracao.SUBSTITUIR)
        assertTrue(sub.limparTudo)
        assertTrue(sub.idsAInserir.isEmpty())
    }
}

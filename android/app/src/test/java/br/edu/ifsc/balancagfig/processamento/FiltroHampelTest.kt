package br.edu.ifsc.balancagfig.processamento

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Paridade com pacotes/processamento/testes/filtros/FiltroHampel.teste.ts (Fase 4). */
class FiltroHampelTest {
    private fun passar(f: FiltroHampel, xs: List<Double>) = xs.map(f::aplicarDetalhado)

    @Test
    fun outlierIsoladoSubstituidoPelaMediana() {
        val r = passar(FiltroHampel(7, 3.0), listOf(100.0, 101.0, 99.0, 100.0, 5000.0, 101.0, 100.0))
        assertTrue(r[4].outlier); assertEquals(100.0, r[4].valor, 1e-9)
        assertEquals(1, r.count { it.outlier })
        assertEquals(101.0, r[5].valor, 0.0)
    }

    @Test
    fun mudancaSustentadaAtravessaDepoisDeMetadeDaJanela() {
        val saida = passar(FiltroHampel(7, 3.0), List(7) { 100.0 } + List(7) { 200.0 }).map { it.valor }
        assertEquals(100.0, saida[7], 0.0)
        assertEquals(200.0, saida[10], 0.0)
        assertEquals(listOf(200.0, 200.0, 200.0), saida.subList(11, 14))
    }

    @Test
    fun pisoEmSigmaComMadZero() {
        val f = FiltroHampel(5, 3.0, 1e-3)
        passar(f, List(5) { 1.0 })
        assertEquals(FiltroHampel.Resultado(1.002, false), f.aplicarDetalhado(1.002))
        assertTrue(f.aplicarDetalhado(1.5).outlier)
    }

    @Test
    fun aquecimentoPassaDireto() {
        val f = FiltroHampel(7)
        assertFalse(f.aplicarDetalhado(50.0).outlier)
        assertFalse(f.aplicarDetalhado(5000.0).outlier)
    }

    @Test
    fun senoideLisaComK35NaoDispara() {
        val k35 = FiltroHampel(7, 3.5, 1e-3)
        var o = 0
        for (i in 0 until 400) if (k35.aplicarDetalhado(5 * kotlin.math.sin(2 * Math.PI * i / 80)).outlier) o++
        assertEquals(0, o)
    }

    @Test
    fun janelaInvalidaRecusada() {
        try { FiltroHampel(4); assert(false) } catch (_: IllegalArgumentException) { }
    }
}

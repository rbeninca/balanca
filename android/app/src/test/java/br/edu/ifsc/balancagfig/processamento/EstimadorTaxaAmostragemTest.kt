package br.edu.ifsc.balancagfig.processamento

import br.edu.ifsc.balancagfig.protocolo.PacoteDados
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlin.math.PI

/** Paridade com testes/analise/EstimadorTaxaAmostragem.teste.ts e testes/pipeline/PipelineTaxa.teste.ts (Fase 3). */
class EstimadorTaxaAmostragemTest {

    private fun marcas(hz: Double, n: Int, inicio: Double = 1000.0): List<Long> =
        (0 until n).map { (inicio + it * 1000.0 / hz).roundToLong() }

    @Test
    fun poucasAmostrasDevolveNull() {
        val e = EstimadorTaxaAmostragem()
        marcas(80.0, 8).forEach(e::adicionarTimestamp)
        assertNull(e.obterHz()); assertNull(e.obterHzEstavel()); assertFalse(e.consumirMudanca())
    }

    @Test
    fun oitentaHzComDtAlternando12e13() {
        val e = EstimadorTaxaAmostragem()
        marcas(80.0, 64).forEach(e::adicionarTimestamp)
        assertTrue(e.obterHz()!! > 79 && e.obterHz()!! < 81)
        assertTrue(e.consumirMudanca()); assertFalse(e.consumirMudanca())
    }

    @Test
    fun histereseDe1PorCentoComJanelaCheia() {
        val e = EstimadorTaxaAmostragem(64)
        marcas(80.0, 64).forEach(e::adicionarTimestamp)
        val estavel = e.obterHzEstavel()!!; e.consumirMudanca()
        marcas(80.4, 64, 1000 + 64 * 12.5).forEach(e::adicionarTimestamp)
        assertEquals(estavel, e.obterHzEstavel()!!, 0.0); assertFalse(e.consumirMudanca())
        marcas(120.0, 128, 1000 + 128 * 12.5).forEach(e::adicionarTimestamp)
        assertTrue(abs(e.obterHzEstavel()!! - 120) / 120 < 0.01); assertTrue(e.consumirMudanca())
        assertEquals(120.0, e.obterHz()!!, 0.5)
    }

    @Test
    fun primeiroValorComPoucasAmostrasDepoisSoComJanelaCheia() {
        val e = EstimadorTaxaAmostragem(64)
        marcas(80.0, 12).forEach(e::adicionarTimestamp)
        assertTrue(e.obterHzEstavel() != null); e.consumirMudanca()
        marcas(100.0, 40, 1000 + 12 * 12.5).forEach(e::adicionarTimestamp)
        assertFalse(e.consumirMudanca())
        marcas(100.0, 80, 1000 + 12 * 12.5 + 40 * 10).forEach(e::adicionarTimestamp)
        assertTrue(e.consumirMudanca())
        assertEquals(100.0, e.obterHzEstavel()!!, 0.5)
    }

    @Test
    fun saltoRecomecaAJanela() {
        val e = EstimadorTaxaAmostragem()
        marcas(80.0, 64).forEach(e::adicionarTimestamp)
        e.adicionarTimestamp((1000 + 64 * 12.5 + 5000).roundToLong())
        assertNull(e.obterHz())
        marcas(80.0, 20, 1000 + 64 * 12.5 + 5000 + 12.5).forEach(e::adicionarTimestamp)
        assertEquals(80.0, e.obterHz()!!, 0.5)
        e.adicionarTimestamp(500); assertNull(e.obterHz())

        val g = EstimadorTaxaAmostragem()
        marcas(80.0, 64).forEach(g::adicionarTimestamp)
        g.adicionarTimestamp(marcas(80.0, 64)[63] + 40)   // gap do display da ESP: não recomeça
        assertTrue(g.obterHz() != null)
    }

    private fun pacote(f: Double, t: Long) = PacoteDados(t, f.toFloat(), 0, 0)
    private fun marca(i: Int, hz: Double) = (1000 + i * 1000.0 / hz).roundToLong()
    private fun cfg() = ConfiguracaoPipeline(limiarZonaMortaN = 0.5, janelaMediaMovel = 3, tempoMinFimMs = 100)

    private fun amplitudeSaida(p: PipelineProcessamento, fSinal: Double, fs: Double, n: Int = 400): Double {
        var max = 0.0
        for (i in 0 until n) {
            val r = p.processar(pacote(sin(2 * PI * fSinal * i / fs), marca(i, fs)))
            if (i > n - 80) max = maxOf(max, abs(r.forcaNewton))
        }
        return max
    }

    @Test
    fun pipelineExpoeAFsEstimadaESoUsaSeNaoFixada() {
        val p = PipelineProcessamento(cfg())
        assertNull(p.obterConfig().taxaEstimadaHz)
        for (i in 0 until 64) p.processar(pacote(0.0, marca(i, 80.0)))
        assertEquals(80.0, p.obterConfig().taxaEstimadaHz!!, 0.5)
        assertTrue(p.consumirMudancaTaxa()); assertFalse(p.consumirMudancaTaxa())

        val fixo = PipelineProcessamento(cfg().copy(taxaAmostragemHz = 80.0))
        fixo.atualizarConfig(PipelinePatch(ativoNotch = true))
        for (i in 0 until 64) fixo.processar(pacote(0.0, marca(i, 200.0)))
        assertEquals(200.0, fixo.obterConfig().taxaEstimadaHz!!, 0.5)
        assertFalse(fixo.consumirMudancaTaxa())
        assertEquals(80.0, fixo.obterConfig().config.taxaAmostragemHz!!, 0.0)
    }

    @Test
    fun notchUsaAFsRealA200Hz() {
        val em60 = PipelineProcessamento(cfg()).also { it.atualizarConfig(PipelinePatch(ativoNotch = true, freqNotchHz = 60.0, qNotch = 10.0)) }
        val em10 = PipelineProcessamento(cfg()).also { it.atualizarConfig(PipelinePatch(ativoNotch = true, freqNotchHz = 60.0, qNotch = 10.0)) }
        assertTrue(amplitudeSaida(em60, 60.0, 200.0) < 0.15)
        assertTrue(amplitudeSaida(em10, 10.0, 200.0) > 0.9)
    }
}

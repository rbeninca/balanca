package br.edu.ifsc.balancagfig.processamento

import br.edu.ifsc.balancagfig.protocolo.PacoteDados
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.roundToLong
import kotlin.math.sin

/** Paridade com testes/filtros/FiltroButterworth.teste.ts e testes/pipeline/PipelineButterworth.teste.ts (Fase 5). */
class FiltroButterworthTest {
    private fun ganho(f: FiltroButterworth, fSinal: Double, fs: Double, n: Int = 600): Double {
        var max = 0.0
        for (i in 0 until n) { val y = f.aplicar(sin(2 * Math.PI * fSinal * i / fs)); if (i >= n - 100) max = maxOf(max, abs(y)) }
        return max
    }

    @Test
    fun ganhoAbaixoNoEAcimaDoCorte() {
        assertTrue(ganho(FiltroButterworth(10.0, 80.0), 2.0, 80.0) > 0.97)
        val g = ganho(FiltroButterworth(10.0, 80.0), 10.0, 80.0)
        assertTrue(g > 0.66 && g < 0.75)
        assertTrue(ganho(FiltroButterworth(10.0, 80.0), 30.0, 80.0) < 0.12)
    }

    @Test
    fun dcUnitarioDegrauEImpulso() {
        val f = FiltroButterworth(10.0, 80.0)
        var y = 0.0; repeat(200) { y = f.aplicar(5.0) }
        assertEquals(5.0, y, 1e-6)
        val g = FiltroButterworth(10.0, 80.0)
        var max = 0.0; repeat(100) { max = maxOf(max, g.aplicar(1.0)) }
        assertTrue(max > 0.99 && max < 1.06)
        val h = FiltroButterworth(10.0, 80.0); h.aplicar(1.0)
        var z = 0.0; repeat(200) { z = h.aplicar(0.0) }
        assertTrue(abs(z) < 1e-6)
    }

    @Test
    fun validacaoEConfigurarSemSalto() {
        assertTrue(FiltroButterworth.valido(10.0, 80.0)); assertFalse(FiltroButterworth.valido(40.0, 80.0)); assertFalse(FiltroButterworth.valido(0.0, 80.0))
        try { FiltroButterworth(50.0, 80.0); assert(false) } catch (_: IllegalArgumentException) { }
        val f = FiltroButterworth(10.0, 80.0)
        var y = 0.0; repeat(100) { y = f.aplicar(3.0) }
        f.configurar(10.0, 83.3)
        assertTrue(abs(f.aplicar(3.0) - y) < 0.05)
    }

    private fun pacote(f: Double, t: Long) = PacoteDados(t, f.toFloat(), 0, 0)
    private fun marca(i: Int, hz: Double) = (1000 + i * 1000.0 / hz).roundToLong()
    private fun cfg() = ConfiguracaoPipeline(limiarZonaMortaN = 0.5, janelaMediaMovel = 3, tempoMinFimMs = 100)

    @Test
    fun pipelineInvalidoPassaDiretoEAvisa() {
        val p = PipelineProcessamento(cfg().copy(taxaAmostragemHz = 80.0))
        p.atualizarConfig(PipelinePatch(filtroPrincipal = FiltroPrincipal.BUTTERWORTH, frequenciaCorteHz = 45.0))
        assertFalse(p.obterConfig().butterworthValido)
        assertEquals(7.0, p.processar(pacote(7.0, 1000)).forcaNewton, 0.0)
        p.atualizarConfig(PipelinePatch(frequenciaCorteHz = 10.0))
        assertTrue(p.obterConfig().butterworthValido)
        assertTrue(p.processar(pacote(7.0, 1013)).forcaNewton != 7.0)
    }

    @Test
    fun fsEstimadaPodeInvalidarOCorte() {
        val p = PipelineProcessamento(cfg())
        p.atualizarConfig(PipelinePatch(filtroPrincipal = FiltroPrincipal.BUTTERWORTH, frequenciaCorteHz = 45.0))
        assertTrue(p.obterConfig().butterworthValido)
        for (i in 0 until 300) p.processar(pacote(0.0, marca(i, 80.0)))
        assertFalse(p.obterConfig().butterworthValido)
    }
}

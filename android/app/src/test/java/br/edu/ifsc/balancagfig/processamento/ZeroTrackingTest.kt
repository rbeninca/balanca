package br.edu.ifsc.balancagfig.processamento

import br.edu.ifsc.balancagfig.protocolo.PacoteDados
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

/** Paridade com testes/filtros/ZeroTracking.teste.ts e testes/pipeline/PipelineZeroTracking.teste.ts (Fase 8). */
class ZeroTrackingTest {
    private val dt = 12.5

    @Test
    fun derivaLentaCompensadaEForcaRealNao() {
        val z = ZeroTracking(0.05, 3000, 0.01)
        var saida = 0.0
        for (i in 0 until 4000) saida = z.aplicar(0.03 * (i / 4000.0), (i * dt).toLong())
        assertTrue(z.obterOffset() > 0.02); assertTrue(abs(saida) < 0.005)
        val f = ZeroTracking(0.05, 3000, 0.01)
        for (i in 0 until 4000) saida = f.aplicar(0.5, (i * dt).toLong())
        assertEquals(0.0, f.obterOffset(), 0.0); assertEquals(0.5, saida, 0.0)
    }

    @Test
    fun transitorioBloqueioEVariacaoRapida() {
        val z = ZeroTracking(0.05, 3000, 0.01)
        for (i in 0 until 300) z.aplicar(0.02, (i * dt).toLong())
        val antes = z.obterOffset(); assertTrue(antes > 0)
        z.aplicar(5.0, (300 * dt).toLong())
        for (i in 301 until 500) z.aplicar(0.02, (i * dt).toLong())
        assertEquals(antes, z.obterOffset(), 0.0)
        val b = ZeroTracking(0.05, 3000, 0.01)
        for (i in 0 until 1000) b.aplicar(0.02, (i * dt).toLong(), bloqueado = true)
        assertEquals(0.0, b.obterOffset(), 0.0)
        val v = ZeroTracking(0.05, 3000, 0.01, 0.01)
        for (i in 0 until 1000) v.aplicar(if (i % 2 == 0) 0.04 else -0.04, (i * dt).toLong())
        assertEquals(0.0, v.obterOffset(), 0.0)
    }

    private fun pacote(f: Double, t: Long) = PacoteDados(t, f.toFloat(), 0, 0)
    private fun cfg() = ConfiguracaoPipeline(limiarZonaMortaN = 0.5, janelaMediaMovel = 3, tempoMinFimMs = 100)
    private val zt = PipelinePatch(ativoZeroTracking = true, zeroTrackingLimiarN = 0.1, zeroTrackingTempoMs = 200, zeroTrackingAlpha = 0.05)

    @Test
    fun pipelineCompensaExpoeOffsetEBloqueiaNaGravacao() {
        val p = PipelineProcessamento(cfg())
        assertFalse(p.obterConfig().ativoZeroTracking)
        p.atualizarConfig(zt)
        var r = p.processar(pacote(0.05, 0))
        for (i in 1 until 400) r = p.processar(pacote(0.05, (i * dt).toLong()))
        assertEquals(0.05, p.obterConfig().zeroTrackingOffsetN, 1e-3); assertTrue(abs(r.forcaNewton) < 0.002)
        assertTrue(p.consumirMudancaOffset()); assertFalse(p.consumirMudancaOffset())

        val g = PipelineProcessamento(cfg()); g.atualizarConfig(zt); g.definirGravando(true)
        for (i in 0 until 400) g.processar(pacote(0.05, (i * dt).toLong()))
        assertEquals(0.0, g.obterConfig().zeroTrackingOffsetN, 0.0)
        g.definirGravando(false)
        for (i in 400 until 800) g.processar(pacote(0.05, (i * dt).toLong()))
        assertTrue(g.obterConfig().zeroTrackingOffsetN > 0.04)
        val antes = g.obterConfig().zeroTrackingOffsetN
        g.atualizarConfig(zt.copy(ativoNotch = true, freqNotchHz = 50.0))   // reenvio dos mesmos parâmetros: mantém
        assertEquals(antes, g.obterConfig().zeroTrackingOffsetN, 0.0)
        g.atualizarConfig(PipelinePatch(ativoZeroTracking = false))
        assertEquals(0.0, g.obterConfig().zeroTrackingOffsetN, 0.0)
    }
}

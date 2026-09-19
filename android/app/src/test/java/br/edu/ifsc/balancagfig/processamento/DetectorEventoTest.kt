package br.edu.ifsc.balancagfig.processamento

import br.edu.ifsc.balancagfig.protocolo.PacoteDados
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Paridade com testes/analise/DetectorEvento.teste.ts e testes/pipeline/PipelineDetector.teste.ts (Fase 7). */
class DetectorEventoTest {
    @Test
    fun reproduzODetectorQueimaComSaidaIgualEntrada() {
        val antigo = DetectorQueima(1.0, 100)
        val novo = DetectorEvento(ConfigDetectorEvento(1.0, 1.0, 0, 100))
        listOf(0.0, 5.0, 5.0, 0.0, 0.0, 0.0, 5.0, 0.0, 0.5, 1.0, 1.01, 0.0, 0.0, 0.0, 0.0).forEachIndexed { i, f ->
            assertEquals(antigo.atualizar(f, i * 30L), novo.atualizar(f, i * 30L))
        }
    }

    @Test
    fun tempoDeEntradaEHisterese() {
        val d = DetectorEvento(ConfigDetectorEvento(0.2, 0.1, 30, 100))
        assertFalse(d.atualizar(0.5, 0)); assertFalse(d.atualizar(0.5, 20)); assertTrue(d.atualizar(0.5, 30))
        assertTrue(d.atualizar(0.15, 50))
        assertTrue(d.atualizar(0.05, 100)); assertTrue(d.atualizar(0.05, 150))
        assertTrue(d.atualizar(0.15, 160))
        assertTrue(d.atualizar(0.05, 200)); assertFalse(d.atualizar(0.05, 300))
        val spike = DetectorEvento(ConfigDetectorEvento(0.2, 0.1, 30, 100))
        assertFalse(spike.atualizar(50.0, 0)); assertFalse(spike.atualizar(0.0, 12)); assertFalse(spike.atualizar(50.0, 24)); assertFalse(spike.atualizar(50.0, 36))
    }

    @Test
    fun validacao() {
        assertEquals(ConfigDetectorEvento(0.2, 0.2, 0, 0), DetectorEvento(ConfigDetectorEvento(0.2, 0.5, -5, -1)).config)
    }

    private fun pacote(f: Double, t: Long) = PacoteDados(t, f.toFloat(), 0, 0)
    private fun cfg() = ConfiguracaoPipeline(limiarZonaMortaN = 0.5, janelaMediaMovel = 3, tempoMinFimMs = 100)

    @Test
    fun pipelineCompatEDesacoplamento() {
        val p = PipelineProcessamento(cfg())
        assertEquals(ConfigDetectorEvento(0.5, 0.5, 0, 100), p.obterConfig().detector)
        p.atualizarConfig(PipelinePatch(limiarZonaMortaN = 0.8, tempoMinFimMs = 50))
        assertEquals(ConfigDetectorEvento(0.8, 0.8, 0, 50), p.obterConfig().detector)
        p.atualizarConfig(PipelinePatch(ativoDetectorQueima = true, limiarEntradaN = 5.0, limiarSaidaN = 2.0, tempoEntradaMs = 30, tempoSaidaMs = 100))
        p.atualizarConfig(PipelinePatch(limiarZonaMortaN = 0.01))
        assertEquals(5.0, p.obterConfig().detector.limiarEntradaN, 0.0)
        p.atualizarConfig(PipelinePatch(limiarSaidaN = 9.0))
        assertEquals(5.0, p.obterConfig().detector.limiarSaidaN, 0.0)

        val q = PipelineProcessamento(cfg().copy(limiarEntradaN = 5.0, limiarSaidaN = 2.0, tempoEntradaMs = 30, tempoSaidaMs = 100))
        q.atualizarConfig(PipelinePatch(ativoDetectorQueima = true))
        assertFalse(q.processar(pacote(20.0, 0)).emQueima); assertTrue(q.processar(pacote(20.0, 30)).emQueima)
        assertTrue(q.processar(pacote(3.0, 60)).emQueima); assertTrue(q.processar(pacote(1.0, 100)).emQueima); assertFalse(q.processar(pacote(1.0, 200)).emQueima)
    }
}

package br.edu.ifsc.balancagfig.processamento

import br.edu.ifsc.balancagfig.protocolo.PacoteDados
import org.junit.Assert.assertEquals
import org.junit.Test

/** Paridade com testes/pipeline/PipelineEtapas.teste.ts (Fase 6). */
class EtapaTratamentoTest {
    private fun pacote(f: Double, t: Long = 0) = PacoteDados(t, f.toFloat(), 0, 0)
    private fun cfg() = ConfiguracaoPipeline(limiarZonaMortaN = 0.5, janelaMediaMovel = 3, tempoMinFimMs = 100)

    @Test
    fun zonaMortaDepoisDoFiltroPrincipal() {
        val q = PipelineProcessamento(cfg())
        q.atualizarConfig(PipelinePatch(ativoZonaMorta = true, filtroPrincipal = FiltroPrincipal.MEDIA_MOVEL, janelaMediaMovel = 3))
        q.processar(pacote(0.6)); q.processar(pacote(0.6))
        assertEquals(0.0, q.processar(pacote(0.2)).forcaNewton, 0.0)   // média 0,467 < 0,5 → 0 (antes saía 0,4)
    }

    @Test
    fun fonteDoImpulso() {
        val final = PipelineProcessamento(cfg())
        final.atualizarConfig(PipelinePatch(ativoZonaMorta = true))
        assertEquals(FonteImpulso.FINAL, final.obterConfig().fonteCalculoImpulso)
        var ultimo = 0.0
        for (i in 0 until 10) ultimo = final.processar(pacote(0.3, i * 100L)).impulsoAcumuladoNs
        assertEquals(0.0, ultimo, 0.0)

        val filtrado = PipelineProcessamento(cfg().copy(fonteCalculoImpulso = FonteImpulso.FILTRADO))
        filtrado.atualizarConfig(PipelinePatch(ativoZonaMorta = true))
        for (i in 0 until 10) ultimo = filtrado.processar(pacote(0.3, i * 100L)).impulsoAcumuladoNs
        assertEquals(0.3 * 0.9, ultimo, 1e-6)
        assertEquals(0.0, filtrado.processar(pacote(0.3, 1000)).forcaNewton, 0.0)
        assertEquals(null, FonteImpulso.deValor("invalido"))
    }
}

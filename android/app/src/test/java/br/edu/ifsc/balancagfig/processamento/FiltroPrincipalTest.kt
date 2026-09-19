package br.edu.ifsc.balancagfig.processamento

import br.edu.ifsc.balancagfig.protocolo.PacoteDados
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Paridade com pacotes/processamento/testes/pipeline/filtroPrincipal.teste.ts e PipelineEtapas.teste.ts (Fase 2). */
class FiltroPrincipalTest {
    private val N = FiltroPrincipal.NENHUM

    @Test
    fun explicitoVenceAsFlags() {
        assertEquals(FiltroPrincipal.SAVITZKY_GOLAY, resolverFiltroPrincipal(N, FiltroPrincipal.SAVITZKY_GOLAY, FlagsSuavizadores(ativoKalman = true)))
        assertEquals(N, resolverFiltroPrincipal(FiltroPrincipal.EMA, N, FlagsSuavizadores()))
    }

    @Test
    fun flagLigadaEscolheEAUltimaVence() {
        assertEquals(FiltroPrincipal.EMA, resolverFiltroPrincipal(N, null, FlagsSuavizadores(ativoEMA = true)))
        assertEquals(FiltroPrincipal.KALMAN, resolverFiltroPrincipal(N, null, FlagsSuavizadores(ativoSG = true, ativoKalman = true)))
        assertEquals(FiltroPrincipal.EMA, resolverFiltroPrincipal(N, null, FlagsSuavizadores(ativoMediaMovel = true, ativoEMA = true)))
    }

    @Test
    fun flagDesligadaSoDesligaOAtual() {
        assertEquals(N, resolverFiltroPrincipal(FiltroPrincipal.EMA, null, FlagsSuavizadores(ativoEMA = false)))
        assertEquals(FiltroPrincipal.EMA, resolverFiltroPrincipal(FiltroPrincipal.EMA, null, FlagsSuavizadores(ativoSG = false)))
        assertEquals(FiltroPrincipal.MEDIA_MOVEL, resolverFiltroPrincipal(FiltroPrincipal.KALMAN, null, FlagsSuavizadores(ativoKalman = false, ativoMediaMovel = true)))
    }

    @Test
    fun flagsDerivadasSaoExclusivasEIdaEVolta() {
        for (tipo in FiltroPrincipal.entries) {
            val f = FlagsSuavizadores.de(tipo)
            val ligadas = listOf(f.ativoMediaMovel, f.ativoEMA, f.ativoSG, f.ativoKalman).count { it == true }
            assertEquals(if (tipo == N) 0 else 1, ligadas)
            assertEquals(tipo, resolverFiltroPrincipal(N, null, f))
        }
        assertNull(FiltroPrincipal.deValor("butterworth"))
        assertEquals(FiltroPrincipal.EMA, FiltroPrincipal.deValor("ema"))
    }

    @Test
    fun pipelineNuncaEncadeiaDoisSuavizadores() {
        val p = PipelineProcessamento(ConfiguracaoPipeline(limiarZonaMortaN = 0.5, janelaMediaMovel = 3, tempoMinFimMs = 100))
        p.atualizarConfig(PipelinePatch(ativoMediaMovel = true, janelaMediaMovel = 2, ativoEMA = true, alphaEMA = 0.5))
        val e = p.obterConfig()
        assertEquals(FiltroPrincipal.EMA, e.filtroPrincipal)
        assertFalse(e.ativoMediaMovel); assertTrue(e.ativoEMA); assertFalse(e.ativoSG); assertFalse(e.ativoKalman)
        p.processar(PacoteDados(0, 10f, 0, 0))
        assertEquals(5.0, p.processar(PacoteDados(1, 0f, 0, 0)).forcaNewton, 1e-9)   // só EMA (antes MM+EMA dava 7.5)
    }

    @Test
    fun trocaExplicitaReiniciaOFiltroNovo() {
        val p = PipelineProcessamento(ConfiguracaoPipeline(filtroPrincipal = FiltroPrincipal.MEDIA_MOVEL, janelaMediaMovel = 3))
        repeat(3) { p.processar(PacoteDados(it.toLong(), 10f, 0, 0)) }
        p.atualizarConfig(PipelinePatch(filtroPrincipal = FiltroPrincipal.KALMAN))
        assertTrue(p.obterConfig().ativoKalman)
        assertEquals(10.0, p.processar(PacoteDados(5, 10f, 0, 0)).forcaNewton, 1e-6)
        p.atualizarConfig(PipelinePatch(filtroPrincipal = N))
        assertNull(p.processar(PacoteDados(6, 3.3f, 0, 0)).forcaNewtonBruta)
    }
}

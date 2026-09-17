package br.edu.ifsc.balancagfig.processamento

import br.edu.ifsc.balancagfig.protocolo.PacoteDados
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Paridade com pacotes/processamento/testes/pipeline/PipelineProcessamento.teste.ts. */
class PipelineProcessamentoTest {

    private fun pacote(forcaNewtons: Double, marcaTemporal: Long = 0) =
        PacoteDados(marcaTemporal, forcaNewtons.toFloat(), 0, 0)

    private fun configBase() = ConfiguracaoPipeline(
        limiarZonaMortaN = 0.5, janelaMediaMovel = 1, fatorCalibracao = 1.0, deslocamentoTara = 0.0, tempoMinFimMs = 100,
    )

    @Test
    fun `UT-2_7_1 - ruido abaixo do limiar vira zero com zona morta`() {
        val p = PipelineProcessamento(configBase())
        p.atualizarConfig(PipelinePatch(ativoZonaMorta = true))
        val r = p.processar(pacote(0.3))
        assertEquals(0.0, r.forcaNewton, 0.0)
        assertFalse(r.emQueima)
    }

    @Test
    fun `UT-2_7_3 - 200 N passa direto sem filtros`() {
        assertEquals(200.0, PipelineProcessamento(configBase()).processar(pacote(200.0)).forcaNewton, 1e-6)
    }

    @Test
    fun `UT-2_7_4 e 2_7_5 - temperatura 0 e marcaTemporal preservada`() {
        val r = PipelineProcessamento(configBase()).processar(pacote(200.0, 12345))
        assertEquals(0.0, r.temperatura, 0.0)
        assertEquals(12345L, r.marcaTemporal)
    }

    @Test
    fun `UT-2_7_6 - impulso 10 N por 0_5 s = 5 N s`() {
        val p = PipelineProcessamento(configBase())
        p.processar(pacote(10.0, 0))
        assertEquals(5.0, p.processar(pacote(10.0, 500)).impulsoAcumuladoNs, 0.05)
    }

    @Test
    fun `UT-2_7_7 - reiniciar zera impulso mas detector volta a detectar`() {
        val p = PipelineProcessamento(configBase())
        p.atualizarConfig(PipelinePatch(ativoDetectorQueima = true))
        p.processar(pacote(200.0, 0))
        p.processar(pacote(200.0, 500))
        p.reiniciar()
        val r = p.processar(pacote(200.0, 600))
        assertEquals(0.0, r.impulsoAcumuladoNs, 1e-5)
        assertTrue(r.emQueima)
    }

    @Test
    fun `UT-2_7_8 - atualizarCalibracao muda fator em runtime`() {
        val p = PipelineProcessamento(configBase())
        p.atualizarCalibracao(4.0, 0.0)
        assertEquals(4.0, p.obterFatorCalibracao(), 0.0)
    }

    @Test
    fun `UT-2_7_2 - emQueima alterna com histerese de 100 ms`() {
        val p = PipelineProcessamento(configBase())
        p.atualizarConfig(PipelinePatch(ativoDetectorQueima = true))
        assertFalse(p.processar(pacote(0.0, 0)).emQueima)
        assertTrue(p.processar(pacote(200.0, 100)).emQueima)
        assertTrue(p.processar(pacote(0.0, 200)).emQueima)
        assertFalse(p.processar(pacote(0.0, 301)).emQueima)
    }

    @Test
    fun `UT-2_7_9 - ligar e desligar mediana nao suja o estado`() {
        val p1 = PipelineProcessamento(configBase())
        val p2 = PipelineProcessamento(configBase())
        p2.atualizarConfig(PipelinePatch(ativoMediana = true))
        p2.atualizarConfig(PipelinePatch(ativoMediana = false))
        for (f in listOf(0.0, 1.0, 5.0, 100.0, 200.0)) {
            val r1 = p1.processar(pacote(f, (f * 10).toLong()))
            val r2 = p2.processar(pacote(f, (f * 10).toLong()))
            assertEquals(r1.forcaNewton, r2.forcaNewton, 1e-5)
        }
    }

    @Test
    fun `UT-2_7_10 e 2_7_11 - forcaNewtonBruta so aparece com filtro novo ativo`() {
        val p = PipelineProcessamento(configBase())
        assertNull(p.processar(pacote(10.0)).forcaNewtonBruta)
        p.atualizarConfig(PipelinePatch(ativoEMA = true, alphaEMA = 0.2))
        p.processar(pacote(0.0, 0))
        val r = p.processar(pacote(10.0, 10))
        assertNotNull(r.forcaNewtonBruta)
        assertEquals(10.0, r.forcaNewtonBruta!!, 1e-9)
        assertNotEquals(r.forcaNewtonBruta!!, r.forcaNewton, 1e-6)
    }

    @Test
    fun `UT-2_7_13 - mediana elimina spike`() {
        val p = PipelineProcessamento(configBase())
        p.atualizarConfig(PipelinePatch(ativoMediana = true, janelaMediana = 5))
        listOf(10.0, 10.0, 10.0, 10.0).forEachIndexed { i, f -> p.processar(pacote(f, i * 10L)) }
        val r = p.processar(pacote(1000.0, 40))
        assertEquals(10.0, r.forcaNewton, 1e-9)
    }

    @Test
    fun `UT-2_7_15 - Savitzky-Golay preserva sinal constante`() {
        val p = PipelineProcessamento(configBase())
        p.atualizarConfig(PipelinePatch(ativoSG = true, janelaSG = 7))
        var r = p.processar(pacote(50.0, 0))
        repeat(10) { r = p.processar(pacote(50.0, (it + 1) * 10L)) }
        assertEquals(50.0, r.forcaNewton, 1e-6)
    }

    @Test
    fun `UT-2_7_16 - Kalman converge para valor constante`() {
        val p = PipelineProcessamento(configBase())
        p.atualizarConfig(PipelinePatch(ativoKalman = true, kalmanQ = 0.01, kalmanR = 1.0))
        var r = p.processar(pacote(0.0, 0))
        repeat(200) { r = p.processar(pacote(20.0, (it + 1) * 10L)) }
        assertEquals(20.0, r.forcaNewton, 0.5)
    }

    @Test
    fun `UT-2_7_17 - obterConfig reflete patch e flags`() {
        val p = PipelineProcessamento(configBase())
        p.atualizarConfig(PipelinePatch(ativoNotch = true, freqNotchHz = 50.0, limiarZonaMortaN = 1.5))
        val e = p.obterConfig()
        assertTrue(e.ativoNotch)
        assertFalse(e.ativoKalman)
        assertEquals(50.0, e.config.freqNotchHz!!, 0.0)
        assertEquals(30.0, e.config.qNotch!!, 0.0)          // padrão preenchido ao configurar o notch
        assertEquals(1.5, e.config.limiarZonaMortaN, 0.0)
        assertNull(e.config.kalmanQ)                          // não tocado → continua ausente
    }

    @Test
    fun `notch a 60 Hz atenua senoide de 60 Hz amostrada a 100 Hz`() {
        val p = PipelineProcessamento(configBase())
        p.atualizarConfig(PipelinePatch(ativoNotch = true, freqNotchHz = 60.0, qNotch = 30.0, taxaAmostragemHz = 100.0))
        var pico = 0.0
        for (i in 0 until 2000) {
            val x = 10 * kotlin.math.sin(2 * Math.PI * 60 * i / 100.0)
            val y = p.processar(pacote(x, i * 10L)).forcaNewton
            if (i > 1500) pico = maxOf(pico, kotlin.math.abs(y))
        }
        assertTrue("pico residual $pico", pico < 1.0)
    }
}

package br.edu.ifsc.balancagfig.servidor

import br.edu.ifsc.balancagfig.processamento.ConfiguracaoPipeline
import br.edu.ifsc.balancagfig.processamento.LeituraProcessada
import br.edu.ifsc.balancagfig.processamento.PipelineProcessamento
import br.edu.ifsc.balancagfig.protocolo.ComandoCalibrar
import br.edu.ifsc.balancagfig.protocolo.ComandoDefinirParam
import br.edu.ifsc.balancagfig.protocolo.ComandoTarar
import br.edu.ifsc.balancagfig.protocolo.PacoteStatus
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Contrato JSON idêntico ao de pacotes/gateway/src/ServidorWebSocket.ts. */
class MensagensTest {

    @Test
    fun `LEITURA tem os campos que FonteWebSocket espera e omite forcaNewtonBruta sem filtro`() {
        val json = JSONObject(Mensagens.leitura(LeituraProcessada(1234, 9.81, 0.0, false, 0.5, 9.81, null)))
        assertEquals("LEITURA", json.getString("tipo"))
        val c = json.getJSONObject("carga")
        assertEquals(1234L, c.getLong("marcaTemporal"))
        assertEquals(9.81, c.getDouble("forcaNewton"), 0.0)
        assertEquals(0.5, c.getDouble("impulsoAcumuladoNs"), 0.0)
        assertFalse(c.getBoolean("emQueima"))
        assertFalse(c.has("forcaNewtonBruta"))
        assertFalse(c.has("forcaBruta"))
    }

    @Test
    fun `PIPELINE_ESTADO padrao bate com CFG_GATEWAY_PADRAO do frontend`() {
        val estado = PipelineProcessamento(ConfiguracaoPipeline()).obterConfig()
        val c = JSONObject(Mensagens.pipelineEstado(estado)).getJSONObject("carga")
        assertEquals(0.5, c.getDouble("limiarZonaMortaN"), 0.0)
        assertEquals(5, c.getInt("janelaMediaMovel"))
        assertEquals(1.0, c.getDouble("fatorCalibracao"), 0.0)
        assertEquals(0.0, c.getDouble("deslocamentoTara"), 0.0)
        assertEquals(100, c.getInt("tempoMinFimMs"))
        for (flag in listOf("ativoZonaMorta", "ativoMediaMovel", "ativoDetectorQueima", "ativoMediana",
            "ativoEMA", "ativoNotch", "ativoSG", "ativoKalman")) {
            assertFalse(flag, c.getBoolean(flag))
        }
        assertFalse(c.has("alphaEMA")) // opcional não definido não aparece
    }

    @Test
    fun `STATUS carrega tipo e campos do pacote`() {
        val c = JSONObject(Mensagens.status(PacoteStatus(1, 0x10, 0, 55000))).getJSONObject("carga")
        assertEquals("STATUS", c.getString("tipo"))
        assertEquals(0x10, c.getInt("codigo"))
        assertEquals(55000L, c.getLong("marcaTemporal"))
    }

    @Test
    fun `PIPELINE_CONFIG vira patch so com os campos presentes`() {
        val e = Mensagens.interpretar("""{"tipo":"PIPELINE_CONFIG","carga":{"ativoEMA":true,"alphaEMA":0.3,"janelaSG":null}}""")
        val patch = (e as Mensagens.Entrada.ConfigPipeline).patch
        assertEquals(true, patch.ativoEMA)
        assertEquals(0.3, patch.alphaEMA!!, 0.0)
        assertNull(patch.janelaSG)
        assertNull(patch.ativoKalman)
    }

    @Test
    fun `comandos do frontend viram ComandoHost`() {
        assertEquals(ComandoTarar, (Mensagens.interpretar("""{"tipo":"CMD_TARAR"}""") as Mensagens.Entrada.Comando).comando)
        val cal = (Mensagens.interpretar("""{"tipo":"CMD_CALIBRAR","massaG":500}""") as Mensagens.Entrada.Comando).comando
        assertEquals(500f, (cal as ComandoCalibrar).massaG, 0f)
        val def = (Mensagens.interpretar("""{"tipo":"CMD_DEFINIR_PARAM","paramId":2,"valorF":2.05,"valorI":7}""") as Mensagens.Entrada.Comando).comando
        assertEquals(ComandoDefinirParam(2, 2.05f, 7), def)
    }

    @Test
    fun `mensagem invalida ou desconhecida e ignorada`() {
        assertNull(Mensagens.interpretar("isso não é json"))
        assertNull(Mensagens.interpretar("""{"tipo":"XPTO"}"""))
        assertNull(Mensagens.interpretar("""{"tipo":"CMD_CALIBRAR"}""")) // sem massaG
    }

    @Test
    fun `SERIAL_OK e SERIAL_OFF sao envelopes sem carga`() {
        assertTrue(Mensagens.serialOk().contains("\"SERIAL_OK\""))
        assertFalse(JSONObject(Mensagens.serialOff()).has("carga"))
    }
}

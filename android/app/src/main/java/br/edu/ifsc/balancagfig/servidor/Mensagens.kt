package br.edu.ifsc.balancagfig.servidor

import br.edu.ifsc.balancagfig.armazenamento.GravadorSessao
import br.edu.ifsc.balancagfig.processamento.EstadoPipeline
import br.edu.ifsc.balancagfig.processamento.FiltroPrincipal
import br.edu.ifsc.balancagfig.processamento.FonteImpulso
import br.edu.ifsc.balancagfig.processamento.LeituraProcessada
import br.edu.ifsc.balancagfig.processamento.PipelinePatch
import br.edu.ifsc.balancagfig.protocolo.ComandoCalibrar
import br.edu.ifsc.balancagfig.protocolo.ComandoDefinirParam
import br.edu.ifsc.balancagfig.protocolo.ComandoHost
import br.edu.ifsc.balancagfig.protocolo.ComandoObterConfig
import br.edu.ifsc.balancagfig.protocolo.ComandoTarar
import br.edu.ifsc.balancagfig.protocolo.PacoteConfiguracao
import br.edu.ifsc.balancagfig.protocolo.PacoteStatus
import org.json.JSONArray
import org.json.JSONObject

/**
 * Serialização das mensagens do WebSocket, com os mesmos nomes de campo do
 * gateway Node (pacotes/gateway/src/ServidorWebSocket.ts) para o frontend
 * não distinguir os dois.
 *
 * Gateway → frontend: LEITURA, CONFIG, STATUS, PIPELINE_ESTADO, SERIAL_OK, SERIAL_OFF,
 *   GRAVACAO_ESTADO (gravação compartilhada no gateway + clientes conectados — só no app Android),
 *   SAUDE (batimento a cada 2 s: serial, taxa, uptime — o watchdog do frontend reconecta se ele sumir).
 * Frontend → gateway: PIPELINE_CONFIG, GRAVACAO_INICIAR/GRAVACAO_PARAR e os comandos CMD_* (repassados ao ESP).
 */
object Mensagens {

    private fun envelope(tipo: String, carga: JSONObject? = null): String =
        JSONObject().put("tipo", tipo).apply { if (carga != null) put("carga", carga) }.toString()

    fun serialOk(): String = envelope("SERIAL_OK")
    fun serialOff(): String = envelope("SERIAL_OFF")

    fun leitura(l: LeituraProcessada): String = envelope("LEITURA", JSONObject().apply {
        put("marcaTemporal", l.marcaTemporal)
        put("forcaNewton", l.forcaNewton)
        put("temperatura", l.temperatura)
        put("emQueima", l.emQueima)
        put("impulsoAcumuladoNs", l.impulsoAcumuladoNs)
        put("forcaNewtonCrua", l.forcaNewtonCrua)
        l.forcaNewtonBruta?.let { put("forcaNewtonBruta", it) }
    })

    fun config(p: PacoteConfiguracao): String = envelope("CONFIG", JSONObject().apply {
        put("tipo", "CONFIGURACAO")
        put("fatorConversao", p.fatorConversao.toDouble())
        put("gravidade", p.gravidade.toDouble())
        put("leiturasEstaveis", p.leiturasEstaveis)
        put("toleranciaEst", p.toleranciaEst.toDouble())
        put("numAmostrasMedia", p.numAmostrasMedia)
        put("numAmostrasCal", p.numAmostrasCal)
        put("usarMediaMovel", p.usarMediaMovel)
        put("usarEMA", p.usarEMA)
        put("timeoutCal", p.timeoutCal)
        put("offsetTara", p.offsetTara)
        put("capacidadeMaxGramas", p.capacidadeMaxGramas.toDouble())
        put("acuracia", p.acuracia.toDouble())
        put("modo", p.modo)
    })

    fun status(p: PacoteStatus): String = envelope("STATUS", JSONObject().apply {
        put("tipo", "STATUS")
        put("tipoStatus", p.tipoStatus)
        put("codigo", p.codigo)
        put("valor", p.valor)
        put("marcaTemporal", p.marcaTemporal)
    })

    fun pipelineEstado(e: EstadoPipeline): String = envelope("PIPELINE_ESTADO", JSONObject().apply {
        val c = e.config
        put("limiarZonaMortaN", c.limiarZonaMortaN)
        put("janelaMediaMovel", c.janelaMediaMovel)
        put("fatorCalibracao", c.fatorCalibracao)
        put("deslocamentoTara", c.deslocamentoTara)
        put("tempoMinFimMs", c.tempoMinFimMs)
        // opcionais só aparecem quando definidos, como o spread de `config` no TS
        c.janelaMediana?.let { put("janelaMediana", it) }
        c.alphaEMA?.let { put("alphaEMA", it) }
        c.freqNotchHz?.let { put("freqNotchHz", it) }
        c.qNotch?.let { put("qNotch", it) }
        c.taxaAmostragemHz?.let { put("taxaAmostragemHz", it) }
        c.janelaSG?.let { put("janelaSG", it) }
        c.kalmanQ?.let { put("kalmanQ", it) }
        c.kalmanR?.let { put("kalmanR", it) }
        put("filtroPrincipal", e.filtroPrincipal.valor)
        put("taxaEstimadaHz", e.taxaEstimadaHz ?: JSONObject.NULL)
        put("butterworthValido", e.butterworthValido)
        put("fonteCalculoImpulso", e.fonteCalculoImpulso.valor)
        c.limiarEntradaN?.let { put("limiarEntradaN", it) }
        c.limiarSaidaN?.let { put("limiarSaidaN", it) }
        c.tempoEntradaMs?.let { put("tempoEntradaMs", it) }
        c.tempoSaidaMs?.let { put("tempoSaidaMs", it) }
        put("detector", JSONObject().put("limiarEntradaN", e.detector.limiarEntradaN).put("limiarSaidaN", e.detector.limiarSaidaN)
            .put("tempoEntradaMs", e.detector.tempoEntradaMs).put("tempoSaidaMs", e.detector.tempoSaidaMs))
        c.frequenciaCorteHz?.let { put("frequenciaCorteHz", it) }
        c.janelaHampel?.let { put("janelaHampel", it) }
        c.limiarHampelSigma?.let { put("limiarHampelSigma", it) }
        put("ativoHampel", e.ativoHampel)
        c.zeroTrackingLimiarN?.let { put("zeroTrackingLimiarN", it) }
        c.zeroTrackingTempoMs?.let { put("zeroTrackingTempoMs", it) }
        c.zeroTrackingAlpha?.let { put("zeroTrackingAlpha", it) }
        put("ativoZeroTracking", e.ativoZeroTracking)
        put("zeroTrackingOffsetN", e.zeroTrackingOffsetN)
        put("ativoZonaMorta", e.ativoZonaMorta)
        put("ativoMediaMovel", e.ativoMediaMovel)
        put("ativoDetectorQueima", e.ativoDetectorQueima)
        put("ativoMediana", e.ativoMediana)
        put("ativoEMA", e.ativoEMA)
        put("ativoNotch", e.ativoNotch)
        put("ativoSG", e.ativoSG)
        put("ativoKalman", e.ativoKalman)
    })

    /** Estado da gravação no gateway + lista de clientes; enviado ao conectar e a cada mudança. */
    fun gravacaoEstado(estado: GravadorSessao.EstadoGravacao, clientes: List<ClienteWs>): String =
        envelope("GRAVACAO_ESTADO", estado.paraJson().put("clientes", JSONArray().apply {
            for (c in clientes) put(JSONObject().put("endereco", c.endereco).put("conectadoEm", c.conectadoEm))
        }))

    /** Situação da serial no batimento SAUDE. */
    enum class SerialSaude(val valor: String) { CONECTADA("conectada"), SEM_DISPOSITIVO("sem_dispositivo"), ERRO("erro") }

    /**
     * Batimento do gateway. Enviado ao conectar e a cada [INTERVALO_SAUDE_MS]:
     * distingue "conexão morta" (nada chega) de "gateway vivo sem célula"
     * (SAUDE chega, LEITURA não), para o frontend não reconectar à toa.
     */
    fun saude(
        serial: SerialSaude,
        taxaHz: Int,
        uptimeS: Long,
        clientes: Int,
        enderecos: Map<String, String> = emptyMap(),
    ): String =
        envelope("SAUDE", JSONObject().put("serial", serial.valor).put("taxaHz", taxaHz).put("uptimeS", uptimeS)
            .put("clientes", clientes).put("intervaloMs", INTERVALO_SAUDE_MS)
            // endereço por interface (eth0, wlan0…): é com esses que o box
            // aparece na rede. O frontend mostra no chip de status — o endereço
            // de conexão não serve ali, porque visto do próprio box é 127.0.0.1.
            .put("enderecos", JSONObject(enderecos as Map<*, *>)))

    const val INTERVALO_SAUDE_MS = 2000L

    /** Cliente conectado ao WebSocket. */
    data class ClienteWs(val endereco: String, val conectadoEm: Long)

    /** Mensagem recebida de um cliente, já classificada. */
    sealed interface Entrada {
        data class ConfigPipeline(val patch: PipelinePatch) : Entrada
        data class Comando(val comando: ComandoHost) : Entrada
        data class GravacaoIniciar(val nome: String) : Entrada
        data object GravacaoParar : Entrada
    }

    /** Interpreta o JSON do cliente; null se inválido ou desconhecido (o gateway TS ignora). */
    fun interpretar(json: String): Entrada? {
        val obj = try { JSONObject(json) } catch (_: Exception) { return null }
        return when (obj.optString("tipo")) {
            "PIPELINE_CONFIG" -> Entrada.ConfigPipeline(lerPatch(obj.optJSONObject("carga") ?: JSONObject()))
            "GRAVACAO_INICIAR" -> Entrada.GravacaoIniciar(obj.optJSONObject("carga")?.optString("nome") ?: "")
            "GRAVACAO_PARAR" -> Entrada.GravacaoParar
            "CMD_TARAR" -> Entrada.Comando(ComandoTarar)
            "CMD_OBTER_CONFIG" -> Entrada.Comando(ComandoObterConfig)
            "CMD_CALIBRAR" -> obj.optDoubleOrNull("massaG")?.let { Entrada.Comando(ComandoCalibrar(it.toFloat())) }
            "CMD_DEFINIR_PARAM" -> Entrada.Comando(
                ComandoDefinirParam(
                    paramId = obj.optInt("paramId"),
                    valorF = obj.optDouble("valorF", 0.0).toFloat(),
                    valorI = obj.optLong("valorI", 0),
                )
            )
            else -> null
        }
    }

    private fun lerPatch(c: JSONObject) = PipelinePatch(
        limiarZonaMortaN = c.optDoubleOrNull("limiarZonaMortaN"),
        janelaMediaMovel = c.optIntOrNull("janelaMediaMovel"),
        fatorCalibracao = c.optDoubleOrNull("fatorCalibracao"),
        deslocamentoTara = c.optDoubleOrNull("deslocamentoTara"),
        tempoMinFimMs = c.optIntOrNull("tempoMinFimMs")?.toLong(),
        janelaMediana = c.optIntOrNull("janelaMediana"),
        alphaEMA = c.optDoubleOrNull("alphaEMA"),
        freqNotchHz = c.optDoubleOrNull("freqNotchHz"),
        qNotch = c.optDoubleOrNull("qNotch"),
        taxaAmostragemHz = c.optDoubleOrNull("taxaAmostragemHz"),
        janelaSG = c.optIntOrNull("janelaSG"),
        kalmanQ = c.optDoubleOrNull("kalmanQ"),
        kalmanR = c.optDoubleOrNull("kalmanR"),
        limiarEntradaN = c.optDoubleOrNull("limiarEntradaN"),
        limiarSaidaN = c.optDoubleOrNull("limiarSaidaN"),
        tempoEntradaMs = c.optIntOrNull("tempoEntradaMs")?.toLong(),
        tempoSaidaMs = c.optIntOrNull("tempoSaidaMs")?.toLong(),
        fonteCalculoImpulso = FonteImpulso.deValor(c.optString("fonteCalculoImpulso").takeIf { c.has("fonteCalculoImpulso") }),
        frequenciaCorteHz = c.optDoubleOrNull("frequenciaCorteHz"),
        janelaHampel = c.optIntOrNull("janelaHampel"),
        limiarHampelSigma = c.optDoubleOrNull("limiarHampelSigma"),
        ativoHampel = c.optBooleanOrNull("ativoHampel"),
        ativoZeroTracking = c.optBooleanOrNull("ativoZeroTracking"),
        zeroTrackingLimiarN = c.optDoubleOrNull("zeroTrackingLimiarN"),
        zeroTrackingTempoMs = c.optIntOrNull("zeroTrackingTempoMs")?.toLong(),
        zeroTrackingAlpha = c.optDoubleOrNull("zeroTrackingAlpha"),
        ativoZonaMorta = c.optBooleanOrNull("ativoZonaMorta"),
        ativoMediaMovel = c.optBooleanOrNull("ativoMediaMovel"),
        ativoDetectorQueima = c.optBooleanOrNull("ativoDetectorQueima"),
        ativoMediana = c.optBooleanOrNull("ativoMediana"),
        ativoEMA = c.optBooleanOrNull("ativoEMA"),
        ativoNotch = c.optBooleanOrNull("ativoNotch"),
        ativoSG = c.optBooleanOrNull("ativoSG"),
        ativoKalman = c.optBooleanOrNull("ativoKalman"),
        filtroPrincipal = FiltroPrincipal.deValor(c.optString("filtroPrincipal").takeIf { c.has("filtroPrincipal") }),
    )

    // `!= null` no TS: ausente ou null não altera o campo
    private fun JSONObject.optDoubleOrNull(k: String): Double? =
        if (has(k) && !isNull(k)) optDouble(k).takeUnless { it.isNaN() } else null
    private fun JSONObject.optIntOrNull(k: String): Int? =
        if (has(k) && !isNull(k)) optInt(k) else null
    private fun JSONObject.optBooleanOrNull(k: String): Boolean? =
        if (has(k) && !isNull(k)) optBoolean(k) else null
}

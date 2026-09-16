package br.edu.ifsc.balancagfig.protocolo

// Constantes do protocolo binário (firmware Balança GFIG v2).
// Espelho de pacotes/protocolo/src/tipos.ts — manter os dois em sincronia.
object Protocolo {
    const val MAGIC: Int = 0xa1b2
    const val VERSAO: Int = 0x02

    // Tipos de pacotes ESP → Host
    const val TIPO_DADOS: Int = 0x01
    const val TIPO_CONFIGURACAO: Int = 0x02
    const val TIPO_STATUS: Int = 0x03

    // Tipos de comandos Host → ESP
    const val CMD_TARAR: Int = 0x10
    const val CMD_CALIBRAR: Int = 0x11
    const val CMD_OBTER_CONFIG: Int = 0x12
    const val CMD_DEFINIR_PARAM: Int = 0x13

    // Tamanhos fixos dos pacotes (bytes)
    const val TAM_DADOS: Int = 20
    const val TAM_CONFIG: Int = 64
    const val TAM_STATUS: Int = 14
    const val TAM_CMD_TARA: Int = 8
    const val TAM_CMD_CALIB: Int = 10
    const val TAM_CMD_GET: Int = 8
    const val TAM_CMD_SET: Int = 18

    /** Tamanho do pacote ESP → Host para um byte de tipo, ou null se desconhecido. */
    fun tamanhoPorTipo(tipo: Int): Int? = when (tipo) {
        TIPO_DADOS -> TAM_DADOS
        TIPO_CONFIGURACAO -> TAM_CONFIG
        TIPO_STATUS -> TAM_STATUS
        else -> null
    }

    // Códigos de status do firmware
    const val STATUS_INFO: Int = 0x00
    const val STATUS_SUCESSO: Int = 0x01
    const val STATUS_AVISO: Int = 0x02
    const val STATUS_ERRO: Int = 0x03

    // Códigos de mensagem
    const val MSG_CMD_RECEBIDO: Int = 0x01
    const val MSG_TARA_OK: Int = 0x10
    const val MSG_CALIB_OK: Int = 0x11
    const val MSG_CALIB_FALHOU: Int = 0x12
    const val MSG_CONFIG_UPDATE: Int = 0x20
    const val MSG_ERRO_GENERICO: Int = 0xf0

    // IDs de parâmetros (CMD_DEFINIR_PARAM)
    const val PARAM_GRAVIDADE: Int = 0x01
    const val PARAM_FATOR_CONV: Int = 0x02
    const val PARAM_LEIT_ESTAVEIS: Int = 0x03
    const val PARAM_TOLERANCIA: Int = 0x04
    const val PARAM_MODO: Int = 0x05
    const val PARAM_USAR_EMA: Int = 0x06
    const val PARAM_NUM_AMOSTRAS: Int = 0x07
    const val PARAM_OFFSET_TARA: Int = 0x08
    const val PARAM_TIMEOUT_CAL: Int = 0x09
    const val PARAM_CAPACIDADE: Int = 0x0a
    const val PARAM_ACURACIA: Int = 0x0b
}

/** Pacotes enviados pelo ESP ao host. */
sealed interface PacoteESP

/**
 * Pacote de dados enviado a cada leitura (~100 Hz). 20 bytes.
 *
 * @property marcaTemporal uint32 — ms desde o boot (Long para não estourar o Int)
 * @property forcaNewtons  float32 — força já calibrada pelo firmware
 * @property forcaBruta    int32 — leitura ADC com sinal (para recalibração no host)
 * @property statusFirmware uint8 — 0=Pesando 1=Tarar 2=Calibrar 3=Pronta
 */
data class PacoteDados(
    val marcaTemporal: Long,
    val forcaNewtons: Float,
    val forcaBruta: Int,
    val statusFirmware: Int,
) : PacoteESP

/** Pacote de configuração, resposta a CMD_OBTER_CONFIG. 64 bytes. */
data class PacoteConfiguracao(
    val fatorConversao: Float,
    val gravidade: Float,
    val leiturasEstaveis: Int,
    val toleranciaEst: Float,
    val numAmostrasMedia: Int,
    val numAmostrasCal: Int,
    val usarMediaMovel: Boolean,
    val usarEMA: Boolean,
    val timeoutCal: Int,
    val offsetTara: Int,
    val capacidadeMaxGramas: Float,
    val acuracia: Float,
    val modo: Int,
) : PacoteESP

/** Pacote de status, resposta a comandos. 14 bytes. */
data class PacoteStatus(
    val tipoStatus: Int,
    val codigo: Int,
    val valor: Int,
    val marcaTemporal: Long,
) : PacoteESP

/** Comandos enviados pelo host ao ESP. */
sealed interface ComandoHost

object ComandoTarar : ComandoHost
data class ComandoCalibrar(val massaG: Float) : ComandoHost
object ComandoObterConfig : ComandoHost
data class ComandoDefinirParam(val paramId: Int, val valorF: Float, val valorI: Long) : ComandoHost

/** Erro de decodificação: buffer curto, magic/tipo inválido ou CRC errado. */
class ErroProtocolo(mensagem: String) : Exception(mensagem)

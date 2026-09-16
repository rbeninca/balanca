package br.edu.ifsc.balancagfig.protocolo

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Codec binário ESP ↔ Host. Espelho de pacotes/protocolo/src/codificador.ts:
 * todos os campos em little-endian, CRC16 nos dois últimos bytes.
 */
object Codificador {

    // ─── Codificadores (comando → bytes) ────────────────────────────────────

    fun codificar(cmd: ComandoHost): ByteArray = when (cmd) {
        is ComandoTarar -> cabecalho(Protocolo.TAM_CMD_TARA, Protocolo.CMD_TARAR)
            .putShort(0)
            .assinar()
        is ComandoCalibrar -> cabecalho(Protocolo.TAM_CMD_CALIB, Protocolo.CMD_CALIBRAR)
            .putFloat(cmd.massaG)
            .assinar()
        is ComandoObterConfig -> cabecalho(Protocolo.TAM_CMD_GET, Protocolo.CMD_OBTER_CONFIG)
            .putShort(0)
            .assinar()
        is ComandoDefinirParam -> cabecalho(Protocolo.TAM_CMD_SET, Protocolo.CMD_DEFINIR_PARAM)
            .put(cmd.paramId.toByte())
            .put(0).put(0).put(0)                    // bytes 5,6,7 reservados
            .putFloat(cmd.valorF)
            .putInt(cmd.valorI.toInt())              // uint32
            .assinar()
    }

    private fun cabecalho(tamanho: Int, tipo: Int): ByteBuffer =
        ByteBuffer.allocate(tamanho).order(ByteOrder.LITTLE_ENDIAN)
            .putShort(Protocolo.MAGIC.toShort())
            .put(Protocolo.VERSAO.toByte())
            .put(tipo.toByte())

    /** Grava o CRC dos bytes anteriores nos 2 últimos bytes e devolve o array. */
    private fun ByteBuffer.assinar(): ByteArray {
        val bytes = array()
        val crc = Crc16.calcular(bytes, 0, bytes.size - 2)
        putShort(bytes.size - 2, crc.toShort())
        return bytes
    }

    // ─── Decodificadores (bytes → pacote) ───────────────────────────────────

    /**
     * Decodifica um buffer bruto do ESP. Lança [ErroProtocolo] se o buffer for
     * inválido, truncado ou com CRC errado. Bytes excedentes são ignorados.
     */
    fun decodificar(bytes: ByteArray): PacoteESP {
        if (bytes.size < 4) throw ErroProtocolo("Buffer muito curto")

        val bb = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        val magic = bb.getShort(0).toInt() and 0xffff
        if (magic != Protocolo.MAGIC) {
            throw ErroProtocolo("Magic inválido: 0x${magic.toString(16)}")
        }

        val tipo = bb.get(3).toInt() and 0xff
        val tam = Protocolo.tamanhoPorTipo(tipo)
            ?: throw ErroProtocolo("Tipo desconhecido: 0x${tipo.toString(16)}")
        if (bytes.size < tam) {
            throw ErroProtocolo(
                "Buffer muito curto para tipo 0x${tipo.toString(16)}: esperado $tam, recebido ${bytes.size}"
            )
        }

        verificarCrc(bytes, tam)

        return when (tipo) {
            Protocolo.TIPO_DADOS -> PacoteDados(
                marcaTemporal = bb.getInt(4).toLong() and 0xffffffffL,
                forcaNewtons = bb.getFloat(8),
                forcaBruta = bb.getInt(12),
                statusFirmware = bb.get(16).toInt() and 0xff,
            )
            Protocolo.TIPO_CONFIGURACAO -> PacoteConfiguracao(
                fatorConversao = bb.getFloat(4),
                gravidade = bb.getFloat(8),
                leiturasEstaveis = bb.getShort(12).toInt() and 0xffff,
                toleranciaEst = bb.getFloat(14),
                numAmostrasMedia = bb.getShort(18).toInt() and 0xffff,
                numAmostrasCal = bb.getShort(20).toInt() and 0xffff,
                usarMediaMovel = bb.get(22).toInt() != 0,
                usarEMA = bb.get(23).toInt() != 0,
                timeoutCal = bb.getShort(24).toInt() and 0xffff,
                offsetTara = bb.getInt(26),
                capacidadeMaxGramas = bb.getFloat(30),
                acuracia = bb.getFloat(34),
                modo = bb.get(38).toInt() and 0xff,
            )
            else -> PacoteStatus(
                tipoStatus = bb.get(4).toInt() and 0xff,
                codigo = bb.get(5).toInt() and 0xff,
                valor = bb.getShort(6).toInt() and 0xffff,
                marcaTemporal = bb.getInt(8).toLong() and 0xffffffffL,
            )
        }
    }

    private fun verificarCrc(bytes: ByteArray, tam: Int) {
        val bb = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        val recebido = bb.getShort(tam - 2).toInt() and 0xffff
        val calculado = Crc16.calcular(bytes, 0, tam - 2)
        if (recebido != calculado) {
            throw ErroProtocolo(
                "CRC inválido: recebido=0x${recebido.toString(16)} calculado=0x${calculado.toString(16)}"
            )
        }
    }
}

package br.edu.ifsc.balancagfig.protocolo

import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Construtores de pacotes fictícios, equivalentes aos helpers dos testes TS. */
object Fixtures {

    private fun buffer(tam: Int, tipo: Int): ByteBuffer =
        ByteBuffer.allocate(tam).order(ByteOrder.LITTLE_ENDIAN)
            .putShort(0, 0xa1b2.toShort())
            .put(2, 0x02)
            .put(3, tipo.toByte())

    private fun ByteBuffer.assinado(): ByteArray {
        val bytes = array()
        putShort(bytes.size - 2, Crc16.calcular(bytes, 0, bytes.size - 2).toShort())
        return bytes
    }

    fun dados(
        marcaTemporal: Long = 12345,
        forcaNewtons: Float = 9.81f,
        forcaBruta: Int = 210000,
        statusFirmware: Int = 0,
    ): ByteArray = buffer(20, 0x01)
        .putInt(4, marcaTemporal.toInt())
        .putFloat(8, forcaNewtons)
        .putInt(12, forcaBruta)
        .put(16, statusFirmware.toByte())
        .put(17, 0)
        .assinado()

    fun configuracao(): ByteArray = buffer(64, 0x02)
        .putFloat(4, 21000.0f)     // fatorConversao
        .putFloat(8, 9.80665f)     // gravidade
        .putShort(12, 10)          // leiturasEstaveis
        .putFloat(14, 100.0f)      // toleranciaEst
        .putShort(18, 3)           // numAmostrasMedia
        .putShort(20, 10000)       // numAmostrasCal
        .put(22, 1)                // usarMediaMovel
        .put(23, 0)                // usarEMA
        .putShort(24, 20)          // timeoutCal
        .putInt(26, -5000)         // offsetTara
        .putFloat(30, 5000.0f)     // capacidadeMaxGramas
        .putFloat(34, 0.05f)       // acuracia
        .put(38, 0)                // modo
        .assinado()

    fun status(): ByteArray = buffer(14, 0x03)
        .put(4, 0x01)              // STATUS_SUCESSO
        .put(5, 0x10)              // MSG_TARA_OK
        .putShort(6, 0)
        .putInt(8, 55000)
        .assinado()

    fun le(bytes: ByteArray): ByteBuffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
}

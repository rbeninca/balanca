package br.edu.ifsc.balancagfig.protocolo

/**
 * CRC16-CCITT — polinômio 0x1021, seed 0xFFFF.
 * Idêntico a pacotes/protocolo/src/crc16.ts e ao crc16_ccitt do firmware.
 */
object Crc16 {
    private val tabela = IntArray(256) { i ->
        var crc = i shl 8
        repeat(8) {
            crc = if (crc and 0x8000 != 0) (crc shl 1) xor 0x1021 else crc shl 1
        }
        crc and 0xffff
    }

    /** Calcula o CRC de [bytes] no intervalo [inicio, fim). Buffer vazio retorna 0xFFFF. */
    fun calcular(bytes: ByteArray, inicio: Int = 0, fim: Int = bytes.size): Int {
        var crc = 0xffff
        for (i in inicio until fim) {
            val b = bytes[i].toInt() and 0xff
            crc = ((crc shl 8) xor tabela[((crc shr 8) xor b) and 0xff]) and 0xffff
        }
        return crc
    }
}

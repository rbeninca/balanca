package br.edu.ifsc.balancagfig.protocolo

/**
 * Reconstrói pacotes a partir do fluxo serial fragmentado.
 * Espelho de PortaSerial.processarChunk em pacotes/gateway/src/PortaSerial.ts:
 * procura o magic, valida versão/tipo, espera o pacote completo e decodifica.
 *
 * [alimentar] e [limpar] são sincronizados: a leitura vem de uma thread e a reconexão de outra.
 */
class Enquadrador(
    private val aoReceber: (PacoteESP) -> Unit,
    private val aoFalhar: (String) -> Unit = {},
) {
    private var buffer = ByteArray(0)

    /** Versões de protocolo aceitas (v1 tem o mesmo layout de v2). */
    private val versoesAceitas = setOf(0x01, 0x02)

    @Synchronized
    fun alimentar(chunk: ByteArray, tamanho: Int = chunk.size) {
        buffer = buffer + chunk.copyOf(tamanho)

        while (buffer.size >= 4) {
            val idx = indiceMagic()
            if (idx == -1) {
                // sem magic — mantém os últimos 3 bytes (podem conter parte do magic)
                buffer = buffer.copyOfRange(maxOf(0, buffer.size - 3), buffer.size)
                return
            }
            if (idx > 0) buffer = buffer.copyOfRange(idx, buffer.size)
            // Após descartar o lixo pode não restar cabeçalho completo (magic + versão + tipo)
            if (buffer.size < 4) return

            val versao = buffer[2].toInt() and 0xff
            val tipo = buffer[3].toInt() and 0xff
            val tam = if (versao in versoesAceitas) Protocolo.tamanhoPorTipo(tipo) else null
            if (tam == null) {
                buffer = buffer.copyOfRange(1, buffer.size)
                continue
            }
            if (buffer.size < tam) return

            val pacote = buffer.copyOfRange(0, tam)
            buffer = buffer.copyOfRange(tam, buffer.size)

            try {
                aoReceber(Codificador.decodificar(pacote))
            } catch (e: ErroProtocolo) {
                // tipo e bytes ajudam a distinguir ruído de linha de erro de layout
                aoFalhar("tipo 0x${tipo.toString(16)} (${tam}B): ${e.message} [${pacote.hex()}]")
            }
        }
    }

    /** Descarta o que estiver acumulado (ex.: ao reconectar a porta). */
    @Synchronized
    fun limpar() {
        buffer = ByteArray(0)
    }

    private fun ByteArray.hex() = joinToString(" ") { "%02x".format(it) }

    /** Posição do magic 0xA1B2 em little-endian (bytes 0xB2 0xA1), ou -1. */
    private fun indiceMagic(): Int {
        for (i in 0 until buffer.size - 1) {
            if (buffer[i] == 0xb2.toByte() && buffer[i + 1] == 0xa1.toByte()) return i
        }
        return -1
    }
}

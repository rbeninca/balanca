package br.edu.ifsc.balancagfig.protocolo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Comportamento do framing, espelhando PortaSerial.processarChunk do gateway TS. */
class EnquadradorTest {

    private val recebidos = mutableListOf<PacoteESP>()
    private val falhas = mutableListOf<String>()
    private val enq = Enquadrador({ recebidos += it }, { falhas += it })

    private fun marcas() = recebidos.filterIsInstance<PacoteDados>().map { it.marcaTemporal }

    @Test
    fun `pacote inteiro em um chunk`() {
        enq.alimentar(Fixtures.dados(marcaTemporal = 1))
        assertEquals(listOf(1L), marcas())
    }

    @Test
    fun `pacote fragmentado byte a byte`() {
        Fixtures.dados(marcaTemporal = 2).forEach { enq.alimentar(byteArrayOf(it)) }
        assertEquals(listOf(2L), marcas())
    }

    @Test
    fun `varios pacotes em um chunk, inclusive de tipos diferentes`() {
        enq.alimentar(Fixtures.dados(marcaTemporal = 3) + Fixtures.status() + Fixtures.configuracao() + Fixtures.dados(marcaTemporal = 4))
        assertEquals(4, recebidos.size)
        assertTrue(recebidos[1] is PacoteStatus)
        assertTrue(recebidos[2] is PacoteConfiguracao)
        assertEquals(listOf(3L, 4L), marcas())
    }

    @Test
    fun `lixo antes do magic e descartado`() {
        enq.alimentar(byteArrayOf(0x00, 0x55, 0xb2.toByte()) + Fixtures.dados(marcaTemporal = 5))
        assertEquals(listOf(5L), marcas())
        assertTrue(falhas.isEmpty())
    }

    @Test
    fun `magic dividido entre dois chunks`() {
        val p = Fixtures.dados(marcaTemporal = 6)
        enq.alimentar(byteArrayOf(0x11, 0x22) + p.copyOfRange(0, 1))
        enq.alimentar(p.copyOfRange(1, p.size))
        assertEquals(listOf(6L), marcas())
    }

    @Test
    fun `CRC corrompido gera falha e ressincroniza no proximo pacote`() {
        val ruim = Fixtures.dados(marcaTemporal = 7).also { it[10] = (it[10].toInt() xor 0xff).toByte() }
        enq.alimentar(ruim + Fixtures.dados(marcaTemporal = 8))
        assertEquals(1, falhas.size)
        assertEquals(listOf(8L), marcas())
    }

    @Test
    fun `tipo desconhecido apos magic avanca um byte e continua`() {
        val falso = byteArrayOf(0xb2.toByte(), 0xa1.toByte(), 0x02, 0x7f)
        enq.alimentar(falso + Fixtures.dados(marcaTemporal = 9))
        assertEquals(listOf(9L), marcas())
    }

    @Test
    fun `alimentar com tamanho parcial usa so os primeiros bytes do chunk`() {
        val p = Fixtures.dados(marcaTemporal = 10)
        val chunk = p + ByteArray(44) // simula buffer de leitura USB de 64 bytes
        enq.alimentar(chunk, p.size)
        assertEquals(listOf(10L), marcas())
    }

    @Test
    fun `lixo seguido de magic sem cabecalho completo aguarda mais bytes`() {
        val p = Fixtures.dados(marcaTemporal = 13)
        // 3 bytes de lixo + só os 2 bytes do magic: buffer fica com 2 bytes após o descarte
        enq.alimentar(byteArrayOf(0x01, 0x02, 0x03) + p.copyOfRange(0, 2))
        enq.alimentar(p.copyOfRange(2, p.size))
        assertEquals(listOf(13L), marcas())
        assertTrue(falhas.isEmpty())
    }

    @Test
    fun `fluxo real fragmentado em blocos de 64 bytes com lixo intercalado`() {
        val fluxo = byteArrayOf(0x7e, 0x00) + (1L..50L).map { Fixtures.dados(marcaTemporal = it) }
            .reduce { a, b -> a + b } + byteArrayOf(0xb2.toByte())
        fluxo.toList().chunked(64).forEach { enq.alimentar(it.toByteArray()) }
        assertEquals((1L..50L).toList(), marcas())
        assertTrue(falhas.isEmpty())
    }

    @Test
    fun `limpar descarta fragmento pendente`() {
        val p = Fixtures.dados(marcaTemporal = 11)
        enq.alimentar(p.copyOfRange(0, 10))
        enq.limpar()
        enq.alimentar(Fixtures.dados(marcaTemporal = 12))
        assertEquals(listOf(12L), marcas())
    }
}

package br.edu.ifsc.balancagfig.protocolo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Paridade com pacotes/protocolo/testes/crc16.teste.ts (mesmos vetores). */
class Crc16Test {

    @Test
    fun `UT-1_2_1 - 123456789 produz 0x29B1`() {
        val buf = "123456789".toByteArray(Charsets.US_ASCII)
        assertEquals(0x29b1, Crc16.calcular(buf))
    }

    @Test
    fun `UT-1_2_2 - buffer vazio produz o seed 0xFFFF`() {
        assertEquals(0xffff, Crc16.calcular(ByteArray(0)))
    }

    @Test
    fun `UT-1_2_3 - byte unico 0x00 produz 0xE1F0`() {
        assertEquals(0xe1f0, Crc16.calcular(byteArrayOf(0x00)))
    }

    @Test
    fun `UT-1_2_4 - chamadas multiplas sao deterministicas`() {
        val buf = byteArrayOf(0xa1.toByte(), 0xb2.toByte(), 0x02, 0x01)
        assertEquals(Crc16.calcular(buf), Crc16.calcular(buf))
    }

    @Test
    fun `buffers diferentes produzem CRCs diferentes`() {
        assertNotEquals(Crc16.calcular(byteArrayOf(1, 2, 3)), Crc16.calcular(byteArrayOf(3, 2, 1)))
    }

    @Test
    fun `resultado sempre cabe em uint16`() {
        for (i in 0 until 256) {
            val r = Crc16.calcular(byteArrayOf(i.toByte()))
            assertTrue(r in 0..0xffff)
        }
    }

    @Test
    fun `intervalo parcial ignora os bytes fora dele`() {
        val completo = "xx123456789yy".toByteArray(Charsets.US_ASCII)
        assertEquals(0x29b1, Crc16.calcular(completo, 2, 11))
    }
}

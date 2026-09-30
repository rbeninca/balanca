package br.edu.ifsc.balancagfig.protocolo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Paridade com pacotes/protocolo/testes/codificador.teste.ts. */
class CodificadorTest {

    private fun decodificarDados(bytes: ByteArray) = Codificador.decodificar(bytes) as PacoteDados

    // ─── PacoteDados ────────────────────────────────────────────────────────

    @Test
    fun `UT-1_4_1 - marcaTemporal preservada`() {
        assertEquals(99999L, decodificarDados(Fixtures.dados(marcaTemporal = 99999)).marcaTemporal)
    }

    @Test
    fun `UT-1_4_1b - forcaNewtons preservada`() {
        assertEquals(15.5f, decodificarDados(Fixtures.dados(forcaNewtons = 15.5f)).forcaNewtons, 1e-3f)
    }

    @Test
    fun `UT-1_4_1c - forcaBruta negativa preservada`() {
        assertEquals(-32768, decodificarDados(Fixtures.dados(forcaBruta = -32768)).forcaBruta)
    }

    @Test
    fun `UT-1_4_7 - marcaTemporal maxima uint32 sem overflow`() {
        assertEquals(4294967295L, decodificarDados(Fixtures.dados(marcaTemporal = 4294967295L)).marcaTemporal)
    }

    @Test
    fun `statusFirmware acima de 127 lido como uint8`() {
        assertEquals(200, decodificarDados(Fixtures.dados(statusFirmware = 200)).statusFirmware)
    }

    @Test
    fun `UT-1_4_4 - CRC corrompido lanca erro`() {
        val bytes = Fixtures.dados()
        bytes[bytes.size - 3] = (bytes[bytes.size - 3].toInt() xor 0x01).toByte()
        val erro = assertThrows(ErroProtocolo::class.java) { Codificador.decodificar(bytes) }
        assertTrue(erro.message!!.contains("CRC inválido"))
    }

    @Test
    fun `UT-1_4_5 - buffer truncado lanca erro`() {
        val erro = assertThrows(ErroProtocolo::class.java) {
            Codificador.decodificar(byteArrayOf(0xb2.toByte(), 0xa1.toByte(), 0x02))
        }
        assertTrue(erro.message!!.contains("curto"))
    }

    @Test
    fun `UT-1_4_6 - tipo desconhecido lanca erro`() {
        val bytes = ByteArray(20)
        Fixtures.le(bytes).putShort(0, 0xa1b2.toShort()).put(2, 0x02).put(3, 0xff.toByte())
        val erro = assertThrows(ErroProtocolo::class.java) { Codificador.decodificar(bytes) }
        assertTrue(erro.message!!.contains("desconhecido"))
    }

    @Test
    fun `UT-1_4_6b - magic invalido lanca erro`() {
        val bytes = Fixtures.dados()
        bytes[0] = 0x00
        val erro = assertThrows(ErroProtocolo::class.java) { Codificador.decodificar(bytes) }
        assertTrue(erro.message!!.contains("Magic inválido"))
    }

    @Test
    fun `header de 4 bytes com TIPO_DADOS lanca buffer curto`() {
        val bytes = ByteArray(4)
        Fixtures.le(bytes).putShort(0, 0xa1b2.toShort()).put(2, 0x02).put(3, 0x01)
        val erro = assertThrows(ErroProtocolo::class.java) { Codificador.decodificar(bytes) }
        assertTrue(erro.message!!.contains("curto"))
    }

    @Test
    fun `bytes excedentes apos o pacote sao ignorados`() {
        val bytes = Fixtures.dados(marcaTemporal = 7) + byteArrayOf(1, 2, 3)
        assertEquals(7L, decodificarDados(bytes).marcaTemporal)
    }

    // ─── PacoteConfiguracao ─────────────────────────────────────────────────

    @Test
    fun `UT-1_4_2 - configuracao decodificada`() {
        val pkt = Codificador.decodificar(Fixtures.configuracao()) as PacoteConfiguracao
        assertEquals(21000.0f, pkt.fatorConversao, 0.5f)
        assertEquals(9.80665f, pkt.gravidade, 1e-4f)
        assertEquals(10, pkt.leiturasEstaveis)
        assertEquals(3, pkt.numAmostrasMedia)
        assertEquals(10000, pkt.numAmostrasCal)
        assertTrue(pkt.usarMediaMovel)
        assertFalse(pkt.usarEMA)
        assertEquals(20, pkt.timeoutCal)
        assertEquals(-5000, pkt.offsetTara)
        assertEquals(5000.0f, pkt.capacidadeMaxGramas, 0.1f)
        assertEquals(0.05f, pkt.acuracia, 1e-5f)
        assertEquals(0, pkt.modo)
    }

    @Test
    fun `UT-1_4_2b - massa e descricao da celula nos offsets 39_43`() {
        val pkt = Codificador.decodificar(Fixtures.configuracao()) as PacoteConfiguracao
        assertEquals(100.0f, pkt.massaCalibracaoG, 1e-3f)
        assertEquals("Célula 500 kg", pkt.descricaoCelula)
    }

    @Test
    fun `UT-1_4_2c - EEPROM antiga em 39_58 vira massa 0 e descricao vazia`() {
        val bytes = Fixtures.configuracao()
        java.util.Arrays.fill(bytes, 39, 59, 0xff.toByte())
        Fixtures.le(bytes).putShort(62, Crc16.calcular(bytes, 0, 62).toShort())   // refaz o CRC
        val pkt = Codificador.decodificar(bytes) as PacoteConfiguracao
        assertEquals(0f, pkt.massaCalibracaoG, 0f)
        assertEquals("", pkt.descricaoCelula)
    }

    // ─── PacoteStatus ───────────────────────────────────────────────────────

    @Test
    fun `UT-1_4_3 - status decodificado`() {
        val pkt = Codificador.decodificar(Fixtures.status()) as PacoteStatus
        assertEquals(0x01, pkt.tipoStatus)
        assertEquals(0x10, pkt.codigo)
        assertEquals(0, pkt.valor)
        assertEquals(55000L, pkt.marcaTemporal)
    }

    // ─── Comandos ───────────────────────────────────────────────────────────

    private fun assertCrcValido(bytes: ByteArray) {
        val recebido = Fixtures.le(bytes).getShort(bytes.size - 2).toInt() and 0xffff
        assertEquals(Crc16.calcular(bytes, 0, bytes.size - 2), recebido)
    }

    @Test
    fun `UT-1_3_1 a 1_3_3 - CMD_TARAR tem 8 bytes, tipo 0x10 e CRC valido`() {
        val bytes = Codificador.codificar(ComandoTarar)
        assertEquals(8, bytes.size)
        assertEquals(0xb2.toByte(), bytes[0])
        assertEquals(0xa1.toByte(), bytes[1])
        assertEquals(0x02.toByte(), bytes[2])
        assertEquals(0x10.toByte(), bytes[3])
        assertCrcValido(bytes)
    }

    @Test
    fun `UT-1_3_4 - CMD_CALIBRAR codifica massa como float32`() {
        val bytes = Codificador.codificar(ComandoCalibrar(500.0f))
        assertEquals(10, bytes.size)
        assertEquals(0x11.toByte(), bytes[3])
        assertEquals(500.0f, Fixtures.le(bytes).getFloat(4), 1e-3f)
        assertCrcValido(bytes)
    }

    @Test
    fun `UT-1_3_5 - CMD_OBTER_CONFIG tem 8 bytes e tipo 0x12`() {
        val bytes = Codificador.codificar(ComandoObterConfig)
        assertEquals(8, bytes.size)
        assertEquals(0x12.toByte(), bytes[3])
        assertCrcValido(bytes)
    }

    @Test
    fun `UT-1_3_6 - CMD_DEFINIR_PARAM tem 18 bytes, paramId e valores`() {
        val bytes = Codificador.codificar(
            ComandoDefinirParam(paramId = Protocolo.PARAM_FATOR_CONV, valorF = 2.05f, valorI = 0xfffffffeL)
        )
        assertEquals(18, bytes.size)
        assertEquals(0x13.toByte(), bytes[3])
        assertEquals(Protocolo.PARAM_FATOR_CONV.toByte(), bytes[4])
        assertEquals(0.toByte(), bytes[5]); assertEquals(0.toByte(), bytes[6]); assertEquals(0.toByte(), bytes[7])
        assertEquals(2.05f, Fixtures.le(bytes).getFloat(8), 1e-4f)
        assertEquals(0xfffffffeL, Fixtures.le(bytes).getInt(12).toLong() and 0xffffffffL)
        assertCrcValido(bytes)
    }

    @Test
    fun `UT-1_3_6b - param 0x0C (massa de calibracao) codifica`() {
        val bytes = Codificador.codificar(
            ComandoDefinirParam(paramId = Protocolo.PARAM_MASSA_CALIBRACAO, valorF = 100f, valorI = 0)
        )
        assertEquals(18, bytes.size)
        assertEquals(0x0c.toByte(), bytes[4])
        assertEquals(100f, Fixtures.le(bytes).getFloat(8), 1e-3f)
        assertCrcValido(bytes)
    }

    @Test
    fun `UT-1_3_7 - CMD_DEFINIR_DESCRICAO tem 23 bytes, tipo 0x14 e texto no campo`() {
        val bytes = Codificador.codificar(
            ComandoDefinirDescricao(campoId = Protocolo.STRING_DESCRICAO_CELULA, texto = "CALT 500")
        )
        assertEquals(23, bytes.size)
        assertEquals(0x14.toByte(), bytes[3])
        assertEquals(0x01.toByte(), bytes[4])
        assertEquals("CALT 500", String(bytes, 5, 8, Charsets.UTF_8))
        assertEquals(0.toByte(), bytes[13])   // resto do campo NUL
        assertCrcValido(bytes)
    }

    @Test
    fun `UT-1_3_7b - texto de 16 bytes UTF-8 trunca sem cortar caractere`() {
        val bytes = Codificador.codificar(
            ComandoDefinirDescricao(campoId = 0x01, texto = "áááááááá")
        )
        assertEquals(23, bytes.size)
        assertEquals(0.toByte(), bytes[19])   // NUL logo após o texto truncado
        assertEquals("ááááááá", String(bytes, 5, 14, Charsets.UTF_8))
        assertCrcValido(bytes)
    }

    /** Vetor gerado com o codificador TS: codificarComando({tipo:'CMD_TARAR'}). */
    @Test
    fun `CMD_TARAR byte a byte igual ao codificador TS`() {
        val esperado = byteArrayOf(0xb2.toByte(), 0xa1.toByte(), 0x02, 0x10, 0x00, 0x00, 0, 0)
        val crc = Crc16.calcular(esperado, 0, 6)
        esperado[6] = (crc and 0xff).toByte()
        esperado[7] = (crc shr 8).toByte()
        assertTrue(Codificador.codificar(ComandoTarar).contentEquals(esperado))
    }
}

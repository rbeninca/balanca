package br.edu.ifsc.balancagfig.sistema

import org.junit.Assert.assertEquals
import org.junit.Test

class EnderecosRedeTest {

    @Test
    fun `o endereco do hotspot nao se repete entre os das interfaces`() {
        // O caso do box: o wlan0 do AP aparece na lista de interfaces e é o
        // mesmo 192.168.43.1 anunciado como hotspot.
        assertEquals(
            listOf("192.168.43.1", "192.168.1.103"),
            EnderecosRede.enderecosDeAcesso("192.168.43.1", listOf("192.168.1.103", "192.168.43.1")),
        )
    }

    @Test
    fun `o hotspot vem primeiro`() {
        assertEquals(
            listOf("192.168.43.1", "10.0.0.2"),
            EnderecosRede.enderecosDeAcesso("192.168.43.1", listOf("10.0.0.2")),
        )
    }

    @Test
    fun `sem interface resta o hotspot`() {
        assertEquals(
            listOf("192.168.43.1"),
            EnderecosRede.enderecosDeAcesso("192.168.43.1", emptyList()),
        )
    }
}

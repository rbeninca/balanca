package br.edu.ifsc.balancagfig

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NavegacaoInicialTest {

    private val conectado = EstadoSerial.Conectado("CH340", 921600)

    @Test
    fun `abre a balanca quando a celula conecta e nada impede`() {
        assertTrue(NavegacaoInicial.deveAbrirBalanca(conectado, jaAutoTrocou = false, usuarioInteragiu = false))
    }

    @Test
    fun `nao abre sem celula conectada`() {
        assertFalse(NavegacaoInicial.deveAbrirBalanca(EstadoSerial.SemDispositivo, false, false))
        assertFalse(NavegacaoInicial.deveAbrirBalanca(EstadoSerial.Conectando("CH340"), false, false))
        assertFalse(NavegacaoInicial.deveAbrirBalanca(EstadoSerial.Gravando, false, false))
    }

    @Test
    fun `nao abre duas vezes na mesma sessao`() {
        assertFalse(NavegacaoInicial.deveAbrirBalanca(conectado, jaAutoTrocou = true, usuarioInteragiu = false))
    }

    @Test
    fun `respeita a escolha manual do usuario`() {
        assertFalse(NavegacaoInicial.deveAbrirBalanca(conectado, jaAutoTrocou = false, usuarioInteragiu = true))
    }

    @Test
    fun `apenas a Balanca roda em tela cheia`() {
        assertTrue(NavegacaoInicial.ehTelaCheia(Aba.BALANCA))
        assertFalse(NavegacaoInicial.ehTelaCheia(Aba.STATUS))
    }

    @Test
    fun `voltar sai da tela cheia para a Status`() {
        assertEquals(Aba.STATUS, NavegacaoInicial.aoVoltar(Aba.BALANCA))
        assertNull(NavegacaoInicial.aoVoltar(Aba.STATUS))
    }
}

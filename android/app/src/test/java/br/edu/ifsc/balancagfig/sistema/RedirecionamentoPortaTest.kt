package br.edu.ifsc.balancagfig.sistema

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RedirecionamentoPortaTest {

    @Test
    fun `regra por destino so redireciona o trafego dirigido ao ip`() {
        assertEquals(
            "balanca_http -d 192.168.43.1 -p tcp --dport 80 -j REDIRECT --to-ports 8080",
            RedirecionamentoPorta.regraDestino("192.168.43.1", 80, 8080),
        )
    }

    @Test
    fun `com upstream, o script so tem regras por destino (nada de sequestrar HTTP)`() {
        val s = RedirecionamentoPorta.script(listOf("192.168.43.1", "192.168.1.105", "192.168.43.1"), redirecionarTudo = false, portaInterna = 8080)
        val linhas = s.lines()
        assertTrue(linhas[0].startsWith("while iptables -t nat -D PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 8080"))   // limpa a regra antiga
        assertEquals("iptables -t nat -N balanca_http 2>/dev/null", linhas[1])
        assertTrue(linhas[2].contains("-C PREROUTING -j balanca_http") && linhas[2].contains("|| iptables -t nat -A PREROUTING -j balanca_http"))
        assertEquals("iptables -t nat -F balanca_http", linhas[3])
        assertEquals(
            listOf(
                "iptables -t nat -A balanca_http -d 192.168.43.1 -p tcp --dport 80 -j REDIRECT --to-ports 8080",
                "iptables -t nat -A balanca_http -d 192.168.1.105 -p tcp --dport 80 -j REDIRECT --to-ports 8080",
            ),
            linhas.drop(4),
        )   // ip repetido não duplica; sem regra geral
    }

    @Test
    fun `sem upstream, a regra geral entra por ultimo (probes caem no servidor)`() {
        val linhas = RedirecionamentoPorta.script(listOf("192.168.43.1"), redirecionarTudo = true, portaInterna = 8080).lines()
        assertEquals("iptables -t nat -A balanca_http -p tcp --dport 80 -j REDIRECT --to-ports 8080", linhas.last())
        assertTrue(linhas[linhas.size - 2].contains("-d 192.168.43.1"))
    }

    @Test
    fun `temUpstream le o dispositivo do ip route`() {
        assertTrue(RedirecionamentoPorta.temUpstream("8.8.8.8 via 192.168.1.1 dev eth0 src 192.168.1.105 \n    cache "))
        assertFalse(RedirecionamentoPorta.temUpstream("8.8.8.8 dev wlan0 src 192.168.43.1"))
        assertFalse(RedirecionamentoPorta.temUpstream(null))
        assertFalse(RedirecionamentoPorta.temUpstream("RTNETLINK answers: Network is unreachable"))
        assertTrue(RedirecionamentoPorta.temUpstream("8.8.8.8 via 10.0.0.1 dev wlan1 src 10.0.0.5", interfaceHotspot = "wlan0"))
    }
}

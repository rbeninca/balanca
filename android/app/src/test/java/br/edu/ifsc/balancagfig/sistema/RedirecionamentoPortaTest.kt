package br.edu.ifsc.balancagfig.sistema

import org.junit.Assert.assertEquals
import org.junit.Test

class RedirecionamentoPortaTest {

    @Test
    fun `especificacao da regra redireciona a porta externa para a interna`() {
        assertEquals(
            "PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 8080",
            RedirecionamentoPorta.especificacaoRegra(80, 8080),
        )
    }

    @Test
    fun `comando usa a tabela nat e a acao pedida`() {
        assertEquals(
            "iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 8080",
            RedirecionamentoPorta.comando("-A", 80, 8080),
        )
        assertEquals(
            "iptables -t nat -D PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 8080",
            RedirecionamentoPorta.comando("-D", 80, 8080),
        )
    }

    @Test
    fun `respeita portas diferentes das padrao`() {
        assertEquals(
            "iptables -t nat -A PREROUTING -p tcp --dport 8081 -j REDIRECT --to-ports 9090",
            RedirecionamentoPorta.comando("-A", 8081, 9090),
        )
    }
}

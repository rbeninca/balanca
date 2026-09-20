package br.edu.ifsc.balancagfig.sistema

import android.util.Log

/**
 * Publica o frontend na porta 80 sem que o servidor precise bindá-la. A porta
 * 80 é privilegiada e o processo do app (UID comum) não a abre, mesmo com root
 * para comandos de shell. Em vez disso, regras de NAT redirecionam, via root, o
 * tráfego que chega em :80 para a porta real do [ServidorHttp] (8080).
 *
 * As regras vivem numa chain própria (`balanca_http`, tabela nat), chamada a
 * partir da PREROUTING — a chain é esvaziada e reconstruída a cada aplicação,
 * então é idempotente e não empilha a cada reinício.
 *
 * Só redireciona o que é dirigido AOS IPs DO BOX (`-d ip`). Um redirect geral
 * (sem destino) sequestrava todo HTTP de quem estava no hotspot, inclusive o
 * probe de conectividade dos celulares (`generate_204`): o Android concluía
 * "WiFi sem internet", trocava a rede padrão para os dados móveis e o
 * WebSocket parava de conectar. Sem upstream (box sozinho em campo) a regra
 * geral volta de propósito: o probe cai no [ServidorHttp], que responde o
 * sucesso esperado, e o celular mantém o WiFi como padrão sem perguntar nada.
 */
object RedirecionamentoPorta {
    private const val TAG = "RedirecionamentoPorta"
    const val PORTA_EXTERNA = 80
    const val CHAIN = "balanca_http"

    /** Regra por destino: só o tráfego dirigido a [ip] é redirecionado. */
    internal fun regraDestino(ip: String, portaExterna: Int, portaInterna: Int): String =
        "$CHAIN -d $ip -p tcp --dport $portaExterna -j REDIRECT --to-ports $portaInterna"

    /** Regra geral (sem destino): usada só quando não há upstream. */
    internal fun regraGeral(portaExterna: Int, portaInterna: Int): String =
        "$CHAIN -p tcp --dport $portaExterna -j REDIRECT --to-ports $portaInterna"

    /**
     * Script que deixa a chain no estado desejado: cria se preciso, garante o
     * salto da PREROUTING, esvazia e readiciona as regras.
     */
    internal fun script(ipsLocais: List<String>, redirecionarTudo: Boolean, portaInterna: Int, portaExterna: Int = PORTA_EXTERNA): String {
        val linhas = mutableListOf(
            // versões anteriores punham a regra geral direto na PREROUTING: limpa todas as cópias
            "while iptables -t nat -D PREROUTING -p tcp --dport $portaExterna -j REDIRECT --to-ports $portaInterna 2>/dev/null; do :; done",
            "iptables -t nat -N $CHAIN 2>/dev/null",
            "iptables -t nat -C PREROUTING -j $CHAIN 2>/dev/null || iptables -t nat -A PREROUTING -j $CHAIN",
            "iptables -t nat -F $CHAIN",
        )
        for (ip in ipsLocais.distinct()) linhas += "iptables -t nat -A ${regraDestino(ip, portaExterna, portaInterna)}"
        if (redirecionarTudo) linhas += "iptables -t nat -A ${regraGeral(portaExterna, portaInterna)}"
        return linhas.joinToString("\n")
    }

    /** Aplica o estado desejado (idempotente). Devolve true se o iptables aceitou. */
    fun aplicar(ipsLocais: List<String>, redirecionarTudo: Boolean, portaInterna: Int, portaExterna: Int = PORTA_EXTERNA): Boolean {
        val ok = Root.executar(script(ipsLocais, redirecionarTudo, portaInterna, portaExterna))
        if (!ok) Log.w(TAG, "não foi possível aplicar o redirect :$portaExterna → :$portaInterna")
        return ok
    }

    /** Desfaz tudo (best-effort). */
    fun remover() {
        Root.executar("iptables -t nat -D PREROUTING -j $CHAIN 2>/dev/null; iptables -t nat -F $CHAIN 2>/dev/null; iptables -t nat -X $CHAIN 2>/dev/null; exit 0")
    }

    /**
     * Há rota para a internet por outra interface que não o hotspot? Lê
     * `ip route get 8.8.8.8` (só o dispositivo de saída).
     */
    fun temUpstream(saidaIpRoute: String?, interfaceHotspot: String = "wlan0"): Boolean {
        val dev = Regex("""\bdev\s+(\S+)""").find(saidaIpRoute ?: return false)?.groupValues?.get(1) ?: return false
        return dev != interfaceHotspot && dev != "lo"
    }

    fun detectarUpstream(): Boolean = temUpstream(Root.executarLendo("ip route get 8.8.8.8 2>/dev/null"))
}

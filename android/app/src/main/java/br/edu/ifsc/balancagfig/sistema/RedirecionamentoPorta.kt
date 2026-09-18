package br.edu.ifsc.balancagfig.sistema

import android.util.Log

/**
 * Publica o frontend na porta 80 sem que o servidor precise bindá-la. A porta
 * 80 é privilegiada e o processo do app (UID comum) não a abre, mesmo com root
 * para comandos de shell. Em vez disso, uma regra de NAT redireciona, via root,
 * o tráfego que chega em :80 para a porta real do [ServidorHttp] (8080).
 *
 * O kernel do TX9 (2019) não tem `net.ipv4.ip_unprivileged_port_start`, então o
 * REDIRECT do iptables é o caminho. A regra vive na PREROUTING (tabela nat), que
 * o firmware já traz ativa (chains de tethering). É idempotente: uma eventual
 * regra anterior é removida antes de readicionar, para não empilhar a cada
 * reinício do serviço.
 */
object RedirecionamentoPorta {
    private const val TAG = "RedirecionamentoPorta"
    const val PORTA_EXTERNA = 80

    /** Especificação da regra (sem a ação), base para -A, -C e -D. */
    internal fun especificacaoRegra(portaExterna: Int, portaInterna: Int): String =
        "PREROUTING -p tcp --dport $portaExterna -j REDIRECT --to-ports $portaInterna"

    /** Comando iptables completo para uma [acao] (-A, -D, -C). */
    internal fun comando(acao: String, portaExterna: Int, portaInterna: Int): String =
        "iptables -t nat $acao ${especificacaoRegra(portaExterna, portaInterna)}"

    /**
     * Garante o redirect :[portaExterna] → :[portaInterna] (idempotente).
     * Devolve true se a regra foi (re)aplicada.
     */
    fun garantir(portaInterna: Int, portaExterna: Int = PORTA_EXTERNA): Boolean {
        Root.executar(comando("-D", portaExterna, portaInterna)) // remove regra anterior, se houver
        val ok = Root.executar(comando("-A", portaExterna, portaInterna))
        if (!ok) Log.w(TAG, "não foi possível redirecionar :$portaExterna → :$portaInterna")
        return ok
    }

    /** Desfaz o redirect (best-effort). */
    fun remover(portaInterna: Int, portaExterna: Int = PORTA_EXTERNA) {
        Root.executar(comando("-D", portaExterna, portaInterna))
    }
}

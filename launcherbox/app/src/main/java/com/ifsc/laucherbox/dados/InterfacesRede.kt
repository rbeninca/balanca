package com.ifsc.laucherbox.dados

import com.ifsc.laucherbox.sistema.Root

/** Uma interface de rede do equipamento. */
data class InterfaceRede(
    val nome: String,
    val mac: String?,
    val ip: String?,
    val estado: String,
) {
    val noAr: Boolean get() = estado.equals("UP", ignoreCase = true)
}

/**
 * Interfaces de rede com MAC, IP e estado, lidas por root.
 *
 * São as mesmas duas saídas do `ip` que o `listar_redes()` do
 * android/scripts/box.sh parseia: `ip -o link show` traz o nome, o MAC
 * (`link/ether`) e o estado do link; `ip -4 -o addr show` traz o endereço. Ler
 * pelos mesmos comandos é o que garante que a TV mostre exatamente o que o
 * `box.sh estado` imprime — dá para conferir um contra o outro.
 *
 * Deliberadamente não uso `NetworkInterface.getHardwareAddress()`: a partir do
 * Android 6 ele devolve null para interfaces que não pertencem ao app, e MAC
 * vazio não serve aqui.
 */
object InterfacesRede {

    /**
     * Interfaces que não dizem nada numa TV: loopback, túneis e o P2P do WiFi
     * Direct (que fica permanentemente sem IP e só ocupa linha).
     */
    private val RUIDO = setOf("lo", "sit0", "p2p0")

    fun listar(): List<InterfaceRede> {
        val links = Root.executarLendo("ip -o link show") ?: return emptyList()
        val enderecos = enderecosPorInterface(Root.executarLendo("ip -4 -o addr show") ?: "")

        return links.lineSequence()
            .filter { it.isNotBlank() }
            .mapNotNull { linha -> interpretar(linha, enderecos) }
            .filter { rede ->
                val nome = rede.nome
                nome !in RUIDO &&
                    !nome.startsWith("ip6") &&
                    !nome.endsWith("tnl0") &&
                    // interface caída e sem endereço não interessa
                    (rede.noAr || rede.ip != null)
            }
            .toList()
    }

    private fun interpretar(linha: String, enderecos: Map<String, String>): InterfaceRede? {
        // 2: eth0: <BROADCAST,...> mtu 1500 ... state UP ... \ link/ether a8:20:03:ac:10:e7 brd ...
        val nome = NOME.find(linha)?.groupValues?.get(1)?.substringBefore('@') ?: return null
        return InterfaceRede(
            nome = nome,
            mac = MAC.find(linha)?.groupValues?.get(1),
            ip = enderecos[nome],
            estado = ESTADO.find(linha)?.groupValues?.get(1) ?: "?",
        )
    }

    /** `2: eth0    inet 192.168.1.110/24 brd ...` -> `eth0` para `192.168.1.110/24` */
    private fun enderecosPorInterface(saida: String): Map<String, String> =
        saida.lineSequence().mapNotNull { linha ->
            val m = LINHA_END.find(linha) ?: return@mapNotNull null
            m.groupValues[1] to m.groupValues[2]
        }.associate { it }

    private val NOME = Regex("""^\d+:\s+([^:]+):""")
    private val MAC = Regex("""link/(?:ether|loopback)\s+([0-9a-fA-F:]+)""")
    private val ESTADO = Regex("""state\s+([A-Z]+)""")
    private val LINHA_END = Regex("""^\d+:\s+(\S+)\s+inet\s+([0-9.]+/\d+)""")
}

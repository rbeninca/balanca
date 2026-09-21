package br.edu.ifsc.balancagfig.sistema

import java.io.File
import java.net.Inet4Address
import java.net.NetworkInterface

/** Endereços IPv4 do dispositivo (herdado de IFRede/MainActivity.kt). */
object EnderecosRede {

    /** Lista IPv4 não-loopback, ordenada e sem repetição; vazia se offline. */
    fun listarIPv4(): List<String> = try {
        NetworkInterface.getNetworkInterfaces().asSequence()
            .flatMap { it.inetAddresses.asSequence() }
            .filter { !it.isLoopbackAddress && it is Inet4Address }
            .mapNotNull { it.hostAddress?.takeIf(String::isNotBlank) }
            .distinct()
            .sorted()
            .toList()
    } catch (_: Exception) {
        emptyList()
    }

    /**
     * IPv4 por nome de interface, ex.: `{"eth0": "192.168.1.110", "wlan0": "192.168.43.1"}`.
     *
     * Diferente de [listarIPv4], que só devolve os endereços soltos: aqui
     * interessa *qual* interface tem cada um. É o endereço com que o BOX
     * aparece na rede — não aquele por onde o navegador chegou nele, que no
     * próprio box é 127.0.0.1 e não diz nada. Vai no batimento SAUDE para o
     * chip de status do frontend mostrar o ethernet e o wifi do aparelho.
     */
    fun porInterface(): Map<String, String> = try {
        NetworkInterface.getNetworkInterfaces().asSequence()
            .mapNotNull { interface_ ->
                val ip = interface_.inetAddresses.asSequence()
                    .filter { it is Inet4Address && !it.isLoopbackAddress }
                    .mapNotNull { it.hostAddress?.takeIf(String::isNotBlank) }
                    .firstOrNull()
                ip?.let { interface_.name to it }
            }
            .toMap()
    } catch (_: Exception) {
        emptyMap()
    }

    /**
     * MAC da interface ethernet, ou null se não der para ler.
     *
     * É o identificador estável destes boxes: eles não gravam `ro.serialno`
     * (vem vazio), e o `android_id` é derivado da assinatura do app e muda em
     * reset de fábrica. Tenta o sysfs direto e só recorre ao root se o SELinux
     * barrar — o arquivo é legível, mas nem todo contexto de app pode.
     */
    fun macEthernet(): String? {
        val caminho = "/sys/class/net/eth0/address"
        val direto = runCatching { File(caminho).readText().trim() }.getOrNull()
        if (!direto.isNullOrBlank()) return direto
        return Root.executarLendo("cat $caminho")?.trim()?.takeIf { it.isNotBlank() }
    }

    /**
     * Endereços a anunciar para os celulares da bancada, sem repetição: o do
     * hotspot primeiro, depois os das interfaces.
     *
     * O endereço do hotspot também sai em [listarIPv4] quando o AP está no ar
     * (é o `wlan0`), e anunciá-lo duas vezes na tela parecia defeito.
     */
    fun enderecosDeAcesso(hotspot: String, ips: List<String>): List<String> =
        (listOf(hotspot) + ips).distinct()

    /**
     * Texto de até 4 caracteres para o display frontal do TX9: "I" + último
     * octeto do IP com 3 dígitos (ex.: "I111"), ou "SEMC" sem conexão.
     */
    fun abreviarParaPainel(ip: String?): String = ip
        ?.substringAfterLast('.', missingDelimiterValue = "")
        ?.takeIf { it.isNotBlank() }
        ?.padStart(3, '0')
        ?.let { "I$it" }
        ?: "SEMC"
}

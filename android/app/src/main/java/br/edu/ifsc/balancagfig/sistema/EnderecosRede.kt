package br.edu.ifsc.balancagfig.sistema

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

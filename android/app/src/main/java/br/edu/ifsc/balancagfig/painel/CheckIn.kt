package br.edu.ifsc.balancagfig.painel

import br.edu.ifsc.balancagfig.atualizacao.Rede
import org.json.JSONObject

/**
 * O retrato que o box manda para o painel: quem é, o que está rodando, quando
 * aquilo foi instalado e como está agora.
 *
 * `instaladoEm` é o que responde "quando atualizou" — vem do `PackageManager`
 * (`PackageInfo.lastUpdateTime`), gravado pelo Android no momento em que o APK
 * foi instalado, e não de um relógio que o app poderia ter perdido.
 */
data class Batida(
    val serial: String,
    val versao: String,
    val versionCode: Int,
    /** Epoch ms da instalação do APK; null quando o `PackageManager` não informa. */
    val instaladoEm: Long?,
    val modelo: String?,
    val placa: String?,
    /** IPv4 por interface, no mesmo formato do `/saude`. */
    val ip: Map<String, String>,
    val root: Boolean,
) {
    fun paraJson(): JSONObject = JSONObject()
        .put("serial", serial)
        .put("versao", versao)
        .put("versionCode", versionCode)
        .put("instaladoEm", instaladoEm ?: JSONObject.NULL)
        .put("modelo", modelo ?: JSONObject.NULL)
        .put("placa", placa ?: JSONObject.NULL)
        .put("ip", JSONObject(ip as Map<*, *>))
        .put("root", root)
}

/**
 * A batida de ponto no painel (Cloudflare Worker + D1).
 *
 * Este caminho **nunca** derruba nada: qualquer falha — sem rede, chave errada,
 * painel fora do ar — vira uma linha no registro local e `false`, e a próxima
 * tentativa é no tique seguinte. Sem chave configurada, nem toca a rede (é o
 * caso de um build local sem `chaves.properties`).
 *
 * O sucesso não gera linha no registro de propósito: seriam seis por hora
 * empurrando para fora o que interessa. Quem confirma que a batida chegou é o
 * próprio painel.
 */
class CheckIn(
    private val rede: Rede,
    private val urlBase: String,
    private val chave: String,
    private val registrar: (String) -> Unit = {},
) {
    /** true se o painel aceitou a batida. */
    fun batida(b: Batida): Boolean {
        if (chave.isBlank()) return false
        return try {
            rede.publicar("$urlBase/batida", b.paraJson().toString(), chave)
            true
        } catch (e: Exception) {
            registrar("Painel: batida falhou (${e.message})")
            false
        }
    }
}

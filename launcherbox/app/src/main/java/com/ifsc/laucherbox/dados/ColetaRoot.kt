package com.ifsc.laucherbox.dados

import android.util.Base64
import android.util.Log
import com.ifsc.laucherbox.sistema.Root

/**
 * Uma única chamada de root por ciclo, com tudo que precisa de privilégio.
 *
 * Antes cada dado era lido com o seu próprio `su` — quatro por ciclo, a cada 3
 * segundos. No MXQ isso virava ~80 processos `app_process` simultâneos (cada
 * `su` do SuperSU sobe uma VM e leva cerca de um minuto para sair) e o load
 * disparava para 24 num box de quatro núcleos, ao ponto de uma instalação por
 * adb levar mais de cinco minutos.
 *
 * Os comandos são os mesmos, e a saída continua sendo a mesma que o
 * `android/scripts/box.sh estado` usa — só deixam de ser quatro processos.
 *
 * O `softap.conf` é binário, então vai e volta em base64.
 */
object ColetaRoot {
    private const val TAG = "ColetaRoot"

    data class Bruto(
        val links: String,
        val enderecos: String,
        val disco: String,
        val softap: ByteArray?,
    )

    // Nada de "#" na frente: em shell, "#" no começo da palavra vira comentário
    // e o echo da marca saía vazio — as seções nunca eram encontradas.
    private val MARCA_LINK = "__SECAO_LINK__"
    private val MARCA_ADDR = "__SECAO_ADDR__"
    private val MARCA_DF = "__SECAO_DF__"
    private val MARCA_SOFTAP = "__SECAO_SOFTAP__"

    private val SCRIPT = """
        echo $MARCA_LINK; ip -o link show 2>/dev/null
        echo $MARCA_ADDR; ip -4 -o addr show 2>/dev/null
        echo $MARCA_DF;   df -h 2>/dev/null
        echo $MARCA_SOFTAP; base64 /data/misc/wifi/softap.conf 2>/dev/null
    """.trimIndent()

    fun coletar(): Bruto? {
        val saida = Root.executarLendo(SCRIPT) ?: return null
        return Bruto(
            links = secao(saida, MARCA_LINK, MARCA_ADDR),
            enderecos = secao(saida, MARCA_ADDR, MARCA_DF),
            disco = secao(saida, MARCA_DF, MARCA_SOFTAP),
            softap = secao(saida, MARCA_SOFTAP, null)
                .filter { !it.isWhitespace() }
                .takeIf { it.isNotEmpty() }
                ?.let {
                    runCatching { Base64.decode(it, Base64.DEFAULT) }
                        .onFailure { e -> Log.w(TAG, "softap.conf em base64 ilegível: ${e.message}") }
                        .getOrNull()
                },
        )
    }

    /** Texto entre duas marcas; até o fim quando [fim] é null. */
    private fun secao(saida: String, inicio: String, fim: String?): String {
        val i = saida.indexOf(inicio)
        if (i < 0) return ""
        val corpo = saida.substring(i + inicio.length)
        val j = fim?.let { corpo.indexOf(it) } ?: -1
        return (if (j >= 0) corpo.substring(0, j) else corpo).trim()
    }
}

package br.edu.ifsc.balancagfig.sistema

import android.util.Log
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

/**
 * Execução de comandos como root; o TX9 traz su (Superuser Koush) em
 * /system/xbin/su.
 *
 * Todo comando tem **teto de tempo**. Sem ele, um `su` que não responde — pedido
 * de permissão esperando um toque que ninguém dá, numa TV sem tela sensível —
 * deixava a chamada presa para sempre, sem erro e sem saída a não ser reiniciar
 * o box. O `pm install` da atualização era o caso mais visível: a tela ficava em
 * "instalando" indefinidamente.
 *
 * O teto é generoso de propósito: ele existe para destravar, não para apressar.
 * Na atualização, um estouro de tempo não é fatal — o Android instala assim
 * mesmo e o [br.edu.ifsc.balancagfig.atualizacao.Atualizador] confere a versão
 * ao voltar.
 */
object Root {
    private const val TAG = "Root"

    /** Teto padrão: comandos curtos (id, cat, iptables) respondem em milissegundos. */
    const val TIMEOUT_PADRAO_MS = 60_000L

    /** Teto para o `pm install`, que copia e otimiza o APK inteiro. */
    const val TIMEOUT_INSTALACAO_MS = 15 * 60_000L

    /** Executa [comando] via `su -c` e devolve true se saiu com código 0. */
    fun executar(comando: String, timeoutMs: Long = TIMEOUT_PADRAO_MS): Boolean = try {
        val p = Runtime.getRuntime().exec(arrayOf("su", "-c", comando))
        if (p.waitFor(timeoutMs, TimeUnit.MILLISECONDS)) {
            p.exitValue() == 0
        } else {
            p.destroyForcibly()
            Log.w(TAG, "su não respondeu em ${timeoutMs}ms: $comando")
            false
        }
    } catch (e: Throwable) {
        Log.w(TAG, "Falha ao executar como root: $comando (${e.message})")
        false
    }

    /** Executa [comando] via `su -c` e devolve a saída padrão, ou null em falha. */
    fun executarLendo(comando: String, timeoutMs: Long = TIMEOUT_PADRAO_MS): String? = try {
        val p = Runtime.getRuntime().exec(arrayOf("su", "-c", comando))
        // A leitura vai para outra thread: `readText()` só volta quando o
        // processo fecha a saída, e esperar por ele em linha prenderia esta
        // chamada mesmo com o `waitFor` tendo estourado o tempo.
        val leitura = CompletableFuture.supplyAsync {
            runCatching { p.inputStream.bufferedReader().readText() }.getOrDefault("")
        }
        if (p.waitFor(timeoutMs, TimeUnit.MILLISECONDS)) {
            val saida = runCatching { leitura.get(5, TimeUnit.SECONDS) }.getOrDefault("")
            if (p.exitValue() == 0) saida else null
        } else {
            p.destroyForcibly()
            Log.w(TAG, "su não respondeu em ${timeoutMs}ms: $comando")
            null
        }
    } catch (e: Throwable) {
        Log.w(TAG, "Falha ao executar como root: $comando (${e.message})")
        null
    }

    /** true se `su` responde (root concedido a este app). */
    fun disponivel(): Boolean = executar("id")
}

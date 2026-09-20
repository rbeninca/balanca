package com.ifsc.laucherbox.sistema

import android.util.Log
import java.util.concurrent.atomic.AtomicReference

/**
 * Execução de comandos como root. Mesma ideia do `sistema/Root.kt` do app da
 * balança, mas com duas defesas que aquele não tem — e que importam aqui
 * porque este app consulta root em laço, a vida toda:
 *
 *  - **stderr é drenado em paralelo.** Sem isso, um comando que escreve muito
 *    em stderr enche o pipe de 64 KB e o processo trava para sempre.
 *  - **há timeout.** Um `su` ainda não pré-aprovado fica esperando o diálogo
 *    na TV; sem prazo, a leitura bloqueia indefinidamente e a tela congela
 *    mostrando dados velhos, sem nenhum sinal de que parou.
 *
 * Tudo que este launcher precisa de privilégio passa por aqui: o `df`, o `ip`
 * e a leitura do `softap.conf`. Sem root, o app mostra o que dá e marca o
 * resto com "—".
 */
object Root {
    private const val TAG = "Root"

    /** 5 s basta para `df`/`ip`; menos que isso arrisca cortar um `su` lento. */
    private const val TIMEOUT_PADRAO_MS = 5_000L

    /** Executa [comando] via `su -c` e devolve true se saiu com código 0. */
    fun executar(comando: String, timeoutMs: Long = TIMEOUT_PADRAO_MS): Boolean =
        executarBytes(comando, timeoutMs) != null

    /** Como [executarBytes], devolvendo texto. */
    fun executarLendo(comando: String, timeoutMs: Long = TIMEOUT_PADRAO_MS): String? =
        executarBytes(comando, timeoutMs)?.toString(Charsets.UTF_8)

    /**
     * Executa [comando] via `su -c` e devolve a saída padrão, ou null em falha
     * ou estouro de prazo.
     *
     * Devolve bytes crus de propósito: o `softap.conf` é binário e viraria
     * lixo se passasse por decodificação de texto.
     *
     * `Process.waitFor(timeout)` só existe da API 26 em diante, e o alvo aqui é
     * a 24 — daí o laço com `exitValue()`.
     */
    fun executarBytes(comando: String, timeoutMs: Long = TIMEOUT_PADRAO_MS): ByteArray? {
        val processo = try {
            ProcessBuilder("su", "-c", comando).start()
        } catch (e: Throwable) {
            Log.w(TAG, "Falha ao executar como root: $comando (${e.message})")
            return null
        }

        // stderr vai para o vazio, mas numa thread: ninguém pode ficar sem ler
        Thread { runCatching { processo.errorStream.readBytes() } }
            .apply { isDaemon = true }
            .start()

        // a leitura do stdout também roda em thread, senão ela é quem bloqueia
        // e o prazo abaixo nunca chega a valer
        val saida = AtomicReference<ByteArray?>(null)
        val leitor = Thread { saida.set(runCatching { processo.inputStream.readBytes() }.getOrNull()) }
            .apply { isDaemon = true }
            .also { it.start() }

        val limite = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < limite && !saiu(processo)) {
            Thread.sleep(50)
        }

        if (!saiu(processo)) {
            processo.destroy()
            Log.w(TAG, "tempo esgotado (${timeoutMs}ms): $comando")
            return null
        }

        // O processo sair não significa que a leitura terminou: quem consome o
        // pipe é a outra thread. Esperar por ela de verdade — dormir um tempo
        // fixo aqui devolvia null em comando com saída grande, e o app tratava
        // um comando bem-sucedido como falha.
        leitor.join(2_000)

        val bytes = saida.get()
        if (bytes == null) {
            Log.w(TAG, "sem saída (leitura incompleta?): $comando")
            return null
        }
        return if (processo.exitValue() == 0) bytes else null
    }

    /** true se `su` responde (root concedido a este app). */
    fun disponivel(): Boolean = executar("id")

    /** `exitValue()` lança enquanto o processo não terminou. */
    private fun saiu(processo: Process): Boolean = try {
        processo.exitValue()
        true
    } catch (_: IllegalThreadStateException) {
        false
    }
}

package br.edu.ifsc.balancagfig.sistema

import android.util.Log

/** Execução de comandos como root; o TX9 traz su (Superuser Koush) em /system/xbin/su. */
object Root {
    private const val TAG = "Root"

    /** Executa [comando] via `su -c` e devolve true se saiu com código 0. */
    fun executar(comando: String): Boolean = try {
        Runtime.getRuntime().exec(arrayOf("su", "-c", comando)).waitFor() == 0
    } catch (e: Throwable) {
        Log.w(TAG, "Falha ao executar como root: $comando (${e.message})")
        false
    }

    /** Executa [comando] via `su -c` e devolve a saída padrão, ou null em falha. */
    fun executarLendo(comando: String): String? = try {
        val p = Runtime.getRuntime().exec(arrayOf("su", "-c", comando))
        val saida = p.inputStream.bufferedReader().readText()
        if (p.waitFor() == 0) saida else null
    } catch (e: Throwable) {
        Log.w(TAG, "Falha ao executar como root: $comando (${e.message})")
        null
    }

    /** true se `su` responde (root concedido a este app). */
    fun disponivel(): Boolean = executar("id")
}

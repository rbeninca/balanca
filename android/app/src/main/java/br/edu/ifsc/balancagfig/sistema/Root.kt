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

    /** true se `su` responde (root concedido a este app). */
    fun disponivel(): Boolean = executar("id")
}

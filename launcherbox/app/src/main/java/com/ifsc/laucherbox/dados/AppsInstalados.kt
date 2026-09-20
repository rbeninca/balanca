package com.ifsc.laucherbox.dados

import android.content.Context
import android.content.Intent
import android.content.pm.ResolveInfo
import android.util.Log

/** Um app instalado que abre tela. */
data class AppAbrivel(
    val rotulo: String,
    val pacote: String,
    val atividade: String,
) {
    val componente: String get() = "$pacote/$atividade"
}

/**
 * Apps instalados que abrem tela, via `queryIntentActivities` com
 * `CATEGORY_LAUNCHER`. Não precisa de root.
 */
object AppsInstalados {
    private const val TAG = "AppsInstalados"

    fun listar(context: Context): List<AppAbrivel> {
        val pm = context.packageManager
        val intencao = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val resolvidos: List<ResolveInfo> = pm.queryIntentActivities(intencao, 0)

        return resolvidos.asSequence()
            // o próprio launcher não se lista
            .filter { it.activityInfo.packageName != context.packageName }
            .map { info ->
                AppAbrivel(
                    rotulo = info.loadLabel(pm).toString().ifBlank { info.activityInfo.packageName },
                    pacote = info.activityInfo.packageName,
                    atividade = info.activityInfo.name,
                )
            }
            // a consulta devolve mais de uma entrada por pacote (atividade e
            // application); fica só a primeira de cada
            .distinctBy { it.pacote }
            .sortedBy { it.rotulo.lowercase() }
            .toList()
    }

    fun abrir(context: Context, app: AppAbrivel): Boolean = try {
        context.startActivity(
            Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .setClassName(app.pacote, app.atividade)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        true
    } catch (e: Throwable) {
        Log.w(TAG, "não consegui abrir ${app.componente}: ${e.message}")
        false
    }
}

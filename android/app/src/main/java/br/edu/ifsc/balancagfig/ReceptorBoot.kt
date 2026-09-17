package br.edu.ifsc.balancagfig

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Sobe o serviço e a tela ao ligar o box, para o quiosque funcionar sem
 * intervenção. Em API 25 um receiver ainda pode abrir Activity diretamente.
 */
class ReceptorBoot : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        ServicoBalanca.iniciar(context)
        context.startActivity(
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}

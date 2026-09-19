package br.edu.ifsc.balancagfig.atualizacao

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import br.edu.ifsc.balancagfig.MainActivity
import br.edu.ifsc.balancagfig.ServicoBalanca

/**
 * O Android mata o app ao reinstalá-lo e entrega MY_PACKAGE_REPLACED à versão
 * nova: sobe o serviço (que retoma a cadeia de atualização) e a tela do quiosque.
 */
class ReceptorAtualizacao : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        ServicoBalanca.iniciar(context)
        context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

package com.ifsc.laucherbox

import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * A tela inicial do box.
 *
 * É uma Activity de launcher (o manifest tem o filtro com `category.HOME`), mas
 * nada aqui é específico de launcher: ela desenha o painel e delega ao
 * [TelaInicial]. Como no app da balança, a tela fica sempre acesa e o app roda
 * em tela cheia — a TV é operada por controle, sem barra de navegação à mão.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Quiosque: a tela não apaga sozinha
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        esconderBarrasDoSistema()

        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                TelaInicial(contexto = this)
            }
        }
    }

    /**
     * Imersivo, mas com as barras voltando por um gesto de cima para baixo —
     * sem isso não haveria como alcançar notificações ou sair da tela cheia.
     * Mesma abordagem do app da balança.
     */
    private fun esconderBarrasDoSistema() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
    }

    /** Ao voltar para a tela (ex.: fechar um app aberto por ela), some de novo. */
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) esconderBarrasDoSistema()
    }

    /**
     * Na tela inicial a tecla VOLTAR não pode fechar a Activity: o box ficaria
     * com a tela preta, sem launcher nenhum. A tecla é consumida.
     *
     * Mesma razão pela qual o app da balança trata teclas aqui: a TV é operada
     * por controle, e não há barra de navegação para onde voltar.
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean =
        if (event.keyCode == KeyEvent.KEYCODE_BACK) true else super.dispatchKeyEvent(event)
}

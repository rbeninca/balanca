package br.edu.ifsc.balancagfig.sistema

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent

/**
 * Abre o painel da balança no navegador instalado no box.
 *
 * O app não embute mais motor de renderização: o GeckoView consumia 108 dos
 * 122 MB do APK, e o box já traz o Chrome (101 nestes aparelhos), que roda o
 * frontend sem nenhum ajuste. Aqui só se escolhe a melhor forma de entregar a
 * URL a ele.
 *
 * O WebView do sistema não serve como substituto: nestes boxes ele é o
 * Chromium 52 (2016), sem módulos ES nem `ResizeObserver`, e não dá para
 * trocar o provedor — o Chrome instalado em `/data` não tem a permissão de
 * assinatura `android.webkit.permission.PLUGIN` que o Android 7 exige.
 */
object NavegadorDoBox {

    /**
     * Abre [url] no navegador.
     *
     * Prefere um Custom Tab: uma aba só, sem barra de endereço nem gaveta de
     * abas — o mais perto de quiosque que o Chrome oferece. Se nenhum
     * navegador atender ao Custom Tab, cai no `ACTION_VIEW` comum; se nem
     * isso, devolve `false` para o chamador avisar o usuário.
     */
    fun abrir(atividade: Activity, url: String): Boolean {
        val endereco = Uri.parse(url)
        return try {
            CustomTabsIntent.Builder()
                .setShowTitle(false)
                .build()
                .launchUrl(atividade, endereco)
            true
        } catch (e: ActivityNotFoundException) {
            abrirNoNavegadorPadrao(atividade, endereco)
        }
    }

    private fun abrirNoNavegadorPadrao(atividade: Activity, endereco: Uri): Boolean =
        try {
            atividade.startActivity(Intent(Intent.ACTION_VIEW, endereco))
            true
        } catch (e: ActivityNotFoundException) {
            false
        }
}

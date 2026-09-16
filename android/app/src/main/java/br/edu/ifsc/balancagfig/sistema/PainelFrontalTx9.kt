package br.edu.ifsc.balancagfig.sistema

import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val TAG_PAINEL_TX9 = "PainelFrontalTx9"

/**
 * Resultado da tentativa de escrita no display frontal.
 */
data class ResultadoPainelFrontal(
    val sucesso: Boolean,
    val caminhoUsado: String? = null,
    val mensagem: String
)

/**
 * Gateway para escrita em display frontal de segmentos do TX9.
 *
 * Observacao: diferentes firmwares usam caminhos diferentes. Por isso, este
 * gateway testa uma lista de caminhos comuns e falha de forma segura.
 */
object PainelFrontalTx9 {
    private val caminhosTexto = listOf(
        "/sys/class/leds/display/text",
        "/sys/class/leds/seg-led/text",
        "/sys/class/display/text",
        "/sys/devices/platform/display/text",
        "/sys/devices/platform/vfd/text"
    )

    private val caminhosDispositivo = listOf(
        "/dev/vfd",
        "/dev/display"
    )

    /**
     * Envia texto para o display (normalizado para ate 4 caracteres).
     */
    fun mostrarTexto(texto: String): ResultadoPainelFrontal {
        val textoNormalizado = normalizarTextoDisplay(texto)

        for (caminho in caminhosTexto) {
            val arquivo = File(caminho)
            if (!arquivo.exists()) continue

            val escreveu = runCatching {
                arquivo.writeText(textoNormalizado)
                true
            }.getOrElse {
                Log.w(TAG_PAINEL_TX9, "Falha ao escrever em $caminho: ${it.message}")
                false
            }

            if (escreveu) {
                return ResultadoPainelFrontal(
                    sucesso = true,
                    caminhoUsado = caminho,
                    mensagem = "Texto enviado para display frontal"
                )
            }
        }

        for (caminho in caminhosDispositivo) {
            val arquivo = File(caminho)
            if (!arquivo.exists()) continue

            val escreveu = runCatching {
                FileOutputStream(arquivo).use { stream ->
                    stream.write(textoNormalizado.toByteArray())
                    stream.flush()
                }
                true
            }.getOrElse {
                Log.w(TAG_PAINEL_TX9, "Falha ao escrever no dispositivo $caminho: ${it.message}")
                false
            }

            if (escreveu) {
                return ResultadoPainelFrontal(
                    sucesso = true,
                    caminhoUsado = caminho,
                    mensagem = "Texto enviado para dispositivo frontal"
                )
            }
        }

        return ResultadoPainelFrontal(
            sucesso = false,
            mensagem = "Display frontal nao disponivel neste firmware/dispositivo"
        )
    }

    /**
     * Atualiza o display com a hora atual no formato HHmm.
     */
    fun mostrarHoraAtual(): ResultadoPainelFrontal {
        val hora = SimpleDateFormat("HHmm", Locale.getDefault()).format(Date())
        return mostrarTexto(hora)
    }

    private fun normalizarTextoDisplay(texto: String): String {
        val base = texto.uppercase(Locale.getDefault())
            .filter { it.isLetterOrDigit() || it == ' ' || it == '-' }
            .trim()

        if (base.isEmpty()) return "----"
        return base.take(4).padEnd(4, ' ')
    }
}


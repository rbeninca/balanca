package br.edu.ifsc.balancagfig.serial

import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbRequest
import android.os.Process
import android.util.Log
import java.io.IOException
import java.nio.ByteBuffer
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.concurrent.timer

/**
 * Leitura do endpoint bulk IN com várias [UsbRequest] em voo, como o driver
 * ch341 do Linux faz com seus URBs.
 *
 * O SerialInputOutputManager da biblioteca mantém uma única requisição
 * pendente e só enfileira a próxima depois de entregar os dados; qualquer
 * pausa da thread (GC, escalonamento no Amlogic) deixa o CH340 sem para onde
 * enviar e ele descarta bytes — víamos pacotes truncados a cada ~20 s. Com
 * [numRequisicoes] buffers já entregues ao controlador USB, o hardware
 * continua recebendo enquanto o software não está olhando.
 */
class LeitorUsb(
    private val conexao: UsbDeviceConnection,
    private val endpoint: UsbEndpoint,
    private val aoReceber: (ByteArray) -> Unit,
    private val aoFalhar: (IOException) -> Unit,
    private val numRequisicoes: Int = 16,
    private val tamanhoBuffer: Int = 512,
) {
    @Volatile private var ativo = false
    private var thread: Thread? = null
    @Volatile private var ultimoRecebimento = System.currentTimeMillis()
    private var monitor: java.util.Timer? = null

    fun iniciar() {
        ativo = true
        ultimoRecebimento = System.currentTimeMillis()
        thread = Thread(::executar, "LeitorUsb").apply {
            isDaemon = true
            start()
        }
        monitor = timer("LeitorUsb-watchdog", daemon = true, initialDelay = TIMEOUT_INATIVIDADE_MS, period = TIMEOUT_INATIVIDADE_MS / 2) {
            if (ativo && System.currentTimeMillis() - ultimoRecebimento > TIMEOUT_INATIVIDADE_MS) {
                Log.w(TAG, "inatividade detectada por $TIMEOUT_INATIVIDADE_MS ms, encerrando")
                val e = IOException("Sem dados por ${TIMEOUT_INATIVIDADE_MS}ms (ESP desconectada ou travada)")
                aoFalhar(e)
                parar()
            }
        }
    }

    fun parar() {
        ativo = false
        monitor?.cancel()
        monitor = null
        thread?.interrupt()
        thread = null
    }

    private fun executar() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)

        val requisicoes = Array(numRequisicoes) {
            UsbRequest().also { r ->
                if (!r.initialize(conexao, endpoint)) throw IllegalStateException("UsbRequest.initialize falhou")
                r.clientData = ByteBuffer.allocate(tamanhoBuffer)
            }
        }
        try {
            for (r in requisicoes) enfileirar(r)

            while (ativo) {
                val r = conexao.requestWait() ?: throw IOException("requestWait devolveu null (dispositivo removido?)")
                val buffer = r.clientData as ByteBuffer
                val lidos = buffer.position()
                if (lidos > 0) {
                    val dados = ByteArray(lidos)
                    buffer.rewind()
                    buffer.get(dados)
                    aoReceber(dados)
                    ultimoRecebimento = System.currentTimeMillis()
                }
                enfileirar(r)
            }
        } catch (e: Exception) {
            if (ativo) {
                Log.w(TAG, "leitura encerrada: ${e.message}")
                aoFalhar(e as? IOException ?: IOException(e.message, e))
            }
        } finally {
            for (r in requisicoes) {
                try { r.cancel() } catch (_: Exception) { }
                r.close()
            }
        }
    }

    private fun enfileirar(r: UsbRequest) {
        val buffer = (r.clientData as ByteBuffer).also { it.clear() }
        // queue(ByteBuffer, int) é o único disponível em API 25; ao completar, position = bytes lidos
        @Suppress("DEPRECATION")
        if (!r.queue(buffer, tamanhoBuffer)) throw IOException("UsbRequest.queue falhou")
    }

    private companion object {
        const val TAG = "LeitorUsb"
        const val TIMEOUT_INATIVIDADE_MS = 15_000L
    }
}

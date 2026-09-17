package br.edu.ifsc.balancagfig.servidor

import android.util.Log
import fi.iki.elonen.NanoHTTPD
import fi.iki.elonen.NanoWSD
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/**
 * WebSocket do gateway (porta 8765) — papel de pacotes/gateway/src/ServidorWebSocket.ts.
 * Difunde leituras/config/status a todos os clientes e entrega ao serviço as
 * mensagens que eles enviam (PIPELINE_CONFIG e comandos para o ESP).
 */
class ServidorWs(
    porta: Int = PORTA_PADRAO,
    /** JSON enviado a cada cliente recém-conectado (PIPELINE_ESTADO). */
    private val estadoInicial: () -> String,
    private val aoReceber: (Mensagens.Entrada) -> Unit,
) : NanoWSD(porta) {

    private val clientes = CopyOnWriteArraySet<Cliente>()

    /**
     * Envio fora da thread serial: um cliente lento não pode atrasar a leitura
     * da balança. Fila limitada; se encher, descarta as leituras mais antigas.
     */
    private val difusor = ThreadPoolExecutor(
        1, 1, 0L, TimeUnit.MILLISECONDS,
        LinkedBlockingQueue(FILA_MAX),
        { r -> Thread(r, "ServidorWs-difusor") },
        ThreadPoolExecutor.DiscardOldestPolicy(),
    )

    private val pingador = Thread({
        while (!Thread.currentThread().isInterrupted) {
            try {
                Thread.sleep(INTERVALO_PING_MS)
            } catch (_: InterruptedException) {
                return@Thread
            }
            for (c in clientes) {
                try { c.ping(ByteArray(0)) } catch (_: IOException) { remover(c) }
            }
        }
    }, "ServidorWs-ping").apply { isDaemon = true }

    fun iniciar() {
        // Timeout 0: o frontend só recebe, nunca envia; um timeout de leitura derrubaria a conexão.
        start(0, false)
        pingador.start()
        Log.i(TAG, "WebSocket em :$listeningPort")
    }

    fun encerrar() {
        pingador.interrupt()
        difusor.shutdownNow()
        for (c in clientes) try { c.close(WebSocketFrame.CloseCode.GoingAway, "encerrando", false) } catch (_: IOException) { }
        clientes.clear()
        stop()
    }

    fun difundir(json: String) {
        if (clientes.isEmpty()) return
        difusor.execute {
            for (c in clientes) {
                try { c.send(json) } catch (e: IOException) { remover(c) }
            }
        }
    }

    val numClientes: Int get() = clientes.size

    override fun openWebSocket(handshake: NanoHTTPD.IHTTPSession): WebSocket = Cliente(handshake)

    private fun remover(c: Cliente) {
        if (clientes.remove(c)) Log.i(TAG, "cliente saiu (${clientes.size} restantes)")
    }

    private inner class Cliente(handshake: NanoHTTPD.IHTTPSession) : WebSocket(handshake) {
        override fun onOpen() {
            clientes += this
            Log.i(TAG, "cliente conectado (${clientes.size})")
            try { send(estadoInicial()) } catch (e: IOException) { remover(this) }
        }

        override fun onClose(code: WebSocketFrame.CloseCode?, reason: String?, initiatedByRemote: Boolean) = remover(this)

        override fun onMessage(message: WebSocketFrame) {
            val entrada = Mensagens.interpretar(message.textPayload) ?: return
            aoReceber(entrada)
        }

        override fun onPong(pong: WebSocketFrame) = Unit

        override fun onException(exception: IOException) = remover(this)
    }

    companion object {
        private const val TAG = "ServidorWs"
        const val PORTA_PADRAO = 8765
        private const val FILA_MAX = 200
        private const val INTERVALO_PING_MS = 10_000L
    }
}

/**
 * HTTP de coordenação do gateway (porta 8766): `GET /saude`, usado pelo
 * DetectorAmbiente do frontend e por health-checks. `/pausar` e `/retomar`
 * (atualização de firmware) ficam para quando houver gravador de firmware.
 */
class ServidorSaude(
    porta: Int = PORTA_PADRAO,
    private val estado: () -> JSONObject,
) : NanoHTTPD(porta) {

    override fun serve(session: IHTTPSession): Response {
        if (session.method == Method.GET && session.uri == "/saude") {
            return newFixedLengthResponse(Response.Status.OK, "application/json", estado().toString()).apply {
                // O frontend pode estar em outra origem (porta 8080 ou o PC de desenvolvimento)
                addHeader("Access-Control-Allow-Origin", "*")
            }
        }
        return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "")
    }

    companion object {
        const val PORTA_PADRAO = 8766
    }
}

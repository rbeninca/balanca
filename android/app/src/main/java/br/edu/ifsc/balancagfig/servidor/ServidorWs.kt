package br.edu.ifsc.balancagfig.servidor

import android.util.Log
import fi.iki.elonen.NanoHTTPD
import fi.iki.elonen.NanoWSD
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.CopyOnWriteArraySet

/**
 * WebSocket do gateway (porta 8765) — papel de pacotes/gateway/src/ServidorWebSocket.ts.
 * Difunde leituras/config/status a todos os clientes e entrega ao serviço as
 * mensagens que eles enviam (PIPELINE_CONFIG e comandos para a ESP).
 *
 * Cada cliente tem **fila e thread de envio próprias**, e isso não é detalhe de
 * desempenho: é o que impede um cliente morto de calar os outros. Quando um
 * aparelho sai da rede sem fechar o TCP (celular fora do alcance, por exemplo),
 * o `write` para ele bloqueia — sem timeout de escrita no socket. Com uma
 * thread só para todos, a difusão inteira parava ali: o painel recebia o estado
 * inicial do `onOpen`, exibia "conectado" com a taxa certa, e nunca mais uma
 * leitura. Cada cliente na sua fila, o preso trava sozinho.
 */
class ServidorWs(
    porta: Int = PORTA_PADRAO,
    /** JSONs enviados a cada cliente recém-conectado (PIPELINE_ESTADO, GRAVACAO_ESTADO). */
    private val estadoInicial: () -> List<String>,
    /** Mensagem de um cliente, com o endereço de quem enviou. */
    private val aoReceber: (Mensagens.Entrada, remetente: String) -> Unit,
    /** Alguém entrou ou saiu; recebe a lista atual. */
    private val aoMudarClientes: (List<Mensagens.ClienteWs>) -> Unit = {},
) : NanoWSD(porta) {

    private val clientes = CopyOnWriteArraySet<Cliente>()

    /** Clientes conectados, na ordem de chegada. */
    fun listarClientes(): List<Mensagens.ClienteWs> =
        clientes.sortedBy { it.conectadoEm }.map { Mensagens.ClienteWs(it.endereco, it.conectadoEm) }

    /**
     * Ping de vida a cada 10 s, e quem recolhe os clientes presos: um cliente
     * que não conclui envio há [LIMITE_SEM_ENVIAR_MS] não está lendo, e a
     * conexão dele é fechada — o que destrava a thread de envio e libera o
     * socket, em vez de deixá-lo pendurado para sempre.
     */
    private val pingador = Thread({
        while (!Thread.currentThread().isInterrupted) {
            try {
                Thread.sleep(INTERVALO_PING_MS)
            } catch (_: InterruptedException) {
                return@Thread
            }
            for (c in clientes) {
                if (c.preso()) {
                    Log.w(TAG, "cliente ${c.endereco} parou de consumir; fechando")
                    remover(c)
                    continue
                }
                c.ofertar(Envio.Ping)
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
        for (c in clientes) c.destravar()
        clientes.clear()
        stop()
    }

    /**
     * Enfileira em cada cliente e volta. Quem escreve no socket é a thread de
     * envio do próprio cliente — esta função roda na thread da serial, a 86 Hz,
     * e por isso não pode bloquear.
     */
    fun difundir(json: String) {
        for (c in clientes) c.ofertar(Envio.Texto(json))
    }

    val numClientes: Int get() = clientes.size

    override fun openWebSocket(handshake: NanoHTTPD.IHTTPSession): WebSocket = Cliente(handshake)

    private fun remover(c: Cliente) {
        if (clientes.remove(c)) {
            // Se a thread de envio estiver presa num socket morto, é aqui que ela solta
            c.destravar()
            Log.i(TAG, "cliente ${c.endereco} saiu (${clientes.size} restantes)")
            aoMudarClientes(listarClientes())
        }
    }

    /** Um envio na fila de um cliente, na ordem em que foi produzido. */
    private sealed interface Envio {
        data class Texto(val json: String) : Envio
        data object Ping : Envio
    }

    private inner class Cliente(handshake: NanoHTTPD.IHTTPSession) : WebSocket(handshake) {
        val endereco: String = handshake.remoteIpAddress ?: "?"
        val conectadoEm: Long = System.currentTimeMillis()

        /** A sessão do handshake: é por ela que se fecha o socket em [destravar]. */
        private val sessao = handshake

        private val fila = ArrayBlockingQueue<Envio>(FILA_MAX)

        /** Instante do último envio concluído; congelado, denuncia a thread presa (ver [preso]). */
        @Volatile private var ultimoEnvioMs = System.currentTimeMillis()

        /**
         * Envio deste cliente. Se ele parar de ler, o `write` para no meio de um
         * `send` aqui dentro — e é só aqui: os outros clientes seguem recebendo.
         *
         * Só começa no [onOpen]: um handshake que falha não chega a entrar em
         * `clientes` e deixaria a thread esperando na fila para sempre.
         */
        private val envio = Thread({
            while (!Thread.currentThread().isInterrupted) {
                val e = try { fila.take() } catch (_: InterruptedException) { return@Thread }
                try {
                    when (e) {
                        is Envio.Texto -> send(e.json)
                        Envio.Ping -> ping(ByteArray(0))
                    }
                    ultimoEnvioMs = System.currentTimeMillis()
                } catch (ex: IOException) {
                    remover(this)
                    return@Thread
                }
            }
        }, "ServidorWs-envio").apply { isDaemon = true }

        /** Fila cheia descarta a mais antiga: leitura atrasada não interessa a ninguém. */
        fun ofertar(e: Envio) {
            if (fila.offer(e)) return
            fila.poll()
            fila.offer(e)
        }

        /** Parado há [LIMITE_SEM_ENVIAR_MS]: a thread está presa num socket que não anda. */
        fun preso(): Boolean = System.currentTimeMillis() - ultimoEnvioMs > LIMITE_SEM_ENVIAR_MS

        /**
         * Destrava a thread de envio fechando o socket por baixo do NanoWSD.
         *
         * O `close()` da biblioteca não serve para isto: ele passa pelo mesmo
         * `sendFrame` — `synchronized` — que está preso, e travaria quem tenta
         * destravar. Fechar o stream do handshake fecha o socket, e aí o `write`
         * pendente morre com IOException.
         */
        fun destravar() {
            try { sessao.inputStream.close() } catch (_: Exception) { }
            envio.interrupt()
        }

        override fun onOpen() {
            clientes += this
            Log.i(TAG, "cliente $endereco conectado (${clientes.size})")
            envio.start()
            for (m in estadoInicial()) ofertar(Envio.Texto(m))
            aoMudarClientes(listarClientes())
        }

        override fun onClose(code: WebSocketFrame.CloseCode?, reason: String?, initiatedByRemote: Boolean) = remover(this)

        override fun onMessage(message: WebSocketFrame) {
            val entrada = Mensagens.interpretar(message.textPayload) ?: return
            aoReceber(entrada, endereco)
        }

        override fun onPong(pong: WebSocketFrame) = Unit

        override fun onException(exception: IOException) = remover(this)
    }

    companion object {
        private const val TAG = "ServidorWs"
        const val PORTA_PADRAO = 8765

        /** ~2,3 s de leituras a 86 Hz; o suficiente para absorver um cliente momentaneamente lento. */
        private const val FILA_MAX = 200
        private const val INTERVALO_PING_MS = 10_000L

        /**
         * Sem nenhum envio concluído neste tempo, o cliente é dado como morto.
         * O SAUDE sai a cada 2 s, então um cliente vivo sempre renova isto.
         */
        private const val LIMITE_SEM_ENVIAR_MS = 25_000L
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

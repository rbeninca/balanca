package br.edu.ifsc.balancagfig.servidor

import android.util.Log
import fi.iki.elonen.NanoHTTPD
import org.json.JSONObject
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Atualizador de firmware (porta 8767) — papel do container `atualizador`
 * (pacotes/atualizador/src/servidor.ts), com o contrato que TelaFirmware.ts
 * consome:
 *
 *   GET  /saude             → {status, gravando}
 *   GET  /firmware/versao   → conteúdo de firmware-versao.json
 *   POST /firmware/gravar   → texto em streaming, uma linha por etapa,
 *                             terminando em "CONCLUIDO" ou "ERRO: ..."; 409 se já houver gravação
 */
class ServidorAtualizador(
    private val versaoJson: () -> String?,
    /** Executa a gravação chamando [log] a cada linha de progresso; lança em falha. */
    private val gravar: (log: (String) -> Unit) -> Unit,
    porta: Int = PORTA_PADRAO,
) : NanoHTTPD(porta) {

    private val gravando = AtomicBoolean(false)

    val emGravacao: Boolean get() = gravando.get()

    override fun serve(session: IHTTPSession): Response = rotear(session).apply {
        addHeader("Access-Control-Allow-Origin", "*")
        addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        addHeader("Access-Control-Allow-Headers", "Content-Type")
    }

    private fun rotear(s: IHTTPSession): Response {
        val uri = s.uri.trimEnd('/')
        return when {
            s.method == Method.OPTIONS -> newFixedLengthResponse(Response.Status.NO_CONTENT, MIME_PLAINTEXT, "")

            s.method == Method.GET && uri == "/saude" ->
                json(JSONObject().put("status", "ok").put("gravando", gravando.get()))

            s.method == Method.GET && uri == "/firmware/versao" ->
                versaoJson()?.let { newFixedLengthResponse(Response.Status.OK, "application/json; charset=utf-8", it) }
                    ?: json(JSONObject().put("versao", "desconhecida"))

            s.method == Method.POST && uri == "/firmware/gravar" -> iniciarGravacao(gravar)

            else -> newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "")
        }
    }

    private fun iniciarGravacao(tarefa: (log: (String) -> Unit) -> Unit): Response {
        if (!gravando.compareAndSet(false, true)) {
            return json(JSONObject().put("erro", "Gravação já em andamento"), Response.Status.CONFLICT)
        }

        // A gravação escreve linhas no pipe; o NanoHTTPD as envia em chunks conforme chegam.
        val saida = PipedOutputStream()
        val entrada = PipedInputStream(saida, 64 * 1024)
        val linha = { txt: String ->
            synchronized(saida) {
                saida.write((txt + "\n").toByteArray(Charsets.UTF_8))
                saida.flush()
            }
        }

        Thread({
            try {
                tarefa(linha)
                linha("CONCLUIDO")
            } catch (e: Exception) {
                Log.e(TAG, "gravação falhou", e)
                try { linha("ERRO: ${e.message ?: e.javaClass.simpleName}") } catch (_: Exception) { }
            } finally {
                gravando.set(false)
                try { saida.close() } catch (_: Exception) { }
            }
        }, "Atualizador-gravacao").start()

        return newChunkedResponse(Response.Status.OK, "text/plain; charset=utf-8", entrada).apply {
            addHeader("Cache-Control", "no-cache")
            addHeader("X-Content-Type-Options", "nosniff")
        }
    }

    private fun json(obj: JSONObject, status: Response.Status = Response.Status.OK): Response =
        newFixedLengthResponse(status, "application/json; charset=utf-8", obj.toString())

    companion object {
        private const val TAG = "ServidorAtualizador"
        const val PORTA_PADRAO = 8767
    }
}

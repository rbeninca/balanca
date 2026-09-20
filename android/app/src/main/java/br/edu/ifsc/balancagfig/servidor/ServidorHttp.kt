package br.edu.ifsc.balancagfig.servidor

import android.content.res.AssetManager
import android.util.Log
import fi.iki.elonen.NanoHTTPD
import java.io.FileNotFoundException
import java.io.InputStream

/**
 * Serve o frontend (pacotes/aplicacao/dist-web, copiado para assets/web pela
 * tarefa Gradle copiarFrontend) — papel do container `webapp`/nginx.
 *
 * Como o nginx.conf original: `try_files $uri /index.html`, ou seja, rotas
 * desconhecidas sem extensão caem no index.html da SPA.
 */
class ServidorHttp(
    private val assets: AssetManager,
    porta: Int = PORTA_PADRAO,
    private val raiz: String = "web",
) : NanoHTTPD(porta) {

    override fun serve(session: IHTTPSession): Response {
        if (session.method != Method.GET && session.method != Method.HEAD) {
            return newFixedLengthResponse(Response.Status.METHOD_NOT_ALLOWED, MIME_PLAINTEXT, "")
        }

        val caminho = session.uri.trimStart('/').ifEmpty { "index.html" }
        if (caminho.contains("..")) {
            return newFixedLengthResponse(Response.Status.FORBIDDEN, MIME_PLAINTEXT, "")
        }

        // Probe de conectividade de celulares/PCs (chega aqui quando o redirect :80 é geral,
        // isto é, sem upstream): responde o sucesso esperado para o WiFi ser mantido como
        // rede padrão — senão o Android manda o WebSocket pelos dados móveis.
        respostaProbe(session.uri)?.let { (status, corpo) ->
            return newFixedLengthResponse(status, if (corpo.startsWith("<")) "text/html" else MIME_PLAINTEXT, corpo).apply {
                addHeader("Cache-Control", "no-cache")
            }
        }

        abrir(caminho)?.let { return resposta(it, caminho) }

        // SPA: rota sem extensão → index.html
        if (!caminho.substringAfterLast('/').contains('.')) {
            abrir("index.html")?.let { return resposta(it, "index.html") }
        }
        return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "não encontrado")
    }

    private fun abrir(caminho: String): InputStream? = try {
        assets.open("$raiz/$caminho")
    } catch (_: FileNotFoundException) {
        null
    } catch (e: Exception) {
        Log.w(TAG, "erro ao abrir asset $caminho: ${e.message}")
        null
    }

    private fun resposta(fluxo: InputStream, caminho: String): Response {
        val tamanho = fluxo.available().toLong()
        val r = newFixedLengthResponse(Response.Status.OK, mime(caminho), fluxo, tamanho)
        // Bundles do Vite têm hash no nome: cache longo; o resto, sem cache.
        r.addHeader(
            "Cache-Control",
            if (caminho.startsWith("assets/")) "public, max-age=31536000, immutable" else "no-cache"
        )
        return r
    }

    private fun mime(caminho: String): String = when (caminho.substringAfterLast('.', "").lowercase()) {
        "html" -> "text/html; charset=utf-8"
        "js", "mjs" -> "application/javascript; charset=utf-8"
        "css" -> "text/css; charset=utf-8"
        "json", "map" -> "application/json; charset=utf-8"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "gif" -> "image/gif"
        "webp" -> "image/webp"
        "ico" -> "image/x-icon"
        "woff" -> "font/woff"
        "woff2" -> "font/woff2"
        "ttf" -> "font/ttf"
        "wasm" -> "application/wasm"
        "bin" -> "application/octet-stream"
        "txt" -> "text/plain; charset=utf-8"
        "webmanifest" -> "application/manifest+json"
        else -> "application/octet-stream"
    }

    /** true se o frontend foi embutido no APK. */
    fun frontendDisponivel(): Boolean = abrir("index.html")?.also { it.close() } != null

    companion object {
        /**
         * Respostas que cada sistema espera do seu probe de conectividade; null
         * quando o caminho não é um probe. Android: 204 vazio; Apple: "Success";
         * Windows: "Microsoft Connect Test"/"Microsoft NCSI"; Firefox: "success".
         */
        fun respostaProbe(uri: String): Pair<Response.Status, String>? = when (uri.trimStart('/').lowercase()) {
            "generate_204", "gen_204" -> Response.Status.NO_CONTENT to ""
            "hotspot-detect.html", "library/test/success.html" ->
                Response.Status.OK to "<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>"
            "connecttest.txt" -> Response.Status.OK to "Microsoft Connect Test"
            "ncsi.txt" -> Response.Status.OK to "Microsoft NCSI"
            "success.txt", "canonical.html" -> Response.Status.OK to "success"
            else -> null
        }

        private const val TAG = "ServidorHttp"
        /** 80 exigiria root; o frontend não depende da porta em que é servido. */
        const val PORTA_PADRAO = 8080
    }
}

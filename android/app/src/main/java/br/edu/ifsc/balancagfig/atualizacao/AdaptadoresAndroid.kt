package br.edu.ifsc.balancagfig.atualizacao

import android.content.Context
import android.util.Log
import br.edu.ifsc.balancagfig.sistema.Root
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** Rede real: HttpURLConnection, seguindo redirecionamentos (GitHub → objects.githubusercontent.com). */
class RedeHttp(private val agenteUsuario: String) : Rede {

    override fun obterTexto(url: String): String = abrir(url).use { it.inputStream.bufferedReader().readText() }

    override fun publicar(url: String, corpoJson: String, chave: String): String? =
        abrir(
            url,
            metodo = "POST",
            corpo = corpoJson,
            cabecalhos = mapOf("Content-Type" to "application/json; charset=utf-8", "X-Chave" to chave),
        ).use { it.inputStream.bufferedReader().readText() }

    override fun baixar(url: String, destino: File, progresso: (Long, Long) -> Unit) {
        abrir(url).use { con ->
            val total = con.contentLengthLong
            val tmp = File(destino.path + ".parte")
            tmp.outputStream().use { saida ->
                con.inputStream.use { entrada ->
                    val buf = ByteArray(64 * 1024)
                    var lidos = 0L
                    while (true) {
                        val n = entrada.read(buf)
                        if (n < 0) break
                        saida.write(buf, 0, n)
                        lidos += n
                        progresso(lidos, total)
                    }
                }
            }
            if (!tmp.renameTo(destino)) throw IllegalStateException("não foi possível gravar ${destino.name}")
        }
    }

    /**
     * Abre a conexão seguindo até 5 redirecionamentos (HttpURLConnection não
     * segue entre hosts). [corpo] não nulo vira um POST.
     */
    private fun abrir(
        url: String,
        metodo: String = "GET",
        corpo: String? = null,
        cabecalhos: Map<String, String> = emptyMap(),
    ): Conexao {
        var atual = url
        repeat(5) {
            val con = (URL(atual).openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000
                readTimeout = 60_000
                instanceFollowRedirects = false
                requestMethod = metodo
                setRequestProperty("User-Agent", agenteUsuario)
                setRequestProperty("Accept", "application/vnd.github+json, application/octet-stream, */*")
                cabecalhos.forEach { (nome, valor) -> setRequestProperty(nome, valor) }
                if (corpo != null) {
                    doOutput = true
                    outputStream.use { it.write(corpo.toByteArray(Charsets.UTF_8)) }
                }
            }
            val codigo = con.responseCode
            if (codigo in 300..399) {
                val destino = con.getHeaderField("Location") ?: throw IllegalStateException("redirecionamento sem Location")
                con.disconnect()
                atual = URL(URL(atual), destino).toString()
                return@repeat
            }
            if (codigo !in 200..299) {
                val corpo = con.errorStream?.bufferedReader()?.readText()?.take(200) ?: ""
                con.disconnect()
                throw IllegalStateException("HTTP $codigo em $atual $corpo".trim())
            }
            return Conexao(con)
        }
        throw IllegalStateException("redirecionamentos demais para $url")
    }

    private class Conexao(val con: HttpURLConnection) : AutoCloseable {
        val inputStream get() = con.inputStream
        val contentLengthLong get() = con.contentLengthLong
        override fun close() = con.disconnect()
    }
}

/**
 * Instala o APK via root (`pm install -r`), como o preparar-tx9.sh faz pelo adb.
 * O arquivo é copiado para /data/local/tmp porque o instalador do sistema não
 * lê a pasta privada do app. Em sucesso o Android mata este processo e dispara
 * MY_PACKAGE_REPLACED para a versão nova.
 */
class InstaladorRoot : Instalador {
    override fun instalar(apk: File): String? {
        if (!Root.disponivel()) return "root indisponível (su não respondeu)"
        val alvo = "/data/local/tmp/balancagfig-atualizacao.apk"
        val saida = Root.executarLendo(
            "cp '${apk.absolutePath}' $alvo && chmod 644 $alvo && pm install -r $alvo 2>&1; rc=\$?; rm -f $alvo; exit \$rc",
            // Copiar 122 MB e otimizar o APK leva minutos num box destes — o
            // teto aqui existe só para não travar para sempre.
            timeoutMs = Root.TIMEOUT_INSTALACAO_MS,
        )
        Log.i(TAG, "pm install: ${saida?.trim()}")
        return when {
            saida == null -> "pm install falhou (sem saída)"
            saida.contains("Success", ignoreCase = true) -> null
            else -> "pm install: ${saida.trim().lines().lastOrNull { it.isNotBlank() } ?: "falhou"}"
        }
    }

    private companion object { const val TAG = "InstaladorRoot" }
}

/** Estado do atualizador em SharedPreferences (sobrevive à reinstalação do app). */
class ArmazemPreferencias(context: Context) : Armazem {
    private val prefs = context.getSharedPreferences("atualizacao", Context.MODE_PRIVATE)
    override fun ler(): String? = prefs.getString("estado", null)
    override fun gravar(json: String) { prefs.edit().putString("estado", json).apply() }
}

package br.edu.ifsc.balancagfig.servidor

import android.util.Log
import br.edu.ifsc.balancagfig.armazenamento.BancoDados
import br.edu.ifsc.balancagfig.armazenamento.ModoRestauracao
import fi.iki.elonen.NanoHTTPD
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.util.UUID

/**
 * API REST de sessões (porta 3000) — papel do pacote api (Fastify + SQLite),
 * com as mesmas rotas, códigos e formato de resposta que ArmazenamentoApi.ts
 * consome:
 *
 *   GET    /saude
 *   GET    /sessoes                     POST   /sessoes*
 *   GET    /sessoes/:id                 PATCH  /sessoes/:id*      DELETE /sessoes/:id*
 *   GET    /sessoes/:id/leituras        POST   /sessoes/:id/leituras*   DELETE /sessoes/:id/leituras*
 *   GET    /sessoes/:id/exportar.csv
 *   GET    /sessoes/:id/metadados       POST   /sessoes/:id/metadados*
 *
 * (*) exigem o cabeçalho x-chave-api quando uma chave está configurada;
 * sem chave, como no pacote api, a escrita é livre (modo dev/laboratório).
 */
class ServidorApi(
    private val bd: BancoDados,
    /** Chave de API; null desliga a autenticação. */
    private val chave: String?,
    /** Notificado com o id da sessão após inserir leituras (para backup em pendrive). */
    private val aoSalvarSessao: ((String) -> Unit)? = null,
    /** Backup em pendrive, para as rotas /pendrive (null quando indisponível). */
    private val backup: br.edu.ifsc.balancagfig.armazenamento.BackupPendrive? = null,
    porta: Int = PORTA_PADRAO,
) : NanoHTTPD(porta) {

    private val rotaSessao = Regex("^/sessoes/([^/]+)$")
    private val rotaLeituras = Regex("^/sessoes/([^/]+)/leituras$")
    private val rotaCsv = Regex("^/sessoes/([^/]+)/exportar\\.csv$")
    private val rotaMetadados = Regex("^/sessoes/([^/]+)/metadados$")

    override fun serve(session: IHTTPSession): Response {
        val resposta = try {
            rotear(session)
        } catch (e: JSONException) {
            erro(Response.Status.BAD_REQUEST, "JSON inválido: ${e.message}")
        } catch (e: Exception) {
            Log.e(TAG, "erro em ${session.method} ${session.uri}", e)
            erro(Response.Status.INTERNAL_ERROR, e.message ?: "erro interno")
        }
        return resposta.comCors()
    }

    private fun rotear(s: IHTTPSession): Response {
        val uri = s.uri.trimEnd('/').ifEmpty { "/" }
        val m = s.method

        // Preflight CORS do browser (POST/PATCH/DELETE com cabeçalhos customizados)
        if (m == Method.OPTIONS) return newFixedLengthResponse(Response.Status.NO_CONTENT, MIME_PLAINTEXT, "")

        if (uri == "/saude" && m == Method.GET) {
            return json(Response.Status.OK, JSONObject().put("status", "ok").put("modo", bd.modoJournal()))
        }

        if (uri.startsWith("/pendrive")) return rotearPendrive(uri, m, s)

        if (uri == "/sessoes") return when (m) {
            Method.GET -> json(Response.Status.OK, bd.consultar("SELECT * FROM sessoes ORDER BY criado_em DESC"))
            Method.POST -> autenticado(s) { criarSessao(corpoJson(s)) }
            else -> metodoNaoPermitido()
        }

        rotaSessao.find(uri)?.groupValues?.get(1)?.let { id ->
            return when (m) {
                Method.GET -> sessaoOu404(id) { json(Response.Status.OK, it) }
                Method.PATCH -> autenticado(s) { sessaoOu404(id) { atualizarSessao(id, corpoJson(s)) } }
                Method.DELETE -> autenticado(s) {
                    sessaoOu404(id) {
                        bd.executar("DELETE FROM sessoes WHERE id = ?", id)
                        semConteudo()
                    }
                }
                else -> metodoNaoPermitido()
            }
        }

        rotaLeituras.find(uri)?.groupValues?.get(1)?.let { id ->
            return when (m) {
                Method.GET -> sessaoOu404(id) {
                    json(Response.Status.OK, bd.consultar("SELECT * FROM leituras WHERE id_sessao = ? ORDER BY marca_temporal", id))
                }
                Method.POST -> autenticado(s) { sessaoOu404(id) { inserirLeituras(id, corpo(s)) } }
                Method.DELETE -> autenticado(s) {
                    sessaoOu404(id) {
                        bd.executar("DELETE FROM leituras WHERE id_sessao = ?", id)
                        bd.executar("UPDATE sessoes SET duracao_ms = 0, forca_maxima_n = 0, impulso_total_ns = 0 WHERE id = ?", id)
                        semConteudo()
                    }
                }
                else -> metodoNaoPermitido()
            }
        }

        rotaCsv.find(uri)?.groupValues?.get(1)?.let { id ->
            if (m != Method.GET) return metodoNaoPermitido()
            return sessaoOu404(id) { exportarCsv(id) }
        }

        rotaMetadados.find(uri)?.groupValues?.get(1)?.let { id ->
            return when (m) {
                Method.GET -> sessaoOu404(id) {
                    val meta = bd.consultarUm("SELECT * FROM metadados_sessao WHERE id_sessao = ?", id)
                    if (meta == null) erro(Response.Status.NOT_FOUND, "Metadados não encontrados") else json(Response.Status.OK, meta)
                }
                Method.POST -> autenticado(s) { sessaoOu404(id) { salvarMetadados(id, corpoJson(s)) } }
                else -> metodoNaoPermitido()
            }
        }

        return erro(Response.Status.NOT_FOUND, "Rota não encontrada")
    }

    private fun rotearPendrive(uri: String, m: Method, s: IHTTPSession): Response {
        val bkp = backup ?: return erro(Response.Status.SERVICE_UNAVAILABLE, "Backup em pendrive indisponível")
        return when {
            uri == "/pendrive/status" && m == Method.GET -> {
                val info = bkp.status()
                json(Response.Status.OK, JSONObject().apply {
                    put("presente", info != null)
                    if (info != null) {
                        put("id", info.id); put("livreBytes", info.livreBytes); put("totalBytes", info.totalBytes)
                    }
                })
            }
            uri == "/pendrive/arquivos" && m == Method.GET -> {
                val arr = org.json.JSONArray()
                bkp.listarArquivos().forEach {
                    arr.put(JSONObject().put("nome", it.nome).put("tamanhoBytes", it.tamanhoBytes)
                        .put("data", it.data).put("pasta", it.pasta))
                }
                json(Response.Status.OK, JSONObject().put("arquivos", arr))
            }
            uri == "/pendrive/backup" && m == Method.POST ->
                autenticado(s) { bkp.sincronizarTudo(); json(Response.Status.OK, JSONObject().put("ok", true)) }
            uri == "/pendrive/restaurar" && m == Method.POST -> autenticado(s) {
                val body = corpoJson(s)
                val nome = body.optString("arquivo").ifBlank { return@autenticado erro(Response.Status.BAD_REQUEST, "Campo \"arquivo\" obrigatório") }
                val modo = if (body.optString("modo") == "substituir") ModoRestauracao.SUBSTITUIR else ModoRestauracao.MESCLAR
                try {
                    val r = bkp.restaurar(nome, modo)
                    json(Response.Status.OK, JSONObject().put("inseridas", r.inseridas).put("substituiu", r.substituiu))
                } catch (e: Exception) {
                    erro(Response.Status.INTERNAL_ERROR, e.message ?: "falha na restauração")
                }
            }
            uri == "/pendrive/ejetar" && m == Method.POST ->
                autenticado(s) { json(Response.Status.OK, JSONObject().put("ok", bkp.ejetar())) }
            else -> erro(Response.Status.NOT_FOUND, "Rota de pendrive não encontrada")
        }
    }

    // ─── Sessões ────────────────────────────────────────────────────────────

    private fun criarSessao(body: JSONObject): Response {
        val nome = body.optString("nome", "")
        if (nome.isEmpty()) return erro(Response.Status.BAD_REQUEST, "Campo \"nome\" é obrigatório")
        val id = UUID.randomUUID().toString()
        bd.executar(
            "INSERT INTO sessoes (id, nome, id_motor, observacoes) VALUES (?, ?, ?, ?)",
            id, nome, body.optStringOrNull("id_motor"), body.optStringOrNull("observacoes"),
        )
        return json(Response.Status.CREATED, bd.consultarUm("SELECT * FROM sessoes WHERE id = ?", id)!!)
    }

    private fun atualizarSessao(id: String, body: JSONObject): Response {
        val campos = mutableListOf<String>()
        val valores = mutableListOf<Any?>()
        body.optStringOrNull("nome")?.let { campos += "nome = ?"; valores += it }
        body.optStringOrNull("criado_em")?.let { campos += "criado_em = ?"; valores += it }
        if (campos.isEmpty()) return erro(Response.Status.BAD_REQUEST, "Nenhum campo para atualizar")
        valores += id
        bd.executar("UPDATE sessoes SET ${campos.joinToString(", ")} WHERE id = ?", *valores.toTypedArray())
        return json(Response.Status.OK, bd.consultarUm("SELECT * FROM sessoes WHERE id = ?", id)!!)
    }

    // ─── Leituras ───────────────────────────────────────────────────────────

    private fun inserirLeituras(id: String, corpo: String): Response {
        val lote = try { JSONArray(corpo) } catch (_: JSONException) { null }
        if (lote == null || lote.length() == 0) {
            return erro(Response.Status.BAD_REQUEST, "Body deve ser um array não vazio de leituras")
        }
        // Valida tudo antes de gravar, como o handler Node (que aborta sem transação, mas no primeiro inválido)
        for (i in 0 until lote.length()) {
            val l = lote.optJSONObject(i)
            if (l == null || !l.ehNumero("marca_temporal") || !l.ehNumero("forca_crua") || !l.ehNumero("impulso_acumulado_ns")) {
                return erro(Response.Status.BAD_REQUEST, "Campos obrigatórios: marca_temporal, forca_crua, impulso_acumulado_ns")
            }
        }
        bd.transacao { db ->
            val stmt = db.compileStatement(
                "INSERT INTO leituras (id_sessao, marca_temporal, forca_crua, temperatura, em_queima, impulso_acumulado_ns) VALUES (?, ?, ?, ?, ?, ?)"
            )
            for (i in 0 until lote.length()) {
                val l = lote.getJSONObject(i)
                stmt.clearBindings()
                stmt.bindString(1, id)
                stmt.bindLong(2, l.getLong("marca_temporal"))
                stmt.bindDouble(3, l.getDouble("forca_crua"))
                if (l.has("temperatura") && !l.isNull("temperatura")) stmt.bindDouble(4, l.getDouble("temperatura")) else stmt.bindNull(4)
                stmt.bindLong(5, if (l.optBoolean("em_queima", false)) 1 else 0)
                stmt.bindDouble(6, l.getDouble("impulso_acumulado_ns"))
                stmt.executeInsert()
            }
        }
        atualizarMetricasSessao(id)
        aoSalvarSessao?.invoke(id)
        return json(Response.Status.CREATED, JSONObject().put("inseridas", lote.length()))
    }

    /** duracao_ms, forca_maxima_n e impulso_total_ns derivados das leituras (como atualizarMetricasSessao do Node). */
    private fun atualizarMetricasSessao(id: String) {
        val m = bd.consultarUm(
            """SELECT MAX(forca_crua) AS forca_maxima,
                      MAX(marca_temporal) - MIN(marca_temporal) AS duracao,
                      (SELECT impulso_acumulado_ns FROM leituras WHERE id_sessao = ? ORDER BY marca_temporal DESC LIMIT 1) AS ultimo_impulso,
                      COUNT(*) AS n
               FROM leituras WHERE id_sessao = ?""",
            id, id,
        ) ?: return
        if (m.optLong("n") == 0L) return
        bd.executar(
            "UPDATE sessoes SET duracao_ms = ?, forca_maxima_n = ?, impulso_total_ns = ? WHERE id = ?",
            m.optLong("duracao"), m.optDouble("forca_maxima", 0.0), m.optDouble("ultimo_impulso", 0.0), id,
        )
    }

    private fun exportarCsv(id: String): Response {
        val leituras = bd.consultar("SELECT * FROM leituras WHERE id_sessao = ? ORDER BY marca_temporal", id)
        val sb = StringBuilder("marca_temporal,forca_crua_newton,temperatura,em_queima,impulso_acumulado_ns")
        for (i in 0 until leituras.length()) {
            val l = leituras.getJSONObject(i)
            sb.append('\n')
                .append(l.getLong("marca_temporal")).append(',')
                .append(l.getDouble("forca_crua")).append(',')
                .append(if (l.isNull("temperatura")) "" else l.getDouble("temperatura").toString()).append(',')
                .append(l.getLong("em_queima")).append(',')
                .append(l.getDouble("impulso_acumulado_ns"))
        }
        return newFixedLengthResponse(Response.Status.OK, "text/csv; charset=utf-8", sb.toString()).apply {
            addHeader("Content-Disposition", "attachment; filename=\"sessao-$id.csv\"")
        }
    }

    // ─── Metadados ──────────────────────────────────────────────────────────

    private fun salvarMetadados(id: String, body: JSONObject): Response {
        val existente = bd.consultarUm("SELECT id_sessao FROM metadados_sessao WHERE id_sessao = ?", id) != null
        val valores = arrayOf<Any?>(
            body.optDoubleOrNull("massa_propelente_g"),
            body.optDoubleOrNull("diametro_mm"),
            body.optDoubleOrNull("comprimento_mm"),
            body.optStringOrNull("fabricante"),
            body.optStringOrNull("descricao"),
            body.optStringOrNull("observacoes"),
        )
        if (existente) {
            bd.executar(
                """UPDATE metadados_sessao SET massa_propelente_g = ?, diametro_mm = ?, comprimento_mm = ?,
                   fabricante = ?, descricao = ?, observacoes = ? WHERE id_sessao = ?""",
                *valores, id,
            )
        } else {
            bd.executar(
                """INSERT INTO metadados_sessao (id_sessao, massa_propelente_g, diametro_mm, comprimento_mm, fabricante, descricao, observacoes)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                id, *valores,
            )
        }
        val meta = bd.consultarUm("SELECT * FROM metadados_sessao WHERE id_sessao = ?", id)!!
        return json(if (existente) Response.Status.OK else Response.Status.CREATED, meta)
    }

    // ─── Apoio ──────────────────────────────────────────────────────────────

    private inline fun sessaoOu404(id: String, bloco: (JSONObject) -> Response): Response {
        val sessao = bd.consultarUm("SELECT * FROM sessoes WHERE id = ?", id)
            ?: return erro(Response.Status.NOT_FOUND, "Sessão não encontrada")
        return bloco(sessao)
    }

    private inline fun autenticado(s: IHTTPSession, bloco: () -> Response): Response {
        if (chave == null) return bloco()  // modo dev — sem autenticação
        val recebida = s.headers["x-chave-api"]
        if (recebida == null || recebida != chave) {
            return erro(Response.Status.UNAUTHORIZED, "Chave de API inválida ou ausente")
        }
        return bloco()
    }

    /**
     * Lê o corpo pelo Content-Length. O parseBody do NanoHTTPD ignora o corpo
     * de PATCH (só trata POST/PUT) e grava corpos grandes em arquivo temporário;
     * aqui o inputStream já está posicionado após os cabeçalhos.
     */
    private fun corpo(s: IHTTPSession): String {
        val tamanho = s.headers["content-length"]?.toIntOrNull() ?: 0
        if (tamanho <= 0) return ""
        if (tamanho > LIMITE_CORPO) throw IllegalArgumentException("Corpo acima de $LIMITE_CORPO bytes")
        val bytes = ByteArray(tamanho)
        var lidos = 0
        while (lidos < tamanho) {
            val n = s.inputStream.read(bytes, lidos, tamanho - lidos)
            if (n < 0) break
            lidos += n
        }
        return String(bytes, 0, lidos, Charsets.UTF_8)
    }

    private fun corpoJson(s: IHTTPSession): JSONObject = corpo(s).let { if (it.isBlank()) JSONObject() else JSONObject(it) }

    private fun json(status: Response.Status, obj: Any): Response =
        newFixedLengthResponse(status, "application/json; charset=utf-8", obj.toString())

    private fun erro(status: Response.Status, mensagem: String): Response =
        json(status, JSONObject().put("erro", mensagem))

    private fun semConteudo(): Response = newFixedLengthResponse(Response.Status.NO_CONTENT, MIME_PLAINTEXT, "")

    private fun metodoNaoPermitido(): Response = erro(Response.Status.METHOD_NOT_ALLOWED, "Método não permitido")

    /** `cors({ origin: true })` do Fastify: reflete qualquer origem. */
    private fun Response.comCors(): Response = apply {
        addHeader("Access-Control-Allow-Origin", "*")
        addHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        addHeader("Access-Control-Allow-Headers", "Content-Type, x-chave-api")
        addHeader("Access-Control-Max-Age", "86400")
    }

    private fun JSONObject.optStringOrNull(k: String): String? = if (has(k) && !isNull(k)) getString(k) else null
    private fun JSONObject.optDoubleOrNull(k: String): Double? = if (has(k) && !isNull(k)) optDouble(k).takeUnless { it.isNaN() } else null
    private fun JSONObject.ehNumero(k: String): Boolean = has(k) && !isNull(k) && opt(k) is Number

    companion object {
        private const val TAG = "ServidorApi"
        const val PORTA_PADRAO = 3000
        /** bodyLimit do Fastify no pacote api: 10 MB. */
        private const val LIMITE_CORPO = 10 * 1024 * 1024
    }
}

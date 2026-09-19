package br.edu.ifsc.balancagfig.armazenamento

import org.json.JSONArray
import org.json.JSONObject

/**
 * Resumo de uma sessão para a listagem (GET /sessoes) — espelho de
 * pacotes/api/src/bancoDados/resumoSessao.ts: contagem de leituras, força
 * média e impulso da janela de queima, gravados em `sessoes` para a lista não
 * precisar baixar as leituras. NULL nas colunas = ainda não calculado.
 */
object ResumoSessao {

    /** Mesma consulta do Node; recebe o id da sessão 5 vezes (um por `?`). */
    const val SQL_RESUMO_SESSAO = """
        WITH
          totais AS (
            SELECT COUNT(*) AS total_leituras, SUM(em_queima <> 0) AS marcadas, MAX(forca_crua) AS pico
            FROM leituras WHERE id_sessao = ?
          ),
          limiar AS (
            SELECT MIN(l.marca_temporal) AS t_ini, MAX(l.marca_temporal) AS t_fim
            FROM leituras l, totais t
            WHERE l.id_sessao = ? AND t.marcadas = 0 AND t.pico > 0 AND l.forca_crua >= t.pico * 0.05
          ),
          janela AS (
            SELECT l.marca_temporal, l.forca_crua
            FROM leituras l, totais t, limiar m
            WHERE l.id_sessao = ?
              AND ((t.marcadas > 0 AND l.em_queima <> 0)
                OR (t.marcadas = 0 AND l.marca_temporal BETWEEN m.t_ini AND m.t_fim))
          ),
          queima AS (
            SELECT AVG(forca_crua) AS forca_media, MIN(marca_temporal) AS t_ini, MAX(marca_temporal) AS t_fim
            FROM janela
          )
        SELECT t.total_leituras,
               q.forca_media AS forca_media_queima_n,
               (SELECT impulso_acumulado_ns FROM leituras
                 WHERE id_sessao = ? AND marca_temporal = q.t_fim ORDER BY id DESC LIMIT 1)
             - (SELECT impulso_acumulado_ns FROM leituras
                 WHERE id_sessao = ? AND marca_temporal = q.t_ini ORDER BY id ASC LIMIT 1) AS impulso_queima_ns
        FROM totais t, queima q"""

    /** Recalcula e grava o resumo; chamar após inserir ou apagar leituras. */
    fun gravar(bd: BancoDados, idSessao: String): JSONObject {
        val r = bd.consultarUm(SQL_RESUMO_SESSAO, idSessao, idSessao, idSessao, idSessao, idSessao)
            ?: JSONObject().put("total_leituras", 0)
                .put("forca_media_queima_n", JSONObject.NULL).put("impulso_queima_ns", JSONObject.NULL)
        bd.executar(
            "UPDATE sessoes SET total_leituras = ?, forca_media_queima_n = ?, impulso_queima_ns = ? WHERE id = ?",
            r.optLong("total_leituras"), r.opt("forca_media_queima_n")?.takeIf { it != JSONObject.NULL },
            r.opt("impulso_queima_ns")?.takeIf { it != JSONObject.NULL }, idSessao,
        )
        return r
    }

    /**
     * Preenche o resumo das sessões que ainda não o têm (bancos anteriores à
     * coluna, restaurações de backup). Custo único por sessão.
     */
    fun garantir(bd: BancoDados, sessoes: JSONArray): JSONArray {
        for (i in 0 until sessoes.length()) {
            val s = sessoes.getJSONObject(i)
            if (semResumo(s)) {
                val r = gravar(bd, s.getString("id"))
                for (k in r.keys()) s.put(k, r.get(k))
            }
        }
        return sessoes
    }

    fun semResumo(sessao: JSONObject): Boolean = sessao.isNull("total_leituras")
}

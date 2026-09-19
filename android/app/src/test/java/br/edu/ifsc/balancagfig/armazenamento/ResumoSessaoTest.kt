package br.edu.ifsc.balancagfig.armazenamento

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ResumoSessaoTest {

    @Test
    fun semResumoQuandoColunaNulaOuAusente() {
        assertTrue(ResumoSessao.semResumo(JSONObject().put("id", "a")))
        assertTrue(ResumoSessao.semResumo(JSONObject().put("id", "a").put("total_leituras", JSONObject.NULL)))
        assertFalse(ResumoSessao.semResumo(JSONObject().put("id", "a").put("total_leituras", 0)))
        assertFalse(ResumoSessao.semResumo(JSONObject().put("id", "a").put("total_leituras", 1200)))
    }

    /** A consulta é espelho da do Node — se uma mudar sem a outra, o resumo diverge entre gateway e app. */
    @Test
    fun consultaIgualAoNode() {
        val ts = File("../../pacotes/api/src/bancoDados/resumoSessao.ts").readText()
        val inicio = ts.indexOf("SQL_RESUMO_SESSAO = `") + "SQL_RESUMO_SESSAO = `".length
        val sqlNode = ts.substring(inicio, ts.indexOf('`', inicio))
        assertEquals(normalizar(sqlNode), normalizar(ResumoSessao.SQL_RESUMO_SESSAO))
    }

    @Test
    fun colunasDeResumoBatemComOEsquema() {
        val esquema = File("../../pacotes/api/src/bancoDados/esquema.sql").readText()
        for ((coluna, tipo) in BancoDados.COLUNAS_RESUMO) {
            assertTrue("$coluna $tipo no esquema", Regex("""$coluna\s+$tipo""").containsMatchIn(esquema))
        }
    }

    private fun normalizar(sql: String) = sql.trim().replace(Regex("\\s+"), " ")
}

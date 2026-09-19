package br.edu.ifsc.balancagfig.armazenamento

import org.junit.Assert.assertEquals
import org.junit.Test

class DividirEsquemaTest {

    @Test
    fun separaComandosEIgnoraTrechosVazios() {
        val cmds = BancoDados.dividirEsquema("CREATE TABLE a (x);\n\nCREATE INDEX i ON a(x);\n")
        assertEquals(listOf("CREATE TABLE a (x)", "CREATE INDEX i ON a(x)"), cmds)
    }

    @Test
    fun descartaTrechoSoDeComentario() {
        val sql = """
            CREATE TABLE a (x);
            -- comentário com ponto-e-vírgula; continua
            -- outra linha
            DROP VIEW IF EXISTS v;
        """.trimIndent()
        val cmds = BancoDados.dividirEsquema(sql)
        assertEquals(listOf("CREATE TABLE a (x)", "DROP VIEW IF EXISTS v"), cmds)
    }

    @Test
    fun removeComentarioNoFimDaLinha() {
        val cmds = BancoDados.dividirEsquema("-- cabeçalho\nCREATE VIEW v AS -- nome; da view\nWITH t AS (SELECT 1) SELECT * FROM t;")
        assertEquals(listOf("CREATE VIEW v AS \nWITH t AS (SELECT 1) SELECT * FROM t"), cmds)
    }

    @Test
    fun esquemaRealGeraSoComandosNaoVazios() {
        val sql = java.io.File("../../pacotes/api/src/bancoDados/esquema.sql").readText()
        val cmds = BancoDados.dividirEsquema(sql)
        cmds.forEach { assert(it.isNotBlank() && !it.contains("--")) { "trecho inválido: $it" } }
        assert(cmds.any { it.startsWith("CREATE TABLE IF NOT EXISTS sessoes") && it.contains("total_leituras") })
    }
}

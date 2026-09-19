package br.edu.ifsc.balancagfig.armazenamento

import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject

/**
 * Banco SQLite das sessões — papel do ProvedorSQLite do pacote api.
 * O esquema é o próprio pacotes/api/src/bancoDados/esquema.sql, copiado para
 * os assets pela tarefa Gradle copiarEsquema; cada `CREATE ... IF NOT EXISTS`
 * roda em toda abertura, então tabelas novas aparecem sem migração.
 */
class BancoDados(private val context: Context, private val nome: String = NOME_PADRAO) :
    SQLiteOpenHelper(context, nome, null, VERSAO) {

    override fun onConfigure(db: SQLiteDatabase) {
        db.setForeignKeyConstraintsEnabled(true)   // ON DELETE CASCADE de leituras/metadados
        db.enableWriteAheadLogging()               // journal_mode = WAL, como o provedor Node
    }

    override fun onCreate(db: SQLiteDatabase) = aplicarEsquema(db)

    override fun onOpen(db: SQLiteDatabase) {
        super.onOpen(db)
        if (!db.isReadOnly) {
            aplicarEsquema(db)
            migrar(db)
        }
    }

    override fun onUpgrade(db: SQLiteDatabase, antiga: Int, nova: Int) = aplicarEsquema(db)

    private fun aplicarEsquema(db: SQLiteDatabase) {
        val sql = context.assets.open(ARQUIVO_ESQUEMA).bufferedReader().readText()
        dividirEsquema(sql).forEach { db.execSQL(it) }
    }

    /** Mesma migração do ProvedorSQLite: bancos antigos tinham forca_newton. */
    private fun migrar(db: SQLiteDatabase) {
        val temForcaNewton = db.rawQuery("PRAGMA table_info(leituras)", null).use { c ->
            generateSequence { if (c.moveToNext()) c.getString(c.getColumnIndexOrThrow("name")) else null }
                .any { it == "forca_newton" }
        }
        if (temForcaNewton) db.execSQL("ALTER TABLE leituras RENAME COLUMN forca_newton TO forca_crua")

        // Colunas de resumo da listagem (CREATE TABLE IF NOT EXISTS não altera tabela existente)
        val colunasSessoes = db.rawQuery("PRAGMA table_info(sessoes)", null).use { c ->
            generateSequence { if (c.moveToNext()) c.getString(c.getColumnIndexOrThrow("name")) else null }.toSet()
        }
        for ((coluna, tipo) in COLUNAS_RESUMO) {
            if (coluna !in colunasSessoes) db.execSQL("ALTER TABLE sessoes ADD COLUMN $coluna $tipo")
        }
        val colunasMeta = db.rawQuery("PRAGMA table_info(metadados_sessao)", null).use { c ->
            generateSequence { if (c.moveToNext()) c.getString(c.getColumnIndexOrThrow("name")) else null }.toSet()
        }
        if ("detrend" !in colunasMeta) db.execSQL("ALTER TABLE metadados_sessao ADD COLUMN detrend TEXT")
        if ("massa_total_g" !in colunasMeta) db.execSQL("ALTER TABLE metadados_sessao ADD COLUMN massa_total_g REAL")
    }

    // ─── Acesso genérico, espelhando executar/consultar/consultarUm ──────────

    fun executar(sql: String, vararg params: Any?) = writableDatabase.execSQL(sql, params.map { it }.toTypedArray())

    fun consultar(sql: String, vararg params: Any?): JSONArray =
        readableDatabase.rawQuery(sql, params.map { it?.toString() }.toTypedArray()).use { c ->
            JSONArray().apply { while (c.moveToNext()) put(c.paraJson()) }
        }

    fun consultarUm(sql: String, vararg params: Any?): JSONObject? =
        readableDatabase.rawQuery(sql, params.map { it?.toString() }.toTypedArray()).use { c ->
            if (c.moveToFirst()) c.paraJson() else null
        }

    /** Executa [bloco] em uma transação; usado na inserção em lote de leituras. */
    fun <T> transacao(bloco: (SQLiteDatabase) -> T): T {
        val db = writableDatabase
        db.beginTransaction()
        try {
            return bloco(db).also { db.setTransactionSuccessful() }
        } finally {
            db.endTransaction()
        }
    }

    // PRAGMA journal_mode "pode modificar o banco": o Android o recusa na conexão de leitura
    /** Caminho absoluto do arquivo do banco (para o backup em pendrive). */
    fun caminhoArquivo(): String = context.getDatabasePath(nome).absolutePath

    /** Consolida o WAL no .db para o backup ficar consistente. */
    fun checkpoint() {
        try {
            writableDatabase.rawQuery("PRAGMA wal_checkpoint(TRUNCATE)", null).use { it.moveToFirst() }
        } catch (e: Exception) {
            android.util.Log.w("BancoDados", "checkpoint falhou: ${e.message}")
        }
    }

    fun modoJournal(): String =
        writableDatabase.rawQuery("PRAGMA journal_mode", null).use { c -> if (c.moveToFirst()) c.getString(0) else "?" }

    /** Linha atual → objeto com tipos preservados (inteiro, real, texto, null), como o better-sqlite3. */
    private fun Cursor.paraJson(): JSONObject = JSONObject().also { o ->
        for (i in 0 until columnCount) {
            val nome = getColumnName(i)
            when (getType(i)) {
                Cursor.FIELD_TYPE_NULL -> o.put(nome, JSONObject.NULL)
                Cursor.FIELD_TYPE_INTEGER -> o.put(nome, getLong(i))
                Cursor.FIELD_TYPE_FLOAT -> o.put(nome, getDouble(i))
                else -> o.put(nome, getString(i))
            }
        }
    }

    companion object {
        /**
         * Divide o esquema em comandos pelo ';'. Comentários `--` são removidos
         * antes da divisão: um ';' dentro de um comentário geraria um trecho vazio
         * (execSQL falha com "not an error") e o resto do comentário viraria SQL.
         */
        fun dividirEsquema(sql: String): List<String> =
            sql.lines()
                .map { it.substringBefore("--") }
                .joinToString("\n")
                .split(';')
                .map { it.trim() }
                .filter { it.isNotEmpty() }

        val COLUNAS_RESUMO = listOf(
            "total_leituras" to "INTEGER", "forca_media_queima_n" to "REAL", "impulso_queima_ns" to "REAL",
            "config_pipeline" to "TEXT", "config_esp" to "TEXT",
        )

        const val NOME_PADRAO = "balanca.db"
        const val ARQUIVO_ESQUEMA = "esquema.sql"
        private const val VERSAO = 1
    }
}

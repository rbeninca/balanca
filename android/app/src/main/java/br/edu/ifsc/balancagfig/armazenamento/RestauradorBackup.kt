package br.edu.ifsc.balancagfig.armazenamento

import android.database.sqlite.SQLiteDatabase
import android.util.Log
import java.io.File

/** Como restaurar um backup .db sobre o banco atual. */
enum class ModoRestauracao { MESCLAR, SUBSTITUIR }

/**
 * Decisão pura da restauração — separada do SQLite para ser testável em JVM.
 * MESCLAR: insere só as sessões do backup ausentes no banco (por id).
 * SUBSTITUIR: limpa o banco e insere todas as do backup.
 */
object PlanoRestauracao {
    data class Plano(val limparTudo: Boolean, val idsAInserir: List<String>)

    fun calcular(idsBackup: List<String>, idsBanco: Set<String>, modo: ModoRestauracao): Plano = when (modo) {
        ModoRestauracao.SUBSTITUIR -> Plano(limparTudo = true, idsAInserir = idsBackup)
        ModoRestauracao.MESCLAR -> Plano(limparTudo = false, idsAInserir = idsBackup.filter { it !in idsBanco })
    }
}

/**
 * Restaura sessões de um arquivo balanca-*.db (copiado do pendrive) para o
 * banco atual, conforme [ModoRestauracao].
 */
class RestauradorBackup(private val bd: BancoDados) {

    data class Resultado(val inseridas: Int, val substituiu: Boolean)

    fun restaurar(arquivoBackup: File, modo: ModoRestauracao): Resultado {
        val backup = SQLiteDatabase.openDatabase(arquivoBackup.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
        try {
            val idsBackup = mutableListOf<String>()
            backup.rawQuery("SELECT id FROM sessoes", null).use { c ->
                while (c.moveToNext()) idsBackup += c.getString(0)
            }
            val idsBanco = mutableSetOf<String>()
            bd.consultar("SELECT id FROM sessoes").let { arr ->
                for (i in 0 until arr.length()) idsBanco += arr.getJSONObject(i).getString("id")
            }

            val plano = PlanoRestauracao.calcular(idsBackup, idsBanco, modo)
            if (plano.limparTudo) bd.executar("DELETE FROM sessoes")   // cascade apaga leituras/metadados

            for (id in plano.idsAInserir) copiarSessao(backup, id)
            return Resultado(plano.idsAInserir.size, plano.limparTudo)
        } finally {
            backup.close()
        }
    }

    /** Copia uma sessão (linha + leituras + metadados) do backup para o banco atual. */
    private fun copiarSessao(backup: SQLiteDatabase, id: String) {
        bd.transacao { db ->
            copiarLinhas(backup, db, "SELECT * FROM sessoes WHERE id = ?", id, "sessoes")
            copiarLinhas(backup, db, "SELECT * FROM leituras WHERE id_sessao = ?", id, "leituras", pularColuna = "id")
            copiarLinhas(backup, db, "SELECT * FROM metadados_sessao WHERE id_sessao = ?", id, "metadados_sessao")
        }
    }

    /** Lê linhas do [backup] e as insere na [tabela] do banco atual, coluna a coluna. */
    private fun copiarLinhas(
        backup: SQLiteDatabase, destino: SQLiteDatabase, sql: String, id: String,
        tabela: String, pularColuna: String? = null,
    ) {
        backup.rawQuery(sql, arrayOf(id)).use { c ->
            val colunas = c.columnNames.filter { it != pularColuna }   // leituras.id é AUTOINCREMENT
            val marcadores = colunas.joinToString(",") { "?" }
            val insert = "INSERT INTO $tabela (${colunas.joinToString(",")}) VALUES ($marcadores)"
            while (c.moveToNext()) {
                val valores = colunas.map { col ->
                    val idx = c.getColumnIndex(col)
                    when (c.getType(idx)) {
                        android.database.Cursor.FIELD_TYPE_NULL -> null
                        android.database.Cursor.FIELD_TYPE_INTEGER -> c.getLong(idx)
                        android.database.Cursor.FIELD_TYPE_FLOAT -> c.getDouble(idx)
                        else -> c.getString(idx)
                    }
                }
                destino.execSQL(insert, valores.toTypedArray())
            }
        }
    }

    private companion object { const val TAG = "RestauradorBackup" }
}

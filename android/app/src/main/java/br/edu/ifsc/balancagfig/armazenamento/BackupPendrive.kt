package br.edu.ifsc.balancagfig.armazenamento

import android.content.Context
import android.util.Log
import br.edu.ifsc.balancagfig.EstadoHost
import br.edu.ifsc.balancagfig.sistema.Pendrive
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Backup automático em pendrive USB. Quando um pendrive está presente, mantém
 * em <pendrive>/balancaGFIG/:
 *  - backups/balanca-<data-hora>.db  (cópia do banco, com checkpoint do WAL)
 *  - sessoes/<nome>_<id>.{csv,json,eng}  (cada teste salvo)
 *
 * Idempotente: não reexporta uma sessão cujo arquivo já existe. Roda numa
 * thread própria; nunca bloqueia a balança nem a API.
 */
class BackupPendrive(private val context: Context, private val bd: BancoDados) {

    private val executor = Executors.newSingleThreadExecutor { r -> Thread(r, "BackupPendrive") }
    private val carimbo = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US)
    private val maxBackupsDb = 10

    /** Sincroniza tudo (backup do banco + todas as sessões faltantes). Chamar ao detectar o pendrive. */
    fun sincronizarTudo() = executor.execute {
        val info = Pendrive.detectar()
        if (info == null) { EstadoHost.definirPendrive(null); return@execute }
        try {
            val base = Pendrive.prepararPasta(info)
            EstadoHost.registrar("Pendrive ${info.id} detectado — sincronizando…")
            backupBanco(base)
            var n = 0
            val sessoes = bd.consultar("SELECT * FROM sessoes ORDER BY criado_em")
            for (i in 0 until sessoes.length()) {
                if (exportarSessaoSeFalta(base, sessoes.getJSONObject(i))) n++
            }
            EstadoHost.definirPendrive(EstadoHost.Pendrive(info.id, info.livreBytes, contarSessoes(base)))
            EstadoHost.registrar("Pendrive: backup ok, $n nova(s) sessão(ões) exportada(s)")
        } catch (e: Exception) {
            Log.e(TAG, "sincronização falhou", e)
            EstadoHost.registrar("Pendrive: erro no backup — ${e.message}")
        }
    }

    /** Exporta uma sessão específica + atualiza o backup do banco. Chamar ao salvar uma sessão. */
    fun aoSalvarSessao(idSessao: String) = executor.execute {
        val info = Pendrive.detectar() ?: return@execute
        try {
            val base = Pendrive.prepararPasta(info)
            val sessao = bd.consultarUm("SELECT * FROM sessoes WHERE id = ?", idSessao) ?: return@execute
            val exportou = exportarSessaoSeFalta(base, sessao)
            backupBanco(base)
            if (exportou) {
                EstadoHost.definirPendrive(EstadoHost.Pendrive(info.id, info.livreBytes, contarSessoes(base)))
                EstadoHost.registrar("Pendrive: sessão \"${sessao.optString("nome")}\" salva")
            }
        } catch (e: Exception) {
            Log.e(TAG, "backup da sessão falhou", e)
        }
    }

    // ─── Interno ──────────────────────────────────────────────────────────────

    private fun exportarSessaoSeFalta(base: String, sessao: JSONObject): Boolean {
        val id = sessao.optString("id")
        val nomeArq = nomeArquivo(sessao.optString("nome").ifBlank { "sessao" }, id)
        val destCsv = "$base/sessoes/$nomeArq.csv"
        if (Pendrive.existe(destCsv)) return false   // já exportada

        val leituras = bd.consultar("SELECT * FROM leituras WHERE id_sessao = ? ORDER BY marca_temporal", id)
        if (leituras.length() == 0) return false
        val meta = bd.consultarUm("SELECT * FROM metadados_sessao WHERE id_sessao = ?", id)

        escrever(destCsv, Exportacao.csv(leituras))
        escrever("$base/sessoes/$nomeArq.json", Exportacao.json(sessao, meta, leituras))
        escrever("$base/sessoes/$nomeArq.eng", Exportacao.eng(sessao, meta, leituras))
        return true
    }

    private fun backupBanco(base: String) {
        bd.checkpoint()
        val destino = "$base/backups/balanca-${carimbo.format(Date())}.db"
        Pendrive.copiarBanco(bd.caminhoArquivo(), destino)
        rotacionar("$base/backups")
    }

    /** Mantém apenas os [maxBackupsDb] backups mais recentes. */
    private fun rotacionar(dirBackups: String) {
        val lista = br.edu.ifsc.balancagfig.sistema.Root
            .executarLendo("ls -1t '$dirBackups'/balanca-*.db 2>/dev/null") ?: return
        lista.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.drop(maxBackupsDb).forEach {
            br.edu.ifsc.balancagfig.sistema.Root.executar("rm -f '$it'")
        }
    }

    private fun contarSessoes(base: String): Int =
        br.edu.ifsc.balancagfig.sistema.Root
            .executarLendo("ls -1 '$base/sessoes'/*.csv 2>/dev/null | wc -l")?.trim()?.toIntOrNull() ?: 0

    private fun escrever(destino: String, conteudo: String) {
        val tmp = File(context.cacheDir, "exp-${System.nanoTime()}.tmp")
        tmp.writeText(conteudo)
        Pendrive.copiarPara(tmp, destino)
        tmp.delete()
    }

    /** Nome de arquivo seguro para FAT: <nome-sanitizado>_<id-curto>. */
    private fun nomeArquivo(nome: String, id: String): String {
        val limpo = nome.replace(Regex("[\\\\/:*?\"<>|]"), "_").replace(Regex("\\s+"), "_").take(60)
        val idCurto = id.replace("-", "").take(8)
        return "${limpo}_$idCurto"
    }

    private companion object { const val TAG = "BackupPendrive" }
}

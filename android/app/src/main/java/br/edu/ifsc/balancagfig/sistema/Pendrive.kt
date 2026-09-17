package br.edu.ifsc.balancagfig.sistema

import android.util.Log
import java.io.File

/**
 * Acesso ao pendrive USB montado no TVBox, via root.
 *
 * O Android monta pendrives em /mnt/media_rw/<ID> (grupo media_rw) e
 * /storage/<ID> (fuse). Um app comum não escreve nesses pontos sem SAF; com o
 * root que o app já tem, escrevemos direto em /mnt/media_rw/<ID>. Todo o
 * conteúdo do BalançaGFIG fica em <pendrive>/balancaGFIG/, sem tocar no resto.
 */
object Pendrive {
    private const val TAG = "Pendrive"
    private const val BASE = "/mnt/media_rw"
    const val PASTA = "balancaGFIG"

    data class Info(val id: String, val raiz: String, val livreBytes: Long, val totalBytes: Long)

    /** Um arquivo dentro de balancaGFIG (backup ou sessão exportada). */
    data class Arquivo(val nome: String, val tamanhoBytes: Long, val data: String, val pasta: String)

    /** Primeiro pendrive montado, ou null. */
    fun detectar(): Info? {
        val saida = Root.executarLendo("ls -1 $BASE 2>/dev/null") ?: return null
        val id = saida.lineSequence().map { it.trim() }.firstOrNull { it.isNotEmpty() } ?: return null
        val raiz = "$BASE/$id"
        // df imprime cabeçalho + dados; a linha de dados tem: [3]=Available [1]=1K-blocks (KB)
        val dados = Root.executarLendo("df -k '$raiz'")
            ?.lineSequence()?.map { it.trim() }
            ?.lastOrNull { it.isNotEmpty() && !it.startsWith("Filesystem") }
            ?.split(Regex("\\s+"))
        val livre = dados?.getOrNull(3)?.toLongOrNull()?.times(1024) ?: -1
        val total = dados?.getOrNull(1)?.toLongOrNull()?.times(1024) ?: -1
        return Info(id, raiz, livre, total)
    }

    /** Garante <pendrive>/balancaGFIG/backups e /sessoes. Devolve o caminho da pasta base. */
    fun prepararPasta(info: Info): String {
        val base = "${info.raiz}/$PASTA"
        Root.executar("mkdir -p '$base/backups' '$base/sessoes'")
        return base
    }

    /** Lista os arquivos de backups/ e sessoes/ (nome, tamanho, data). */
    fun listarArquivos(info: Info): List<Arquivo> {
        val base = "${info.raiz}/$PASTA"
        return listOf("backups", "sessoes").flatMap { pasta ->
            val saida = Root.executarLendo("ls -la '$base/$pasta' 2>/dev/null") ?: return@flatMap emptyList()
            saida.lineSequence().mapNotNull { linha ->
                // -rwxrwx--- 1 media_rw media_rw 40960 2026-09-17 04:39 nome
                if (!linha.startsWith("-")) return@mapNotNull null      // só arquivos regulares
                val campos = linha.trim().split(Regex("\\s+"), limit = 8)
                if (campos.size < 8) return@mapNotNull null
                val tamanho = campos[4].toLongOrNull() ?: 0
                val data = "${campos[5]} ${campos[6]}"
                Arquivo(campos[7], tamanho, data, pasta)
            }.toList()
        }.sortedByDescending { it.data }
    }

    /** Copia um arquivo do pendrive para um destino local (para restaurar). */
    fun copiarDoPendrive(info: Info, nomeRelativo: String, destinoLocal: File): Boolean =
        Root.executar("cp '${info.raiz}/$PASTA/$nomeRelativo' '${destinoLocal.absolutePath}' && chmod 644 '${destinoLocal.absolutePath}'")

    /** Copia um arquivo local para dentro do pendrive (via root). */
    fun copiarPara(origemLocal: File, destinoNoPendrive: String): Boolean =
        Root.executar("cp '${origemLocal.absolutePath}' '$destinoNoPendrive'")

    /** true se o arquivo já existe no pendrive (para não reexportar). */
    fun existe(caminhoNoPendrive: String): Boolean =
        Root.executar("test -e '$caminhoNoPendrive'")

    /** Copia o banco SQLite (já com checkpoint) para os backups do pendrive. */
    fun copiarBanco(caminhoDb: String, destino: String): Boolean {
        val ok = Root.executar("cp '$caminhoDb' '$destino'")
        if (!ok) Log.w(TAG, "falha ao copiar o banco para $destino")
        return ok
    }

    /** volId (ex.: public:8,1) do pendrive montado com o dado [uuid], via `sm list-volumes`. */
    fun volId(uuid: String): String? =
        Root.executarLendo("sm list-volumes 2>/dev/null")
            ?.lineSequence()
            ?.map { it.trim().split(Regex("\\s+")) }
            ?.firstOrNull { it.size >= 3 && it[1] == "mounted" && it[2] == uuid }
            ?.getOrNull(0)

    /** Ejeta o pendrive pelo sistema (sm unmount) para remoção segura. */
    fun ejetar(uuid: String): Boolean {
        val vol = volId(uuid) ?: return false
        Root.executar("sync")
        return Root.executar("sm unmount $vol")
    }
}

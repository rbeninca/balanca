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

    data class Info(val id: String, val raiz: String, val livreBytes: Long)

    /** Primeiro pendrive montado, ou null. */
    fun detectar(): Info? {
        val saida = Root.executarLendo("ls -1 $BASE 2>/dev/null") ?: return null
        val id = saida.lineSequence().map { it.trim() }.firstOrNull { it.isNotEmpty() } ?: return null
        val raiz = "$BASE/$id"
        // df imprime cabeçalho + dados; pega a última linha de dados (campo 4 = Available, em KB)
        val livre = Root.executarLendo("df -k '$raiz'")
            ?.lineSequence()?.map { it.trim() }
            ?.lastOrNull { it.isNotEmpty() && !it.startsWith("Filesystem") }
            ?.split(Regex("\\s+"))?.getOrNull(3)?.toLongOrNull()?.times(1024) ?: -1
        return Info(id, raiz, livre)
    }

    /** Garante <pendrive>/balancaGFIG/backups e /sessoes. Devolve o caminho da pasta base. */
    fun prepararPasta(info: Info): String {
        val base = "${info.raiz}/$PASTA"
        Root.executar("mkdir -p '$base/backups' '$base/sessoes'")
        return base
    }

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
}

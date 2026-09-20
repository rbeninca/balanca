package com.ifsc.laucherbox.dados

import com.ifsc.laucherbox.sistema.Root

/** Espaço de um ponto de montagem. */
data class Volume(
    val ponto: String,
    val tamanho: String,
    val usado: String,
    val livre: String,
    val percentual: String,
) {
    val critico: Boolean get() = percentual.removeSuffix("%").toIntOrNull()?.let { it >= 90 } == true
}

/**
 * Espaço em disco por ponto de montagem, lido por root com `df -h`.
 *
 * Mesmo comando do `listar_disco()` do android/scripts/box.sh. `tmpfs` fica de
 * fora: são mounts de memória, não armazenamento, e só poluiriam a tela.
 */
object Armazenamento {

    /** Só os que importam para quem está no local. */
    private val INTERESSANTES = setOf("/data", "/system", "/cache", "/storage", "/sdcard")

    fun listar(): List<Volume> {
        val saida = Root.executarLendo("df -h") ?: return emptyList()
        return saida.lineSequence()
            .drop(1) // cabeçalho
            .mapNotNull { interpretar(it) }
            .filter { v ->
                // pontos de montagem que interessam, mais volumes extras
                // (pendrive aparece como /storage/XXXX-XXXX)
                !v.ponto.startsWith("/mnt") &&
                    (v.ponto in INTERESSANTES ||
                        v.ponto.startsWith("/storage/") ||
                        v.ponto.startsWith("/media/"))
            }
            .toList()
    }

    private fun interpretar(linha: String): Volume? {
        // Filesystem  Size  Used  Avail  Use%  Mounted on
        // tmpfs        498M  444K  497M     1%  /dev
        val campos = linha.trim().split(Regex("""\s+"""))
        if (campos.size < 6) return null
        if (campos[0].startsWith("tmpfs") || campos[0].startsWith("devtmpfs")) return null
        return Volume(
            ponto = campos[5],
            tamanho = campos[1],
            usado = campos[2],
            livre = campos[3],
            percentual = campos[4],
        )
    }
}

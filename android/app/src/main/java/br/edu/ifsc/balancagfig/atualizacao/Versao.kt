package br.edu.ifsc.balancagfig.atualizacao

/** Versão semântica do app (tag `vX.Y.Z` do repositório / versionName do APK). */
data class Versao(val maior: Int, val menor: Int, val correcao: Int) : Comparable<Versao> {

    override fun compareTo(other: Versao): Int =
        compareValuesBy(this, other, { it.maior }, { it.menor }, { it.correcao })

    override fun toString() = "$maior.$menor.$correcao"

    companion object {
        private val PADRAO = Regex("""^v?(\d+)\.(\d+)(?:\.(\d+))?$""")

        /** Aceita "2.3.0", "v2.3.0" e "2.3" (correção 0); null para qualquer outra coisa. */
        fun analisar(texto: String?): Versao? {
            val m = PADRAO.matchEntire(texto?.trim() ?: return null) ?: return null
            return Versao(m.groupValues[1].toInt(), m.groupValues[2].toInt(), m.groupValues[3].ifEmpty { "0" }.toInt())
        }
    }
}

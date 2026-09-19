package br.edu.ifsc.balancagfig.atualizacao

/**
 * Cadeia de versões que o box vai percorrer: todas as releases mais novas que a
 * instalada, em ordem crescente. Instalar uma a uma garante que cada versão
 * rode as próprias migrações (banco, preferências) antes da seguinte.
 */
object PlanoAtualizacao {
    fun calcular(instalada: Versao, disponiveis: List<Release>): List<Release> =
        disponiveis
            .filter { it.versao > instalada }
            .distinctBy { it.versao }
            .sortedBy { it.versao }
}

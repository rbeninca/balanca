package br.edu.ifsc.balancagfig.atualizacao

/**
 * Qual versão o box vai instalar: **a mais nova**, num passo só.
 *
 * Antes isto devolvia a cadeia inteira, uma versão por vez, para que cada uma
 * rodasse as próprias migrações antes da seguinte. A precaução custava caro e
 * não protegia nada:
 *
 * - As migrações do banco são **idempotentes e cumulativas**: `BancoDados.migrar`
 *   confere `PRAGMA table_info` antes de cada `ALTER TABLE`, e o esquema inteiro
 *   é reaplicado a cada abertura do banco. Qualquer versão aplica todas — a mais
 *   nova inclusive, e é ela que fica.
 * - Nenhuma release entre a 2.7.4 e a 2.8.1 transforma dado guardado: as
 *   mudanças foram de formato de arquivo exportado e de tela.
 *
 * Conferido num MXQ real: saltar da 2.7.5 direto para a 2.8.1 deixou as 1709
 * leituras da sessão exatamente iguais, byte a byte.
 *
 * O preço da cadeia era concreto. Um box na 2.7.4 tinha **sete** degraus até a
 * 2.8.1, e seis desses APKs são da era do GeckoView, ~122 MB cada: cerca de
 * 750 MB de download e uns 40 minutos de TV parada passo a passo, que é
 * exatamente o que parece um travamento. Saltando direto, são os 16 MB da
 * última.
 *
 * O mecanismo de passos continua de pé porque [Atualizador] sabe retomar de onde
 * parou; hoje o plano é sempre de um passo.
 *
 * A escolha da versão não termina aqui: [calcular] devolve a mais nova das
 * candidatas, mas quem instala é [Atualizador], que baixa o manifest de cada
 * uma, da mais nova para a mais antiga, e só aceita a primeira marcada como
 * estável. Uma mais nova que não passe no portão não bloqueia a anterior.
 */
object PlanoAtualizacao {
    /**
     * As versões mais novas que a instalada, da mais nova para a mais antiga,
     * sem repetição. Não decide nada — é o conjunto onde [Atualizador] procura
     * a que vai instalar.
     */
    fun candidatas(instalada: Versao, disponiveis: List<Release>): List<Release> =
        disponiveis
            .filter { it.versao > instalada }
            .distinctBy { it.versao }
            .sortedByDescending { it.versao }

    fun calcular(instalada: Versao, disponiveis: List<Release>): List<Release> =
        candidatas(instalada, disponiveis)
            .firstOrNull()
            ?.let { listOf(it) }
            ?: emptyList()
}

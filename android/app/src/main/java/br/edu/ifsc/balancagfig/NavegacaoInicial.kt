package br.edu.ifsc.balancagfig

/** Abas do app. A Balança roda em tela cheia (quiosque na TV do box). */
enum class Aba(val titulo: String) { STATUS("Status"), BALANCA("Balança") }

/**
 * Regras de navegação automática entre as abas e do modo tela cheia. Isolado da
 * UI Compose para ser testável em JVM.
 */
object NavegacaoInicial {
    /** Atraso antes de abrir a Balança quando a célula de carga conecta. */
    const val ATRASO_ABRIR_BALANCA_MS = 5_000L

    /**
     * Deve trocar automaticamente para a aba da Balança?
     *
     * Só quando a célula está conectada, ainda não houve troca automática nesta
     * sessão e o usuário não escolheu uma aba manualmente — para não arrancar a
     * tela de quem está navegando de propósito.
     */
    fun deveAbrirBalanca(serial: EstadoSerial, jaAutoTrocou: Boolean, usuarioInteragiu: Boolean): Boolean =
        serial is EstadoSerial.Conectado && !jaAutoTrocou && !usuarioInteragiu

    /** A [aba] ocupa a tela toda (esconde a barra de abas e as barras do sistema)? */
    fun ehTelaCheia(aba: Aba): Boolean = aba == Aba.BALANCA

    /** Destino do botão "voltar"; null = comportamento padrão do sistema. */
    fun aoVoltar(aba: Aba): Aba? = if (aba == Aba.BALANCA) Aba.STATUS else null
}

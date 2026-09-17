package br.edu.ifsc.balancagfig

/**
 * Regras de navegação automática entre as abas. Isolado da UI Compose para ser
 * testável em JVM.
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
}

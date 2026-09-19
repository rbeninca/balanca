package br.edu.ifsc.balancagfig.processamento

/**
 * Etapa 2 do pipeline: um só suavizador ativo por vez — espelho de
 * pacotes/processamento/src/pipeline/filtroPrincipal.ts.
 */
enum class FiltroPrincipal(val valor: String) {
    NENHUM("nenhum"), MEDIA_MOVEL("mediaMovel"), EMA("ema"), BUTTERWORTH("butterworth"), SAVITZKY_GOLAY("savitzkyGolay"), KALMAN("kalman");

    companion object {
        fun deValor(v: String?): FiltroPrincipal? = entries.firstOrNull { it.valor == v }
    }
}

/** Flags antigas (uma por suavizador), como o frontend anterior manda. */
data class FlagsSuavizadores(
    val ativoMediaMovel: Boolean? = null,
    val ativoEMA: Boolean? = null,
    val ativoSG: Boolean? = null,
    val ativoKalman: Boolean? = null,
) {
    companion object {
        /** Flags equivalentes ao filtro escolhido (compat com mensagens antigas; Butterworth não tem flag). */
        fun de(tipo: FiltroPrincipal) = FlagsSuavizadores(
            ativoMediaMovel = tipo == FiltroPrincipal.MEDIA_MOVEL,
            ativoEMA = tipo == FiltroPrincipal.EMA,
            ativoSG = tipo == FiltroPrincipal.SAVITZKY_GOLAY,
            ativoKalman = tipo == FiltroPrincipal.KALMAN,
        )
    }
}

/**
 * Mesma regra do TS: `filtroPrincipal` explícito vence; senão, flag ligada
 * escolhe o filtro (a última na ordem MM → EMA → SG → Kalman vence) e flag
 * desligada só volta a NENHUM se for o filtro atual.
 */
fun resolverFiltroPrincipal(atual: FiltroPrincipal, explicito: FiltroPrincipal?, flags: FlagsSuavizadores): FiltroPrincipal {
    if (explicito != null) return explicito
    var escolhido = atual
    for ((tipo, flag) in listOf(
        FiltroPrincipal.MEDIA_MOVEL to flags.ativoMediaMovel,
        FiltroPrincipal.EMA to flags.ativoEMA,
        FiltroPrincipal.SAVITZKY_GOLAY to flags.ativoSG,
        FiltroPrincipal.KALMAN to flags.ativoKalman,
    )) {
        if (flag == true) escolhido = tipo
        else if (flag == false && escolhido == tipo) escolhido = FiltroPrincipal.NENHUM
    }
    return escolhido
}

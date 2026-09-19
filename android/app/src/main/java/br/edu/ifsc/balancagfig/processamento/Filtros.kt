package br.edu.ifsc.balancagfig.processamento

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos

// Portas diretas de pacotes/processamento/src/{calibracao,filtros,analise}.
// Aritmética em Double para reproduzir os números do gateway Node.

/** (forcaBruta − offset) × fator. */
class Calibrador(private var fator: Double, private var offset: Double) {
    fun aplicar(forcaBruta: Double): Double = (forcaBruta - offset) * fator
    fun atualizar(fator: Double, offset: Double) { this.fator = fator; this.offset = offset }
    fun obterFator(): Double = fator
    fun obterOffset(): Double = offset
}

/** Força com módulo ≤ limiar vira zero. */
class ZonaMorta(private val limiar: Double) {
    fun aplicar(forca: Double): Double = if (abs(forca) <= limiar) 0.0 else forca
}

/** Média das últimas [tamanho] amostras (janela parcial no aquecimento). */
class MediaMovel(private val tamanho: Int) {
    private val janela = ArrayDeque<Double>()

    fun aplicar(valor: Double): Double {
        janela.addLast(valor)
        if (janela.size > tamanho) janela.removeFirst()
        return janela.sum() / janela.size
    }

    fun reiniciar() = janela.clear()
}

/** EMA: y = α·x + (1−α)·y₋₁; primeira amostra passa direto. */
class MediaExponencial(private val alpha: Double) {
    private var ultimo: Double? = null

    fun aplicar(valor: Double): Double {
        val u = ultimo
        val novo = if (u == null) valor else alpha * valor + (1 - alpha) * u
        ultimo = novo
        return novo
    }

    fun reiniciar() { ultimo = null }
}

/** Mediana das últimas [janela] amostras (média dos dois centrais se par). */
class FiltroMediana(private val janela: Int) {
    private val buffer = ArrayDeque<Double>()

    fun aplicar(valor: Double): Double {
        buffer.addLast(valor)
        if (buffer.size > janela) buffer.removeFirst()
        val ordenado = buffer.sorted()
        val meio = ordenado.size / 2
        return if (ordenado.size % 2 == 1) ordenado[meio] else (ordenado[meio - 1] + ordenado[meio]) / 2
    }

    fun reiniciar() = buffer.clear()
}

/** Kalman escalar com ruído de processo [q] e de medição [r]. */
class FiltroKalman(private val q: Double, private val r: Double) {
    private var xHat: Double? = null
    private var p = r

    fun aplicar(medicao: Double): Double {
        val x = xHat
        if (x == null) {
            xHat = medicao
            p = r
            return medicao
        }
        p += q
        val k = p / (p + r)
        val novo = x + k * (medicao - x)
        p *= (1 - k)
        xHat = novo
        return novo
    }

    fun reiniciar() { xHat = null; p = r }
}

/** Savitzky-Golay (ajuste quadrático) com janela 5/7/9/11 — escolhe a mais próxima. */
class SavitzkyGolay(janela: Int) {
    private val buffer = ArrayDeque<Double>()
    private val coefs: DoubleArray
    private val norm: Double

    init {
        val suportado = COEFS.keys.reduce { prev, cur -> if (abs(cur - janela) < abs(prev - janela)) cur else prev }
        val (c, n) = COEFS.getValue(suportado)
        coefs = c
        norm = n
    }

    private val tamanhoJanela get() = coefs.size

    fun aplicar(valor: Double): Double {
        buffer.addLast(valor)
        if (buffer.size > tamanhoJanela) buffer.removeFirst()
        if (buffer.size < tamanhoJanela) return buffer.sum() / buffer.size
        var soma = 0.0
        for (i in 0 until tamanhoJanela) soma += coefs[i] * buffer[i]
        return soma / norm
    }

    fun reiniciar() = buffer.clear()

    private companion object {
        val COEFS: Map<Int, Pair<DoubleArray, Double>> = mapOf(
            5 to (doubleArrayOf(-3.0, 12.0, 17.0, 12.0, -3.0) to 35.0),
            7 to (doubleArrayOf(-2.0, 3.0, 6.0, 7.0, 6.0, 3.0, -2.0) to 21.0),
            9 to (doubleArrayOf(-21.0, 14.0, 39.0, 54.0, 59.0, 54.0, 39.0, 14.0, -21.0) to 231.0),
            11 to (doubleArrayOf(-36.0, 9.0, 44.0, 69.0, 84.0, 89.0, 84.0, 69.0, 44.0, 9.0, -36.0) to 429.0),
        )
    }
}

/** Notch IIR de 2ª ordem normalizado para ganho DC unitário. */
/**
 * Porta de FiltroButterworth.ts: passa-baixa Butterworth de 2ª ordem (biquad,
 * Q = 1/√2). Exige 0 < fc < Fs/2; `configurar` recalcula mantendo o estado.
 */
class FiltroButterworth(frequenciaCorteHz: Double, taxaAmostragemHz: Double) {
    private var b0 = 1.0; private var b1 = 0.0; private var b2 = 0.0; private var a1 = 0.0; private var a2 = 0.0
    private var x1 = 0.0; private var x2 = 0.0; private var y1 = 0.0; private var y2 = 0.0

    init { configurar(frequenciaCorteHz, taxaAmostragemHz) }

    fun configurar(frequenciaCorteHz: Double, taxaAmostragemHz: Double) {
        require(valido(frequenciaCorteHz, taxaAmostragemHz)) { "Butterworth: exige 0 < fc < Fs/2 (fc = $frequenciaCorteHz Hz, Fs = $taxaAmostragemHz Hz)" }
        val w0 = 2 * Math.PI * frequenciaCorteHz / taxaAmostragemHz
        val cosW0 = kotlin.math.cos(w0)
        val alpha = kotlin.math.sin(w0) / (2 * (1.0 / kotlin.math.sqrt(2.0)))
        val a0 = 1 + alpha
        b0 = ((1 - cosW0) / 2) / a0
        b1 = (1 - cosW0) / a0
        b2 = b0
        a1 = (-2 * cosW0) / a0
        a2 = (1 - alpha) / a0
    }

    fun aplicar(x: Double): Double {
        val y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2 = x1; x1 = x
        y2 = y1; y1 = y
        return y
    }

    fun reiniciar() { x1 = 0.0; x2 = 0.0; y1 = 0.0; y2 = 0.0 }

    companion object {
        fun valido(frequenciaCorteHz: Double, taxaAmostragemHz: Double) =
            frequenciaCorteHz > 0 && taxaAmostragemHz > 0 && frequenciaCorteHz < taxaAmostragemHz / 2
    }
}

/**
 * Porta de FiltroHampel.ts: Hampel causal — a amostra mais recente contra a
 * mediana robusta da janela; outlier se |x − m| > K·max(1,4826·MAD, piso).
 */
class FiltroHampel(private val janela: Int = 7, private val limiarSigma: Double = 3.0, private val pisoSigma: Double = 1e-3) {
    init { require(janela >= 3 && janela % 2 == 1) { "Hampel: janela deve ser ímpar ≥ 3 (recebeu $janela)" } }

    data class Resultado(val valor: Double, val outlier: Boolean)

    private val buffer = ArrayDeque<Double>()

    fun aplicarDetalhado(x: Double): Resultado {
        buffer.addLast(x)
        if (buffer.size > janela) buffer.removeFirst()
        if (buffer.size < 3) return Resultado(x, false)
        val m = mediana(buffer)
        val mad = mediana(buffer.map { kotlin.math.abs(it - m) })
        val sigma = maxOf(FATOR_MAD * mad, pisoSigma)
        return if (kotlin.math.abs(x - m) > limiarSigma * sigma) Resultado(m, true) else Resultado(x, false)
    }

    fun aplicar(x: Double): Double = aplicarDetalhado(x).valor

    fun reiniciar() = buffer.clear()

    private fun mediana(valores: Collection<Double>): Double {
        val ordenado = valores.sorted()
        val meio = ordenado.size / 2
        return if (ordenado.size % 2 == 1) ordenado[meio] else (ordenado[meio - 1] + ordenado[meio]) / 2
    }

    companion object { const val FATOR_MAD = 1.4826 }
}

class FiltroNotch(freqHz: Double, q: Double, taxaAmostragemHz: Double) {
    private val b0: Double
    private val b1: Double
    private val b2: Double
    private val a1: Double
    private val a2: Double
    private var x1 = 0.0
    private var x2 = 0.0
    private var y1 = 0.0
    private var y2 = 0.0

    init {
        val w0 = 2 * PI * freqHz / taxaAmostragemHz
        val r = 1 - (PI * (freqHz / taxaAmostragemHz)) / q
        a1 = -2 * r * cos(w0)
        a2 = r * r
        val b0u = 1.0
        val b1u = -2 * cos(w0)
        val b2u = 1.0
        val ganhoDC = (b0u + b1u + b2u) / (1 + a1 + a2)
        b0 = b0u / ganhoDC
        b1 = b1u / ganhoDC
        b2 = b2u / ganhoDC
    }

    fun aplicar(x: Double): Double {
        val y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2 = x1; x1 = x
        y2 = y1; y1 = y
        return y
    }

    fun reiniciar() { x1 = 0.0; x2 = 0.0; y1 = 0.0; y2 = 0.0 }
}

/** Máquina REPOUSO ⇄ EM_QUEIMA com histerese temporal no fim da queima. */
class DetectorQueima(private val limiar: Double, private val tempoMinFimMs: Long = 100) {
    private var emQueima = false
    private var tsBaixoMs: Long? = null

    fun atualizar(forca: Double, marcaTemporal: Long): Boolean {
        if (!emQueima) {
            if (forca > limiar) { emQueima = true; tsBaixoMs = null }
        } else if (forca <= limiar) {
            val t = tsBaixoMs
            if (t == null) tsBaixoMs = marcaTemporal
            else if (marcaTemporal - t >= tempoMinFimMs) { emQueima = false; tsBaixoMs = null }
        } else {
            tsBaixoMs = null
        }
        return emQueima
    }

    fun reiniciar() { emQueima = false; tsBaixoMs = null }
}

/** Integral trapezoidal de força no tempo (N·s). */
/** Porta de ZeroTracking.ts: compensa deriva lenta do zero só em repouso comprovado e sem bloqueio. */
class ZeroTracking(limiarN: Double, tempoEstavelMs: Long, alpha: Double, variacaoMaxN: Double? = null) {
    val limiarN = maxOf(0.0, limiarN)
    val tempoEstavelMs = maxOf(0, tempoEstavelMs)
    val alpha = alpha.coerceIn(0.0, 1.0)
    val variacaoMaxN = variacaoMaxN ?: (limiarN / 2)
    private var offset = 0.0
    private var estavelDesdeMs: Long? = null
    private var ultimoCorrigido: Double? = null

    fun aplicar(forca: Double, marcaTemporal: Long, bloqueado: Boolean = false): Double {
        val corrigida = forca - offset
        val variacao = ultimoCorrigido?.let { kotlin.math.abs(corrigida - it) } ?: 0.0
        ultimoCorrigido = corrigida
        val emRepouso = !bloqueado && kotlin.math.abs(corrigida) < limiarN && variacao <= variacaoMaxN
        if (!emRepouso) { estavelDesdeMs = null; return corrigida }
        val desde = estavelDesdeMs ?: marcaTemporal.also { estavelDesdeMs = it }
        if (marcaTemporal - desde >= tempoEstavelMs) offset += alpha * corrigida
        return corrigida
    }

    fun obterOffset(): Double = offset
    fun reiniciar() { offset = 0.0; estavelDesdeMs = null; ultimoCorrigido = null }
}

/** Limiares/tempos do detector de evento (espelho de ConfigDetectorEvento em DetectorEvento.ts). */
data class ConfigDetectorEvento(val limiarEntradaN: Double, val limiarSaidaN: Double, val tempoEntradaMs: Long, val tempoSaidaMs: Long)

/**
 * Porta de DetectorEvento.ts: início quando força > entrada por ≥ tempoEntrada,
 * fim quando força ≤ saída por ≥ tempoSaida; saída presa à entrada se maior.
 * Com saída = entrada e tempoEntrada = 0 reproduz o DetectorQueima.
 */
class DetectorEvento(config: ConfigDetectorEvento) {
    val config = ConfigDetectorEvento(
        limiarEntradaN = config.limiarEntradaN,
        limiarSaidaN = minOf(config.limiarSaidaN, config.limiarEntradaN),
        tempoEntradaMs = maxOf(0, config.tempoEntradaMs),
        tempoSaidaMs = maxOf(0, config.tempoSaidaMs),
    )
    private var emEvento = false
    private var tsAltoMs: Long? = null
    private var tsBaixoMs: Long? = null

    fun atualizar(forca: Double, marcaTemporal: Long): Boolean {
        val c = config
        if (!emEvento) {
            if (forca > c.limiarEntradaN) {
                val inicio = tsAltoMs ?: marcaTemporal.also { tsAltoMs = it }
                if (marcaTemporal - inicio >= c.tempoEntradaMs) { emEvento = true; tsAltoMs = null; tsBaixoMs = null }
            } else tsAltoMs = null
        } else {
            if (forca <= c.limiarSaidaN) {
                val inicio = tsBaixoMs
                if (inicio == null) tsBaixoMs = marcaTemporal
                else if (marcaTemporal - inicio >= c.tempoSaidaMs) { emEvento = false; tsBaixoMs = null }
            } else tsBaixoMs = null
        }
        return emEvento
    }

    fun reiniciar() { emEvento = false; tsAltoMs = null; tsBaixoMs = null }
}

class CalculadorImpulso {
    private var impulsoAcumulado = 0.0
    private var ultimaForca: Double? = null
    private var ultimoTs: Long? = null

    fun integrar(forca: Double, marcaTemporal: Long): Double {
        val f = ultimaForca
        val t = ultimoTs
        if (f != null && t != null) {
            val deltaT = (marcaTemporal - t) / 1000.0
            if (deltaT > 0) impulsoAcumulado += ((f + forca) / 2) * deltaT
        }
        ultimaForca = forca
        ultimoTs = marcaTemporal
        return impulsoAcumulado
    }

    fun reiniciar() { impulsoAcumulado = 0.0; ultimaForca = null; ultimoTs = null }
}

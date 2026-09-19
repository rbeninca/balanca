package br.edu.ifsc.balancagfig.processamento

import kotlin.math.abs

/**
 * Espelho de pacotes/processamento/src/analise/EstimadorTaxaAmostragem.ts:
 * Fs = (n−1)·1000 / (t_último − t_primeiro) numa janela de marcas de tempo
 * (média, imune ao Δt 12/13 ms das marcas inteiras da ESP), janela recomeça
 * em salto (Δt > fatorSalto × período, 8 ≈ 100 ms — acima dos gaps de 30–40 ms
 * que a ESP tem a cada 500 ms) ou Δt ≤ 0, valor estável com histerese de 1 %
 * avaliada só com a janela cheia (256 ≈ 3 s).
 */
class EstimadorTaxaAmostragem(
    private val tamanhoJanela: Int = 256,
    private val histerese: Double = 0.01,
    private val fatorSalto: Double = 8.0,
    private val minimoIntervalos: Int = 8,
) {
    private val marcas = ArrayDeque<Long>()
    private var estavel: Double? = null
    private var mudou = false

    fun adicionarTimestamp(ms: Long) {
        val ultimo = marcas.lastOrNull()
        if (ultimo != null) {
            val dt = ms - ultimo
            val periodo = periodoAtualMs()
            if (dt <= 0 || (periodo != null && dt > fatorSalto * periodo)) marcas.clear()
        }
        marcas.addLast(ms)
        if (marcas.size > tamanhoJanela) marcas.removeFirst()

        val hz = obterHz() ?: return
        val e = estavel
        // Primeiro valor assim que houver amostras; depois só com a janela cheia (média estável)
        val janelaCheia = marcas.size >= tamanhoJanela
        if (e == null || (janelaCheia && abs(hz - e) / e > histerese)) {
            estavel = hz
            mudou = true
        }
    }

    /** Estimativa instantânea (média na janela) ou null enquanto há poucas amostras. */
    fun obterHz(): Double? {
        val n = marcas.size
        if (n < minimoIntervalos + 1) return null
        val dur = marcas.last() - marcas.first()
        return if (dur > 0) (n - 1) * 1000.0 / dur else null
    }

    /** Valor com histerese: o que os filtros devem usar. */
    fun obterHzEstavel(): Double? = estavel

    /** true uma vez a cada mudança do valor estável (consome o aviso). */
    fun consumirMudanca(): Boolean { val m = mudou; mudou = false; return m }

    fun reiniciar() { marcas.clear(); estavel = null; mudou = false }

    private fun periodoAtualMs(): Double? {
        val hz = obterHz() ?: estavel ?: return null
        return 1000.0 / hz
    }
}

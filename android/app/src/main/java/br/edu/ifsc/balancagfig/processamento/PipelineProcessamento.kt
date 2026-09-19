package br.edu.ifsc.balancagfig.processamento

import br.edu.ifsc.balancagfig.protocolo.PacoteDados

/** Qual sinal alimenta o impulso (espelho de FonteImpulso em tipos.ts); FINAL = após a zona morta (padrão). */
enum class FonteImpulso(val valor: String) {
    BRUTO("bruto"), LIMPO("limpo"), FILTRADO("filtrado"), FINAL("final");
    companion object { fun deValor(v: String?): FonteImpulso? = entries.firstOrNull { it.valor == v } }
}

/** Parâmetros do pipeline (espelho de ConfiguracaoPipeline em processamento/src/tipos.ts). */
data class ConfiguracaoPipeline(
    var limiarZonaMortaN: Double = 0.5,   // força abaixo disso → zero
    var janelaMediaMovel: Int = 5,        // amostras para suavização
    var fatorCalibracao: Double = 1.0,    // multiplicador forcaBruta → Newtons
    var deslocamentoTara: Double = 0.0,   // offset de tara (raw ADC)
    var tempoMinFimMs: Long = 100,        // histerese de fim de queima (ms)

    // Filtros adicionais — opcionais, desativados por padrão (null = padrão interno)
    var janelaMediana: Int? = null,       // padrão 5
    var alphaEMA: Double? = null,         // padrão 0.2
    var freqNotchHz: Double? = null,      // padrão 60
    var qNotch: Double? = null,           // padrão 30
    var taxaAmostragemHz: Double? = null, // padrão 100
    var janelaSG: Int? = null,            // padrão 7
    var kalmanQ: Double? = null,          // padrão 0.01
    var kalmanR: Double? = null,          // padrão 1.0

    /** Etapa 2: um só suavizador (padrão NENHUM). Substitui as flags ativoMediaMovel/EMA/SG/Kalman. */
    var filtroPrincipal: FiltroPrincipal = FiltroPrincipal.NENHUM,

    // Detector de evento (Fase 7); null = padrão antigo (entrada = saída = zona morta, tempoEntrada 0, tempoSaida = tempoMinFimMs)
    var limiarEntradaN: Double? = null,
    var limiarSaidaN: Double? = null,
    var tempoEntradaMs: Long? = null,
    var tempoSaidaMs: Long? = null,

    // Etapa 3 — Zero tracking (Fase 8), desativado por padrão
    var zeroTrackingLimiarN: Double? = null,   // zona de repouso (N), padrão 0.05
    var zeroTrackingTempoMs: Long? = null,     // tempo em repouso antes de corrigir, padrão 3000
    var zeroTrackingAlpha: Double? = null,     // passo por amostra, padrão 0.01

    /** Etapa 3 → análise: sinal que alimenta o impulso acumulado (padrão FINAL). */
    var fonteCalculoImpulso: FonteImpulso = FonteImpulso.FINAL,

    // Etapa 2 — Butterworth passa-baixa (filtroPrincipal = BUTTERWORTH)
    var frequenciaCorteHz: Double? = null, // Hz, exige 0 < fc < Fs/2 (padrão 10)

    // Etapa 1 — Hampel (remoção de spikes), desativado por padrão
    var janelaHampel: Int? = null,        // amostras, ímpar (padrão 7)
    var limiarHampelSigma: Double? = null, // K em múltiplos de σ (padrão 3)
)

/** Alteração parcial vinda do frontend (mensagem PIPELINE_CONFIG); null = não alterar. */
data class PipelinePatch(
    val limiarZonaMortaN: Double? = null,
    val janelaMediaMovel: Int? = null,
    val fatorCalibracao: Double? = null,
    val deslocamentoTara: Double? = null,
    val tempoMinFimMs: Long? = null,
    val janelaMediana: Int? = null,
    val alphaEMA: Double? = null,
    val freqNotchHz: Double? = null,
    val qNotch: Double? = null,
    val taxaAmostragemHz: Double? = null,
    val janelaSG: Int? = null,
    val kalmanQ: Double? = null,
    val kalmanR: Double? = null,
    val limiarEntradaN: Double? = null,
    val limiarSaidaN: Double? = null,
    val tempoEntradaMs: Long? = null,
    val tempoSaidaMs: Long? = null,
    val fonteCalculoImpulso: FonteImpulso? = null,
    val frequenciaCorteHz: Double? = null,
    val janelaHampel: Int? = null,
    val limiarHampelSigma: Double? = null,
    val ativoHampel: Boolean? = null,
    val ativoZeroTracking: Boolean? = null,
    val zeroTrackingLimiarN: Double? = null,
    val zeroTrackingTempoMs: Long? = null,
    val zeroTrackingAlpha: Double? = null,
    val ativoZonaMorta: Boolean? = null,
    val ativoMediaMovel: Boolean? = null,
    val ativoDetectorQueima: Boolean? = null,
    val ativoMediana: Boolean? = null,
    val ativoEMA: Boolean? = null,
    val ativoNotch: Boolean? = null,
    val ativoSG: Boolean? = null,
    val ativoKalman: Boolean? = null,
    /** Vence as flags de suavizador quando presente (ver resolverFiltroPrincipal). */
    val filtroPrincipal: FiltroPrincipal? = null,
)

/** Configuração + flags de ativação (mensagem PIPELINE_ESTADO). */
data class EstadoPipeline(
    val config: ConfiguracaoPipeline,
    val filtroPrincipal: FiltroPrincipal,
    /** Fs medida pelas marcas de tempo (null até haver amostras); usada se taxaAmostragemHz não foi fixada. */
    val taxaEstimadaHz: Double?,
    /** false quando filtroPrincipal = BUTTERWORTH e fc ≥ Fs/2: o filtro é ignorado até corrigir. */
    val butterworthValido: Boolean,
    val fonteCalculoImpulso: FonteImpulso,
    /** Limiares/tempos efetivos do detector (após os padrões e a validação saída ≤ entrada). */
    val detector: ConfigDetectorEvento,
    val ativoHampel: Boolean,
    val ativoZeroTracking: Boolean,
    /** Offset atual do zero tracking (N), 0 quando desligado. */
    val zeroTrackingOffsetN: Double,
    val ativoZonaMorta: Boolean,
    val ativoMediaMovel: Boolean,
    val ativoDetectorQueima: Boolean,
    val ativoMediana: Boolean,
    val ativoEMA: Boolean,
    val ativoNotch: Boolean,
    val ativoSG: Boolean,
    val ativoKalman: Boolean,
)

/** Sinal em cada ponto do pipeline (uso interno; só filtrada e bruta saem na LeituraProcessada). */
data class SinaisPipeline(val bruta: Double, val limpa: Double, val suavizada: Double, val filtrada: Double)

/** Saída do pipeline por amostra (mensagem LEITURA). */
data class LeituraProcessada(
    val marcaTemporal: Long,
    val forcaNewton: Double,       // após calibração, zona morta e suavização
    val temperatura: Double,       // 0 — firmware não fornece
    val emQueima: Boolean,
    val impulsoAcumuladoNs: Double,
    val forcaNewtonCrua: Double,   // antes de qualquer filtro
    val forcaNewtonBruta: Double?, // presente só quando ≥ 1 filtro novo ativo (paridade com o TS)
)

/**
 * Porta de pacotes/processamento/src/pipeline/PipelineProcessamento.ts.
 * Thread-safe: leituras chegam da thread serial e PIPELINE_CONFIG das threads do WebSocket.
 */
class PipelineProcessamento(private val config: ConfiguracaoPipeline) {

    private var calibrador = Calibrador(config.fatorCalibracao, config.deslocamentoTara)
    private var zonaMorta = ZonaMorta(config.limiarZonaMortaN)
    private var mediaMovel = MediaMovel(config.janelaMediaMovel)
    private var mediana = FiltroMediana(config.janelaMediana ?: 5)
    private var ema = MediaExponencial(config.alphaEMA ?: 0.2)
    private val estimadorFs = EstimadorTaxaAmostragem()
    private var taxaMudou = false
    private var notch = FiltroNotch(config.freqNotchHz ?: 60.0, config.qNotch ?: 30.0, taxaParaFiltros())
    private var hampel = FiltroHampel(config.janelaHampel ?: 7, config.limiarHampelSigma ?: 3.0)
    /** null enquanto fc/Fs forem inválidos (o filtro passa direto). */
    private var butterworth: FiltroButterworth? = null
    private var zeroTracking = ZeroTracking(config.zeroTrackingLimiarN ?: 0.05, config.zeroTrackingTempoMs ?: 3000, config.zeroTrackingAlpha ?: 0.01)
    private var ativoZeroTracking = false
    /** Gravação em andamento (informada pelo serviço): bloqueia o zero tracking. */
    @Volatile private var gravando = false
    /** Estado do detector na amostra anterior: evento em curso bloqueia o zero tracking. */
    private var ultimoEmEvento = false
    private var offsetPublicadoN = 0.0

    init { reconstruirButterworth() }

    /** Gravação em andamento: o zero tracking não corrige (o zero de uma sessão não pode andar). */
    fun definirGravando(v: Boolean) { gravando = v }

    /** true quando o offset do zero tracking andou mais de [minimoN] desde a última publicação. */
    @Synchronized
    fun consumirMudancaOffset(minimoN: Double = 0.001): Boolean {
        val atual = zeroTracking.obterOffset()
        if (kotlin.math.abs(atual - offsetPublicadoN) < minimoN) return false
        offsetPublicadoN = atual
        return true
    }
    private var sg = SavitzkyGolay(config.janelaSG ?: 7)
    private var kalman = FiltroKalman(config.kalmanQ ?: 0.01, config.kalmanR ?: 1.0)
    private var detector = DetectorEvento(configDetector())
    private val calculador = CalculadorImpulso()

    private var ativoHampel = false
    private var ativoZonaMorta = false
    private var ativoDetectorQueima = false
    private var ativoMediana = false
    private var ativoNotch = false
    /** Etapa 2: só um suavizador (as flags antigas são derivadas dele). */
    private var filtroPrincipal = config.filtroPrincipal

    /** Três etapas, espelho do TS (ver PLANEJAMENTO-PROCESSAMENTO.MD): limpeza → filtro principal → tratamento. */
    private fun aplicarFiltros(entrada: Double, marcaTemporal: Long): SinaisPipeline {
        val limpa = aplicarLimpeza(entrada)
        val suavizada = aplicarFiltroPrincipal(limpa)
        val filtrada = aplicarTratamento(suavizada, marcaTemporal)
        return SinaisPipeline(bruta = entrada, limpa = limpa, suavizada = suavizada, filtrada = filtrada)
    }

    /** Limiares/tempos efetivos: os próprios quando definidos, senão os antigos (zona morta + tempo de fim). */
    private fun configDetector(): ConfigDetectorEvento {
        val entrada = config.limiarEntradaN ?: config.limiarZonaMortaN
        return ConfigDetectorEvento(
            limiarEntradaN = entrada,
            limiarSaidaN = minOf(config.limiarSaidaN ?: entrada, entrada),
            tempoEntradaMs = config.tempoEntradaMs ?: 0,
            tempoSaidaMs = config.tempoSaidaMs ?: config.tempoMinFimMs,
        )
    }

    private fun reconstruirDetector() { detector = DetectorEvento(configDetector()) }

    /** Sinal que alimenta o impulso, conforme fonteCalculoImpulso. */
    private fun sinalParaImpulso(s: SinaisPipeline): Double = when (config.fonteCalculoImpulso) {
        FonteImpulso.BRUTO -> s.bruta
        FonteImpulso.LIMPO -> s.limpa
        FonteImpulso.FILTRADO -> s.suavizada
        FonteImpulso.FINAL -> s.filtrada
    }

    /** Etapa 1 — limpeza (combináveis): Hampel → Mediana → Notch, spikes antes do IIR. */
    private fun aplicarLimpeza(entrada: Double): Double {
        var forca = entrada
        if (ativoHampel) forca = hampel.aplicar(forca)
        if (ativoMediana) forca = mediana.aplicar(forca)
        if (ativoNotch) forca = notch.aplicar(forca)
        return forca
    }

    /** Etapa 2 — filtro principal: exatamente um suavizador (ou nenhum). */
    private fun aplicarFiltroPrincipal(entrada: Double): Double = when (filtroPrincipal) {
        FiltroPrincipal.MEDIA_MOVEL -> mediaMovel.aplicar(entrada)
        FiltroPrincipal.EMA -> ema.aplicar(entrada)
        FiltroPrincipal.BUTTERWORTH -> butterworth?.aplicar(entrada) ?: entrada
        FiltroPrincipal.SAVITZKY_GOLAY -> sg.aplicar(entrada)
        FiltroPrincipal.KALMAN -> kalman.aplicar(entrada)
        FiltroPrincipal.NENHUM -> entrada
    }

    private fun reiniciarFiltroPrincipal() = when (filtroPrincipal) {
        FiltroPrincipal.MEDIA_MOVEL -> mediaMovel.reiniciar()
        FiltroPrincipal.EMA -> ema.reiniciar()
        FiltroPrincipal.BUTTERWORTH -> butterworth?.reiniciar() ?: Unit
        FiltroPrincipal.SAVITZKY_GOLAY -> sg.reiniciar()
        FiltroPrincipal.KALMAN -> kalman.reiniciar()
        FiltroPrincipal.NENHUM -> Unit
    }

    /** Etapa 3 — tratamento: zero tracking (bloqueado em evento/gravação) e depois zona morta. */
    private fun aplicarTratamento(entrada: Double, marcaTemporal: Long): Double {
        var forca = entrada
        if (ativoZeroTracking) forca = zeroTracking.aplicar(forca, marcaTemporal, ultimoEmEvento || gravando)
        if (ativoZonaMorta) forca = zonaMorta.aplicar(forca)
        return forca
    }

    @Synchronized
    /** Fs dos filtros dependentes de frequência: a fixada em taxaAmostragemHz, senão a estimada, senão 100 Hz. */
    private fun taxaParaFiltros(): Double = config.taxaAmostragemHz ?: estimadorFs.obterHzEstavel() ?: 100.0

    private fun reconstruirNotch() {
        notch = FiltroNotch(config.freqNotchHz ?: 60.0, config.qNotch ?: 30.0, taxaParaFiltros())
    }

    /** Coeficientes para a Fs atual; se fc ≥ Fs/2 o filtro fica desligado (passa direto) até corrigir. */
    private fun reconstruirButterworth() {
        val fc = config.frequenciaCorteHz ?: 10.0
        val fs = taxaParaFiltros()
        if (!FiltroButterworth.valido(fc, fs)) { butterworth = null; return }
        val atual = butterworth
        if (atual != null) atual.configurar(fc, fs) else butterworth = FiltroButterworth(fc, fs)
    }

    /** Alimenta o estimador; se a Fs estável mudou e não há taxa fixada, reconstrói os filtros IIR. */
    private fun acompanharTaxa(marcaTemporal: Long) {
        estimadorFs.adicionarTimestamp(marcaTemporal)
        if (estimadorFs.consumirMudanca() && config.taxaAmostragemHz == null) {
            reconstruirNotch()
            reconstruirButterworth()
            taxaMudou = true
        }
    }

    /** true uma vez a cada reconstrução por mudança de Fs (o serviço reenvia o PIPELINE_ESTADO). */
    @Synchronized
    fun consumirMudancaTaxa(): Boolean { val m = taxaMudou; taxaMudou = false; return m }

    fun processar(pacote: PacoteDados): LeituraProcessada {
        acompanharTaxa(pacote.marcaTemporal)
        // Float → Double exato, como o DataView.getFloat32 do gateway Node
        val sinais = aplicarFiltros(pacote.forcaNewtons.toDouble(), pacote.marcaTemporal)
        val filtrada = sinais.filtrada
        val bruta = sinais.bruta

        val emQueima = if (ativoDetectorQueima) detector.atualizar(filtrada, pacote.marcaTemporal) else false
        ultimoEmEvento = emQueima
        val impulso = calculador.integrar(sinalParaImpulso(sinais), pacote.marcaTemporal)
        val algumFiltroNovo = ativoHampel || ativoNotch || ativoMediana ||
            (filtroPrincipal != FiltroPrincipal.NENHUM && filtroPrincipal != FiltroPrincipal.MEDIA_MOVEL)

        return LeituraProcessada(
            marcaTemporal = pacote.marcaTemporal,
            forcaNewton = filtrada,
            temperatura = 0.0,
            emQueima = emQueima,
            impulsoAcumuladoNs = impulso,
            forcaNewtonCrua = bruta,
            forcaNewtonBruta = if (algumFiltroNovo) bruta else null,
        )
    }

    @Synchronized
    fun atualizarConfig(patch: PipelinePatch) {
        patch.limiarZonaMortaN?.let {
            config.limiarZonaMortaN = it
            zonaMorta = ZonaMorta(it)
        }
        patch.janelaMediaMovel?.let {
            config.janelaMediaMovel = it
            mediaMovel = MediaMovel(it)
        }
        patch.tempoMinFimMs?.let { config.tempoMinFimMs = it }
        patch.limiarEntradaN?.let { config.limiarEntradaN = it }
        patch.limiarSaidaN?.let { config.limiarSaidaN = it }
        patch.tempoEntradaMs?.let { config.tempoEntradaMs = it }
        patch.tempoSaidaMs?.let { config.tempoSaidaMs = it }
        if (patch.limiarZonaMortaN != null || patch.tempoMinFimMs != null || patch.limiarEntradaN != null ||
            patch.limiarSaidaN != null || patch.tempoEntradaMs != null || patch.tempoSaidaMs != null) {
            reconstruirDetector()   // como antes: mudar limiar/tempo recomeça o detector
        }
        patch.fatorCalibracao?.let {
            config.fatorCalibracao = it
            calibrador.atualizar(it, config.deslocamentoTara)
        }
        patch.deslocamentoTara?.let {
            config.deslocamentoTara = it
            calibrador.atualizar(config.fatorCalibracao, it)
        }
        patch.janelaMediana?.let {
            config.janelaMediana = it
            mediana = FiltroMediana(it)
        }
        patch.alphaEMA?.let {
            config.alphaEMA = it
            ema = MediaExponencial(it)
        }
        if (patch.freqNotchHz != null || patch.qNotch != null || patch.taxaAmostragemHz != null) {
            config.freqNotchHz = patch.freqNotchHz ?: config.freqNotchHz ?: 60.0
            config.qNotch = patch.qNotch ?: config.qNotch ?: 30.0
            // taxaAmostragemHz só fica fixada se vier no patch; sem ela, vale a estimada
            patch.taxaAmostragemHz?.let { config.taxaAmostragemHz = it }
            reconstruirNotch()
            reconstruirButterworth()
        }
        run {
            // O painel reenvia tudo a cada mudança: só recria (e zera o offset) se um parâmetro mudou de fato
            val antes = Triple(config.zeroTrackingLimiarN ?: 0.05, config.zeroTrackingTempoMs ?: 3000, config.zeroTrackingAlpha ?: 0.01)
            patch.zeroTrackingLimiarN?.let { config.zeroTrackingLimiarN = it }
            patch.zeroTrackingTempoMs?.let { config.zeroTrackingTempoMs = it }
            patch.zeroTrackingAlpha?.let { config.zeroTrackingAlpha = it }
            val depois = Triple(config.zeroTrackingLimiarN ?: 0.05, config.zeroTrackingTempoMs ?: 3000, config.zeroTrackingAlpha ?: 0.01)
            if (antes != depois) zeroTracking = ZeroTracking(depois.first, depois.second, depois.third)
        }
        patch.fonteCalculoImpulso?.let { config.fonteCalculoImpulso = it }
        patch.frequenciaCorteHz?.let {
            config.frequenciaCorteHz = it
            reconstruirButterworth()
        }
        if (patch.janelaHampel != null || patch.limiarHampelSigma != null) {
            config.janelaHampel = patch.janelaHampel ?: config.janelaHampel ?: 7
            config.limiarHampelSigma = patch.limiarHampelSigma ?: config.limiarHampelSigma ?: 3.0
            hampel = FiltroHampel(config.janelaHampel!!, config.limiarHampelSigma!!)
        }
        patch.janelaSG?.let {
            config.janelaSG = it
            sg = SavitzkyGolay(it)
        }
        if (patch.kalmanQ != null || patch.kalmanR != null) {
            config.kalmanQ = patch.kalmanQ ?: config.kalmanQ ?: 0.01
            config.kalmanR = patch.kalmanR ?: config.kalmanR ?: 1.0
            kalman = FiltroKalman(config.kalmanQ!!, config.kalmanR!!)
        }

        // Flags de ativação — ao ligar um filtro, começa com estado limpo
        patch.ativoHampel?.let { if (it && !ativoHampel) hampel.reiniciar(); ativoHampel = it }
        patch.ativoZeroTracking?.let { if (it != ativoZeroTracking) zeroTracking.reiniciar(); ativoZeroTracking = it }
        patch.ativoZonaMorta?.let { ativoZonaMorta = it }
        patch.ativoDetectorQueima?.let { if (it && !ativoDetectorQueima) detector.reiniciar(); ativoDetectorQueima = it }
        patch.ativoMediana?.let { if (it && !ativoMediana) mediana.reiniciar(); ativoMediana = it }
        patch.ativoNotch?.let { if (it && !ativoNotch) notch.reiniciar(); ativoNotch = it }

        // Etapa 2: `filtroPrincipal` explícito ou flags antigas → um só suavizador
        val novo = resolverFiltroPrincipal(
            filtroPrincipal, patch.filtroPrincipal,
            FlagsSuavizadores(patch.ativoMediaMovel, patch.ativoEMA, patch.ativoSG, patch.ativoKalman),
        )
        if (novo != filtroPrincipal) {
            filtroPrincipal = novo
            config.filtroPrincipal = novo
            reiniciarFiltroPrincipal()   // começa limpo, como as flags faziam ao ligar
        }
    }

    @Synchronized
    fun obterConfig(): EstadoPipeline {
        val flags = FlagsSuavizadores.de(filtroPrincipal)   // compat com clientes antigos
        return EstadoPipeline(
            config = config.copy(),
            filtroPrincipal = filtroPrincipal,
            taxaEstimadaHz = estimadorFs.obterHzEstavel(),
            butterworthValido = butterworth != null,
            fonteCalculoImpulso = config.fonteCalculoImpulso,
            detector = detector.config,
            ativoHampel = ativoHampel,
            ativoZeroTracking = ativoZeroTracking,
            zeroTrackingOffsetN = if (ativoZeroTracking) zeroTracking.obterOffset() else 0.0,
            ativoZonaMorta = ativoZonaMorta,
            ativoMediaMovel = flags.ativoMediaMovel!!,
            ativoDetectorQueima = ativoDetectorQueima,
            ativoMediana = ativoMediana,
            ativoEMA = flags.ativoEMA!!,
            ativoNotch = ativoNotch,
            ativoSG = flags.ativoSG!!,
            ativoKalman = flags.ativoKalman!!,
        )
    }

    @Synchronized
    fun atualizarCalibracao(fator: Double, offset: Double) = calibrador.atualizar(fator, offset)

    @Synchronized
    fun obterFatorCalibracao(): Double = calibrador.obterFator()

    @Synchronized
    fun reiniciar() {
        mediaMovel.reiniciar()
        mediana.reiniciar()
        ema.reiniciar()
        notch.reiniciar()
        hampel.reiniciar()
        butterworth?.reiniciar()
        zeroTracking.reiniciar()
        ultimoEmEvento = false
        sg.reiniciar()
        kalman.reiniciar()
        detector.reiniciar()
        calculador.reiniciar()
        estimadorFs.reiniciar()
    }
}

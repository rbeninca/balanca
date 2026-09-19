package br.edu.ifsc.balancagfig.processamento

import br.edu.ifsc.balancagfig.protocolo.PacoteDados

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
    private var notch = FiltroNotch(config.freqNotchHz ?: 60.0, config.qNotch ?: 30.0, config.taxaAmostragemHz ?: 100.0)
    private var sg = SavitzkyGolay(config.janelaSG ?: 7)
    private var kalman = FiltroKalman(config.kalmanQ ?: 0.01, config.kalmanR ?: 1.0)
    private var detector = DetectorQueima(config.limiarZonaMortaN, config.tempoMinFimMs)
    private val calculador = CalculadorImpulso()

    private var ativoZonaMorta = false
    private var ativoDetectorQueima = false
    private var ativoMediana = false
    private var ativoNotch = false
    /** Etapa 2: só um suavizador (as flags antigas são derivadas dele). */
    private var filtroPrincipal = config.filtroPrincipal

    /**
     * Três etapas, espelho do TS (ver PLANEJAMENTO-PROCESSAMENTO.MD): limpeza →
     * filtro principal → tratamento. Ordem numérica igual à de sempre; a zona
     * morta ainda roda entre a limpeza e o principal (legado, migra na Fase 6).
     */
    private fun aplicarFiltros(entrada: Double): SinaisPipeline {
        val limpa = aplicarLimpeza(entrada)
        val zonada = if (ativoZonaMorta) zonaMorta.aplicar(limpa) else limpa   // legado (Fase 6)
        val suavizada = aplicarFiltroPrincipal(zonada)
        val filtrada = aplicarTratamento(suavizada)
        return SinaisPipeline(bruta = entrada, limpa = limpa, suavizada = suavizada, filtrada = filtrada)
    }

    /** Etapa 1 — limpeza (combináveis). */
    private fun aplicarLimpeza(entrada: Double): Double {
        var forca = entrada
        if (ativoNotch) forca = notch.aplicar(forca)
        if (ativoMediana) forca = mediana.aplicar(forca)
        return forca
    }

    /** Etapa 2 — filtro principal: exatamente um suavizador (ou nenhum). */
    private fun aplicarFiltroPrincipal(entrada: Double): Double = when (filtroPrincipal) {
        FiltroPrincipal.MEDIA_MOVEL -> mediaMovel.aplicar(entrada)
        FiltroPrincipal.EMA -> ema.aplicar(entrada)
        FiltroPrincipal.SAVITZKY_GOLAY -> sg.aplicar(entrada)
        FiltroPrincipal.KALMAN -> kalman.aplicar(entrada)
        FiltroPrincipal.NENHUM -> entrada
    }

    private fun reiniciarFiltroPrincipal() = when (filtroPrincipal) {
        FiltroPrincipal.MEDIA_MOVEL -> mediaMovel.reiniciar()
        FiltroPrincipal.EMA -> ema.reiniciar()
        FiltroPrincipal.SAVITZKY_GOLAY -> sg.reiniciar()
        FiltroPrincipal.KALMAN -> kalman.reiniciar()
        FiltroPrincipal.NENHUM -> Unit
    }

    /** Etapa 3 — tratamento: vazia até a Fase 6. */
    private fun aplicarTratamento(entrada: Double): Double = entrada

    @Synchronized
    fun processar(pacote: PacoteDados): LeituraProcessada {
        // Float → Double exato, como o DataView.getFloat32 do gateway Node
        val sinais = aplicarFiltros(pacote.forcaNewtons.toDouble())
        val filtrada = sinais.filtrada
        val bruta = sinais.bruta

        val emQueima = if (ativoDetectorQueima) detector.atualizar(filtrada, pacote.marcaTemporal) else false
        val impulso = calculador.integrar(filtrada, pacote.marcaTemporal)
        val algumFiltroNovo = ativoNotch || ativoMediana ||
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
            detector = DetectorQueima(it, config.tempoMinFimMs)
        }
        patch.janelaMediaMovel?.let {
            config.janelaMediaMovel = it
            mediaMovel = MediaMovel(it)
        }
        patch.tempoMinFimMs?.let {
            config.tempoMinFimMs = it
            detector = DetectorQueima(config.limiarZonaMortaN, it)
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
            config.taxaAmostragemHz = patch.taxaAmostragemHz ?: config.taxaAmostragemHz ?: 100.0
            notch = FiltroNotch(config.freqNotchHz!!, config.qNotch!!, config.taxaAmostragemHz!!)
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
        sg.reiniciar()
        kalman.reiniciar()
        detector.reiniciar()
        calculador.reiniciar()
    }
}

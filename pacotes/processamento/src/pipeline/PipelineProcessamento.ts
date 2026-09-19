import type { PacoteDados } from '@balancagfig/protocolo';
import { FONTES_IMPULSO, type ConfiguracaoPipeline, type FonteImpulso, type LeituraProcessada } from '../tipos.js';
import { Calibrador }        from '../calibracao/Calibrador.js';
import { ZonaMorta }         from '../filtros/ZonaMorta.js';
import { MediaMovel }        from '../filtros/MediaMovel.js';
import { MediaExponencial }  from '../filtros/MediaExponencial.js';
import { FiltroMediana }     from '../filtros/FiltroMediana.js';
import { FiltroKalman }      from '../filtros/FiltroKalman.js';
import { SavitzkyGolay }     from '../filtros/SavitzkyGolay.js';
import { FiltroNotch }       from '../filtros/FiltroNotch.js';
import { FiltroHampel }      from '../filtros/FiltroHampel.js';
import { FiltroButterworth } from '../filtros/FiltroButterworth.js';
import { ZeroTracking }      from '../filtros/ZeroTracking.js';
import { DetectorEvento, type ConfigDetectorEvento } from '../analise/DetectorEvento.js';
import { CalculadorImpulso } from '../analise/CalculadorImpulso.js';
import { EstimadorTaxaAmostragem } from '../analise/EstimadorTaxaAmostragem.js';
import { resolverFiltroPrincipal, flagsDoFiltroPrincipal, type TipoFiltroPrincipal } from './filtroPrincipal.js';

// Reexportado aqui porque o vitest do pacote aplicacao resolve '@balancagfig/processamento' neste arquivo
export { resolverFiltroPrincipal, flagsDoFiltroPrincipal, ehFiltroPrincipal, FILTROS_PRINCIPAIS, type TipoFiltroPrincipal } from './filtroPrincipal.js';
export { FONTES_IMPULSO, type FonteImpulso } from '../tipos.js';

/** `filtroPrincipal` vence; as flags ativoMediaMovel/EMA/SG/Kalman seguem aceitas (ver resolverFiltroPrincipal). */
export type PipelinePatch = Partial<ConfiguracaoPipeline> & {
  ativoHampel?:         boolean;
  ativoZeroTracking?:   boolean;
  ativoZonaMorta?:      boolean;
  ativoMediaMovel?:     boolean;
  ativoDetectorQueima?: boolean;
  ativoMediana?:        boolean;
  ativoEMA?:            boolean;
  ativoNotch?:          boolean;
  ativoSG?:             boolean;
  ativoKalman?:         boolean;
};

/** Sinal em cada ponto do pipeline (uso interno; só `filtrada` e `bruta` saem na LeituraProcessada). */
export interface SinaisPipeline {
  bruta:     number;   // como veio da ESP
  limpa:     number;   // após a etapa 1 (limpeza)
  suavizada: number;   // após a etapa 2 (filtro principal)
  filtrada:  number;   // após a etapa 3 (tratamento) — o que o usuário vê
}

export type EstadoPipeline = ConfiguracaoPipeline & {
  filtroPrincipal:     TipoFiltroPrincipal;
  /** Fs medida pelas marcas de tempo (null até haver amostras); os filtros usam-na se taxaAmostragemHz não foi fixada. */
  taxaEstimadaHz:      number | null;
  /** false quando filtroPrincipal = 'butterworth' e fc ≥ Fs/2: o filtro é ignorado até corrigir. */
  butterworthValido:   boolean;
  fonteCalculoImpulso: FonteImpulso;
  /** Limiares/tempos efetivos do detector de evento (após os padrões e a validação saída ≤ entrada). */
  detector:            ConfigDetectorEvento;
  ativoHampel:         boolean;
  ativoZeroTracking:   boolean;
  /** Offset atual do zero tracking (N), 0 quando desligado. */
  zeroTrackingOffsetN: number;
  ativoZonaMorta:      boolean;
  ativoMediaMovel:     boolean;
  ativoDetectorQueima: boolean;
  ativoMediana:        boolean;
  ativoEMA:            boolean;
  ativoNotch:          boolean;
  ativoSG:             boolean;
  ativoKalman:         boolean;
};

export class PipelineProcessamento {
  private calibrador:  Calibrador;
  private zonaMorta:   ZonaMorta;
  private mediaMovel:  MediaMovel;
  private mediana:     FiltroMediana;
  private ema:         MediaExponencial;
  private notch:       FiltroNotch;
  private hampel:      FiltroHampel;
  /** null enquanto fc/Fs forem inválidos (o filtro passa direto). */
  private butterworth: FiltroButterworth | null = null;
  private zeroTracking: ZeroTracking;
  private ativoZeroTracking = false;
  /** Gravação em andamento (informada pelo serviço/tela): bloqueia o zero tracking. */
  private gravando = false;
  /** Estado do detector na amostra anterior: evento em curso bloqueia o zero tracking. */
  private ultimoEmEvento = false;
  private offsetPublicadoN = 0;
  private sg:          SavitzkyGolay;
  private kalman:      FiltroKalman;
  private detector:    DetectorEvento;
  private calculador:  CalculadorImpulso;
  private estimadorFs = new EstimadorTaxaAmostragem();

  private ativoHampel         = false;
  private ativoZonaMorta      = false;
  private ativoDetectorQueima = false;
  private ativoMediana        = false;
  private ativoNotch          = false;
  /** Etapa 2: só um suavizador (as flags antigas são derivadas dele). */
  private filtroPrincipal: TipoFiltroPrincipal = 'nenhum';

  constructor(private config: ConfiguracaoPipeline) {
    this.filtroPrincipal = config.filtroPrincipal ?? 'nenhum';
    this.calibrador = new Calibrador(config.fatorCalibracao, config.deslocamentoTara);
    this.zonaMorta  = new ZonaMorta(config.limiarZonaMortaN);
    this.mediaMovel = new MediaMovel(config.janelaMediaMovel);
    this.mediana    = new FiltroMediana(config.janelaMediana ?? 5);
    this.ema        = new MediaExponencial(config.alphaEMA ?? 0.2);
    this.notch      = new FiltroNotch(config.freqNotchHz ?? 60, config.qNotch ?? 30, this.taxaParaFiltros());
    this.hampel     = new FiltroHampel(config.janelaHampel ?? 7, config.limiarHampelSigma ?? 3);
    this.reconstruirButterworth();
    this.sg         = new SavitzkyGolay(config.janelaSG ?? 7);
    this.kalman     = new FiltroKalman(config.kalmanQ ?? 0.01, config.kalmanR ?? 1.0);
    this.detector   = new DetectorEvento(this.configDetector());
    this.calculador = new CalculadorImpulso();
    this.zeroTracking = new ZeroTracking(this.configZeroTracking());
  }

  private configZeroTracking() {
    return {
      limiarN:        this.config.zeroTrackingLimiarN ?? 0.05,
      tempoEstavelMs: this.config.zeroTrackingTempoMs ?? 3000,
      alpha:          this.config.zeroTrackingAlpha ?? 0.01,
    };
  }

  /** Gravação em andamento: o zero tracking não corrige (o zero de uma sessão não pode andar). */
  definirGravando(v: boolean): void { this.gravando = v; }

  /** true quando o offset do zero tracking andou mais de [minimoN] desde a última publicação. */
  consumirMudancaOffset(minimoN = 0.001): boolean {
    const atual = this.zeroTracking.obterOffset();
    if (Math.abs(atual - this.offsetPublicadoN) < minimoN) return false;
    this.offsetPublicadoN = atual;
    return true;
  }

  /** Três etapas (ver PLANEJAMENTO-PROCESSAMENTO.MD): limpeza → filtro principal → tratamento. */
  private aplicarFiltros(forca: number, marcaTemporal: number): SinaisPipeline {
    const bruta = forca;
    const limpa = this.aplicarLimpeza(bruta);
    const suavizada = this.aplicarFiltroPrincipal(limpa);
    const filtrada = this.aplicarTratamento(suavizada, marcaTemporal);
    return { bruta, limpa, suavizada, filtrada };
  }

  /**
   * Etapa 1 — limpeza: remove interferências antes de suavizar (combináveis).
   * Ordem Hampel → Mediana → Notch: spikes saem antes do IIR (um spike no
   * Notch "toca o sino" por várias amostras).
   */
  private aplicarLimpeza(forca: number): number {
    if (this.ativoHampel)  forca = this.hampel.aplicar(forca);
    if (this.ativoMediana) forca = this.mediana.aplicar(forca);
    if (this.ativoNotch)   forca = this.notch.aplicar(forca);
    return forca;
  }

  /** Etapa 2 — filtro principal: exatamente um suavizador (ou nenhum). */
  private aplicarFiltroPrincipal(forca: number): number {
    switch (this.filtroPrincipal) {
      case 'mediaMovel':    return this.mediaMovel.aplicar(forca);
      case 'ema':           return this.ema.aplicar(forca);
      case 'butterworth':   return this.butterworth ? this.butterworth.aplicar(forca) : forca;
      case 'savitzkyGolay': return this.sg.aplicar(forca);
      case 'kalman':        return this.kalman.aplicar(forca);
      default:              return forca;
    }
  }

  private get algumFiltroNovo(): boolean {
    return this.ativoHampel || this.ativoNotch || this.ativoMediana || (this.filtroPrincipal !== 'nenhum' && this.filtroPrincipal !== 'mediaMovel');
  }

  /**
   * Etapa 3 — tratamento: correções que não são filtros de ruído. Zona morta
   * (desde a Fase 6 roda sobre o sinal já suavizado: sem tremor perto de
   * zero); zero tracking entra na Fase 8.
   */
  private aplicarTratamento(forca: number, marcaTemporal: number): number {
    // Zero tracking antes da zona morta (sobre zeros ele não teria o que corrigir);
    // bloqueado em evento e em gravação.
    if (this.ativoZeroTracking) forca = this.zeroTracking.aplicar(forca, marcaTemporal, this.ultimoEmEvento || this.gravando);
    if (this.ativoZonaMorta) forca = this.zonaMorta.aplicar(forca);
    return forca;
  }

  /**
   * Limiares/tempos efetivos do detector: os próprios quando definidos, senão
   * os antigos (limiar = zona morta, só tempo de fim) — compatível com
   * configurações anteriores à Fase 7.
   */
  private configDetector(): ConfigDetectorEvento {
    const c = this.config;
    const entrada = c.limiarEntradaN ?? c.limiarZonaMortaN;
    return {
      limiarEntradaN: entrada,
      limiarSaidaN:   Math.min(c.limiarSaidaN ?? entrada, entrada),
      tempoEntradaMs: c.tempoEntradaMs ?? 0,
      tempoSaidaMs:   c.tempoSaidaMs ?? c.tempoMinFimMs,
    };
  }

  private reconstruirDetector(): void {
    this.detector = new DetectorEvento(this.configDetector());
  }

  /** Sinal que alimenta o impulso, conforme `fonteCalculoImpulso`. */
  private sinalParaImpulso(s: SinaisPipeline): number {
    switch (this.config.fonteCalculoImpulso ?? 'final') {
      case 'bruto':    return s.bruta;
      case 'limpo':    return s.limpa;
      case 'filtrado': return s.suavizada;
      default:         return s.filtrada;
    }
  }

  /**
   * Fs que os filtros dependentes de frequência (Notch; Butterworth na Fase 5)
   * usam: a fixada em `taxaAmostragemHz`, senão a estimada, senão 100 Hz.
   */
  private taxaParaFiltros(): number {
    return this.config.taxaAmostragemHz ?? this.estimadorFs.obterHzEstavel() ?? 100;
  }

  /** Alimenta o estimador; se a Fs estável mudou e não há taxa fixada, reconstrói os filtros IIR. */
  private acompanharTaxa(marcaTemporal: number): void {
    this.estimadorFs.adicionarTimestamp(marcaTemporal);
    if (this.estimadorFs.consumirMudanca() && this.config.taxaAmostragemHz == null) {
      this.reconstruirNotch();
      this.reconstruirButterworth();
      this.taxaMudou = true;
    }
  }

  private taxaMudou = false;

  /** true uma vez a cada reconstrução por mudança de Fs (o gateway reenvia o PIPELINE_ESTADO). */
  consumirMudancaTaxa(): boolean { const m = this.taxaMudou; this.taxaMudou = false; return m; }

  private reconstruirNotch(): void {
    this.notch = new FiltroNotch(this.config.freqNotchHz ?? 60, this.config.qNotch ?? 30, this.taxaParaFiltros());
  }

  /** Coeficientes para a Fs atual; se fc ≥ Fs/2 o filtro fica desligado (passa direto) até corrigir. */
  private reconstruirButterworth(): void {
    const fc = this.config.frequenciaCorteHz ?? 10;
    const fs = this.taxaParaFiltros();
    if (!FiltroButterworth.valido(fc, fs)) { this.butterworth = null; return; }
    if (this.butterworth) this.butterworth.configurar(fc, fs);   // mantém o estado: sem salto na saída
    else this.butterworth = new FiltroButterworth(fc, fs);
  }

  processar(pacote: PacoteDados): LeituraProcessada {
    this.acompanharTaxa(pacote.marcaTemporal);
    const sinais = this.aplicarFiltros(pacote.forcaNewtons, pacote.marcaTemporal);
    const { filtrada, bruta } = sinais;

    const emQueima           = this.ativoDetectorQueima
      ? this.detector.atualizar(filtrada, pacote.marcaTemporal)
      : false;
    this.ultimoEmEvento = emQueima;
    const impulsoAcumuladoNs = this.calculador.integrar(this.sinalParaImpulso(sinais), pacote.marcaTemporal);

    const algumFiltroNovo = this.algumFiltroNovo;

    return {
      marcaTemporal:     pacote.marcaTemporal,
      forcaNewton:       filtrada,
      temperatura:       0,
      emQueima,
      impulsoAcumuladoNs,
      forcaNewtonCrua:   bruta,
      ...(algumFiltroNovo && { forcaNewtonBruta: bruta }),
    };
  }

  processarLeitura(l: LeituraProcessada): LeituraProcessada {
    this.acompanharTaxa(l.marcaTemporal);
    const sinais = this.aplicarFiltros(l.forcaNewton, l.marcaTemporal);
    const { filtrada, bruta } = sinais;

    const emQueima           = this.ativoDetectorQueima
      ? this.detector.atualizar(filtrada, l.marcaTemporal)
      : l.emQueima;
    this.ultimoEmEvento = emQueima;
    const impulsoAcumuladoNs = this.calculador.integrar(this.sinalParaImpulso(sinais), l.marcaTemporal);

    const algumFiltroNovo = this.algumFiltroNovo;

    return {
      ...l,
      forcaNewton:       filtrada,
      emQueima,
      impulsoAcumuladoNs,
      ...(algumFiltroNovo && { forcaNewtonBruta: bruta }),
    };
  }

  atualizarConfig(patch: PipelinePatch): void {
    if (patch.limiarZonaMortaN != null) {
      this.config.limiarZonaMortaN = patch.limiarZonaMortaN;
      this.zonaMorta = new ZonaMorta(patch.limiarZonaMortaN);
    }
    if (patch.janelaMediaMovel != null) {
      this.config.janelaMediaMovel = patch.janelaMediaMovel;
      this.mediaMovel = new MediaMovel(patch.janelaMediaMovel);
    }
    if (patch.tempoMinFimMs != null) this.config.tempoMinFimMs = patch.tempoMinFimMs;
    if (patch.limiarEntradaN != null) this.config.limiarEntradaN = patch.limiarEntradaN;
    if (patch.limiarSaidaN != null)   this.config.limiarSaidaN   = patch.limiarSaidaN;
    if (patch.tempoEntradaMs != null) this.config.tempoEntradaMs = patch.tempoEntradaMs;
    if (patch.tempoSaidaMs != null)   this.config.tempoSaidaMs   = patch.tempoSaidaMs;
    if (patch.limiarZonaMortaN != null || patch.tempoMinFimMs != null || patch.limiarEntradaN != null ||
        patch.limiarSaidaN != null || patch.tempoEntradaMs != null || patch.tempoSaidaMs != null) {
      this.reconstruirDetector();   // como antes: mudar limiar/tempo recomeça o detector
    }
    if (patch.fatorCalibracao != null) {
      this.config.fatorCalibracao = patch.fatorCalibracao;
      this.calibrador.atualizar(patch.fatorCalibracao, this.config.deslocamentoTara);
    }
    if (patch.deslocamentoTara != null) {
      this.config.deslocamentoTara = patch.deslocamentoTara;
      this.calibrador.atualizar(this.config.fatorCalibracao, patch.deslocamentoTara);
    }
    if (patch.janelaMediana != null) {
      this.config.janelaMediana = patch.janelaMediana;
      this.mediana = new FiltroMediana(patch.janelaMediana);
    }
    if (patch.alphaEMA != null) {
      this.config.alphaEMA = patch.alphaEMA;
      this.ema = new MediaExponencial(patch.alphaEMA);
    }
    if (patch.freqNotchHz != null || patch.qNotch != null || patch.taxaAmostragemHz != null) {
      this.config.freqNotchHz = patch.freqNotchHz ?? this.config.freqNotchHz ?? 60;
      this.config.qNotch      = patch.qNotch      ?? this.config.qNotch      ?? 30;
      // taxaAmostragemHz só fica fixada se vier no patch; sem ela, vale a estimada
      if (patch.taxaAmostragemHz != null) this.config.taxaAmostragemHz = patch.taxaAmostragemHz;
      this.reconstruirNotch();
      this.reconstruirButterworth();
    }
    {
      // O painel reenvia tudo a cada mudança: só recria (e zera o offset) se um parâmetro mudou de fato
      const antes = this.configZeroTracking();
      if (patch.zeroTrackingLimiarN != null) this.config.zeroTrackingLimiarN = patch.zeroTrackingLimiarN;
      if (patch.zeroTrackingTempoMs != null) this.config.zeroTrackingTempoMs = patch.zeroTrackingTempoMs;
      if (patch.zeroTrackingAlpha != null)   this.config.zeroTrackingAlpha   = patch.zeroTrackingAlpha;
      const depois = this.configZeroTracking();
      if (antes.limiarN !== depois.limiarN || antes.tempoEstavelMs !== depois.tempoEstavelMs || antes.alpha !== depois.alpha) {
        this.zeroTracking = new ZeroTracking(depois);
      }
    }
    if (patch.fonteCalculoImpulso != null && (FONTES_IMPULSO as readonly string[]).includes(patch.fonteCalculoImpulso)) {
      this.config.fonteCalculoImpulso = patch.fonteCalculoImpulso;
    }
    if (patch.frequenciaCorteHz != null) {
      this.config.frequenciaCorteHz = patch.frequenciaCorteHz;
      this.reconstruirButterworth();
    }
    if (patch.janelaHampel != null || patch.limiarHampelSigma != null) {
      this.config.janelaHampel      = patch.janelaHampel      ?? this.config.janelaHampel      ?? 7;
      this.config.limiarHampelSigma = patch.limiarHampelSigma ?? this.config.limiarHampelSigma ?? 3;
      this.hampel = new FiltroHampel(this.config.janelaHampel, this.config.limiarHampelSigma);
    }
    if (patch.janelaSG != null) {
      this.config.janelaSG = patch.janelaSG;
      this.sg = new SavitzkyGolay(patch.janelaSG);
    }
    if (patch.kalmanQ != null || patch.kalmanR != null) {
      this.config.kalmanQ = patch.kalmanQ ?? this.config.kalmanQ ?? 0.01;
      this.config.kalmanR = patch.kalmanR ?? this.config.kalmanR ?? 1.0;
      this.kalman = new FiltroKalman(this.config.kalmanQ, this.config.kalmanR);
    }

    // Flags de ativação
    if (patch.ativoHampel != null) {
      if (patch.ativoHampel && !this.ativoHampel) this.hampel.reiniciar();
      this.ativoHampel = patch.ativoHampel;
    }
    if (patch.ativoZeroTracking != null) {
      if (patch.ativoZeroTracking !== this.ativoZeroTracking) this.zeroTracking.reiniciar();   // liga/desliga: offset zera
      this.ativoZeroTracking = patch.ativoZeroTracking;
    }
    if (patch.ativoZonaMorta != null)      this.ativoZonaMorta = patch.ativoZonaMorta;
    if (patch.ativoDetectorQueima != null) {
      if (patch.ativoDetectorQueima && !this.ativoDetectorQueima) this.detector.reiniciar();
      this.ativoDetectorQueima = patch.ativoDetectorQueima;
    }
    if (patch.ativoMediana != null) {
      if (patch.ativoMediana && !this.ativoMediana) this.mediana.reiniciar();
      this.ativoMediana = patch.ativoMediana;
    }
    if (patch.ativoNotch != null) {
      if (patch.ativoNotch && !this.ativoNotch) this.notch.reiniciar();
      this.ativoNotch = patch.ativoNotch;
    }

    // Etapa 2: `filtroPrincipal` explícito ou flags antigas → um só suavizador
    const novo = resolverFiltroPrincipal(this.filtroPrincipal, patch);
    if (novo !== this.filtroPrincipal) {
      this.filtroPrincipal = novo;
      this.config.filtroPrincipal = novo;
      this.reiniciarFiltroPrincipal();   // começa limpo, como as flags faziam ao ligar
    }
  }

  private reiniciarFiltroPrincipal(): void {
    switch (this.filtroPrincipal) {
      case 'mediaMovel':    this.mediaMovel.reiniciar(); break;
      case 'ema':           this.ema.reiniciar(); break;
      case 'butterworth':   this.butterworth?.reiniciar(); break;
      case 'savitzkyGolay': this.sg.reiniciar(); break;
      case 'kalman':        this.kalman.reiniciar(); break;
    }
  }

  obterConfig(): EstadoPipeline {
    return {
      ...this.config,
      filtroPrincipal:     this.filtroPrincipal,
      taxaEstimadaHz:      this.estimadorFs.obterHzEstavel(),
      butterworthValido:   this.butterworth !== null,
      fonteCalculoImpulso: this.config.fonteCalculoImpulso ?? 'final',
      detector:            this.detector.config,
      ativoHampel:         this.ativoHampel,
      ativoZeroTracking:   this.ativoZeroTracking,
      zeroTrackingOffsetN: this.ativoZeroTracking ? this.zeroTracking.obterOffset() : 0,
      ativoZonaMorta:      this.ativoZonaMorta,
      ativoDetectorQueima: this.ativoDetectorQueima,
      ativoMediana:        this.ativoMediana,
      ativoNotch:          this.ativoNotch,
      ...flagsDoFiltroPrincipal(this.filtroPrincipal),   // compat com clientes antigos
    };
  }

  atualizarCalibracao(fator: number, offset: number): void {
    this.calibrador.atualizar(fator, offset);
  }

  obterFatorCalibracao(): number {
    return this.calibrador.obterFator();
  }

  reiniciar(): void {
    this.mediaMovel.reiniciar();
    this.mediana.reiniciar();
    this.ema.reiniciar();
    this.notch.reiniciar();
    this.hampel.reiniciar();
    this.butterworth?.reiniciar();
    this.zeroTracking.reiniciar();
    this.ultimoEmEvento = false;
    this.sg.reiniciar();
    this.kalman.reiniciar();
    this.detector.reiniciar();
    this.calculador.reiniciar();
    this.estimadorFs.reiniciar();
  }
}

import type { PacoteDados } from '@balancagfig/protocolo';
import type { ConfiguracaoPipeline, LeituraProcessada } from '../tipos.js';
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
import { DetectorQueima }    from '../analise/DetectorQueima.js';
import { CalculadorImpulso } from '../analise/CalculadorImpulso.js';
import { EstimadorTaxaAmostragem } from '../analise/EstimadorTaxaAmostragem.js';
import { resolverFiltroPrincipal, flagsDoFiltroPrincipal, type TipoFiltroPrincipal } from './filtroPrincipal.js';

// Reexportado aqui porque o vitest do pacote aplicacao resolve '@balancagfig/processamento' neste arquivo
export { resolverFiltroPrincipal, flagsDoFiltroPrincipal, ehFiltroPrincipal, FILTROS_PRINCIPAIS, type TipoFiltroPrincipal } from './filtroPrincipal.js';

/** `filtroPrincipal` vence; as flags ativoMediaMovel/EMA/SG/Kalman seguem aceitas (ver resolverFiltroPrincipal). */
export type PipelinePatch = Partial<ConfiguracaoPipeline> & {
  ativoHampel?:         boolean;
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
  ativoHampel:         boolean;
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
  private sg:          SavitzkyGolay;
  private kalman:      FiltroKalman;
  private detector:    DetectorQueima;
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
    this.detector   = new DetectorQueima(config.limiarZonaMortaN, config.tempoMinFimMs);
    this.calculador = new CalculadorImpulso();
  }

  /**
   * Três etapas (ver PLANEJAMENTO-PROCESSAMENTO.MD): limpeza → filtro
   * principal → tratamento. A ordem numérica é a mesma de sempre; a zona
   * morta ainda roda entre a limpeza e o filtro principal (posição legada —
   * migra para o tratamento na Fase 6, com golden files regravados).
   */
  private aplicarFiltros(forca: number): SinaisPipeline {
    const bruta = forca;
    const limpa = this.aplicarLimpeza(bruta);
    const zonada = this.ativoZonaMorta ? this.zonaMorta.aplicar(limpa) : limpa;   // legado (Fase 6)
    const suavizada = this.aplicarFiltroPrincipal(zonada);
    const filtrada = this.aplicarTratamento(suavizada);
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

  /** Etapa 3 — tratamento (zona morta, zero tracking…): vazia até a Fase 6. */
  private aplicarTratamento(forca: number): number {
    return forca;
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
    const { filtrada, bruta } = this.aplicarFiltros(pacote.forcaNewtons);

    const emQueima           = this.ativoDetectorQueima
      ? this.detector.atualizar(filtrada, pacote.marcaTemporal)
      : false;
    const impulsoAcumuladoNs = this.calculador.integrar(filtrada, pacote.marcaTemporal);

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
    const { filtrada, bruta } = this.aplicarFiltros(l.forcaNewton);

    const emQueima           = this.ativoDetectorQueima
      ? this.detector.atualizar(filtrada, l.marcaTemporal)
      : l.emQueima;
    const impulsoAcumuladoNs = this.calculador.integrar(filtrada, l.marcaTemporal);

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
      this.detector  = new DetectorQueima(patch.limiarZonaMortaN, this.config.tempoMinFimMs);
    }
    if (patch.janelaMediaMovel != null) {
      this.config.janelaMediaMovel = patch.janelaMediaMovel;
      this.mediaMovel = new MediaMovel(patch.janelaMediaMovel);
    }
    if (patch.tempoMinFimMs != null) {
      this.config.tempoMinFimMs = patch.tempoMinFimMs;
      this.detector = new DetectorQueima(this.config.limiarZonaMortaN, patch.tempoMinFimMs);
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
      ativoHampel:         this.ativoHampel,
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
    this.sg.reiniciar();
    this.kalman.reiniciar();
    this.detector.reiniciar();
    this.calculador.reiniciar();
    this.estimadorFs.reiniciar();
  }
}

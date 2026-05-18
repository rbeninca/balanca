import { FiltroPassaAlta } from '../filtros/FiltroPassaAlta.js';
import { FiltroBandaPassante } from '../filtros/FiltroBandaPassante.js';
import { FiltroFIR } from '../filtros/FiltroFIR.js';
import { FiltroMediana } from '../filtros/FiltroMediana.js';
import { MediaMovel } from '../filtros/MediaMovel.js';
import { CanceladorRespiracao } from './CanceladorRespiracao.js';
import { PanTompkins } from './PanTompkins.js';
import { EstimadorBpmAutocorrelacao } from './EstimadorBpmAutocorrelacao.js';

export type QualidadeSinal = 'boa' | 'razoavel' | 'instavel' | 'sem-sinal';
export type TipoCamada1 = 'nenhum' | 'mediana' | 'mediaMovel';
export type TipoCamada2 = 'iir' | 'fir';
export type ModoPico = 'limiar' | 'panTompkins';
export type ModoBpm  = 'ibi' | 'autocorrelacao' | 'ambos';

export interface ResultadoBatimento {
  sinalBruto:    number;
  sinalFiltrado: number;
  bpm:           number | null;
  bpmAuto:       number | null;
  confiancaAuto: number;
  pico:          boolean;
  qualidade:     QualidadeSinal;
  ibiMs:         number | null;
}

export interface ConfigDetectorBatimento {
  // Camada 1 — pré-filtro
  tipoCamada1: TipoCamada1;
  janelaC1:    number;

  // Camada 2 — filtro de banda cardíaca
  tipoCamada2: TipoCamada2;
  fcAltaHz:    number;
  fcBaixaHz:   number;
  numTaps:     number;

  // Cancelador de respiração (NLMS)
  cancelarRespiracao: boolean;
  numPesosNlms:       number;
  muNlms:             number;

  // Detecção de picos
  modoPico:     ModoPico;
  amplitudeMin: number;
  fatorLimiar:  number;
  refratarioMs: number;
  janelaS:      number;

  // Estimativa de BPM
  modoBpm:    ModoBpm;
  janelaAutoS: number;
}

export const CONFIG_DETECTOR_PADRAO: ConfigDetectorBatimento = {
  tipoCamada1: 'nenhum',
  janelaC1:    5,
  tipoCamada2: 'fir',
  fcAltaHz:    0.5,
  fcBaixaHz:   5.0,
  numTaps:     63,

  cancelarRespiracao: false,
  numPesosNlms:       16,
  muNlms:             0.01,

  modoPico:     'limiar',
  amplitudeMin: 0.002,
  fatorLimiar:  0.4,
  refratarioMs: 300,
  janelaS:      3,

  modoBpm:     'ibi',
  janelaAutoS: 10,
};

const FC_DC_HZ      = 0.05;
const TIMEOUT_MS    = 2500;
const MAX_IBIS      = 8;
const IBI_MIN_MS    = 300;
const IBI_MAX_MS    = 2000;
const OUTLIER_FATOR = 0.30;
const CV_BOA        = 0.08;
const CV_RAZOAVEL   = 0.20;

export class DetectorBatimento {
  private cfg: ConfigDetectorBatimento;

  // Camada 1
  private c1Mediana: FiltroMediana;
  private c1Media:   MediaMovel;

  // Camada 2
  private c2IIR: FiltroBandaPassante;
  private c2FIR: FiltroFIR;

  // DC removal para traço bruto
  private hpDc: FiltroPassaAlta;

  // Cancelador de respiração
  private cancelador: CanceladorRespiracao;

  // Detectores de pico
  private panTompkins: PanTompkins;

  // Estimador por autocorrelação
  private estimadorAuto: EstimadorBpmAutocorrelacao;

  // Estado do detector por limiar
  private tamanhoJanela: number;
  private janelaAmostras: number[] = [];
  private ibis:           number[] = [];
  private ultimoPicoMs:   number | null = null;
  private acimaDaLimiar   = false;

  constructor(
    private readonly taxaHz: number = 80,
    cfg: Partial<ConfigDetectorBatimento> = {},
  ) {
    this.cfg = { ...CONFIG_DETECTOR_PADRAO, ...cfg };
    this.c1Mediana    = new FiltroMediana(this.cfg.janelaC1);
    this.c1Media      = new MediaMovel(this.cfg.janelaC1);
    this.c2IIR        = new FiltroBandaPassante(taxaHz, this.cfg.fcAltaHz, this.cfg.fcBaixaHz);
    this.c2FIR        = new FiltroFIR(taxaHz, this.cfg.fcAltaHz, this.cfg.fcBaixaHz, this.cfg.numTaps);
    this.hpDc         = new FiltroPassaAlta(taxaHz, FC_DC_HZ);
    this.cancelador   = new CanceladorRespiracao(taxaHz, this.cfg.numPesosNlms, this.cfg.muNlms);
    this.panTompkins  = new PanTompkins(taxaHz, this.cfg.refratarioMs);
    this.estimadorAuto = new EstimadorBpmAutocorrelacao(taxaHz, this.cfg.janelaAutoS);
    this.tamanhoJanela = Math.round(taxaHz * this.cfg.janelaS);
  }

  atualizarConfig(patch: Partial<ConfigDetectorBatimento>): void {
    const prev = this.cfg;
    this.cfg = { ...this.cfg, ...patch };

    const c1Mudou =
      patch.tipoCamada1 !== undefined ||
      (patch.janelaC1 !== undefined && patch.janelaC1 !== prev.janelaC1);

    const c2Mudou =
      patch.tipoCamada2 !== undefined ||
      (patch.fcAltaHz  !== undefined && patch.fcAltaHz  !== prev.fcAltaHz) ||
      (patch.fcBaixaHz !== undefined && patch.fcBaixaHz !== prev.fcBaixaHz) ||
      (patch.numTaps   !== undefined && patch.numTaps   !== prev.numTaps);

    const nlmsMudou =
      (patch.numPesosNlms !== undefined && patch.numPesosNlms !== prev.numPesosNlms) ||
      (patch.muNlms       !== undefined && patch.muNlms       !== prev.muNlms);

    const ptMudou =
      (patch.refratarioMs !== undefined && patch.refratarioMs !== prev.refratarioMs);

    const autoMudou =
      (patch.janelaAutoS !== undefined && patch.janelaAutoS !== prev.janelaAutoS);

    if (c1Mudou) {
      this.c1Mediana = new FiltroMediana(this.cfg.janelaC1);
      this.c1Media   = new MediaMovel(this.cfg.janelaC1);
      this.janelaAmostras = [];
    }
    if (c2Mudou) {
      this.c2IIR = new FiltroBandaPassante(this.taxaHz, this.cfg.fcAltaHz, this.cfg.fcBaixaHz);
      this.c2FIR = new FiltroFIR(this.taxaHz, this.cfg.fcAltaHz, this.cfg.fcBaixaHz, this.cfg.numTaps);
      this.janelaAmostras = [];
    }
    if (nlmsMudou) {
      this.cancelador = new CanceladorRespiracao(this.taxaHz, this.cfg.numPesosNlms, this.cfg.muNlms);
    }
    if (ptMudou) {
      this.panTompkins = new PanTompkins(this.taxaHz, this.cfg.refratarioMs);
    }
    if (autoMudou) {
      this.estimadorAuto = new EstimadorBpmAutocorrelacao(this.taxaHz, this.cfg.janelaAutoS);
    }
    if (patch.janelaS !== undefined) {
      this.tamanhoJanela = Math.round(this.taxaHz * this.cfg.janelaS);
    }
  }

  obterConfig(): Readonly<ConfigDetectorBatimento> { return this.cfg; }

  processar(forcaN: number, marcaTemporal: number): ResultadoBatimento {
    // Camada 1: pré-filtro
    let c1: number;
    switch (this.cfg.tipoCamada1) {
      case 'mediana':    c1 = this.c1Mediana.aplicar(forcaN); break;
      case 'mediaMovel': c1 = this.c1Media.aplicar(forcaN);   break;
      default:           c1 = forcaN;
    }

    // Cancelamento de respiração (NLMS)
    const c1Resp = this.cfg.cancelarRespiracao ? this.cancelador.aplicar(c1) : c1;

    // Traço bruto: entrada C1 com apenas remoção de DC
    const sinalBruto = this.hpDc.aplicar(c1);

    // Camada 2: filtro de banda cardíaca
    const sinalFiltrado = this.cfg.tipoCamada2 === 'fir'
      ? this.c2FIR.aplicar(c1Resp)
      : this.c2IIR.aplicar(c1Resp);

    // Estimador por autocorrelação (sempre alimentado)
    const { bpm: bpmAuto, confianca: confiancaAuto } =
      this.estimadorAuto.processar(sinalFiltrado);

    // Detecção de pico
    let pico: boolean;
    if (this.cfg.modoPico === 'panTompkins') {
      pico = this.panTompkins.processar(sinalFiltrado);
      if (pico) this.registrarPico(marcaTemporal);
    } else {
      pico = this.detectarPorLimiar(sinalFiltrado, marcaTemporal);
    }

    // BPM final conforme modo
    let bpmFinal: number | null;
    switch (this.cfg.modoBpm) {
      case 'autocorrelacao':
        bpmFinal = bpmAuto;
        break;
      case 'ambos':
        bpmFinal = this.calcularBpm() ?? bpmAuto;
        break;
      default:
        bpmFinal = this.calcularBpm();
    }

    return {
      sinalBruto,
      sinalFiltrado,
      bpm:      bpmFinal,
      bpmAuto,
      confiancaAuto,
      pico,
      qualidade: this.calcularQualidade(marcaTemporal),
      ibiMs:    this.ibis[this.ibis.length - 1] ?? null,
    };
  }

  private detectarPorLimiar(sinalFiltrado: number, marcaTemporal: number): boolean {
    this.janelaAmostras.push(sinalFiltrado);
    if (this.janelaAmostras.length > this.tamanhoJanela) {
      this.janelaAmostras.shift();
    }

    const max = Math.max(...this.janelaAmostras);
    const min = Math.min(...this.janelaAmostras);
    const amplitude = max - min;
    const limiar = amplitude > this.cfg.amplitudeMin
      ? min + this.cfg.fatorLimiar * amplitude
      : Infinity;

    let pico = false;
    const estaAcima = sinalFiltrado > limiar;

    if (!this.acimaDaLimiar && estaAcima) {
      this.acimaDaLimiar = true;
    } else if (this.acimaDaLimiar && !estaAcima) {
      this.acimaDaLimiar = false;
      const passouRefratario =
        this.ultimoPicoMs === null ||
        (marcaTemporal - this.ultimoPicoMs) >= this.cfg.refratarioMs;

      if (passouRefratario) {
        this.registrarPico(marcaTemporal);
        pico = true;
      }
    }
    return pico;
  }

  private registrarPico(marcaTemporal: number): void {
    if (this.ultimoPicoMs !== null) {
      const ibi = marcaTemporal - this.ultimoPicoMs;
      if (ibi >= IBI_MIN_MS && ibi <= IBI_MAX_MS) {
        this.ibis.push(ibi);
        if (this.ibis.length > MAX_IBIS) this.ibis.shift();
      }
    }
    this.ultimoPicoMs = marcaTemporal;
  }

  private calcularBpm(): number | null {
    if (this.ibis.length < 2) return null;
    const sorted  = [...this.ibis].sort((a, b) => a - b);
    const mediana = sorted[Math.floor(sorted.length / 2)] ?? null;
    if (mediana === null) return null;
    const validos = this.ibis.filter(
      ibi => Math.abs(ibi - mediana) / mediana < OUTLIER_FATOR,
    );
    if (validos.length < 2) return null;
    const media = validos.reduce((a, b) => a + b, 0) / validos.length;
    return Math.round(60000 / media);
  }

  private calcularQualidade(marcaTemporal: number): QualidadeSinal {
    if (
      this.ultimoPicoMs === null ||
      (marcaTemporal - this.ultimoPicoMs) > TIMEOUT_MS ||
      this.ibis.length < 3
    ) return 'sem-sinal';

    const media     = this.ibis.reduce((a, b) => a + b, 0) / this.ibis.length;
    const variancia = this.ibis.reduce((acc, v) => acc + (v - media) ** 2, 0) / this.ibis.length;
    const cv        = Math.sqrt(variancia) / media;

    if (cv < CV_BOA)      return 'boa';
    if (cv < CV_RAZOAVEL) return 'razoavel';
    return 'instavel';
  }

  reiniciar(): void {
    this.c1Mediana.reiniciar();
    this.c1Media.reiniciar();
    this.c2IIR.reiniciar();
    this.c2FIR.reiniciar();
    this.hpDc.reiniciar();
    this.cancelador.reiniciar();
    this.panTompkins.reiniciar();
    this.estimadorAuto.reiniciar();
    this.janelaAmostras = [];
    this.ibis           = [];
    this.ultimoPicoMs   = null;
    this.acimaDaLimiar  = false;
  }
}

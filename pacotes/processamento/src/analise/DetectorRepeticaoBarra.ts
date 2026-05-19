import type { EstadoMovimento } from './EstimadorMovimentoBarra.js';

export interface Repeticao {
  indice:            number;
  duracaoSubidaMs:   number;
  duracaoDescidaMs:  number;
  posicaoPicoM:      number;   // amplitude estimada
  trabalhoJ:         number;   // pesoRef × posicaoPico
  potenciaMediaW:    number;   // trabalho / duracaoSubida (s)
  potenciaPicoW:     number;   // max(pesoRef × v) durante subida
  velocidadePicoMs:  number;
  descidaRapida:     boolean;  // v_pico descida > limiarDescidaRapidaMs
}

const LIMIAR_DESCIDA_RAPIDA_MS = 0.8; // m/s

export class DetectorRepeticaoBarra {
  private _totalReps = 0;
  private fasePrev   = 'CALIBRANDO';

  // Acumuladores da repetição em andamento
  private tsInicioSubidaMs  = 0;
  private tsInicioDescidaMs = 0;
  private trabalhoSubidaJ   = 0;
  private potenciaPicoW     = 0;
  private velPicoSubidaMs   = 0;
  private velPicoDescidaMs  = 0;
  private posicaoPicoM      = 0;
  private xAnterior         = 0;

  processar(estado: EstadoMovimento, marcaTemporal: number, pesoRef: number): Repeticao | null {
    const { fase, posicaoM, velocidadeMs } = estado;
    let rep: Repeticao | null = null;

    // Transição → SUBINDO: inicia contadores
    if (fase === 'SUBINDO' && this.fasePrev !== 'SUBINDO') {
      this.tsInicioSubidaMs = marcaTemporal;
      this.trabalhoSubidaJ  = 0;
      this.potenciaPicoW    = 0;
      this.velPicoSubidaMs  = 0;
      this.posicaoPicoM     = 0;
    }

    // Acumula durante SUBINDO
    if (fase === 'SUBINDO') {
      const dx = posicaoM - this.xAnterior;
      if (dx > 0) this.trabalhoSubidaJ += pesoRef * dx;
      const pot = pesoRef * velocidadeMs;
      if (pot > this.potenciaPicoW) this.potenciaPicoW = pot;
      if (velocidadeMs > this.velPicoSubidaMs) this.velPicoSubidaMs = velocidadeMs;
      if (posicaoM > this.posicaoPicoM) this.posicaoPicoM = posicaoM;
    }

    // Transição → DESCENDO: inicia cronômetro de descida
    if (fase === 'DESCENDO' && this.fasePrev !== 'DESCENDO') {
      this.tsInicioDescidaMs = marcaTemporal;
      this.velPicoDescidaMs  = 0;
    }

    // Acumula durante DESCENDO
    if (fase === 'DESCENDO') {
      const v = Math.abs(velocidadeMs);
      if (v > this.velPicoDescidaMs) this.velPicoDescidaMs = v;
    }

    // Transição DESCENDO → PARADO = rep completa
    if (fase === 'PARADO' && this.fasePrev === 'DESCENDO' && this.posicaoPicoM > 0) {
      const durSubidaMs  = this.tsInicioDescidaMs - this.tsInicioSubidaMs;
      const durDescidaMs = marcaTemporal - this.tsInicioDescidaMs;
      const potMedia     = durSubidaMs > 0 ? this.trabalhoSubidaJ / (durSubidaMs / 1000) : 0;

      this._totalReps++;
      rep = {
        indice:           this._totalReps,
        duracaoSubidaMs:  Math.max(0, durSubidaMs),
        duracaoDescidaMs: Math.max(0, durDescidaMs),
        posicaoPicoM:     this.posicaoPicoM,
        trabalhoJ:        this.trabalhoSubidaJ,
        potenciaMediaW:   potMedia,
        potenciaPicoW:    this.potenciaPicoW,
        velocidadePicoMs: this.velPicoSubidaMs,
        descidaRapida:    this.velPicoDescidaMs > LIMIAR_DESCIDA_RAPIDA_MS,
      };
      this.posicaoPicoM = 0;
    }

    this.fasePrev  = fase;
    this.xAnterior = posicaoM;
    return rep;
  }

  reiniciar(): void {
    this._totalReps       = 0;
    this.fasePrev         = 'CALIBRANDO';
    this.trabalhoSubidaJ  = 0;
    this.potenciaPicoW    = 0;
    this.velPicoSubidaMs  = 0;
    this.velPicoDescidaMs = 0;
    this.posicaoPicoM     = 0;
    this.xAnterior        = 0;
  }

  get totalReps(): number { return this._totalReps; }
}

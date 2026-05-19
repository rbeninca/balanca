import type { EstadoMovimento } from './EstimadorMovimentoBarra.js';
import type { Repeticao } from './DetectorRepeticaoBarra.js';

export interface MetricasBarra {
  trabalhoTotalJ:    number;
  potenciaMediaW:    number;   // trabalho total / tempo total de subida
  potenciaPicoW:     number;   // maior pico entre todas as reps
  kcalMecanica:      number;   // trabalhoTotalJ / 4184
  kcalMetabolica:    number;   // kcalMecanica / 0.25
  tempoSobTensaoMs:  number;   // tempo com F > pesoRef
  repsTotal:         number;
}

const KCAL_POR_JOULE      = 1 / 4184;
const EFICIENCIA_METABOLICA = 0.25;

export class CalculadorMetricasBarra {
  private trabalhoTotalJ    = 0;
  private tempoSubidaTotalS = 0;
  private potenciaPicoW     = 0;
  private tempoSobTensaoMs  = 0;
  private repsTotal         = 0;
  private tsAnteriorMs: number | null = null;

  processar(estado: EstadoMovimento, marcaTemporal: number, rep: Repeticao | null, pesoRef: number): MetricasBarra {
    // Tempo sob tensão (F > pesoRef)
    if (this.tsAnteriorMs !== null && estado.forcaN > pesoRef) {
      this.tempoSobTensaoMs += marcaTemporal - this.tsAnteriorMs;
    }
    this.tsAnteriorMs = marcaTemporal;

    // Acumula rep concluída
    if (rep !== null) {
      this.trabalhoTotalJ    += rep.trabalhoJ;
      this.tempoSubidaTotalS += rep.duracaoSubidaMs / 1000;
      if (rep.potenciaPicoW > this.potenciaPicoW) this.potenciaPicoW = rep.potenciaPicoW;
      this.repsTotal++;
    }

    const potenciaMedia = this.tempoSubidaTotalS > 0
      ? this.trabalhoTotalJ / this.tempoSubidaTotalS
      : 0;
    const kcalMecanica   = this.trabalhoTotalJ * KCAL_POR_JOULE;
    const kcalMetabolica = kcalMecanica / EFICIENCIA_METABOLICA;

    return {
      trabalhoTotalJ:   this.trabalhoTotalJ,
      potenciaMediaW:   potenciaMedia,
      potenciaPicoW:    this.potenciaPicoW,
      kcalMecanica,
      kcalMetabolica,
      tempoSobTensaoMs: this.tempoSobTensaoMs,
      repsTotal:        this.repsTotal,
    };
  }

  reiniciar(): void {
    this.trabalhoTotalJ    = 0;
    this.tempoSubidaTotalS = 0;
    this.potenciaPicoW     = 0;
    this.tempoSobTensaoMs  = 0;
    this.repsTotal         = 0;
    this.tsAnteriorMs      = null;
  }
}

/**
 * Detector de evento (queima, impacto, repetição…) com histerese de força e
 * tempos de confirmação separados — Fase 7 do PLANEJAMENTO-PROCESSAMENTO.MD.
 * Generaliza o DetectorQueima (que tinha um limiar único acoplado à zona morta
 * e só tempo de fim).
 *
 *   início: força > limiarEntrada por ≥ tempoEntrada ms (0 = na primeira amostra)
 *   fim:    força ≤ limiarSaida  por ≥ tempoSaida ms
 *
 * Exige limiarSaida ≤ limiarEntrada (F_ON > F_OFF): a saída é presa à
 * entrada se vier maior. Com limiarSaida = limiarEntrada e tempoEntrada = 0
 * reproduz exatamente o DetectorQueima.
 */
export interface ConfigDetectorEvento {
  limiarEntradaN: number;
  limiarSaidaN:   number;
  tempoEntradaMs: number;
  tempoSaidaMs:   number;
}

export class DetectorEvento {
  private emEvento = false;
  private tsAltoMs: number | null = null;
  private tsBaixoMs: number | null = null;
  readonly config: ConfigDetectorEvento;

  constructor(config: ConfigDetectorEvento) {
    this.config = {
      limiarEntradaN: config.limiarEntradaN,
      limiarSaidaN:   Math.min(config.limiarSaidaN, config.limiarEntradaN),
      tempoEntradaMs: Math.max(0, config.tempoEntradaMs),
      tempoSaidaMs:   Math.max(0, config.tempoSaidaMs),
    };
  }

  atualizar(forca: number, marcaTemporal: number): boolean {
    const c = this.config;
    if (!this.emEvento) {
      if (forca > c.limiarEntradaN) {
        if (this.tsAltoMs === null) this.tsAltoMs = marcaTemporal;
        if (marcaTemporal - this.tsAltoMs >= c.tempoEntradaMs) {
          this.emEvento = true;
          this.tsAltoMs = null;
          this.tsBaixoMs = null;
        }
      } else {
        this.tsAltoMs = null;
      }
    } else {
      if (forca <= c.limiarSaidaN) {
        if (this.tsBaixoMs === null) this.tsBaixoMs = marcaTemporal;
        else if (marcaTemporal - this.tsBaixoMs >= c.tempoSaidaMs) {
          this.emEvento = false;
          this.tsBaixoMs = null;
        }
      } else {
        this.tsBaixoMs = null;
      }
    }
    return this.emEvento;
  }

  reiniciar(): void {
    this.emEvento = false;
    this.tsAltoMs = null;
    this.tsBaixoMs = null;
  }
}

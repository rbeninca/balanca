/**
 * Estima BPM via autocorrelação normalizada de um buffer deslizante.
 *
 * Busca o pico dominante no intervalo de lag correspondente a 30–200 BPM
 * (300 ms – 2000 ms). A confiança é a altura normalizada desse pico.
 */
export class EstimadorBpmAutocorrelacao {
  private readonly taxaHz: number;
  private readonly capacidade: number;
  private readonly lagMin: number;
  private readonly lagMax: number;
  private buffer: number[] = [];

  constructor(taxaHz: number, janelaS = 10) {
    this.taxaHz    = taxaHz;
    this.capacidade = Math.round(taxaHz * janelaS);
    // 300 ms → 200 BPM,  2000 ms → 30 BPM
    this.lagMin = Math.round(taxaHz * 0.300);
    this.lagMax = Math.round(taxaHz * 2.000);
  }

  /** Adiciona uma amostra e recalcula BPM. Retorna null enquanto o buffer está aquecendo. */
  processar(valor: number): { bpm: number | null; confianca: number } {
    this.buffer.push(valor);
    if (this.buffer.length > this.capacidade) this.buffer.shift();

    const N = this.buffer.length;
    if (N < this.lagMax + 1) return { bpm: null, confianca: 0 };

    const ac = autocorrelacao(this.buffer, this.lagMin, this.lagMax);
    if (ac.length === 0) return { bpm: null, confianca: 0 };

    // Encontra o primeiro pico local acima de 40% do máximo global.
    // Preferir o menor lag (maior BPM) evita ambiguidade harmônica (octave error).
    const maxAc = Math.max(...ac);
    if (maxAc <= 0) return { bpm: null, confianca: 0 };

    let melhorLag = this.lagMin;
    let melhorAc  = maxAc;

    for (let i = 1; i < ac.length - 1; i++) {
      const prev = ac[i - 1] ?? 0;
      const curr = ac[i] ?? 0;
      const next = ac[i + 1] ?? 0;
      if (curr > prev && curr > next && curr >= 0.4 * maxAc) {
        melhorLag = this.lagMin + i;
        melhorAc  = curr;
        break;
      }
    }

    // Autocorrelação em lag=0 (energia do sinal)
    const ac0 = autocorrelacao(this.buffer, 0, 0)[0] ?? 1;
    const confianca = ac0 > 1e-12 ? Math.max(0, Math.min(1, melhorAc / ac0)) : 0;

    if (confianca < 0.05) return { bpm: null, confianca };

    const periodoS = melhorLag / this.taxaHz;
    const bpm = Math.round(60 / periodoS);
    return { bpm, confianca };
  }

  reiniciar(): void {
    this.buffer = [];
  }
}

function autocorrelacao(sinal: number[], lagIni: number, lagFim: number): number[] {
  const N = sinal.length;
  const resultado: number[] = [];

  // Remove média para autocorrelação normalizada de Pearson
  let media = 0;
  for (let i = 0; i < N; i++) media += sinal[i] ?? 0;
  media /= N;

  for (let lag = lagIni; lag <= lagFim; lag++) {
    let soma = 0;
    const n = N - lag;
    for (let i = 0; i < n; i++) {
      soma += ((sinal[i] ?? 0) - media) * ((sinal[i + lag] ?? 0) - media);
    }
    resultado.push(soma / n);
  }
  return resultado;
}

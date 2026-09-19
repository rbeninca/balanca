/**
 * Estima a taxa de amostragem real a partir das marcas de tempo (Fase 3 do
 * PLANEJAMENTO-PROCESSAMENTO.MD). A ESP marca em ms inteiros — a 80 Hz o Δt
 * alterna 12 e 13 ms, então a mediana de Δt "salta" entre 76,9 e 83,3 Hz. A
 * média em janela `Fs = (n−1)·1000 / (t_último − t_primeiro)` não sofre disso.
 *
 * - Janela de `tamanhoJanela` marcas (padrão 128 ≈ 1,5 s a 80 Hz — a ESP tem
 *   jitter de polling e janelas menores oscilam ±1,5 %).
 * - Um salto (Δt > `fatorSalto` × período estimado, ou Δt ≤ 0) é uma pausa ou
 *   perda de pacotes: a janela recomeça, sem contaminar a estimativa.
 * - `obterHzEstavel()` só muda com a janela cheia e quando a estimativa se
 *   afasta mais de `histerese` (1 %) do valor estável — é o que os filtros IIR
 *   usam para decidir reconstruir coeficientes. Com 64 marcas inteiras a
 *   83 Hz o jitter da média é ~0,13 %, então 1 % não oscila e limita o erro
 *   de Fs a 1 % (um Notch de Q = 30 a 60 Hz tem banda de 2 Hz: 5 % de erro
 *   já o tirava da frequência).
 */
export class EstimadorTaxaAmostragem {
  private marcas: number[] = [];
  private estavel: number | null = null;
  private mudou = false;

  constructor(
    private readonly tamanhoJanela = 128,
    private readonly histerese = 0.01,
    private readonly fatorSalto = 3,
    private readonly minimoIntervalos = 8,
  ) {}

  adicionarTimestamp(ms: number): void {
    const ultimo = this.marcas[this.marcas.length - 1];
    if (ultimo !== undefined) {
      const dt = ms - ultimo;
      const periodo = this.periodoAtualMs();
      if (dt <= 0 || (periodo !== null && dt > this.fatorSalto * periodo)) this.marcas = [];
    }
    this.marcas.push(ms);
    if (this.marcas.length > this.tamanhoJanela) this.marcas.shift();

    const hz = this.obterHz();
    if (hz === null) return;
    // Primeiro valor assim que houver amostras; depois só com a janela cheia (média estável)
    const janelaCheia = this.marcas.length >= this.tamanhoJanela;
    if (this.estavel === null || (janelaCheia && Math.abs(hz - this.estavel) / this.estavel > this.histerese)) {
      this.estavel = hz;
      this.mudou = true;
    }
  }

  /** Estimativa instantânea (média na janela) ou null enquanto há poucas amostras. */
  obterHz(): number | null {
    const n = this.marcas.length;
    if (n < this.minimoIntervalos + 1) return null;
    const dur = this.marcas[n - 1]! - this.marcas[0]!;
    return dur > 0 ? (n - 1) * 1000 / dur : null;
  }

  /** Valor com histerese: o que os filtros devem usar. */
  obterHzEstavel(): number | null { return this.estavel; }

  /** true uma vez a cada mudança do valor estável (consome o aviso). */
  consumirMudanca(): boolean { const m = this.mudou; this.mudou = false; return m; }

  reiniciar(): void { this.marcas = []; this.estavel = null; this.mudou = false; }

  private periodoAtualMs(): number | null {
    const hz = this.obterHz() ?? this.estavel;
    return hz ? 1000 / hz : null;
  }
}

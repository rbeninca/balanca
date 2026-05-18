export class FiltroPassaBaixa {
  private readonly alpha: number;
  private y = 0;

  constructor(taxaHz: number, frequenciaCorteHz: number) {
    const tau = 1 / (2 * Math.PI * frequenciaCorteHz);
    const T   = 1 / taxaHz;
    this.alpha = tau / (tau + T);
  }

  aplicar(valor: number): number {
    this.y = this.alpha * this.y + (1 - this.alpha) * valor;
    return this.y;
  }

  reiniciar(): void {
    this.y = 0;
  }
}

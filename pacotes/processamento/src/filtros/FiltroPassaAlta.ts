export class FiltroPassaAlta {
  private readonly alpha: number;
  private y = 0;
  private x = 0;

  constructor(taxaHz: number, frequenciaCorteHz: number) {
    const tau = 1 / (2 * Math.PI * frequenciaCorteHz);
    const T   = 1 / taxaHz;
    this.alpha = tau / (tau + T);
  }

  aplicar(valor: number): number {
    const y = this.alpha * (this.y + valor - this.x);
    this.x = valor;
    this.y = y;
    return y;
  }

  reiniciar(): void {
    this.y = 0;
    this.x = 0;
  }
}

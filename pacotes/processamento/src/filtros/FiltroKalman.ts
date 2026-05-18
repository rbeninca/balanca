export class FiltroKalman {
  private xHat: number | null = null;
  private p: number;

  constructor(private q: number, private r: number) {
    this.p = r;
  }

  aplicar(medicao: number): number {
    if (this.xHat === null) {
      this.xHat = medicao;
      this.p    = this.r;
      return this.xHat;
    }

    // Predição
    this.p += this.q;

    // Atualização
    const k    = this.p / (this.p + this.r);
    this.xHat += k * (medicao - this.xHat);
    this.p    *= (1 - k);

    return this.xHat;
  }

  reiniciar(): void {
    this.xHat = null;
    this.p    = this.r;
  }
}

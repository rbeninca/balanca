export class MediaExponencial {
  private ultimo: number | null = null;

  constructor(private alpha: number) {}

  aplicar(valor: number): number {
    if (this.ultimo === null) {
      this.ultimo = valor;
    } else {
      this.ultimo = this.alpha * valor + (1 - this.alpha) * this.ultimo;
    }
    return this.ultimo;
  }

  reiniciar(): void {
    this.ultimo = null;
  }
}

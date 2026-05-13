export class CalculadorImpulso {
  private impulsoAcumulado = 0;
  private ultimaForca: number | null = null;
  private ultimoTs: number | null = null;

  integrar(forca: number, marcaTemporal: number): number {
    if (this.ultimaForca !== null && this.ultimoTs !== null) {
      const deltaT = (marcaTemporal - this.ultimoTs) / 1000; // ms → s
      if (deltaT > 0) {
        this.impulsoAcumulado += ((this.ultimaForca + forca) / 2) * deltaT;
      }
    }
    this.ultimaForca = forca;
    this.ultimoTs = marcaTemporal;
    return this.impulsoAcumulado;
  }

  reiniciar(): void {
    this.impulsoAcumulado = 0;
    this.ultimaForca = null;
    this.ultimoTs = null;
  }
}

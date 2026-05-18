// Biquad IIR notch (rejeita-faixa) de 2ª ordem.
// H(z) = (1 - 2cos(ω₀)·z⁻¹ + z⁻²) / (1 - 2r·cos(ω₀)·z⁻¹ + r²·z⁻²)
// onde r = 1 - π·(freqHz/taxaAmostragem) / q
export class FiltroNotch {
  private b0: number;
  private b1: number;
  private b2: number;
  private a1: number;
  private a2: number;

  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(freqHz: number, q: number, taxaAmostragemHz: number) {
    const w0 = 2 * Math.PI * freqHz / taxaAmostragemHz;
    const r  = 1 - (Math.PI * (freqHz / taxaAmostragemHz)) / q;

    this.a1 = -2 * r * Math.cos(w0);
    this.a2 =  r * r;

    // Coeficientes do numerador antes da normalização
    const b0u =  1;
    const b1u = -2 * Math.cos(w0);
    const b2u =  1;

    // Normaliza para ganho unitário em DC: H(1) = (b0+b1+b2)/(1+a1+a2)
    const gainDC = (b0u + b1u + b2u) / (1 + this.a1 + this.a2);
    this.b0 = b0u / gainDC;
    this.b1 = b1u / gainDC;
    this.b2 = b2u / gainDC;
  }

  aplicar(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
            - this.a1 * this.y1 - this.a2 * this.y2;

    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;

    return y;
  }

  reiniciar(): void {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
}

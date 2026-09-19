/**
 * Butterworth passa-baixa de 2ª ordem (Fase 5 do PLANEJAMENTO-PROCESSAMENTO.MD),
 * como biquad IIR (Audio EQ Cookbook, LPF com Q = 1/√2 — resposta maximamente
 * plana na banda passante, −3 dB em fc, −12 dB/oitava acima).
 *
 *   ω0 = 2π·fc/Fs · α = sin(ω0)/(2Q)
 *   b0 = (1 − cos ω0)/2 · b1 = 1 − cos ω0 · b2 = b0
 *   a0 = 1 + α · a1 = −2 cos ω0 · a2 = 1 − α   (normalizados por a0)
 *
 * Exige 0 < fc < Fs/2 (Nyquist); `valido(fc, fs)` diz se a combinação serve.
 * O pipeline usa a Fs real estimada e reconstrói os coeficientes quando ela
 * muda (o estado interno é preservado para não dar salto na saída).
 */
export class FiltroButterworth {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;

  constructor(frequenciaCorteHz: number, taxaAmostragemHz: number) {
    this.configurar(frequenciaCorteHz, taxaAmostragemHz);
  }

  static valido(frequenciaCorteHz: number, taxaAmostragemHz: number): boolean {
    return frequenciaCorteHz > 0 && taxaAmostragemHz > 0 && frequenciaCorteHz < taxaAmostragemHz / 2;
  }

  /** Recalcula os coeficientes mantendo o estado (troca de Fs ou de fc em operação). */
  configurar(frequenciaCorteHz: number, taxaAmostragemHz: number): void {
    if (!FiltroButterworth.valido(frequenciaCorteHz, taxaAmostragemHz)) {
      throw new Error(`Butterworth: exige 0 < fc < Fs/2 (fc = ${frequenciaCorteHz} Hz, Fs = ${taxaAmostragemHz} Hz)`);
    }
    const w0 = 2 * Math.PI * frequenciaCorteHz / taxaAmostragemHz;
    const cosW0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
    const a0 = 1 + alpha;
    this.b0 = ((1 - cosW0) / 2) / a0;
    this.b1 = (1 - cosW0) / a0;
    this.b2 = this.b0;
    this.a1 = (-2 * cosW0) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  aplicar(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }

  reiniciar(): void {
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
  }
}

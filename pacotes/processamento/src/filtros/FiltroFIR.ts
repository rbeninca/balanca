/**
 * Filtro FIR de banda passante com fase linear, implementado via overlap-add (FFT).
 *
 * Cada bloco de L amostras é filtrado no domínio da frequência:
 *   X = FFT(bloco_zero_pad)  →  Y = X × H  →  y = IFFT(Y)
 *
 * Latência: L amostras (um bloco). Com L=32 e fs=80 Hz → 400 ms.
 */
export class FiltroFIR {
  private readonly L: number;
  private readonly N: number;
  private readonly M: number;
  private readonly HRe: number[];
  private readonly HIm: number[];

  private inputBuf:   number[] = [];
  private outputBuf:  number[] = [];
  private overlapBuf: number[];

  constructor(taxaHz: number, fcBaixaHz: number, fcAltaHz: number, numTaps = 63) {
    this.M = numTaps % 2 === 0 ? numTaps + 1 : numTaps;
    this.L = 32;
    this.N = nextPow2(this.L + this.M - 1);

    const h = FiltroFIR.designar(taxaHz, fcBaixaHz, fcAltaHz, this.M);

    const hRe = new Array<number>(this.N).fill(0);
    const hIm = new Array<number>(this.N).fill(0);
    for (let i = 0; i < this.M; i++) hRe[i] = h[i] ?? 0;
    fftDireto(hRe, hIm);
    this.HRe = hRe;
    this.HIm = hIm;

    this.overlapBuf = new Array<number>(this.M - 1).fill(0);
  }

  static designar(taxaHz: number, fcBaixaHz: number, fcAltaHz: number, M: number): number[] {
    const mid = (M - 1) / 2;
    const flN = fcBaixaHz / taxaHz;
    const fhN = fcAltaHz  / taxaHz;
    const h = new Array<number>(M);

    for (let n = 0; n < M; n++) {
      const k    = n - mid;
      const hann = 0.5 * (1 - Math.cos(2 * Math.PI * n / (M - 1)));
      const sinch = k === 0 ? 2 * fhN : Math.sin(2 * Math.PI * fhN * k) / (Math.PI * k);
      const sincl = k === 0 ? 2 * flN : Math.sin(2 * Math.PI * flN * k) / (Math.PI * k);
      h[n] = (sinch - sincl) * hann;
    }

    const fcCN = (flN + fhN) / 2;
    let gain = 0;
    for (let n = 0; n < M; n++) gain += (h[n] ?? 0) * Math.cos(2 * Math.PI * fcCN * (n - mid));
    if (Math.abs(gain) > 1e-10) {
      for (let n = 0; n < M; n++) h[n] = (h[n] ?? 0) / gain;
    }
    return h;
  }

  aplicar(valor: number): number {
    this.inputBuf.push(valor);
    if (this.inputBuf.length >= this.L) this.processarBloco();
    return this.outputBuf.shift() ?? 0;
  }

  private processarBloco(): void {
    const { L, N, M } = this;

    const xRe = new Array<number>(N).fill(0);
    const xIm = new Array<number>(N).fill(0);
    for (let i = 0; i < L; i++) xRe[i] = this.inputBuf[i] ?? 0;
    this.inputBuf = [];

    fftDireto(xRe, xIm);

    for (let k = 0; k < N; k++) {
      const xR = xRe[k] ?? 0, xI = xIm[k] ?? 0;
      const hR = this.HRe[k] ?? 0, hI = this.HIm[k] ?? 0;
      xRe[k] = xR * hR - xI * hI;
      xIm[k] = xR * hI + xI * hR;
    }

    fftInversa(xRe, xIm);

    for (let i = 0; i < M - 1; i++) xRe[i] = (xRe[i] ?? 0) + (this.overlapBuf[i] ?? 0);
    for (let i = 0; i < M - 1; i++) this.overlapBuf[i] = xRe[L + i] ?? 0;
    for (let i = 0; i < L; i++) this.outputBuf.push(xRe[i] ?? 0);
  }

  reiniciar(): void {
    this.inputBuf  = [];
    this.outputBuf = [];
    this.overlapBuf.fill(0);
  }

  get atrasoAmostras(): number { return this.L; }
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function bitReverse(re: number[], im: number[]): void {
  const N = re.length;
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] ?? 0; re[i] = re[j] ?? 0; re[j] = tr;
      const ti = im[i] ?? 0; im[i] = im[j] ?? 0; im[j] = ti;
    }
  }
}

function fftDireto(re: number[], im: number[]): void {
  bitReverse(re, im);
  const N = re.length;
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1;
    const ang  = -2 * Math.PI / len;
    const wr0  = Math.cos(ang);
    const wi0  = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let wr = 1, wi = 0;
      for (let k = 0; k < half; k++) {
        const u = i + k, v = i + k + half;
        const ur = re[u] ?? 0, ui = im[u] ?? 0;
        const vr = (re[v] ?? 0) * wr - (im[v] ?? 0) * wi;
        const vi = (re[v] ?? 0) * wi + (im[v] ?? 0) * wr;
        re[u] = ur + vr; im[u] = ui + vi;
        re[v] = ur - vr; im[v] = ui - vi;
        const nwr = wr * wr0 - wi * wi0;
        wi  = wr * wi0 + wi * wr0;
        wr  = nwr;
      }
    }
  }
}

function fftInversa(re: number[], im: number[]): void {
  const N = re.length;
  for (let i = 0; i < N; i++) im[i] = -(im[i] ?? 0);
  fftDireto(re, im);
  for (let i = 0; i < N; i++) {
    re[i] = (re[i] ?? 0) / N;
    im[i] = -(im[i] ?? 0) / N;
  }
}

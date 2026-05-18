/**
 * Detector de pico adaptado de Pan-Tompkins para sinais BCG de célula de carga.
 *
 * Pipeline:
 *   1. Derivada (diferença central de 5 pontos)
 *   2. Elevação ao quadrado
 *   3. Integração por janela móvel (Moving Window Integration)
 *   4. Limiar adaptativo duplo (SPKI/NPKI) como no artigo original
 *
 * Referência: Pan & Tompkins, IEEE TBME, 1985.
 */
export class PanTompkins {
  private readonly taxaHz: number;
  private readonly mwiJanela: number;
  private readonly refratarioAmostras: number;

  // Buffer para derivada de 5 pontos
  private readonly bufDeriv: number[] = [0, 0, 0, 0, 0];

  // Buffer para MWI
  private readonly bufMwi: number[];
  private somaMwi = 0;

  // Limiares adaptativos
  private spki = 0;   // pico de sinal
  private npki = 0;   // pico de ruído
  private limiar1 = 0;
  private limiar2 = 0;

  // Estado de detecção
  private ultimoPicoIdx = -1000;
  private idx = 0;
  private acimaDaLimiar = false;
  private picoMwiAtual = -Infinity;

  // Saída diferida (alinha com atraso da MWI)
  private readonly atraso: number;

  constructor(taxaHz: number, refratarioMs = 300) {
    this.taxaHz = taxaHz;
    this.mwiJanela = Math.round(taxaHz * 0.150); // 150 ms
    this.refratarioAmostras = Math.round(taxaHz * refratarioMs / 1000);
    this.bufMwi = new Array<number>(this.mwiJanela).fill(0);
    this.atraso = Math.floor(this.mwiJanela / 2);
  }

  /**
   * Processa uma amostra e retorna se um pico foi detectado nesta amostra.
   * @param valor Sinal BCG filtrado em banda cardíaca
   */
  processar(valor: number): boolean {
    // 1. Derivada central de 5 pontos
    const buf = this.bufDeriv;
    buf.shift();
    buf.push(valor);
    const deriv = (-(buf[0] ?? 0) - 2 * (buf[1] ?? 0) + 2 * (buf[3] ?? 0) + (buf[4] ?? 0)) / (8 / this.taxaHz);

    // 2. Quadrado
    const sq = deriv * deriv;

    // 3. MWI (janela móvel com acumulador)
    const saindoMwi = this.bufMwi.shift() ?? 0;
    this.somaMwi += sq - saindoMwi;
    this.bufMwi.push(sq);
    const mwi = this.somaMwi / this.mwiJanela;

    // 4. Detecção com limiar duplo
    let pico = false;
    const estaAcima = mwi > this.limiar1;

    if (!this.acimaDaLimiar && estaAcima) {
      this.acimaDaLimiar = true;
      this.picoMwiAtual = mwi;
    } else if (this.acimaDaLimiar && estaAcima) {
      if (mwi > this.picoMwiAtual) this.picoMwiAtual = mwi;
    } else if (this.acimaDaLimiar && !estaAcima) {
      this.acimaDaLimiar = false;
      const passouRefratario = (this.idx - this.ultimoPicoIdx) >= this.refratarioAmostras;

      if (passouRefratario && this.picoMwiAtual > this.limiar2) {
        // Pico de sinal
        this.spki = 0.125 * this.picoMwiAtual + 0.875 * this.spki;
        this.ultimoPicoIdx = this.idx;
        pico = true;
      } else {
        // Pico de ruído
        this.npki = 0.125 * this.picoMwiAtual + 0.875 * this.npki;
      }

      this.limiar1 = this.npki + 0.25 * (this.spki - this.npki);
      this.limiar2 = 0.5 * this.limiar1;
      this.picoMwiAtual = -Infinity;
    }

    // Inicialização do limiar nas primeiras amostras
    if (this.spki === 0 && mwi > 0) {
      this.spki = mwi;
      this.limiar1 = 0.5 * mwi;
      this.limiar2 = 0.25 * mwi;
    }

    this.idx++;
    return pico;
  }

  reiniciar(): void {
    this.bufDeriv.fill(0);
    this.bufMwi.fill(0);
    this.somaMwi = 0;
    this.spki = 0;
    this.npki = 0;
    this.limiar1 = 0;
    this.limiar2 = 0;
    this.ultimoPicoIdx = -1000;
    this.idx = 0;
    this.acimaDaLimiar = false;
    this.picoMwiAtual = -Infinity;
  }

  get atrasoAmostras(): number { return this.atraso; }
}

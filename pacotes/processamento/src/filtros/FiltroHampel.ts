/**
 * Filtro de Hampel causal (Fase 4 do PLANEJAMENTO-PROCESSAMENTO.MD): remove
 * amostras anômalas (spikes) comparando a amostra mais recente com a mediana
 * robusta da janela das últimas N amostras.
 *
 *   m = mediana(janela) · MAD = mediana(|x_i − m|) · σ ≈ 1,4826·MAD
 *   outlier se |x − m| > K·σ → sai a mediana; senão sai o valor original.
 *
 * - Causal (janela só de amostras passadas, avaliando a mais recente): zero
 *   atraso na saída e a mesma implementação no Kotlin. Consequência: um degrau
 *   real é substituído pela mediana até que ⌈N/2⌉ amostras do novo patamar
 *   entrem na janela — atraso máximo de (N+1)/2 amostras, nunca "apagado".
 * - Piso em σ (`pisoSigma`): num sinal quantizado ou constante MAD = 0 e sem
 *   o piso qualquer desvio seria outlier — um degrau real ficaria preso na
 *   mediana para sempre.
 * - Aquecimento: com menos de 3 amostras não há mediana robusta; passa direto.
 */
export interface ResultadoHampel {
  valor: number;
  outlier: boolean;
}

export const HAMPEL_FATOR_MAD = 1.4826;

export class FiltroHampel {
  private buffer: number[] = [];

  constructor(
    private readonly janela = 7,
    private readonly limiarSigma = 3,
    /** σ mínimo (N); da ordem da resolução da célula. */
    private readonly pisoSigma = 1e-3,
  ) {
    if (janela < 3 || janela % 2 === 0) throw new Error(`Hampel: janela deve ser ímpar ≥ 3 (recebeu ${janela})`);
  }

  aplicarDetalhado(x: number): ResultadoHampel {
    this.buffer.push(x);
    if (this.buffer.length > this.janela) this.buffer.shift();
    if (this.buffer.length < 3) return { valor: x, outlier: false };

    const m = mediana(this.buffer);
    const mad = mediana(this.buffer.map(v => Math.abs(v - m)));
    const sigma = Math.max(HAMPEL_FATOR_MAD * mad, this.pisoSigma);
    if (Math.abs(x - m) > this.limiarSigma * sigma) return { valor: m, outlier: true };
    return { valor: x, outlier: false };
  }

  aplicar(x: number): number {
    return this.aplicarDetalhado(x).valor;
  }

  reiniciar(): void {
    this.buffer = [];
  }
}

function mediana(valores: number[]): number {
  const ordenado = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 === 1 ? ordenado[meio]! : (ordenado[meio - 1]! + ordenado[meio]!) / 2;
}

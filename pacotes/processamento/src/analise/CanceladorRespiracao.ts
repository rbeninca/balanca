import { FiltroPassaBaixa } from '../filtros/FiltroPassaBaixa.js';

/**
 * Cancela o componente respiratório do sinal BCG usando LMS normalizado (NLMS).
 *
 * Referência respiratória: passa-baixa com fc=0.4 Hz.
 * O filtro adaptativo subtrai a estimativa da respiração da saída.
 */
export class CanceladorRespiracao {
  private readonly lpResp: FiltroPassaBaixa;
  private readonly pesos: number[];
  private readonly buffer: number[];
  private readonly mu: number;
  private readonly epsilon: number;

  constructor(
    taxaHz: number,
    numPesos = 16,
    mu = 0.01,
    fcRespHz = 0.4,
  ) {
    this.lpResp  = new FiltroPassaBaixa(taxaHz, fcRespHz);
    this.pesos   = new Array<number>(numPesos).fill(0);
    this.buffer  = new Array<number>(numPesos).fill(0);
    this.mu      = mu;
    this.epsilon = 1e-6;
  }

  /**
   * Processa uma amostra BCG e retorna o sinal com a respiração cancelada.
   * @param valor Sinal BCG bruto (N)
   */
  aplicar(valor: number): number {
    const ref = this.lpResp.aplicar(valor);

    // Desloca buffer de referência
    for (let i = this.buffer.length - 1; i > 0; i--) {
      this.buffer[i] = this.buffer[i - 1] ?? 0;
    }
    this.buffer[0] = ref;

    // Estimativa da interferência respiratória
    let yHat = 0;
    for (let i = 0; i < this.pesos.length; i++) {
      yHat += (this.pesos[i] ?? 0) * (this.buffer[i] ?? 0);
    }

    // Erro = sinal - estimativa
    const erro = valor - yHat;

    // Potência do vetor de referência (denominador do NLMS)
    let potencia = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      potencia += (this.buffer[i] ?? 0) ** 2;
    }

    // Atualização NLMS dos pesos
    const ganho = this.mu / (potencia + this.epsilon);
    for (let i = 0; i < this.pesos.length; i++) {
      this.pesos[i] = (this.pesos[i] ?? 0) + ganho * erro * (this.buffer[i] ?? 0);
    }

    return erro;
  }

  reiniciar(): void {
    this.lpResp.reiniciar();
    this.pesos.fill(0);
    this.buffer.fill(0);
  }
}

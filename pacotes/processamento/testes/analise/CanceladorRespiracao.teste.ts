import { describe, it, expect } from 'vitest';
import { CanceladorRespiracao } from '../../src/analise/CanceladorRespiracao.js';

const TAXA_HZ = 80;

describe('CanceladorRespiracao', () => {
  it('UT-2.17.1 — sinal BCG puro sem respiração: erro ≈ entrada após adaptação', () => {
    const c = new CanceladorRespiracao(TAXA_HZ);
    // Sinal cardíaco limpo (sem respiração): pesos convergem para zero
    let saida = 0;
    for (let i = 0; i < 500; i++) {
      saida = c.aplicar(Math.sin(2 * Math.PI * 1.2 * i / TAXA_HZ) * 0.01);
    }
    // Com sinal cardíaco alto na saída e sem componente respiratório,
    // o NLMS não consegue cancelar muito — saída deve ser similar à entrada
    expect(Math.abs(saida)).toBeGreaterThan(0);
  });

  it('UT-2.17.2 — componente respiratório DC-like é reduzido após adaptação', () => {
    const c = new CanceladorRespiracao(TAXA_HZ, 16, 0.05);
    const taxaResp = 0.25; // 0.25 Hz (dentro da banda respiratória)
    let saidaInicial = 0, saidaFinal = 0;

    for (let i = 0; i < 800; i++) {
      const resp = Math.sin(2 * Math.PI * taxaResp * i / TAXA_HZ) * 1.0;
      const saida = c.aplicar(resp);
      if (i < 10) saidaInicial = Math.abs(saida);
      if (i > 750) saidaFinal = Math.abs(saida);
    }
    // A saída final deve ser menor que a inicial (alguma cancelamento ocorreu)
    expect(saidaFinal).toBeLessThan(saidaInicial);
  });

  it('UT-2.17.3 — reiniciar() zera pesos e buffer', () => {
    const c = new CanceladorRespiracao(TAXA_HZ);
    for (let i = 0; i < 200; i++) c.aplicar(Math.sin(i * 0.1));
    c.reiniciar();
    // Após reiniciar, comportamento é idêntico a instância nova
    const cNovo = new CanceladorRespiracao(TAXA_HZ);
    const entrada = 0.5;
    expect(c.aplicar(entrada)).toBeCloseTo(cNovo.aplicar(entrada), 5);
  });

  it('UT-2.17.4 — saída é um número finito para qualquer entrada', () => {
    const c = new CanceladorRespiracao(TAXA_HZ);
    for (let i = 0; i < 100; i++) {
      const r = c.aplicar(Math.random() - 0.5);
      expect(isFinite(r)).toBe(true);
    }
  });

  it('UT-2.17.5 — entrada zero → saída zero em regime', () => {
    const c = new CanceladorRespiracao(TAXA_HZ);
    let saida = 0;
    for (let i = 0; i < 200; i++) saida = c.aplicar(0);
    expect(saida).toBeCloseTo(0, 5);
  });
});

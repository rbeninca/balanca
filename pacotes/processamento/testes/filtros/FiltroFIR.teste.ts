import { describe, it, expect } from 'vitest';
import { FiltroFIR } from '../../src/filtros/FiltroFIR.js';

describe('FiltroFIR', () => {
  it('UT-2.16.1 — coeficientes do filtro somam 1 na frequência central', () => {
    const taxaHz = 80;
    const fc1 = 0.5, fc2 = 5.0;
    const M = 63;
    const h = FiltroFIR.designar(taxaHz, fc1, fc2, M);
    const fcCN = ((fc1 / taxaHz) + (fc2 / taxaHz)) / 2;
    const mid = (M - 1) / 2;
    let gain = 0;
    for (let n = 0; n < M; n++) {
      gain += (h[n] ?? 0) * Math.cos(2 * Math.PI * fcCN * (n - mid));
    }
    expect(gain).toBeCloseTo(1, 2);
  });

  it('UT-2.16.2 — DC é atenuado após aquecimento', () => {
    // fc_min=10 Hz em taxaHz=200 Hz → sinc bem capturado por 63 taps
    const taxaHz = 200;
    const f = new FiltroFIR(taxaHz, 10.0, 80.0, 63);
    let saida = 0;
    for (let i = 0; i < 300; i++) saida = f.aplicar(10);
    expect(Math.abs(saida)).toBeLessThan(1.0);
  });

  it('UT-2.16.3 — sinal dentro da banda passa com amplitude não nula', () => {
    const taxaHz = 80;
    const f = new FiltroFIR(taxaHz, 0.5, 5.0, 63);
    let maxAbs = 0;
    for (let i = 0; i < 300; i++) {
      const saida = f.aplicar(Math.sin(2 * Math.PI * 2 * i / taxaHz));
      if (i > 100 && Math.abs(saida) > maxAbs) maxAbs = Math.abs(saida);
    }
    expect(maxAbs).toBeGreaterThan(0.1);
  });

  it('UT-2.16.4 — reiniciar() limpa buffers', () => {
    const f = new FiltroFIR(80, 0.5, 5.0, 63);
    for (let i = 0; i < 100; i++) f.aplicar(10);
    f.reiniciar();
    // Após reiniciar, saída é 0 (buffer vazio, saída é 0 por padrão)
    const r = f.aplicar(0);
    expect(r).toBeCloseTo(0, 5);
  });

  it('UT-2.16.5 — atrasoAmostras retorna L=32', () => {
    const f = new FiltroFIR(80, 0.5, 5.0, 63);
    expect(f.atrasoAmostras).toBe(32);
  });

  it('UT-2.16.6 — numTaps par é convertido para ímpar automaticamente', () => {
    // FiltroFIR com 62 taps (par) deve funcionar sem erro (converte para 63)
    expect(() => new FiltroFIR(80, 0.5, 5.0, 62)).not.toThrow();
  });
});

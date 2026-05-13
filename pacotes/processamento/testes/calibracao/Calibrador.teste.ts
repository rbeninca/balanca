import { describe, it, expect } from 'vitest';
import { Calibrador } from '../../src/calibracao/Calibrador.js';

describe('Calibrador', () => {
  it('UT-2.2.1 — calibração simples: (200-100)*2 = 200', () => {
    const c = new Calibrador(2.0, 100);
    expect(c.aplicar(200)).toBeCloseTo(200.0);
  });

  it('UT-2.2.2 — tara igual ao bruto → 0', () => {
    const c = new Calibrador(1.0, 100);
    expect(c.aplicar(100)).toBeCloseTo(0.0);
  });

  it('UT-2.2.3 — fator negativo', () => {
    const c = new Calibrador(-1.0, 0);
    expect(c.aplicar(100)).toBeCloseTo(-100.0);
  });

  it('UT-2.2.4 — valor bruto abaixo da tara → negativo', () => {
    const c = new Calibrador(1.0, 100);
    expect(c.aplicar(50)).toBeCloseTo(-50.0);
  });

  it('UT-2.2.5 — fator fracionário', () => {
    const c = new Calibrador(0.5, 100);
    expect(c.aplicar(150)).toBeCloseTo(25.0);
  });

  it('atualizar() troca fator e offset em runtime', () => {
    const c = new Calibrador(1.0, 0);
    c.atualizar(2.0, 100);
    expect(c.aplicar(200)).toBeCloseTo(200.0);
    expect(c.obterFator()).toBe(2.0);
    expect(c.obterOffset()).toBe(100);
  });
});

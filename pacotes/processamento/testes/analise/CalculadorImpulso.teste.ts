import { describe, it, expect } from 'vitest';
import { CalculadorImpulso } from '../../src/analise/CalculadorImpulso.js';

describe('CalculadorImpulso', () => {
  it('UT-2.6.1 — força constante 10N por 1s → ≈10 N·s', () => {
    const c = new CalculadorImpulso();
    c.integrar(10, 0);
    c.integrar(10, 500);
    const r = c.integrar(10, 1000);
    expect(r).toBeCloseTo(10, 2);
  });

  it('UT-2.6.2 — triângulo 0→10→0 N em 1s → ≈5 N·s', () => {
    const c = new CalculadorImpulso();
    c.integrar(0, 0);
    c.integrar(10, 500);
    const r = c.integrar(0, 1000);
    expect(r).toBeCloseTo(5, 2);
  });

  it('UT-2.6.3 — primeira amostra → 0 N·s', () => {
    const c = new CalculadorImpulso();
    expect(c.integrar(10, 0)).toBe(0);
  });

  it('UT-2.6.4 — reiniciar() zera o acumulador', () => {
    const c = new CalculadorImpulso();
    c.integrar(10, 0);
    c.integrar(10, 500);
    c.reiniciar();
    expect(c.integrar(10, 600)).toBe(0);
  });

  it('UT-2.6.5 — força zero não acumula', () => {
    const c = new CalculadorImpulso();
    for (let t = 0; t <= 10000; t += 100) {
      c.integrar(0, t);
    }
    expect(c.integrar(0, 11000)).toBeCloseTo(0);
  });

  it('UT-2.6.6 — precisão com Δt irregular < 0.1%', () => {
    const c = new CalculadorImpulso();
    // 10 N constante durante 1 s com intervalos irregulares
    const tempos = [0, 50, 123, 300, 500, 700, 850, 1000];
    for (const t of tempos) c.integrar(10, t);
    const resultado = c.integrar(10, 1000);
    const esperado  = 10.0; // 10 N × 1 s
    expect(Math.abs(resultado - esperado) / esperado).toBeLessThan(0.001);
  });
});

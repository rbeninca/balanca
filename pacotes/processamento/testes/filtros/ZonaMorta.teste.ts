import { describe, it, expect } from 'vitest';
import { ZonaMorta } from '../../src/filtros/ZonaMorta.js';

describe('ZonaMorta', () => {
  it('UT-2.3.1 — exatamente no limiar → 0', () => {
    const z = new ZonaMorta(0.5);
    expect(z.aplicar(0.5)).toBe(0);
  });

  it('UT-2.3.2 — abaixo do limiar → 0', () => {
    const z = new ZonaMorta(0.5);
    expect(z.aplicar(0.3)).toBe(0);
  });

  it('UT-2.3.3 — acima do limiar → passa', () => {
    const z = new ZonaMorta(0.5);
    expect(z.aplicar(0.6)).toBeCloseTo(0.6);
  });

  it('UT-2.3.4 — negativo abaixo do limiar (em módulo) → 0', () => {
    const z = new ZonaMorta(0.5);
    expect(z.aplicar(-0.3)).toBe(0);
  });

  it('UT-2.3.5 — negativo acima do limiar (em módulo) → passa', () => {
    const z = new ZonaMorta(0.5);
    expect(z.aplicar(-0.7)).toBeCloseTo(-0.7);
  });

  it('UT-2.3.6 — limiar zero (desabilitado) → qualquer valor passa', () => {
    const z = new ZonaMorta(0);
    expect(z.aplicar(0.001)).toBeCloseTo(0.001);
  });
});

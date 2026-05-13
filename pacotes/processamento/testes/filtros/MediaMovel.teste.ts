import { describe, it, expect } from 'vitest';
import { MediaMovel } from '../../src/filtros/MediaMovel.js';

describe('MediaMovel', () => {
  it('UT-2.4.1 — janela 1: passa cada valor direto', () => {
    const m = new MediaMovel(1);
    expect(m.aplicar(10)).toBeCloseTo(10);
    expect(m.aplicar(20)).toBeCloseTo(20);
    expect(m.aplicar(30)).toBeCloseTo(30);
  });

  it('UT-2.4.2 — janela 3 em aquecimento: média das amostras disponíveis', () => {
    const m = new MediaMovel(3);
    expect(m.aplicar(6)).toBeCloseTo(6);   // 6/1
    expect(m.aplicar(6)).toBeCloseTo(6);   // 12/2
    expect(m.aplicar(6)).toBeCloseTo(6);   // 18/3
  });

  it('UT-2.4.3 — janela 3 em regime deslizante', () => {
    const m = new MediaMovel(3);
    m.aplicar(2);                              // [2]
    m.aplicar(4);                              // [2,4]
    expect(m.aplicar(6)).toBeCloseTo(4);       // [2,4,6] → 12/3=4
    expect(m.aplicar(8)).toBeCloseTo(6);       // [4,6,8] → 18/3=6
    expect(m.aplicar(10)).toBeCloseTo(8);      // [6,8,10] → 24/3=8
  });

  it('UT-2.4.4 — reiniciar() zera a janela', () => {
    const m = new MediaMovel(3);
    for (let i = 0; i < 10; i++) m.aplicar(100);
    m.reiniciar();
    expect(m.aplicar(5)).toBeCloseTo(5);
  });

  it('UT-2.4.5 — janela maior que amostras: média das disponíveis', () => {
    const m = new MediaMovel(10);
    m.aplicar(3);
    m.aplicar(6);
    expect(m.aplicar(9)).toBeCloseTo(6);   // 18/3
  });
});

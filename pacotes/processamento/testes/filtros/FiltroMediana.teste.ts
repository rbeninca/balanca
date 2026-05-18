import { describe, it, expect } from 'vitest';
import { FiltroMediana } from '../../src/filtros/FiltroMediana.js';

describe('FiltroMediana', () => {
  it('UT-2.9.1 — janela 1: retorna cada valor diretamente', () => {
    const f = new FiltroMediana(1);
    expect(f.aplicar(10)).toBeCloseTo(10);
    expect(f.aplicar(99)).toBeCloseTo(99);
  });

  it('UT-2.9.2 — remove spike central em janela 3', () => {
    const f = new FiltroMediana(3);
    f.aplicar(10);
    f.aplicar(10);
    // buffer = [10, 10] → aquecendo, sem spike ainda
    const comSpike = new FiltroMediana(3);
    comSpike.aplicar(10);
    comSpike.aplicar(500); // spike
    const r = comSpike.aplicar(10); // [10, 500, 10] → mediana = 10
    expect(r).toBeCloseTo(10);
  });

  it('UT-2.9.3 — janela 5: spike não contamina saída', () => {
    const f = new FiltroMediana(5);
    f.aplicar(5); f.aplicar(5); f.aplicar(5); f.aplicar(5);
    const r = f.aplicar(1000); // [5,5,5,5,1000] → mediana = 5
    expect(r).toBeCloseTo(5);
  });

  it('UT-2.9.4 — aquecimento: mediana das amostras disponíveis antes de encher a janela', () => {
    const f = new FiltroMediana(5);
    expect(f.aplicar(2)).toBeCloseTo(2);       // [2] → 2
    expect(f.aplicar(4)).toBeCloseTo(3);       // [2,4] → (2+4)/2 = 3
    expect(f.aplicar(6)).toBeCloseTo(4);       // [2,4,6] → 4
  });

  it('UT-2.9.5 — janela deslizante descarta amostra mais antiga', () => {
    const f = new FiltroMediana(3);
    f.aplicar(1); f.aplicar(2); f.aplicar(3); // [1,2,3] → 2
    const r = f.aplicar(100);                 // [2,3,100] → 3
    expect(r).toBeCloseTo(3);
  });

  it('UT-2.9.6 — valores todos iguais retornam o mesmo valor', () => {
    const f = new FiltroMediana(7);
    for (let i = 0; i < 7; i++) expect(f.aplicar(42)).toBeCloseTo(42);
  });

  it('UT-2.9.7 — reiniciar() zera buffer: aquece novamente', () => {
    const f = new FiltroMediana(3);
    f.aplicar(100); f.aplicar(100); f.aplicar(100);
    f.reiniciar();
    expect(f.aplicar(5)).toBeCloseTo(5); // buffer = [5], mediana = 5
  });

  it('UT-2.9.8 — janela par: média dos dois centrais', () => {
    const f = new FiltroMediana(4);
    f.aplicar(1); f.aplicar(2); f.aplicar(3);
    const r = f.aplicar(4); // [1,2,3,4] → (2+3)/2 = 2.5
    expect(r).toBeCloseTo(2.5);
  });
});

import { describe, it, expect } from 'vitest';
import { FiltroKalman } from '../../src/filtros/FiltroKalman.js';

describe('FiltroKalman', () => {
  it('UT-2.10.1 — primeira medição é retornada como estimativa inicial', () => {
    const k = new FiltroKalman(0.01, 1);
    expect(k.aplicar(50)).toBeCloseTo(50);
  });

  it('UT-2.10.2 — entrada constante converge para o valor de entrada', () => {
    const k = new FiltroKalman(0.01, 1);
    let saida = 0;
    for (let i = 0; i < 100; i++) saida = k.aplicar(200);
    expect(saida).toBeCloseTo(200, 2);
  });

  it('UT-2.10.3 — Q alto: segue rapidamente mudanças de degrau', () => {
    const k = new FiltroKalman(10, 1); // Q grande → confia mais na medição
    for (let i = 0; i < 5; i++) k.aplicar(0);
    let saida = 0;
    for (let i = 0; i < 10; i++) saida = k.aplicar(100);
    expect(saida).toBeCloseTo(100, 0);
  });

  it('UT-2.10.4 — R alto: em regime, rastreia degrau mais devagar que R baixo', () => {
    const kRapido = new FiltroKalman(0.001, 1);    // R baixo → segue rápido
    const kLento  = new FiltroKalman(0.001, 1000); // R alto  → suaviza mais

    // Ambos convergem para 0 (200 passos)
    for (let i = 0; i < 200; i++) { kRapido.aplicar(0); kLento.aplicar(0); }

    // Degrau para 100: em regime permanente, K_rapido >> K_lento
    let rapido = 0, lento = 0;
    for (let i = 0; i < 30; i++) {
      rapido = kRapido.aplicar(100);
      lento  = kLento.aplicar(100);
    }
    // kRapido deve rastrear o degrau muito mais rápido que kLento
    expect(rapido).toBeGreaterThan(lento + 20);
  });

  it('UT-2.10.5 — reiniciar() zera estimativa: próximo valor tratado como primeiro', () => {
    const k = new FiltroKalman(0.01, 1);
    for (let i = 0; i < 50; i++) k.aplicar(999);
    k.reiniciar();
    expect(k.aplicar(3)).toBeCloseTo(3);
  });

  it('UT-2.10.6 — valores negativos processados corretamente', () => {
    const k = new FiltroKalman(0.01, 1);
    let saida = 0;
    for (let i = 0; i < 50; i++) saida = k.aplicar(-100);
    expect(saida).toBeCloseTo(-100, 1);
  });

  it('UT-2.10.7 — estimativa sempre entre 0 e medição em degrau positivo', () => {
    const k = new FiltroKalman(0.01, 1);
    k.aplicar(0);
    const r = k.aplicar(100);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(100);
  });
});

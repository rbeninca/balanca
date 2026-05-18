import { describe, it, expect } from 'vitest';
import { FiltroNotch } from '../../src/filtros/FiltroNotch.js';

// Gera uma senoide pura: valor[n] = amplitude * sin(2π * freq * n / taxa)
function senoide(freq: number, taxa: number, n: number, amplitude = 1): number {
  return amplitude * Math.sin(2 * Math.PI * freq * n / taxa);
}

// RMS de um array
function rms(valores: number[]): number {
  const soma = valores.reduce((a, v) => a + v * v, 0);
  return Math.sqrt(soma / valores.length);
}

describe('FiltroNotch', () => {
  it('UT-2.12.1 — senoide na frequência alvo é fortemente atenuada', () => {
    const taxa = 100;
    const freqAlvo = 60;
    const f = new FiltroNotch(freqAlvo, 30, taxa);

    // Aquece o filtro
    const N = 500;
    const saidas: number[] = [];
    for (let n = 0; n < N; n++) {
      saidas.push(f.aplicar(senoide(freqAlvo, taxa, n)));
    }

    // Descarta transiente inicial e mede atenuação
    const regime = saidas.slice(200);
    expect(rms(regime)).toBeLessThan(0.15); // atenuação > 80%
  });

  it('UT-2.12.2 — senoide fora da faixa passa com amplitude preservada', () => {
    const taxa = 100;
    const f = new FiltroNotch(60, 30, taxa);

    // Frequência de 5 Hz — bem longe do notch
    const N = 500;
    const entradas: number[] = [];
    const saidas:   number[] = [];
    for (let n = 0; n < N; n++) {
      const x = senoide(5, taxa, n);
      entradas.push(x);
      saidas.push(f.aplicar(x));
    }

    const rmsEntrada = rms(entradas.slice(200));
    const rmsSaida   = rms(saidas.slice(200));
    // Deve passar com pelo menos 90% da amplitude original
    expect(rmsSaida / rmsEntrada).toBeGreaterThan(0.9);
  });

  it('UT-2.12.3 — sinal DC (frequência zero) passa sem atenuação significativa', () => {
    const f = new FiltroNotch(60, 30, 100);
    let saida = 0;
    for (let i = 0; i < 200; i++) saida = f.aplicar(10);
    expect(saida).toBeCloseTo(10, 0);
  });

  it('UT-2.12.4 — reiniciar() elimina contaminação do estado anterior', () => {
    const taxa = 100;
    const f = new FiltroNotch(60, 30, taxa);

    // Alimenta com senoide na frequência alvo para saturar o estado
    for (let n = 0; n < 200; n++) f.aplicar(senoide(60, taxa, n));

    f.reiniciar();

    // Após reiniciar, sinal DC deve convergir sem artefatos do estado antigo
    let saida = 0;
    for (let i = 0; i < 100; i++) saida = f.aplicar(5);
    expect(saida).toBeCloseTo(5, 0);
  });

  it('UT-2.12.5 — entrada zero retorna zero', () => {
    const f = new FiltroNotch(60, 30, 100);
    for (let i = 0; i < 50; i++) {
      expect(f.aplicar(0)).toBeCloseTo(0, 10);
    }
  });

  it('UT-2.12.6 — notch em 50 Hz também atenua corretamente', () => {
    const taxa = 200;
    const f = new FiltroNotch(50, 30, taxa);
    const N = 600;
    const saidas: number[] = [];
    for (let n = 0; n < N; n++) {
      saidas.push(f.aplicar(senoide(50, taxa, n)));
    }
    expect(rms(saidas.slice(300))).toBeLessThan(0.15);
  });
});

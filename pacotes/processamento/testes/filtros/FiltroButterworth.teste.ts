import { describe, it, expect } from 'vitest';
import { FiltroButterworth } from '../../src/filtros/FiltroButterworth.js';

/** Ganho em regime: amplitude da saída nas últimas 100 amostras de um seno unitário. */
function ganho(f: FiltroButterworth, fSinalHz: number, fsHz: number, n = 600): number {
  let max = 0;
  for (let i = 0; i < n; i++) {
    const y = f.aplicar(Math.sin(2 * Math.PI * fSinalHz * i / fsHz));
    if (i >= n - 100) max = Math.max(max, Math.abs(y));
  }
  return max;
}

describe('FiltroButterworth (Fase 5) — fc = 10 Hz, Fs = 80 Hz', () => {
  it('seno abaixo do corte (2 Hz) passa quase intacto', () => {
    expect(ganho(new FiltroButterworth(10, 80), 2, 80)).toBeGreaterThan(0.97);
  });

  it('seno no corte (10 Hz) sai com ~0,707 (−3 dB)', () => {
    const g = ganho(new FiltroButterworth(10, 80), 10, 80);
    expect(g).toBeGreaterThan(0.66);
    expect(g).toBeLessThan(0.75);
  });

  it('seno acima do corte (30 Hz) é fortemente atenuado', () => {
    expect(ganho(new FiltroButterworth(10, 80), 30, 80)).toBeLessThan(0.12);
  });

  it('sinal constante: ganho DC unitário (converge para o valor)', () => {
    const f = new FiltroButterworth(10, 80);
    let y = 0;
    for (let i = 0; i < 200; i++) y = f.aplicar(5);
    expect(y).toBeCloseTo(5, 6);
  });

  it('degrau: sobe sem ultrapassar muito (Q = 1/√2 → sobressinal ≈ 4 %)', () => {
    const f = new FiltroButterworth(10, 80);
    let max = 0;
    for (let i = 0; i < 100; i++) max = Math.max(max, f.aplicar(1));
    expect(max).toBeGreaterThan(0.99);
    expect(max).toBeLessThan(1.06);
  });

  it('impulso: resposta decai para zero', () => {
    const f = new FiltroButterworth(10, 80);
    f.aplicar(1);
    let y = 0;
    for (let i = 0; i < 200; i++) y = f.aplicar(0);
    expect(Math.abs(y)).toBeLessThan(1e-6);
  });

  it('ruído branco sai com menos energia', () => {
    const f = new FiltroButterworth(5, 80);
    let semente = 9;
    const rand = () => { semente = (semente * 1103515245 + 12345) & 0x7fffffff; return semente / 0x7fffffff - 0.5; };
    let eIn = 0, eOut = 0;
    for (let i = 0; i < 2000; i++) { const x = rand(); const y = f.aplicar(x); if (i > 100) { eIn += x * x; eOut += y * y; } }
    expect(eOut / eIn).toBeLessThan(0.25);
  });

  it('exige 0 < fc < Fs/2', () => {
    expect(FiltroButterworth.valido(10, 80)).toBe(true);
    expect(FiltroButterworth.valido(40, 80)).toBe(false);
    expect(FiltroButterworth.valido(0, 80)).toBe(false);
    expect(FiltroButterworth.valido(10, 0)).toBe(false);
    expect(() => new FiltroButterworth(50, 80)).toThrow(/Nyquist|Fs\/2/);
  });

  it('configurar troca fc/Fs mantendo o estado (sem salto); reiniciar zera', () => {
    const f = new FiltroButterworth(10, 80);
    let y = 0;
    for (let i = 0; i < 100; i++) y = f.aplicar(3);
    f.configurar(10, 83.3);
    expect(Math.abs(f.aplicar(3) - y)).toBeLessThan(0.05);
    f.reiniciar();
    expect(f.aplicar(0)).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { analisarMotor } from '../src/AnalisadorMotor.js';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

function makeLeituras(forcas: number[], emQueima = true, tInicio = 0): LeituraProcessada[] {
  let impulso = 0;
  return forcas.map((f, i) => {
    if (i > 0) impulso += ((forcas[i - 1]! + f) / 2) * 0.1;
    return {
      marcaTemporal: tInicio + i * 100,
      forcaNewton: f,
      temperatura: 0,
      emQueima,
      impulsoAcumuladoNs: impulso,
    };
  });
}

// Sessão Fernanda 1.11 — dados reais simplificados
function sessaoFernanda(): LeituraProcessada[] {
  // 30 amostras de ~1.73N média, impulso ~2.94 N·s
  // A=1.46 calibrado para produzir impulso ≈ 2.94 N·s (0.8 base + 1.46*sin)
  const forcas = Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    return 0.8 + 1.46 * Math.sin(Math.PI * t);
  });
  let impulso = 0;
  return forcas.map((f, i) => {
    if (i > 0) impulso += ((forcas[i - 1]! + f) / 2) * (1700 / 29 / 1000);
    return {
      marcaTemporal: i * Math.round(1700 / 29),
      forcaNewton: f,
      temperatura: 0,
      emQueima: true,
      impulsoAcumuladoNs: impulso,
    };
  });
}

describe('AnalisadorMotor', () => {
  // UT-3.4.1
  it('lança exceção quando não há leituras em queima', () => {
    const ls = makeLeituras([1, 2, 3], false);
    expect(() => analisarMotor(ls)).toThrow('Nenhuma leitura');
  });

  // UT-3.4.2
  it('forcaPico = max das leituras em queima', () => {
    const ls = makeLeituras([1, 2, 3, 2, 1]);
    expect(analisarMotor(ls).forcaPico_N).toBe(3.0);
  });

  // UT-3.4.3
  it('forcaMedia aritmética de [2,2,2,2] = 2.0', () => {
    const ls = makeLeituras([2, 2, 2, 2]);
    expect(analisarMotor(ls).forcaMedia_N).toBeCloseTo(2.0, 5);
  });

  // UT-3.4.4
  it('forcaRms >= forcaMedia (invariante)', () => {
    const ls = makeLeituras([1, 3, 2, 4, 1.5]);
    const r = analisarMotor(ls);
    expect(r.forcaRms_N).toBeGreaterThanOrEqual(r.forcaMedia_N);
  });

  // UT-3.4.5
  it('CV = σ/média', () => {
    // forcas: [1.55, 1.73, 1.91] → média=1.73, σ≈0.147
    const ls = makeLeituras([1.55, 1.73, 1.91]);
    const r = analisarMotor(ls);
    expect(r.coefVariacao).toBeCloseTo(0.147 / 1.73, 2);
  });

  // UT-3.4.6
  it('t10 < t90 (invariante)', () => {
    const ls = makeLeituras([1, 2, 3, 2, 1]);
    const r = analisarMotor(ls);
    expect(r.t10_s).toBeLessThan(r.t90_s);
  });

  // UT-3.4.7
  it('tempoSubida = t90 - t10', () => {
    const ls = makeLeituras([1, 2, 3, 2, 1]);
    const r = analisarMotor(ls);
    expect(r.tempoSubida_s).toBeCloseTo(r.t90_s - r.t10_s, 10);
  });

  // UT-3.4.8
  it('Isp com massa: impulso=2.94 N·s, massa=30g → ~9.97s', () => {
    const ls = sessaoFernanda();
    const r = analisarMotor(ls, { massaPropelente_g: 30 });
    // impulso da sessão Fernanda é ~2.94 N·s
    // Isp = 2.94 / (0.030 * 9.80665) ≈ 9.97
    expect(r.impulsoEspecifico_s).toBeCloseTo(9.97, 0);
  });

  // UT-3.4.9
  it('Isp = undefined sem massa', () => {
    const ls = makeLeituras([2, 2, 2]);
    expect(analisarMotor(ls).impulsoEspecifico_s).toBeUndefined();
  });

  // UT-3.4.10
  it('nomeComum segue formato /^[A-Z0-9\\/]+\\d+\\.\\d$/', () => {
    const ls = makeLeituras([2, 2, 2, 2]);
    const r = analisarMotor(ls);
    expect(r.nomeComum).toMatch(/^[A-Z0-9/]+\d+\.\d$/);
  });

  // UT-3.4.11
  it('dados do relatório real: letra B, impulso ~2.94', () => {
    const ls = sessaoFernanda();
    const r = analisarMotor(ls, { massaPropelente_g: 30 });
    expect(r.letraMotor).toBe('B');
    expect(r.impulsoTotal_Ns).toBeCloseTo(2.94, 0);
  });
});

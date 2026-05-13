import { describe, it, expect } from 'vitest';
import { classificarPerfil } from '../src/ClassificadorPerfil.js';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

function gerarLeituras(forcas: number[], emQueima = true): LeituraProcessada[] {
  return forcas.map((f, i) => ({
    marcaTemporal: i * 100,
    forcaNewton: f,
    temperatura: 0,
    emQueima,
    impulsoAcumuladoNs: 0,
  }));
}

function gerarLeiturasMistas(forcasQueima: number[]): LeituraProcessada[] {
  return forcasQueima.map((f, i) => ({
    marcaTemporal: i * 100,
    forcaNewton: f,
    temperatura: 0,
    emQueima: true,
    impulsoAcumuladoNs: 0,
  }));
}

describe('ClassificadorPerfil', () => {
  // UT-3.2.1 — neutro-platô: início/fim baixos, meio alto
  it('neutro-platô (KNSB típico): início=1, meio=2, fim=1', () => {
    // 3 terços de 3 amostras = 9 total
    const forcas = [1.0, 1.0, 1.0, 2.0, 2.0, 2.0, 1.0, 1.0, 1.0];
    const leituras = gerarLeiturasMistas(forcas);
    expect(classificarPerfil(leituras)).toBe('neutro-plato');
  });

  // UT-3.2.2 — progressivo
  it('progressivo: 0.5 / 1.0 / 2.0', () => {
    const forcas = [0.5, 0.5, 0.5, 1.0, 1.0, 1.0, 2.0, 2.0, 2.0];
    const leituras = gerarLeiturasMistas(forcas);
    expect(classificarPerfil(leituras)).toBe('progressivo');
  });

  // UT-3.2.3 — regressivo
  it('regressivo: 2.0 / 1.5 / 0.5', () => {
    const forcas = [2.0, 2.0, 2.0, 1.5, 1.5, 1.5, 0.5, 0.5, 0.5];
    const leituras = gerarLeiturasMistas(forcas);
    expect(classificarPerfil(leituras)).toBe('regressivo');
  });

  // UT-3.2.4 — neutro (flat)
  it('neutro (flat): 1.7 / 1.7 / 1.7', () => {
    const forcas = [1.7, 1.7, 1.7, 1.7, 1.7, 1.7, 1.7, 1.7, 1.7];
    const leituras = gerarLeiturasMistas(forcas);
    expect(classificarPerfil(leituras)).toBe('neutro');
  });

  // UT-3.2.5 — amostra insuficiente
  it('amostra insuficiente (< 9): complexo', () => {
    const forcas = [1.0, 2.0, 1.5];
    const leituras = gerarLeiturasMistas(forcas);
    expect(classificarPerfil(leituras)).toBe('complexo');
  });

  // UT-3.2.6 — variação dentro da margem de 10%
  it('variação dentro da margem 10%: neutro', () => {
    const forcas = [1.7, 1.7, 1.7, 1.8, 1.8, 1.8, 1.75, 1.75, 1.75];
    const leituras = gerarLeiturasMistas(forcas);
    expect(classificarPerfil(leituras)).toBe('neutro');
  });

  // UT-3.2.7 — dados do relatório real (padrão neutro-platô)
  it('dados do relatório real: neutro-platô', () => {
    // Fernanda 1.11 — simulação de perfil real com pico no meio
    const forcas = [
      0.8, 0.9, 1.1,   // terço início
      1.8, 2.0, 1.9,   // terço meio
      1.0, 0.9, 0.8,   // terço fim
    ];
    const leituras = gerarLeiturasMistas(forcas);
    expect(classificarPerfil(leituras)).toBe('neutro-plato');
  });
});

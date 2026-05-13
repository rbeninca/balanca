import { describe, it, expect } from 'vitest';
import { classificarNAR } from '../src/ClassificadorNAR.js';

describe('ClassificadorNAR', () => {
  // UT-3.1.1
  it('motor do relatório real: 2.94 N·s / 1.73 N → B1.7', () => {
    const r = classificarNAR(2.94, 1.73);
    expect(r.letra).toBe('B');
    expect(r.nomeComum).toBe('B1.7');
  });

  // UT-3.1.2
  it('limite inferior classe B: 2.51 N·s → B', () => {
    const r = classificarNAR(2.51, 1.0);
    expect(r.letra).toBe('B');
    expect(r.nomeComum).toBe('B1.0');
  });

  // UT-3.1.3
  it('limite superior classe B: 5.00 N·s → B', () => {
    const r = classificarNAR(5.00, 2.0);
    expect(r.letra).toBe('B');
    expect(r.nomeComum).toBe('B2.0');
  });

  // UT-3.1.4
  it('fronteira A/B: 2.50 N·s → A', () => {
    const r = classificarNAR(2.50, 1.5);
    expect(r.letra).toBe('A');
  });

  // UT-3.1.5
  it('motor K grande: 1500 N·s / 240 N → K240.0', () => {
    const r = classificarNAR(1500.0, 240.0);
    expect(r.letra).toBe('K');
    expect(r.nomeComum).toBe('K240.0');
  });

  // UT-3.1.6
  it('motor micro 1/8A: 0.15 N·s / 0.5 N', () => {
    const r = classificarNAR(0.15, 0.5);
    expect(r.letra).toBe('1/8A');
    expect(r.nomeComum).toBe('1/8A0.5');
  });

  // UT-3.1.7
  it('impulso acima de O → ?', () => {
    const r = classificarNAR(41000, 500);
    expect(r.letra).toBe('?');
    expect(r.nomeComum).toBe('?500.0');
  });

  // UT-3.1.8
  it('nome com 1 decimal: 1.73 → "1.7" (não "1.73")', () => {
    const r = classificarNAR(2.94, 1.73);
    expect(r.nomeComum).toBe('B1.7');
    expect(r.nomeComum).not.toContain('1.73');
  });
});

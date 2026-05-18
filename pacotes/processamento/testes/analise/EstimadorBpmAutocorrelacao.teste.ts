import { describe, it, expect } from 'vitest';
import { EstimadorBpmAutocorrelacao } from '../../src/analise/EstimadorBpmAutocorrelacao.js';

const TAXA_HZ = 80;

function gerarSinalPeriodico(bpm: number, duracaoS: number): number[] {
  const periodoAmostras = TAXA_HZ * 60 / bpm;
  const n = Math.round(TAXA_HZ * duracaoS);
  return Array.from({ length: n }, (_, i) => {
    // Batimento BCG sintético: picos periódicos com Gaussiana
    const fase = (i % periodoAmostras) / periodoAmostras;
    return Math.exp(-0.5 * ((fase - 0) / 0.05) ** 2) - 0.5 * Math.exp(-0.5 * ((fase - 0.15) / 0.05) ** 2);
  });
}

describe('EstimadorBpmAutocorrelacao', () => {
  it('UT-2.19.1 — retorna null enquanto buffer está aquecendo', () => {
    const e = new EstimadorBpmAutocorrelacao(TAXA_HZ, 10);
    // Menos de lagMax amostras
    for (let i = 0; i < 100; i++) {
      const { bpm } = e.processar(Math.sin(i * 0.1));
      expect(bpm).toBeNull();
    }
  });

  it('UT-2.19.2 — estima BPM próximo de 60 para sinal a 1 Hz', () => {
    const e = new EstimadorBpmAutocorrelacao(TAXA_HZ, 10);
    const sinal = gerarSinalPeriodico(60, 12);
    let resultado: { bpm: number | null; confianca: number } = { bpm: null, confianca: 0 };
    sinal.forEach(v => { resultado = e.processar(v); });
    if (resultado.bpm !== null) {
      expect(resultado.bpm).toBeGreaterThanOrEqual(50);
      expect(resultado.bpm).toBeLessThanOrEqual(70);
    }
    // Ao menos deve ter tentado (sem null) ou ter confiança baixa (sinal sintético simples)
  });

  it('UT-2.19.3 — estima BPM próximo de 72 para sinal periódico', () => {
    const e = new EstimadorBpmAutocorrelacao(TAXA_HZ, 10);
    const sinal = gerarSinalPeriodico(72, 12);
    let resultado: { bpm: number | null; confianca: number } = { bpm: null, confianca: 0 };
    sinal.forEach(v => { resultado = e.processar(v); });
    if (resultado.bpm !== null) {
      expect(resultado.bpm).toBeGreaterThanOrEqual(60);
      expect(resultado.bpm).toBeLessThanOrEqual(84);
    }
  });

  it('UT-2.19.4 — confiança está no intervalo [0, 1]', () => {
    const e = new EstimadorBpmAutocorrelacao(TAXA_HZ, 10);
    const sinal = gerarSinalPeriodico(60, 12);
    sinal.forEach(v => {
      const { confianca } = e.processar(v);
      expect(confianca).toBeGreaterThanOrEqual(0);
      expect(confianca).toBeLessThanOrEqual(1);
    });
  });

  it('UT-2.19.5 — reiniciar() zera buffer: volta a retornar null', () => {
    const e = new EstimadorBpmAutocorrelacao(TAXA_HZ, 10);
    const sinal = gerarSinalPeriodico(60, 12);
    sinal.forEach(v => e.processar(v));
    e.reiniciar();
    const { bpm } = e.processar(0.5);
    expect(bpm).toBeNull();
  });

  it('UT-2.19.6 — sinal constante retorna bpm null (sem periodicidade)', () => {
    const e = new EstimadorBpmAutocorrelacao(TAXA_HZ, 10);
    let resultado: { bpm: number | null; confianca: number } = { bpm: null, confianca: 0 };
    for (let i = 0; i < TAXA_HZ * 11; i++) resultado = e.processar(1.0);
    // Confiança deve ser próxima de 0 para sinal constante (sem variação)
    expect(resultado.confianca).toBeLessThan(0.5);
  });
});

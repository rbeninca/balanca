import { describe, it, expect } from 'vitest';
import { EstimadorTaxaAmostragem } from '../../src/analise/EstimadorTaxaAmostragem.js';

/** Marcas em ms inteiros a `hz`, como a ESP: acumula o período real e arredonda. */
function marcas(hz: number, n: number, inicio = 1000): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.round(inicio + i * 1000 / hz));
  return out;
}

describe('EstimadorTaxaAmostragem (Fase 3)', () => {
  it('sem amostras suficientes devolve null', () => {
    const e = new EstimadorTaxaAmostragem();
    for (const t of marcas(80, 8)) e.adicionarTimestamp(t);
    expect(e.obterHz()).toBeNull();
    expect(e.obterHzEstavel()).toBeNull();
    expect(e.consumirMudanca()).toBe(false);
  });

  it('80 Hz com Δt alternando 12/13 ms → ~80 Hz, não 76,9 nem 83,3', () => {
    const e = new EstimadorTaxaAmostragem();
    for (const t of marcas(80, 64)) e.adicionarTimestamp(t);
    expect(e.obterHz()!).toBeGreaterThan(79);
    expect(e.obterHz()!).toBeLessThan(81);
    expect(e.consumirMudanca()).toBe(true);
    expect(e.consumirMudanca()).toBe(false);
  });

  it('a janela desliza: 100 Hz depois de 80 Hz converge para 100', () => {
    const e = new EstimadorTaxaAmostragem(64);
    for (const t of marcas(80, 64)) e.adicionarTimestamp(t);
    const t0 = 1000 + 64 * 12.5;
    for (const t of marcas(100, 64, t0)) e.adicionarTimestamp(t);
    expect(e.obterHz()!).toBeCloseTo(100, 0);
  });

  it('histerese de 1 % com janela cheia: flutuação pequena não muda o valor estável', () => {
    const e = new EstimadorTaxaAmostragem(64);
    for (const t of marcas(80, 64)) e.adicionarTimestamp(t);
    const estavel = e.obterHzEstavel()!;
    e.consumirMudanca();
    // continua a 80,4 Hz (0,5 %): estimativa muda, estável não
    for (const t of marcas(80.4, 64, 1000 + 64 * 12.5)) e.adicionarTimestamp(t);
    expect(e.obterHzEstavel()).toBe(estavel);
    expect(e.consumirMudanca()).toBe(false);
    // 120 Hz: muda, e com a janela toda a 120 Hz o estável fica a menos de 1 % do real
    for (const t of marcas(120, 128, 1000 + 128 * 12.5)) e.adicionarTimestamp(t);
    expect(Math.abs(e.obterHzEstavel()! - 120) / 120).toBeLessThan(0.01);
    expect(e.consumirMudanca()).toBe(true);
    expect(e.obterHz()!).toBeCloseTo(120, 0);
  });

  it('o primeiro valor estável vem já com poucas amostras; depois só com a janela cheia', () => {
    const e = new EstimadorTaxaAmostragem(64);
    for (const t of marcas(80, 12)) e.adicionarTimestamp(t);
    expect(e.obterHzEstavel()).not.toBeNull();     // 12 marcas: primeira estimativa
    e.consumirMudanca();
    // muda para 100 Hz mas a janela ainda não encheu: estável não muda
    for (const t of marcas(100, 40, 1000 + 12 * 12.5)) e.adicionarTimestamp(t);
    expect(e.consumirMudanca()).toBe(false);
    for (const t of marcas(100, 80, 1000 + 12 * 12.5 + 40 * 10)) e.adicionarTimestamp(t);
    expect(e.consumirMudanca()).toBe(true);
    expect(e.obterHzEstavel()!).toBeCloseTo(100, 0);
  });

  it('um salto (pausa) recomeça a janela em vez de baixar a taxa', () => {
    const e = new EstimadorTaxaAmostragem();
    for (const t of marcas(80, 64)) e.adicionarTimestamp(t);
    e.adicionarTimestamp(1000 + 64 * 12.5 + 5000);      // 5 s sem pacotes
    expect(e.obterHz()).toBeNull();                       // janela recomeçou
    for (const t of marcas(80, 20, 1000 + 64 * 12.5 + 5000 + 12.5)) e.adicionarTimestamp(t);
    expect(e.obterHz()!).toBeCloseTo(80, 0);
  });

  it('gap de 40 ms (display da ESP) não recomeça a janela; 5000 ms sim', () => {
    const e = new EstimadorTaxaAmostragem();
    for (const t of marcas(80, 64)) e.adicionarTimestamp(t);
    e.adicionarTimestamp(marcas(80, 64)[63]! + 40);
    expect(e.obterHz()).not.toBeNull();
  });

  it('marca repetida ou no passado (Δt ≤ 0) recomeça a janela', () => {
    const e = new EstimadorTaxaAmostragem();
    for (const t of marcas(80, 64)) e.adicionarTimestamp(t);
    e.adicionarTimestamp(500);
    expect(e.obterHz()).toBeNull();
  });

  it('reiniciar zera tudo', () => {
    const e = new EstimadorTaxaAmostragem();
    for (const t of marcas(80, 64)) e.adicionarTimestamp(t);
    e.reiniciar();
    expect(e.obterHz()).toBeNull();
    expect(e.obterHzEstavel()).toBeNull();
  });
});

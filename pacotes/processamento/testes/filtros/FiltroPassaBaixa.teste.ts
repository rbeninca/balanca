import { describe, it, expect } from 'vitest';
import { FiltroPassaBaixa } from '../../src/filtros/FiltroPassaBaixa.js';

describe('FiltroPassaBaixa', () => {
  it('UT-2.14.1 — entrada constante é preservada em regime', () => {
    const f = new FiltroPassaBaixa(80, 5);
    let saida = 0;
    for (let i = 0; i < 300; i++) saida = f.aplicar(10);
    expect(saida).toBeCloseTo(10, 2);
  });

  it('UT-2.14.2 — primeiro valor parte de 0 e converge', () => {
    const f = new FiltroPassaBaixa(80, 5);
    const r1 = f.aplicar(10);
    expect(r1).toBeGreaterThan(0);
    expect(r1).toBeLessThan(10);
  });

  it('UT-2.14.3 — atenua componente de alta frequência', () => {
    const taxaHz = 80;
    const f = new FiltroPassaBaixa(taxaHz, 5);
    // Sinal a 30 Hz (bem acima de 5 Hz)
    let energia = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const saida = f.aplicar(Math.sin(2 * Math.PI * 30 * i / taxaHz));
      energia += saida * saida;
    }
    expect(energia / n).toBeLessThan(0.05);
  });

  it('UT-2.14.4 — reiniciar() zera estado', () => {
    const f = new FiltroPassaBaixa(80, 5);
    for (let i = 0; i < 100; i++) f.aplicar(100);
    f.reiniciar();
    expect(f.aplicar(0)).toBeCloseTo(0, 5);
  });

  it('UT-2.14.5 — fc alta: resposta rápida (segue degrau em poucas amostras)', () => {
    const f = new FiltroPassaBaixa(80, 20);
    let saida = 0;
    for (let i = 0; i < 20; i++) saida = f.aplicar(10);
    expect(saida).toBeCloseTo(10, 1);
  });
});

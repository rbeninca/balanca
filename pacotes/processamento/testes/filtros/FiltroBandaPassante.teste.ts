import { describe, it, expect } from 'vitest';
import { FiltroBandaPassante } from '../../src/filtros/FiltroBandaPassante.js';

describe('FiltroBandaPassante', () => {
  it('UT-2.15.1 — DC é bloqueado', () => {
    const f = new FiltroBandaPassante(80, 0.5, 5);
    let saida = 0;
    for (let i = 0; i < 500; i++) saida = f.aplicar(10);
    expect(Math.abs(saida)).toBeLessThan(0.01);
  });

  it('UT-2.15.2 — alta frequência é bloqueada', () => {
    const taxaHz = 80;
    const f = new FiltroBandaPassante(taxaHz, 0.5, 5);
    let energia = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const saida = f.aplicar(Math.sin(2 * Math.PI * 30 * i / taxaHz));
      energia += saida * saida;
    }
    expect(energia / n).toBeLessThan(0.02);
  });

  it('UT-2.15.3 — sinal dentro da banda passa com boa amplitude', () => {
    const taxaHz = 80;
    const f = new FiltroBandaPassante(taxaHz, 0.5, 5);
    let energia = 0;
    const n = 800;
    for (let i = 0; i < n; i++) {
      const saida = f.aplicar(Math.sin(2 * Math.PI * 2 * i / taxaHz));
      if (i > 200) energia += saida * saida; // ignora aquecimento
    }
    expect(energia / (n - 200)).toBeGreaterThan(0.2);
  });

  it('UT-2.15.4 — reiniciar() zera ambos os filtros internos', () => {
    const f = new FiltroBandaPassante(80, 0.5, 5);
    for (let i = 0; i < 200; i++) f.aplicar(10);
    f.reiniciar();
    // Após reiniciar, comportamento é igual a uma instância nova
    const fNovo = new FiltroBandaPassante(80, 0.5, 5);
    expect(f.aplicar(10)).toBeCloseTo(fNovo.aplicar(10), 5);
  });
});

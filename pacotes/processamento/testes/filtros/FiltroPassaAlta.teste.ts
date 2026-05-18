import { describe, it, expect } from 'vitest';
import { FiltroPassaAlta } from '../../src/filtros/FiltroPassaAlta.js';

describe('FiltroPassaAlta', () => {
  it('UT-2.13.1 — sinal DC puro é atenuado a zero com entradas constantes', () => {
    const f = new FiltroPassaAlta(80, 0.5);
    let saida = 0;
    for (let i = 0; i < 500; i++) saida = f.aplicar(10);
    expect(Math.abs(saida)).toBeLessThan(0.01);
  });

  it('UT-2.13.2 — primeira amostra tem alpha próximo de 1 para fc baixa', () => {
    const f = new FiltroPassaAlta(80, 0.05);
    const r = f.aplicar(10);
    expect(r).toBeGreaterThan(9.5);
  });

  it('UT-2.13.3 — degrau negativo é tratado simetricamente', () => {
    const f = new FiltroPassaAlta(80, 0.5);
    let saida = 0;
    for (let i = 0; i < 500; i++) saida = f.aplicar(-10);
    expect(Math.abs(saida)).toBeLessThan(0.01);
  });

  it('UT-2.13.4 — reiniciar() zera estado: próxima amostra tratada como primeira', () => {
    const f = new FiltroPassaAlta(80, 0.5);
    for (let i = 0; i < 200; i++) f.aplicar(50);
    f.reiniciar();
    const r = f.aplicar(10);
    expect(r).toBeGreaterThan(9.5);
  });

  it('UT-2.13.5 — variação AC passa com pouca atenuação acima da fc', () => {
    const taxaHz = 80;
    const fc = 0.5;
    const f = new FiltroPassaAlta(taxaHz, fc);
    // Sinal senoidal a 2 Hz (bem acima de 0.5 Hz)
    let energia = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const entrada = Math.sin(2 * Math.PI * 2 * i / taxaHz);
      const saida = f.aplicar(entrada);
      energia += saida * saida;
    }
    // Energia deve ser considerável (não atenuado)
    expect(energia / n).toBeGreaterThan(0.3);
  });
});

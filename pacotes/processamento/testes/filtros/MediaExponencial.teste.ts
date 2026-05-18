import { describe, it, expect } from 'vitest';
import { MediaExponencial } from '../../src/filtros/MediaExponencial.js';

describe('MediaExponencial', () => {
  it('UT-2.8.1 — primeiro valor é retornado sem modificação', () => {
    const ema = new MediaExponencial(0.3);
    expect(ema.aplicar(50)).toBeCloseTo(50);
  });

  it('UT-2.8.2 — alpha=1 equivale a identidade (segue perfeitamente a entrada)', () => {
    const ema = new MediaExponencial(1);
    ema.aplicar(10);
    expect(ema.aplicar(99)).toBeCloseTo(99);
    expect(ema.aplicar(0)).toBeCloseTo(0);
  });

  it('UT-2.8.3 — alpha=0 congela no primeiro valor', () => {
    const ema = new MediaExponencial(0);
    ema.aplicar(42);
    expect(ema.aplicar(100)).toBeCloseTo(42);
    expect(ema.aplicar(200)).toBeCloseTo(42);
  });

  it('UT-2.8.4 — convergência: entrada constante → saída estabiliza no mesmo valor', () => {
    const ema = new MediaExponencial(0.2);
    let saida = 0;
    for (let i = 0; i < 50; i++) saida = ema.aplicar(100);
    expect(saida).toBeCloseTo(100, 3);
  });

  it('UT-2.8.5 — suaviza degrau: resposta intermediária entre início e destino', () => {
    const ema = new MediaExponencial(0.5);
    ema.aplicar(0);          // inicializa em 0
    const r = ema.aplicar(100);
    expect(r).toBeCloseTo(50); // 0.5*100 + 0.5*0 = 50
  });

  it('UT-2.8.6 — reiniciar() zera estado: próximo valor tratado como primeiro', () => {
    const ema = new MediaExponencial(0.3);
    for (let i = 0; i < 20; i++) ema.aplicar(999);
    ema.reiniciar();
    expect(ema.aplicar(7)).toBeCloseTo(7);
  });

  it('UT-2.8.7 — valores negativos processados corretamente', () => {
    const ema = new MediaExponencial(0.5);
    ema.aplicar(-100);
    expect(ema.aplicar(-100)).toBeCloseTo(-100);
  });
});

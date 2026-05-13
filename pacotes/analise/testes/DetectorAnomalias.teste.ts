import { describe, it, expect } from 'vitest';
import { detectarAnomalias } from '../src/DetectorAnomalias.js';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

function leituras(dados: Array<{ t: number; f: number; q: boolean }>): LeituraProcessada[] {
  return dados.map(d => ({
    marcaTemporal: d.t,
    forcaNewton: d.f,
    temperatura: 0,
    emQueima: d.q,
    impulsoAcumuladoNs: 0,
  }));
}

describe('DetectorAnomalias', () => {
  // UT-3.3.1 — queima limpa sem oscilações
  it('queima limpa → nenhuma anomalia', () => {
    const ls = leituras([
      { t: 0, f: 2.0, q: true },
      { t: 100, f: 2.1, q: true },
      { t: 200, f: 1.95, q: true },
      { t: 300, f: 2.05, q: true },
    ]);
    expect(detectarAnomalias(ls)).toEqual([]);
  });

  // UT-3.3.2 — oscilação AVISO (delta = 35%)
  it('oscilação AVISO quando delta = 35% da média', () => {
    // média = 2.0, delta = 0.35*2.0 = 0.70
    const ls = leituras([
      { t: 0,   f: 2.0, q: true },
      { t: 100, f: 2.7, q: true },  // delta 0.7/2.0 = 35%
      { t: 200, f: 2.0, q: true },
    ]);
    const result = detectarAnomalias(ls);
    const osc = result.filter(a => a.tipo === 'OSCILACAO' && a.nivel === 'AVISO');
    expect(osc.length).toBeGreaterThanOrEqual(1);
  });

  // UT-3.3.3 — oscilação CRITICO (delta > 60% da média)
  it('oscilação CRITICO quando delta > 60% da média', () => {
    // [1.0, 2.5, 1.0] → média=1.5, delta 1→2.5 = 1.5/1.5 = 100% → CRITICO
    const ls = leituras([
      { t: 0,   f: 1.0, q: true },
      { t: 100, f: 2.5, q: true },
      { t: 200, f: 1.0, q: true },
    ]);
    const result = detectarAnomalias(ls);
    const crit = result.filter(a => a.tipo === 'OSCILACAO' && a.nivel === 'CRITICO');
    expect(crit.length).toBeGreaterThanOrEqual(1);
  });

  // UT-3.3.4 — CV > 20% → QUEIMA_IRREGULAR
  it('CV > 20% → QUEIMA_IRREGULAR/AVISO', () => {
    // média=2.0, σ=0.5 → CV=0.25
    const ls = leituras([
      { t: 0,   f: 1.5, q: true },
      { t: 100, f: 2.5, q: true },
      { t: 200, f: 1.5, q: true },
      { t: 300, f: 2.5, q: true },
    ]);
    const result = detectarAnomalias(ls);
    const irreg = result.find(a => a.tipo === 'QUEIMA_IRREGULAR');
    expect(irreg).toBeDefined();
    expect(irreg?.nivel).toBe('AVISO');
  });

  // UT-3.3.5 — ignição com atraso > 2s → FALHA_IGNICAO
  it('ignição com atraso > 2s → FALHA_IGNICAO/AVISO', () => {
    const ls = leituras([
      { t: 0,    f: 0.0, q: false },
      { t: 3000, f: 2.0, q: true  },
      { t: 3100, f: 2.0, q: true  },
    ]);
    const result = detectarAnomalias(ls);
    const falha = result.find(a => a.tipo === 'FALHA_IGNICAO');
    expect(falha).toBeDefined();
    expect(falha?.nivel).toBe('AVISO');
    expect(falha?.marcaTemporal).toBe(3000);
  });

  // UT-3.3.6 — ignição normal (< 2s)
  it('ignição normal (1.5s) → sem FALHA_IGNICAO', () => {
    const ls = leituras([
      { t: 0,    f: 0.0, q: false },
      { t: 1500, f: 2.0, q: true  },
      { t: 1600, f: 2.0, q: true  },
    ]);
    const result = detectarAnomalias(ls);
    expect(result.some(a => a.tipo === 'FALHA_IGNICAO')).toBe(false);
  });

  // UT-3.3.7 — múltiplas oscilações
  it('3 oscilações fortes → 3 anomalias OSCILACAO', () => {
    // média = 2.0; cada pico de 2→3.5 é delta=1.5/2.0=75% → CRITICO
    const ls = leituras([
      { t: 0,   f: 2.0, q: true },
      { t: 100, f: 3.5, q: true },
      { t: 200, f: 2.0, q: true },
      { t: 300, f: 3.5, q: true },
      { t: 400, f: 2.0, q: true },
      { t: 500, f: 3.5, q: true },
      { t: 600, f: 2.0, q: true },
    ]);
    const result = detectarAnomalias(ls);
    const oscs = result.filter(a => a.tipo === 'OSCILACAO');
    expect(oscs.length).toBeGreaterThanOrEqual(3);
  });

  // UT-3.3.8 — sem dados de queima
  it('sem leituras em queima → []', () => {
    const ls = leituras([
      { t: 0, f: 0.1, q: false },
      { t: 100, f: 0.2, q: false },
    ]);
    expect(detectarAnomalias(ls)).toEqual([]);
  });
});

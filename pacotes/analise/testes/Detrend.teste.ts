import { describe, it, expect } from 'vitest';
import { removerMedia, removerLinear, aplicarDetrend } from '../src/Detrend.js';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

/** Repouso com deriva a·t + b, queima de 20 N no meio (marcada). */
function sessao(a: number, b: number, n = 400): LeituraProcessada[] {
  return Array.from({ length: n }, (_, i) => {
    const t = 1000 + i * 12.5;
    const queima = i >= 150 && i < 250;
    return { marcaTemporal: t, forcaNewton: a * (i * 12.5 / 1000) + b + (queima ? 20 : 0), temperatura: 0, emQueima: queima, impulsoAcumuladoNs: 0 };
  });
}

describe('Detrend (Fase 11)', () => {
  it('removerMedia tira o offset estimado no repouso; a queima fica intacta', () => {
    const r = removerMedia(sessao(0, 0.3));
    expect(r.b).toBeCloseTo(0.3, 9);
    expect(r.a).toBe(0);
    expect(r.amostrasReferencia).toBe(300);
    expect(r.leituras[10]!.forcaNewton).toBeCloseTo(0, 9);
    expect(r.leituras[200]!.forcaNewton).toBeCloseTo(20, 9);
  });

  it('removerLinear recupera a reta (a·t + b) só pelo repouso — a queima não enviesa', () => {
    const r = removerLinear(sessao(0.02, 0.1));
    expect(r.a).toBeCloseTo(0.02, 9);
    expect(r.b).toBeCloseTo(0.1, 9);
    expect(r.leituras[399]!.forcaNewton).toBeCloseTo(0, 9);
    expect(r.leituras[200]!.forcaNewton).toBeCloseTo(20, 9);
    // sem marcação de queima, a reta seria puxada pela queima: a estimativa piora
    const semMarca = sessao(0.02, 0.1).map(l => ({ ...l, emQueima: false }));
    expect(Math.abs(removerLinear(semMarca).b - 0.1)).toBeGreaterThan(1);
  });

  it('não muta a entrada e preserva os outros campos', () => {
    const entrada = sessao(0.01, 0.2);
    const copia = JSON.stringify(entrada);
    const r = removerLinear(entrada);
    expect(JSON.stringify(entrada)).toBe(copia);
    expect(r.leituras[0]!.marcaTemporal).toBe(entrada[0]!.marcaTemporal);
    expect(r.leituras[200]!.emQueima).toBe(true);
  });

  it('casos degenerados: vazio, uma amostra, todas no mesmo instante', () => {
    expect(removerLinear([]).leituras).toEqual([]);
    const uma: LeituraProcessada[] = [{ marcaTemporal: 5, forcaNewton: 3, temperatura: 0, emQueima: false, impulsoAcumuladoNs: 0 }];
    expect(removerLinear(uma).leituras[0]!.forcaNewton).toBeCloseTo(0, 9);   // cai na média
    const mesmoInstante = [uma[0]!, { ...uma[0]!, forcaNewton: 5 }];
    const r = removerLinear(mesmoInstante);
    expect(r.a).toBe(0); expect(r.b).toBeCloseTo(4, 9);
  });

  it('aplicarDetrend: nenhum devolve cópia igual', () => {
    const e = sessao(0.01, 0.2);
    const r = aplicarDetrend(e, 'nenhum');
    expect(r.leituras).toEqual(e);
    expect(r.leituras).not.toBe(e);
    expect(aplicarDetrend(e, 'linear').a).toBeCloseTo(0.01, 9);
  });
});

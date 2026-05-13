import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

export type PerfilQueima = 'progressivo' | 'regressivo' | 'neutro' | 'neutro-plato' | 'complexo';

const MARGEM = 0.10;

function mediaTerco(leituras: LeituraProcessada[]): number {
  return leituras.reduce((s, l) => s + l.forcaNewton, 0) / leituras.length;
}

export function classificarPerfil(leituras: LeituraProcessada[]): PerfilQueima {
  const emQueima = leituras.filter(l => l.emQueima);
  if (emQueima.length < 9) return 'complexo';

  const n = emQueima.length;
  const t = Math.floor(n / 3);
  const inicio = mediaTerco(emQueima.slice(0, t));
  const meio   = mediaTerco(emQueima.slice(t, 2 * t));
  const fim    = mediaTerco(emQueima.slice(2 * t));

  const maximo = Math.max(inicio, meio, fim);
  const dif = (a: number, b: number) => Math.abs(a - b) / maximo;

  const inicioSimilarFim = dif(inicio, fim) <= MARGEM;
  const meioMaior = meio > inicio * (1 + MARGEM) && meio > fim * (1 + MARGEM);
  const flat = dif(inicio, meio) <= MARGEM && dif(meio, fim) <= MARGEM;

  if (flat) return 'neutro';
  if (inicioSimilarFim && meioMaior) return 'neutro-plato';
  if (fim > inicio * (1 + MARGEM) && fim > meio * (1 + MARGEM)) return 'progressivo';
  if (inicio > fim * (1 + MARGEM) && inicio > meio * (1 + MARGEM)) return 'regressivo';
  return 'complexo';
}

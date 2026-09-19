import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

/**
 * Remoção de deriva offline (Fase 11 do PLANEJAMENTO-PROCESSAMENTO.MD):
 * aplicada na análise, depois da gravação — não amostra a amostra, para não
 * inventar um detrend causal mal definido.
 *
 * A tendência é estimada só nas amostras FORA da queima (emQueima = false):
 * ajustar uma reta sobre a curva de empuxo inteira enviesaria pela própria
 * queima. Se não houver amostras de repouso suficientes, usa todas.
 * Devolve uma cópia: a entrada não é mutada.
 */
export type MetodoDetrend = 'nenhum' | 'media' | 'linear';
export const METODOS_DETREND: readonly MetodoDetrend[] = ['nenhum', 'media', 'linear'];

export interface ResultadoDetrend {
  leituras: LeituraProcessada[];
  /** y = a·t + b (t em segundos desde a primeira amostra); a = 0 para 'media'. */
  a: number;
  b: number;
  /** Quantas amostras serviram de referência (repouso). */
  amostrasReferencia: number;
}

function referencia(leituras: LeituraProcessada[]): LeituraProcessada[] {
  const repouso = leituras.filter(l => !l.emQueima);
  return repouso.length >= 2 ? repouso : leituras;
}

function subtrair(leituras: LeituraProcessada[], a: number, b: number, t0: number): LeituraProcessada[] {
  return leituras.map(l => ({ ...l, forcaNewton: l.forcaNewton - (a * (l.marcaTemporal - t0) / 1000 + b) }));
}

export function removerMedia(leituras: LeituraProcessada[]): ResultadoDetrend {
  if (leituras.length === 0) return { leituras: [], a: 0, b: 0, amostrasReferencia: 0 };
  const ref = referencia(leituras);
  const b = ref.reduce((s, l) => s + l.forcaNewton, 0) / ref.length;
  return { leituras: subtrair(leituras, 0, b, leituras[0]!.marcaTemporal), a: 0, b, amostrasReferencia: ref.length };
}

/** Mínimos quadrados de F = a·t + b sobre as amostras de referência. */
export function removerLinear(leituras: LeituraProcessada[]): ResultadoDetrend {
  if (leituras.length === 0) return { leituras: [], a: 0, b: 0, amostrasReferencia: 0 };
  const t0 = leituras[0]!.marcaTemporal;
  const ref = referencia(leituras);
  if (ref.length < 2) return removerMedia(leituras);
  let st = 0, sf = 0, stt = 0, stf = 0;
  for (const l of ref) {
    const t = (l.marcaTemporal - t0) / 1000;
    st += t; sf += l.forcaNewton; stt += t * t; stf += t * l.forcaNewton;
  }
  const n = ref.length;
  const den = n * stt - st * st;
  if (Math.abs(den) < 1e-12) return removerMedia(leituras);   // todas no mesmo instante
  const a = (n * stf - st * sf) / den;
  const b = (sf - a * st) / n;
  return { leituras: subtrair(leituras, a, b, t0), a, b, amostrasReferencia: n };
}

export function aplicarDetrend(leituras: LeituraProcessada[], metodo: MetodoDetrend): ResultadoDetrend {
  switch (metodo) {
    case 'media':  return removerMedia(leituras);
    case 'linear': return removerLinear(leituras);
    default:       return { leituras: leituras.map(l => ({ ...l })), a: 0, b: 0, amostrasReferencia: 0 };
  }
}

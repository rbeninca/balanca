/**
 * Etapa 2 do pipeline: um só suavizador ativo por vez (Fase 2 do
 * PLANEJAMENTO-PROCESSAMENTO.MD). Butterworth entra na Fase 5.
 */
export type TipoFiltroPrincipal = 'nenhum' | 'mediaMovel' | 'ema' | 'savitzkyGolay' | 'kalman';

export const FILTROS_PRINCIPAIS: readonly TipoFiltroPrincipal[] = ['nenhum', 'mediaMovel', 'ema', 'savitzkyGolay', 'kalman'];

/** Flags antigas (uma por suavizador) que o frontend/gateway anteriores ainda mandam. */
export interface FlagsSuavizadores {
  ativoMediaMovel?: boolean | undefined;
  ativoEMA?:        boolean | undefined;
  ativoSG?:         boolean | undefined;
  ativoKalman?:     boolean | undefined;
}

const FLAG_DE: Record<Exclude<TipoFiltroPrincipal, 'nenhum'>, keyof FlagsSuavizadores> = {
  mediaMovel:    'ativoMediaMovel',
  ema:           'ativoEMA',
  savitzkyGolay: 'ativoSG',
  kalman:        'ativoKalman',
};

export function ehFiltroPrincipal(v: unknown): v is TipoFiltroPrincipal {
  return typeof v === 'string' && (FILTROS_PRINCIPAIS as readonly string[]).includes(v);
}

/**
 * Decide o filtro principal depois de um patch. `filtroPrincipal` explícito
 * vence; senão, as flags antigas: ligar uma escolhe aquele filtro (a última,
 * na ordem média móvel → EMA → SG → Kalman, vence — era a ordem do
 * encadeamento) e desligar a do filtro atual volta a 'nenhum'.
 */
export function resolverFiltroPrincipal(
  atual: TipoFiltroPrincipal,
  patch: FlagsSuavizadores & { filtroPrincipal?: TipoFiltroPrincipal | undefined },
): TipoFiltroPrincipal {
  if (patch.filtroPrincipal != null) return ehFiltroPrincipal(patch.filtroPrincipal) ? patch.filtroPrincipal : atual;
  let escolhido = atual;
  for (const tipo of ['mediaMovel', 'ema', 'savitzkyGolay', 'kalman'] as const) {
    const flag = patch[FLAG_DE[tipo]];
    if (flag === true) escolhido = tipo;
    else if (flag === false && escolhido === tipo) escolhido = 'nenhum';
  }
  return escolhido;
}

/** Flags equivalentes ao filtro escolhido (para clientes e mensagens antigas). */
export function flagsDoFiltroPrincipal(tipo: TipoFiltroPrincipal): { ativoMediaMovel: boolean; ativoEMA: boolean; ativoSG: boolean; ativoKalman: boolean } {
  return {
    ativoMediaMovel: tipo === 'mediaMovel',
    ativoEMA:        tipo === 'ema',
    ativoSG:         tipo === 'savitzkyGolay',
    ativoKalman:     tipo === 'kalman',
  };
}

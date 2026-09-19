import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import { analisarMotor, classificarNAR } from '@balancagfig/analise';

/**
 * O que a lista de sessões mostra de cada uma sem abrir as leituras:
 * contagem e classe NAR do motor. Sem queima detectável, só a contagem.
 */
export interface ResumoSessao {
  totalLeituras: number;
  letraMotor?: string;
  nomeMotor?: string;
}

/** Colunas que GET /sessoes anexa a partir da view resumo_sessoes. */
export interface LinhaResumoApi {
  total_leituras?: number | null;
  forca_media_queima_n?: number | null;
  impulso_queima_ns?: number | null;
}

/**
 * Monta o resumo a partir da listagem da API. Devolve undefined quando a API
 * ainda não envia as colunas (gateway antigo) — aí a tela cai no cálculo
 * pelas leituras.
 */
export function resumoDaListagem(linha: LinhaResumoApi): ResumoSessao | undefined {
  if (typeof linha.total_leituras !== 'number') return undefined;
  const resumo: ResumoSessao = { totalLeituras: linha.total_leituras };
  const impulso = linha.impulso_queima_ns;
  const media   = linha.forca_media_queima_n;
  if (typeof impulso === 'number' && typeof media === 'number' && Number.isFinite(impulso) && Number.isFinite(media)) {
    const nar = classificarNAR(impulso, media);
    resumo.letraMotor = nar.letra;
    resumo.nomeMotor  = nar.nomeComum;
  }
  return resumo;
}

/** Mesmo resumo, calculado pelas leituras (armazenamento local ou gateway antigo). */
export function resumoDeLeituras(leituras: LeituraProcessada[]): ResumoSessao {
  const resumo: ResumoSessao = { totalLeituras: leituras.length };
  if (leituras.length === 0) return resumo;
  try {
    const analise = analisarMotor(leituras, {});
    resumo.letraMotor = analise.letraMotor;
    resumo.nomeMotor  = analise.nomeComum;
  } catch { /* sem queima — só a contagem */ }
  return resumo;
}

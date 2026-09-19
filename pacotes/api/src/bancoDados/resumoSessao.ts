import type { ProvedorSQLite } from './ProvedorSQLite.js';

/**
 * Resumo de uma sessão para a listagem (GET /sessoes): contagem de leituras,
 * força média e impulso da janela de queima. Fica gravado nas colunas
 * total_leituras / forca_media_queima_n / impulso_queima_ns de `sessoes`, para
 * a lista não precisar baixar as leituras de cada sessão.
 *
 * A janela de queima segue a regra do garantirQueima (pacote analise): as
 * leituras marcadas em_queima ou, sem marcação, do primeiro ao último ponto
 * com força >= 5% do pico. A classe NAR é derivada no frontend a partir de
 * impulso e força média (classificarNAR).
 *
 * O app Android (ServidorApi.kt) usa esta mesma consulta.
 */
export const COLUNAS_RESUMO = ['total_leituras', 'forca_media_queima_n', 'impulso_queima_ns'] as const;

/** Recebe o id da sessão 5 vezes (um por `?`). */
export const SQL_RESUMO_SESSAO = `
  WITH
    totais AS (
      SELECT COUNT(*) AS total_leituras, SUM(em_queima <> 0) AS marcadas, MAX(forca_crua) AS pico
      FROM leituras WHERE id_sessao = ?
    ),
    limiar AS (
      SELECT MIN(l.marca_temporal) AS t_ini, MAX(l.marca_temporal) AS t_fim
      FROM leituras l, totais t
      WHERE l.id_sessao = ? AND t.marcadas = 0 AND t.pico > 0 AND l.forca_crua >= t.pico * 0.05
    ),
    janela AS (
      SELECT l.marca_temporal, l.forca_crua
      FROM leituras l, totais t, limiar m
      WHERE l.id_sessao = ?
        AND ((t.marcadas > 0 AND l.em_queima <> 0)
          OR (t.marcadas = 0 AND l.marca_temporal BETWEEN m.t_ini AND m.t_fim))
    ),
    queima AS (
      SELECT AVG(forca_crua) AS forca_media, MIN(marca_temporal) AS t_ini, MAX(marca_temporal) AS t_fim
      FROM janela
    )
  SELECT t.total_leituras,
         q.forca_media AS forca_media_queima_n,
         (SELECT impulso_acumulado_ns FROM leituras
           WHERE id_sessao = ? AND marca_temporal = q.t_fim ORDER BY id DESC LIMIT 1)
       - (SELECT impulso_acumulado_ns FROM leituras
           WHERE id_sessao = ? AND marca_temporal = q.t_ini ORDER BY id ASC LIMIT 1) AS impulso_queima_ns
  FROM totais t, queima q`;

export interface ResumoSessao {
  total_leituras: number;
  forca_media_queima_n: number | null;
  impulso_queima_ns: number | null;
}

export function calcularResumoSessao(db: ProvedorSQLite, idSessao: string): ResumoSessao {
  const r = db.consultarUm<ResumoSessao>(SQL_RESUMO_SESSAO, [idSessao, idSessao, idSessao, idSessao, idSessao]);
  return r ?? { total_leituras: 0, forca_media_queima_n: null, impulso_queima_ns: null };
}

/** Recalcula e grava o resumo; chamar após inserir ou apagar leituras. */
export function gravarResumoSessao(db: ProvedorSQLite, idSessao: string): ResumoSessao {
  const r = calcularResumoSessao(db, idSessao);
  db.executar(
    'UPDATE sessoes SET total_leituras = ?, forca_media_queima_n = ?, impulso_queima_ns = ? WHERE id = ?',
    [r.total_leituras, r.forca_media_queima_n, r.impulso_queima_ns, idSessao],
  );
  return r;
}

/**
 * Preenche o resumo das sessões que ainda não o têm (bancos anteriores a esta
 * coluna, restaurações de backup). Custo único por sessão.
 */
export function garantirResumos<T extends { id: string; total_leituras: number | null }>(db: ProvedorSQLite, sessoes: T[]): T[] {
  return sessoes.map(s => (s.total_leituras == null ? { ...s, ...gravarResumoSessao(db, s.id) } : s));
}

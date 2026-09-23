import type { Banco } from './banco.js';

/**
 * O que o app manda a cada 10 minutos. Tudo além de `serial` e `versao` pode
 * faltar: um box com `su` pendurado manda `placa: null` e `root: false`, e isso
 * não pode impedir a batida de ser aceita.
 */
export interface Batida {
  serial: string;
  versao: string;
  versionCode: number | null;
  instaladoEm: number | null;
  modelo: string | null;
  placa: string | null;
  ip: Record<string, string> | null;
  root: boolean | null;
}

/** Como o box aparece no painel. */
export interface Box {
  serial: string;
  versao: string;
  versionCode: number | null;
  modelo: string | null;
  placa: string | null;
  ip: Record<string, string>;
  root: boolean;
  /** Quando o APK foi instalado, segundo o Android. */
  instaladoEm: number | null;
  /** Quando este box passou para a versão atual — a resposta que interessa. */
  atualizouEm: number | null;
  /** true quando `atualizouEm` é estimativa (primeira batida da versão). */
  atualizouEmEstimado: boolean;
  primeiraBatidaEm: number;
  ultimaBatidaEm: number;
}

interface LinhaBox {
  serial: string;
  versao: string;
  version_code: number | null;
  modelo: string | null;
  placa: string | null;
  ip: string | null;
  root: number | null;
  instalado_em: number | null;
  primeira_batida_em: number;
  ultima_batida_em: number;
  primeira_da_versao: number | null;
}

const COLUNAS_BOX =
  'serial, versao, version_code, modelo, placa, ip, root, instalado_em, primeira_batida_em, ultima_batida_em';

/**
 * Grava a batida: atualiza o retrato do box e engorda o histórico.
 *
 * No `ON CONFLICT` fica tudo o que o box diz de si agora — menos
 * `primeira_batida_em`, que é a data em que ele apareceu no painel e não muda
 * mais. Já `instalado_em` usa `COALESCE`: se o Android não informar o
 * `lastUpdateTime`, o valor que já estava lá vale mais do que nenhum.
 */
export async function registrarBatida(banco: Banco, b: Batida, agora: number): Promise<void> {
  await banco
    .prepare(
      `INSERT INTO boxes (${COLUNAS_BOX})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(serial) DO UPDATE SET
         versao = excluded.versao,
         version_code = excluded.version_code,
         modelo = excluded.modelo,
         placa = excluded.placa,
         ip = excluded.ip,
         root = excluded.root,
         instalado_em = COALESCE(excluded.instalado_em, boxes.instalado_em),
         ultima_batida_em = excluded.ultima_batida_em`,
    )
    .bind(
      b.serial,
      b.versao,
      b.versionCode,
      b.modelo,
      b.placa,
      b.ip === null ? null : JSON.stringify(b.ip),
      b.root === null ? null : b.root ? 1 : 0,
      b.instaladoEm,
      agora,
      agora,
    )
    .run();

  await banco
    .prepare('INSERT INTO batidas (serial, versao, version_code, ip, em) VALUES (?, ?, ?, ?, ?)')
    .bind(b.serial, b.versao, b.versionCode, b.ip === null ? null : JSON.stringify(b.ip), agora)
    .run();
}

/** Todos os boxes, em ordem de serial. */
export async function listarBoxes(banco: Banco): Promise<Box[]> {
  const linhas = await banco
    .prepare(
      `SELECT b.serial, b.versao, b.version_code, b.modelo, b.placa, b.ip, b.root,
              b.instalado_em, b.primeira_batida_em, b.ultima_batida_em,
              (SELECT MIN(em) FROM batidas
                WHERE serial = b.serial AND versao = b.versao) AS primeira_da_versao
         FROM boxes b
        ORDER BY b.serial`,
    )
    .all<LinhaBox>();

  return (linhas.results ?? []).map(paraBox);
}

function paraBox(l: LinhaBox): Box {
  // O caminho preferido é o `lastUpdateTime` do Android: é o instante exato da
  // instalação. Quando ele falta — boxes que instalaram antes de existir
  // painel, ou um Android que não informou —, a primeira batida da versão atual
  // é o mais perto que dá para chegar, e vai marcada como estimativa.
  const exato = l.instalado_em;
  return {
    serial: l.serial,
    versao: l.versao,
    versionCode: l.version_code,
    modelo: l.modelo,
    placa: l.placa,
    ip: lerIp(l.ip),
    root: l.root === 1,
    instaladoEm: exato,
    atualizouEm: exato ?? l.primeira_da_versao,
    atualizouEmEstimado: exato === null && l.primeira_da_versao !== null,
    primeiraBatidaEm: l.primeira_batida_em,
    ultimaBatidaEm: l.ultima_batida_em,
  };
}

function lerIp(texto: string | null): Record<string, string> {
  if (texto === null) return {};
  try {
    const dado: unknown = JSON.parse(texto);
    if (dado === null || typeof dado !== 'object' || Array.isArray(dado)) return {};
    const saida: Record<string, string> = {};
    for (const [chave, valor] of Object.entries(dado as Record<string, unknown>)) {
      if (typeof valor === 'string') saida[chave] = valor;
    }
    return saida;
  } catch {
    return {};
  }
}

/** Versão-teto que os boxes leem; null = sem teto (cada um vai até a mais nova). */
export async function lerAlvo(banco: Banco): Promise<string | null> {
  const linha = await banco.prepare("SELECT valor FROM config WHERE chave = 'alvo'").first<{ valor: string | null }>();
  return linha?.valor ?? null;
}

export async function gravarAlvo(banco: Banco, alvo: string | null): Promise<void> {
  await banco
    .prepare("INSERT INTO config (chave, valor) VALUES ('alvo', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
    .bind(alvo)
    .run();
}

/** Uma versão no formato que o app sabe analisar (`Versao.analisar`). */
export function alvoValido(valor: string): boolean {
  return /^\d+\.\d+(\.\d+)?$/.test(valor);
}

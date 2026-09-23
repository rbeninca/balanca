import { esquecerEsquema } from '../../src/banco.js';
import rotas from '../../src/rotas.js';
import { criarBancoSqlite } from './bancoSqlite.js';
import type { Banco } from '../../src/banco.js';
import type { Ambiente } from '../../src/rotas.js';

export const CHAVE = 'segredo-de-teste';

export interface Bancada {
  banco: Banco;
  /** Chama o Worker como o Cloudflare chamaria: um `Request`, uma `Response`. */
  pedir(caminho: string, opcoes?: RequestInit & { chave?: string | null }): Promise<Response>;
  json<T>(caminho: string, opcoes?: RequestInit & { chave?: string | null }): Promise<T>;
  /** Corpo da última resposta, já lido — para quando o teste quer o texto cru. */
  ler(resposta: Response): Promise<string>;
}

/**
 * Uma bancada por teste: banco novo (SQLite de verdade, em memória) e o
 * esquema esquecido, para cada caso começar do zero.
 *
 * [chaveAmbiente] é o secret `CHAVE` do Worker; `null` quer dizer "publicado
 * sem o secret", que é um caso que precisa ser testado.
 */
export function bancada(chaveAmbiente: string | null = CHAVE): Bancada {
  esquecerEsquema();
  const banco = criarBancoSqlite();
  const ambiente: Ambiente = chaveAmbiente === null ? { DB: banco } : { DB: banco, CHAVE: chaveAmbiente };

  const pedir = async (
    caminho: string,
    opcoes: RequestInit & { chave?: string | null } = {},
  ): Promise<Response> => {
    const { chave, ...resto } = opcoes;
    const cabecalhos = new Headers(resto.headers);
    // `chave: null` no teste quer dizer "não mande chave nenhuma"; ausente quer
    // dizer "manda a de sempre".
    const enviada = chave === undefined ? chaveAmbiente : chave;
    if (enviada !== null) cabecalhos.set('X-Chave', enviada);
    const pedido = new Request(`https://painel.exemplo${caminho}`, { ...resto, headers: cabecalhos });
    return await rotas.fetch(pedido, ambiente);
  };

  return {
    banco,
    pedir,
    json: async <T>(caminho: string, opcoes?: RequestInit & { chave?: string | null }): Promise<T> =>
      (await (await pedir(caminho, opcoes)).json()) as T,
    ler: (resposta: Response) => resposta.text(),
  };
}

/** Uma batida como o app a manda, para os testes que não querem repetir tudo. */
export function batidaCampos(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    serial: 'GFIG-TX9-58EB81E3618C',
    versao: '2.8.501',
    versionCode: 24,
    instaladoEm: 1_700_000_000_000,
    modelo: 'TX9',
    placa: 'gxl',
    ip: { wlan0: '192.168.0.50' },
    root: true,
    ...extra,
  };
}

export function postar(corpo: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  };
}

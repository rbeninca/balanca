import type { Banco } from './banco.js';
import { garantirEsquema } from './banco.js';
import { iguais } from './chave.js';
import { alvoValido, gravarAlvo, lerAlvo, listarBoxes, registrarBatida } from './repositorio.js';
import type { Batida } from './repositorio.js';
import { pagina } from './pagina.js';

export interface Ambiente {
  DB: Banco;
  /** Secret do wrangler (`npx wrangler secret put CHAVE`). Sem ele, nada protegido responde. */
  CHAVE?: string;
}

/*
 * O app dos boxes é HttpURLConnection, e a página é servida daqui mesmo: não há
 * outro domínio envolvido, então não há CORS nem preflight para tratar.
 */
export default {
  async fetch(pedido: Request, ambiente: Ambiente): Promise<Response> {
    const url = new URL(pedido.url);
    const rota = `${pedido.method} ${url.pathname.replace(/\/+$/, '') || '/'}`;

    // Toda rota menos o redirecionamento toca o banco: o esquema entra antes.
    if (rota !== 'GET /') {
      try {
        await garantirEsquema(ambiente.DB);
      } catch (e) {
        return json({ erro: `banco indisponível: ${mensagem(e)}` }, 500);
      }
    }

    switch (rota) {
      case 'POST /batida':
        return await batida(pedido, ambiente);
      case 'GET /alvo':
        return json({ alvo: await lerAlvo(ambiente.DB) });
      case 'POST /alvo':
        return await definirAlvo(pedido, ambiente);
      case 'GET /boxes':
        return await boxes(url, ambiente);
      case 'GET /painel':
        return await painel(url, ambiente);
      case 'GET /':
        // A chave viaja na query para quem chega por um link já pronto.
        return Response.redirect(`${url.origin}/painel${url.search}`, 302);
      default:
        return json({ erro: 'rota desconhecida' }, 404);
    }
  },
};

async function batida(pedido: Request, ambiente: Ambiente): Promise<Response> {
  if (!autorizado(pedido.headers.get('X-Chave'), ambiente)) return naoAutorizado();

  let dados: unknown;
  try {
    dados = await pedido.json();
  } catch {
    return json({ erro: 'corpo não é JSON' }, 400);
  }
  const b = comoBatida(dados);
  if (b === null) return json({ erro: 'batida sem serial ou versão' }, 400);

  await registrarBatida(ambiente.DB, b, Date.now());
  return json({ ok: true });
}

async function definirAlvo(pedido: Request, ambiente: Ambiente): Promise<Response> {
  if (!autorizado(pedido.headers.get('X-Chave'), ambiente)) return naoAutorizado();

  let dados: unknown;
  try {
    dados = await pedido.json();
  } catch {
    return json({ erro: 'corpo não é JSON' }, 400);
  }
  const alvo = (dados as { alvo?: unknown } | null)?.alvo ?? null;
  if (alvo !== null && (typeof alvo !== 'string' || !alvoValido(alvo))) {
    return json({ erro: 'alvo precisa ser uma versão como "2.8.501" ou null' }, 400);
  }

  await gravarAlvo(ambiente.DB, alvo);
  return json({ alvo });
}

async function boxes(url: URL, ambiente: Ambiente): Promise<Response> {
  if (!autorizado(url.searchParams.get('chave'), ambiente)) return naoAutorizado();
  return json({ agora: Date.now(), alvo: await lerAlvo(ambiente.DB), boxes: await listarBoxes(ambiente.DB) });
}

async function painel(url: URL, ambiente: Ambiente): Promise<Response> {
  const chave = url.searchParams.get('chave');
  if (!autorizado(chave, ambiente)) return naoAutorizado();
  return new Response(pagina(chave ?? ''), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * A chave confere? Sem `CHAVE` no ambiente, ninguém entra: um Worker publicado
 * sem o secret não pode virar um painel aberto só porque a configuração faltou.
 */
function autorizado(informada: string | null, ambiente: Ambiente): boolean {
  const esperada = ambiente.CHAVE;
  if (esperada === undefined || esperada === '') return false;
  return informada !== null && iguais(informada, esperada);
}

function naoAutorizado(): Response {
  return json({ erro: 'chave inválida' }, 401);
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * Valida o que veio do box. A porta é pública (só a chave protege), então o
 * corpo não é de confiança: campos fora de forma viram `null` ou recusam a
 * batida, e nada modelado aqui chega ao banco.
 */
function comoBatida(dados: unknown): Batida | null {
  if (dados === null || typeof dados !== 'object' || Array.isArray(dados)) return null;
  const d = dados as Record<string, unknown>;

  const serial = texto(d['serial'], 120);
  const versao = texto(d['versao'], 20);
  if (serial === null || versao === null) return null;
  if (!/^\d+\.\d+(\.\d+)?$/.test(versao)) return null;

  return {
    serial,
    versao,
    versionCode: inteiro(d['versionCode']),
    instaladoEm: inteiro(d['instaladoEm']),
    modelo: texto(d['modelo'], 60),
    placa: texto(d['placa'], 60),
    ip: mapaTexto(d['ip']),
    root: typeof d['root'] === 'boolean' ? d['root'] : null,
  };
}

function texto(valor: unknown, limite: number): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  if (limpo === '' || limpo.length > limite) return null;
  return limpo;
}

function inteiro(valor: unknown): number | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null;
  return Math.trunc(valor);
}

function mapaTexto(valor: unknown): Record<string, string> | null {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const saida: Record<string, string> = {};
  let n = 0;
  for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
    if (n >= 10) break;
    if (typeof v !== 'string') continue;
    saida[chave.slice(0, 20)] = v.slice(0, 45);
    n++;
  }
  return saida;
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

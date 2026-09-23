import type { Banco } from './banco.js';
import { garantirEsquema } from './banco.js';
import { iguais } from './chave.js';
import {
  CAMPOS_FICHA,
  alvoValido,
  gravarAlvo,
  gravarFicha,
  lerAlvo,
  listarBoxes,
  registrarBatida,
  removerBoxSemBatida,
} from './repositorio.js';
import type { Batida, Ficha } from './repositorio.js';
import { pagina } from './pagina.js';
import { paginaInventario } from './inventario.js';

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
      case 'POST /box':
        return await fichaDoBox(pedido, ambiente);
      case 'POST /box/remover':
        return await removerBox(pedido, ambiente);
      case 'GET /boxes':
        return await boxes(url, ambiente);
      case 'GET /painel':
        return await html(pagina, url, ambiente);
      case 'GET /inventario':
        return await html(paginaInventario, url, ambiente);
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

/**
 * O inventário: onde o box está, de quem é e para que serve. É o único dado do
 * painel que não vem do aparelho — vem de quem escreve na página, e por isso
 * chega por uma rota de escrita comum (`X-Chave`), como o alvo.
 */
async function fichaDoBox(pedido: Request, ambiente: Ambiente): Promise<Response> {
  if (!autorizado(pedido.headers.get('X-Chave'), ambiente)) return naoAutorizado();

  let dados: unknown;
  try {
    dados = await pedido.json();
  } catch {
    return json({ erro: 'corpo não é JSON' }, 400);
  }
  if (dados === null || typeof dados !== 'object' || Array.isArray(dados)) {
    return json({ erro: 'corpo não é um objeto' }, 400);
  }
  const d = dados as Record<string, unknown>;

  const serial = texto(d['serial'], 120);
  if (serial === null || !SERIAL_PLAUSIVEL.test(serial)) {
    return json({ erro: 'serial ausente ou fora do formato esperado (letras, números, ponto, hífen)' }, 400);
  }
  const ficha = comoFicha(d);
  if (ficha === null) return json({ erro: `cada campo da ficha é texto de até ${LIMITE_FICHA} caracteres` }, 400);

  await gravarFicha(ambiente.DB, serial, ficha);
  return json({ ok: true, serial, ficha });
}

async function removerBox(pedido: Request, ambiente: Ambiente): Promise<Response> {
  if (!autorizado(pedido.headers.get('X-Chave'), ambiente)) return naoAutorizado();

  let dados: unknown;
  try {
    dados = await pedido.json();
  } catch {
    return json({ erro: 'corpo não é JSON' }, 400);
  }
  const serial = texto((dados as Record<string, unknown> | null)?.['serial'], 120);
  if (serial === null) return json({ erro: 'serial ausente' }, 400);

  const resultado = await removerBoxSemBatida(ambiente.DB, serial);
  if (resultado === 'inexistente') return json({ erro: 'box não está no painel' }, 404);
  if (resultado === 'temBatida') return json({ erro: 'este box já bateu: a ficha dele não sai por aqui' }, 409);
  return json({ ok: true, serial });
}

async function boxes(url: URL, ambiente: Ambiente): Promise<Response> {
  if (!autorizado(url.searchParams.get('chave'), ambiente)) return naoAutorizado();
  return json({ agora: Date.now(), alvo: await lerAlvo(ambiente.DB), boxes: await listarBoxes(ambiente.DB) });
}

/**
 * As duas telas são HTML montado aqui, e as duas se protegem do mesmo jeito: a
 * chave vem na URL porque é ela que o script da página usa para chamar
 * `/boxes`. Sem chave válida nem o HTML sai — a página é tão secreta quanto o
 * link que a carrega.
 */
async function html(desenhar: (chave: string) => string, url: URL, ambiente: Ambiente): Promise<Response> {
  const chave = url.searchParams.get('chave');
  if (!autorizado(chave, ambiente)) return naoAutorizado();
  return new Response(desenhar(chave ?? ''), {
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

/** Quanto cabe em cada campo da ficha. Texto livre, mas não um livro. */
const LIMITE_FICHA = 300;

/**
 * O serial é a chave da ficha, e um serial digitado errado cria uma linha
 * fantasma que só apareceria depois como um box a mais. Não dá para exigir o
 * formato `GFIG-…` (o serial pode ser fixado à mão no box), mas espaço e
 * acento são digitação, não serial.
 */
const SERIAL_PLAUSIVEL = /^[A-Za-z0-9._:-]{3,}$/;

/**
 * Os três campos do inventário, separando "não veio" de "veio vazio": o que não
 * veio no corpo fica como estava, e o que veio em branco é apagado. A página
 * manda sempre os três, então quem preenche pelo painel não sente a diferença.
 */
function comoFicha(d: Record<string, unknown>): Partial<Ficha> | null {
  const ficha: Partial<Ficha> = {};
  for (const campo of CAMPOS_FICHA) {
    const bruto = d[campo];
    if (bruto === undefined) continue;
    if (bruto !== null && typeof bruto !== 'string') return null;
    const limpo = (bruto ?? '').trim();
    if (limpo.length > LIMITE_FICHA) return null;
    ficha[campo] = limpo === '' ? null : limpo;
  }
  return ficha;
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

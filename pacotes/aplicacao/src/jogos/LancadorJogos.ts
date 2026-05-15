import type { JogoCatalogo } from './tipos.js';

export interface OpcaoAbrirJogo {
  baseUrl?: string;
  openFn?: (url: string, target?: string, features?: string) => Window | null;
}

function normalizarBase(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function normalizarCaminho(caminho: string): string {
  return caminho.replace(/^\/+/, '');
}

export function resolverUrlJogo(jogo: JogoCatalogo, baseUrl = '/'): string {
  if (!jogo.arquivoPublico) {
    throw new Error(`Jogo ${jogo.id} não possui arquivo público para modo popup`);
  }
  return `${normalizarBase(baseUrl)}${normalizarCaminho(jogo.arquivoPublico)}`;
}

export function abrirJogo(jogo: JogoCatalogo, opcoes: OpcaoAbrirJogo = {}): Window | null {
  if (!jogo.arquivoPublico) return null;
  const abrir = opcoes.openFn ?? globalThis.open?.bind(globalThis);
  if (!abrir) return null;

  const url = resolverUrlJogo(jogo, opcoes.baseUrl ?? '/');
  const alvo = `balancagfig-jogo-${jogo.id}`;
  const recursos = [
    'popup=yes',
    'width=1366',
    'height=900',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',');

  return abrir(url, alvo, recursos);
}

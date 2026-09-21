// Normalização da importação de sessões (formatos v1 legado e v2 nativo) para o
// modelo interno. Lógica pura, sem DOM nem armazenamento, para ser testável e
// reaproveitável — é aqui que moram os formatos aceitos pela tela de sessões.

import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { MetadadosLocal } from '../armazenamento/ArmazenamentoLocal.js';
import { importarCurvaEmpuxo } from '@balancagfig/relatorio';

/** Formato v2 nativo (exportado pelo próprio BalançaGFIG). */
export interface SessaoExportadaV2 {
  versao: 2;
  nome: string;
  criadoEm: string;
  exportadoEm: string;
  metadados: MetadadosLocal;
  leituras: LeituraProcessada[];
}

/** Formato legado v1 (balancaGFIGv1). */
export interface SessaoExportadaV1 {
  nome: string;
  dadosTabela: Array<{ tempo_esp: number; newtons: number }>;
  metadadosMotor?: {
    diameter?: number | null; length?: number | null;
    propweight?: number | null; totalweight?: number | null;
    manufacturer?: string | null; description?: string | null;
    observations?: string | null;
  } | null;
  burnMetadata?: { burnStartTime?: number; burnEndTime?: number } | null;
}

/** Resultado normalizado, pronto para criar sessão + leituras + metadados. */
export interface SessaoImportada {
  nome: string;
  leituras: LeituraProcessada[];
  meta: MetadadosLocal;
  /** O que o arquivo trouxe de imperfeito e foi descartado na leitura. */
  avisos?: string[];
}

/** Converte o formato legado v1 para o modelo interno (impulso por trapézio). */
export function converterV1(v1: SessaoExportadaV1): SessaoImportada {
  const burn = v1.burnMetadata ?? {};
  const inicio = burn.burnStartTime ?? -1;
  const fim    = burn.burnEndTime   ?? -1;

  let impulsoAcumulado = 0;
  const leituras: LeituraProcessada[] = v1.dadosTabela.map((p, i, arr) => {
    if (i > 0) {
      const dt = p.tempo_esp - arr[i - 1]!.tempo_esp; // segundos → N·s
      impulsoAcumulado += (arr[i - 1]!.newtons + p.newtons) / 2 * dt;
    }
    return {
      marcaTemporal:      Math.round(p.tempo_esp * 1000),
      forcaNewton:        p.newtons,
      temperatura:        0,
      emQueima:           inicio >= 0 ? (i >= inicio && i <= fim) : false,
      impulsoAcumuladoNs: impulsoAcumulado,
    };
  });

  const mm = v1.metadadosMotor;
  const meta: MetadadosLocal = {};
  if (mm?.diameter    != null) meta.diametro_mm       = mm.diameter;
  if (mm?.length      != null) meta.comprimento_mm    = mm.length;
  if (mm?.propweight  != null) meta.massaPropelente_g = mm.propweight  * 1000;
  if (mm?.totalweight != null) meta.massaTotal_g      = mm.totalweight * 1000;
  if (mm?.manufacturer)        meta.fabricante        = mm.manufacturer;
  if (mm?.description)         meta.descricao         = mm.description;
  if (mm?.observations)        meta.observacoes       = mm.observations;

  return { nome: v1.nome, leituras, meta };
}

/**
 * Detecta o formato de um JSON importado e o normaliza. Lança Error com
 * mensagem amigável quando o formato não é reconhecido ou faltam campos.
 */
export function normalizarImportacao(parsed: unknown): SessaoImportada {
  const p = parsed as { versao?: unknown; nome?: unknown; leituras?: unknown; dadosTabela?: unknown; metadados?: MetadadosLocal };

  if (p && p.versao === 2) {
    const v2 = parsed as SessaoExportadaV2;
    if (!v2.nome || !Array.isArray(v2.leituras)) {
      throw new Error('Arquivo JSON inválido (faltam campos obrigatórios).');
    }
    return { nome: v2.nome, leituras: v2.leituras, meta: v2.metadados ?? {} };
  }

  if (p && Array.isArray(p.dadosTabela)) {
    const v1 = parsed as SessaoExportadaV1;
    if (!v1.nome) throw new Error('Arquivo JSON v1 inválido (faltam campos obrigatórios).');
    return converterV1(v1);
  }

  throw new Error('Formato de arquivo não reconhecido. Esperado JSON exportado pelo BalançaGFIG.');
}

/**
 * Importa o texto de um arquivo escolhido pelo usuário, decidindo o formato
 * pelo **conteúdo** — não pela extensão, que cada um salva como quer.
 *
 * Dois formatos entram por aqui:
 * - **JSON** do BalançaGFIG (v2 nativo ou v1 legado), que começa com `{`;
 * - **CURVA EMPUXO** do Prof. Marchi, que é texto com pares tempo/força e
 *   cabeçalho opcional (ver `ImportadorCurvaEmpuxo`).
 *
 * [nomeArquivo] só é usado para batizar a sessão quando o arquivo não traz um
 * `Caso` no cabeçalho — o formato CURVA EMPUXO não exige cabeçalho nenhum.
 */
export function normalizarImportacaoTexto(texto: string, nomeArquivo?: string): SessaoImportada {
  // O BOM que o Windows põe na frente quebraria o `startsWith('{')`.
  const semBom = texto.replace(/^﻿/, '');
  if (semBom.trimStart().startsWith('{')) {
    return normalizarImportacao(JSON.parse(semBom));
  }

  const curva = importarCurvaEmpuxo(semBom);
  const doArquivo = nomeArquivo?.replace(/\.[^.]*$/, '').trim();

  return {
    nome: curva.nome ?? (doArquivo || 'Sessão importada'),
    leituras: curva.leituras,
    // O `Título` do cabeçalho é texto livre ("D0.3, 21/09/2026"): fica como
    // descrição, sem tentar adivinhar que parte é motor e que parte é data.
    meta: curva.titulo ? { descricao: curva.titulo } : {},
    ...(curva.avisos.length > 0 && { avisos: curva.avisos }),
  };
}

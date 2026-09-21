import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { normalizarImportacao, normalizarImportacaoTexto } from '../../src/interface/importacaoSessao.js';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = (nome: string): unknown =>
  JSON.parse(readFileSync(resolve(dir, '../fixtures/importacao/sessoes', nome), 'utf-8'));

/** Invariantes que garantem um payload aceito pela API de leituras. */
function conferirLeiturasValidas(leituras: LeituraProcessada[]): void {
  let anteriorTempo = -Infinity;
  let anteriorImpulso = -Infinity;
  for (const l of leituras) {
    expect(Number.isInteger(l.marcaTemporal)).toBe(true); // API exige inteiro
    expect(Number.isFinite(l.forcaNewton)).toBe(true);
    expect(Number.isFinite(l.impulsoAcumuladoNs)).toBe(true);
    expect(typeof l.emQueima).toBe('boolean');
    expect(l.marcaTemporal).toBeGreaterThanOrEqual(anteriorTempo); // tempo não regride
    expect(l.impulsoAcumuladoNs).toBeGreaterThanOrEqual(anteriorImpulso - 1e-9); // impulso monotônico
    anteriorTempo = l.marcaTemporal;
    anteriorImpulso = l.impulsoAcumuladoNs;
  }
}

describe('normalizarImportacao — v1 legado (arquivos reais)', () => {
  it('converte a captura pequena (692 leituras) sem janela de queima', () => {
    const r = normalizarImportacao(fixture('v1-legado-pequena.json'));
    expect(r.nome).toBe('Fernanda 2.1');
    expect(r.leituras).toHaveLength(692);
    conferirLeiturasValidas(r.leituras);
    // metadados de motor todos nulos → meta vazia; sem burnMetadata → nada em queima
    expect(Object.keys(r.meta)).toHaveLength(0);
    expect(r.leituras.some((l) => l.emQueima)).toBe(false);
  });

  it('converte a captura grande (3239 leituras) preservando o volume e as invariantes', () => {
    const r = normalizarImportacao(fixture('v1-legado-grande.json'));
    expect(r.leituras).toHaveLength(3239);
    conferirLeiturasValidas(r.leituras);
  });
});

describe('normalizarImportacao — v2 nativo', () => {
  it('mantém leituras e metadados do formato v2', () => {
    const r = normalizarImportacao(fixture('v2-nativa.json'));
    expect(r.nome).toBe('Motor Teste V2');
    expect(r.leituras).toHaveLength(12);
    expect(r.meta.diametro_mm).toBe(29);
    expect(r.meta.massaPropelente_g).toBe(12.5);
    expect(r.leituras.some((l) => l.emQueima)).toBe(true);
    conferirLeiturasValidas(r.leituras);
  });
});

describe('normalizarImportacao — formatos inválidos', () => {
  it('rejeita v1 sem nome', () => {
    expect(() => normalizarImportacao(fixture('invalido-v1-sem-nome.json')))
      .toThrow(/v1 inválido/i);
  });

  it('rejeita formato desconhecido', () => {
    expect(() => normalizarImportacao(fixture('invalido-formato-desconhecido.json')))
      .toThrow(/não reconhecido/i);
  });

  it('rejeita v2 sem leituras', () => {
    expect(() => normalizarImportacao({ versao: 2, nome: 'x' }))
      .toThrow(/inválido/i);
  });
});

/**
 * A tela de sessões tem um botão de importar só: o formato é decidido pelo
 * conteúdo do arquivo. Aqui se testa essa decisão, não os formatos em si — o
 * CURVA EMPUXO é testado no pacote `relatorio`, junto do exportador.
 */
describe('normalizarImportacaoTexto — qual formato é o arquivo', () => {
  const CURVA = [
    '#  Saída do balancaGFIG no formato CURVA EMPUXO 2.2',
    '#  Caso   = D0.3',
    '#  Título = D0.3, 21/09/2026',
    '#  t [s]       F [N]',
    '   0.0000000   2.365083E-01',
    '   0.0120000   2.417445E-01',
    '   0.0230000   2.470495E-01',
  ].join('\n');

  it('texto com pares tempo/força entra como curva do Marchi', () => {
    const r = normalizarImportacaoTexto(CURVA);
    expect(r.nome).toBe('D0.3');
    expect(r.meta.descricao).toBe('D0.3, 21/09/2026');
    expect(r.leituras.map(l => l.marcaTemporal)).toEqual([0, 12, 23]);
    conferirLeiturasValidas(r.leituras);
  });

  it('JSON continua entrando pelo caminho de sempre', () => {
    const json = readFileSync(resolve(dir, '../fixtures/importacao/sessoes', 'v2-nativa.json'), 'utf-8');
    const r = normalizarImportacaoTexto(json);
    expect(r.nome).toBe('Motor Teste V2');
    expect(r.leituras).toHaveLength(12);
  });

  it('espaço em branco antes do { não engana a detecção', () => {
    const json = readFileSync(resolve(dir, '../fixtures/importacao/sessoes', 'v2-nativa.json'), 'utf-8');
    expect(normalizarImportacaoTexto(`\n  ${json}`).nome).toBe('Motor Teste V2');
  });

  // Arquivo vindo do Windows.
  it('BOM não atrapalha', () => {
    const json = readFileSync(resolve(dir, '../fixtures/importacao/sessoes', 'v2-nativa.json'), 'utf-8');
    expect(normalizarImportacaoTexto(`﻿${json}`).nome).toBe('Motor Teste V2');
    expect(normalizarImportacaoTexto(`﻿${CURVA}`).nome).toBe('D0.3');
  });

  // O cabeçalho do CURVA EMPUXO é opcional: sem `Caso`, quem batiza é o nome
  // do arquivo — melhor que uma sessão chamada "---".
  it('sem Caso no cabeçalho, o nome vem do arquivo', () => {
    const semCabecalho = '0.000 1.5\n0.012 2.5\n0.024 3.5';
    expect(normalizarImportacaoTexto(semCabecalho, 'D0.3-teste.txt').nome).toBe('D0.3-teste');
    expect(normalizarImportacaoTexto(semCabecalho).nome).toBe('Sessão importada');
  });

  it('o nome do arquivo não atropela o Caso do cabeçalho', () => {
    expect(normalizarImportacaoTexto(CURVA, 'qualquer-coisa.txt').nome).toBe('D0.3');
  });

  it('curva sem cabeçalho não ganha descrição inventada', () => {
    expect(normalizarImportacaoTexto('0 1\n0.01 2', 'x.txt').meta).toEqual({});
  });

  it('linhas descartadas viram aviso para a tela mostrar', () => {
    const r = normalizarImportacaoTexto('0.000 1\nlixo\n0.012 2', 'x.txt');
    expect(r.avisos?.join(' ')).toContain('1 linha(s)');
  });

  it('arquivo sem curva nenhuma é recusado com mensagem que explica o que se esperava', () => {
    expect(() => normalizarImportacaoTexto('relatório de outra coisa', 'x.txt'))
      .toThrow(/CURVA EMPUXO/);
  });
});

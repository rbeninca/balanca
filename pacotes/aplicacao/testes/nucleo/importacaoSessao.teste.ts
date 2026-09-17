import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { normalizarImportacao } from '../../src/interface/importacaoSessao.js';
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

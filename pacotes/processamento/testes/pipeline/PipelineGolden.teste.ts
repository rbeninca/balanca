import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PipelineProcessamento, type PipelinePatch } from '../../src/pipeline/PipelineProcessamento.js';
import { gerarSinalFixture } from '../fixtures/sinalFixture.js';

/**
 * Golden tests (Fase 0 do PLANEJAMENTO-PROCESSAMENTO.MD): a saída do pipeline
 * para o sinal fixo, em várias configurações, fica gravada em JSON. Qualquer
 * refatoração que mude um número quebra aqui. Os mesmos arquivos alimentam o
 * teste de equivalência do Kotlin (PipelineGoldenTest.kt).
 *
 * Para regravar (só quando a mudança de comportamento for intencional):
 *   GERAR_FIXTURES=1 npx vitest run testes/pipeline/PipelineGolden.teste.ts
 */
const PASTA = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'pipeline');

const configBase = {
  limiarZonaMortaN: 0.05,
  janelaMediaMovel: 5,
  fatorCalibracao:  1.0,
  deslocamentoTara: 0,
  tempoMinFimMs:    100,
  taxaAmostragemHz: 80,
};

/** Cada caso é um patch aplicado sobre configBase; nomes viram os arquivos JSON. */
export const CASOS: Record<string, PipelinePatch> = {
  'tudo-desligado':        {},
  'zona-morta-detector':   { ativoZonaMorta: true, ativoDetectorQueima: true },
  'media-movel-5':         { ativoZonaMorta: true, ativoDetectorQueima: true, ativoMediaMovel: true },
  'mediana-5-notch-60':    { ativoMediana: true, janelaMediana: 5, ativoNotch: true, freqNotchHz: 60, qNotch: 30 },
  'hampel-7':              { ativoHampel: true, janelaHampel: 7, limiarHampelSigma: 3, ativoDetectorQueima: true },
  'hampel-mediana-notch':  { ativoHampel: true, ativoMediana: true, janelaMediana: 3, ativoNotch: true },
  'ema-0.2':               { ativoZonaMorta: true, ativoEMA: true, alphaEMA: 0.2 },
  'sg-7':                  { ativoSG: true, janelaSG: 7, ativoDetectorQueima: true },
  'kalman':                { ativoKalman: true, kalmanQ: 0.01, kalmanR: 1.0 },
  'butterworth-10':        { filtroPrincipal: 'butterworth', frequenciaCorteHz: 10, ativoDetectorQueima: true },
  'impulso-do-filtrado':   { ativoZonaMorta: true, filtroPrincipal: 'ema', alphaEMA: 0.3, fonteCalculoImpulso: 'filtrado' },
  // Fase 2: flags antigas viram um só filtro principal (a última na ordem MM→EMA→SG→Kalman vence)
  'flags-sg-e-kalman-vira-kalman': { ativoSG: true, ativoKalman: true },
  'filtro-principal-sg-vence-flag': { filtroPrincipal: 'savitzkyGolay', ativoKalman: true, ativoDetectorQueima: true },
  'tudo-ligado':           { ativoHampel: true, ativoZonaMorta: true, ativoDetectorQueima: true, ativoMediana: true, ativoNotch: true,
                             ativoMediaMovel: true, ativoEMA: true, ativoSG: true, ativoKalman: true },   // principal = kalman
};

interface Amostra { t: number; f: number }
interface Saida { forcaNewton: number; emQueima: boolean; impulsoAcumuladoNs: number; forcaNewtonCrua: number; forcaNewtonBruta: number | null }
interface Fixture { descricao: string; configBase: typeof configBase; patch: PipelinePatch; entrada: Amostra[]; saida: Saida[] }

function executar(patch: PipelinePatch): Fixture {
  const p = new PipelineProcessamento({ ...configBase });
  p.atualizarConfig(patch);
  const pacotes = gerarSinalFixture();
  const saida = pacotes.map(pk => {
    const l = p.processar(pk);
    return { forcaNewton: l.forcaNewton, emQueima: l.emQueima, impulsoAcumuladoNs: l.impulsoAcumuladoNs,
             forcaNewtonCrua: l.forcaNewtonCrua!, forcaNewtonBruta: l.forcaNewtonBruta ?? null };
  });
  return {
    descricao: 'Saída do pipeline TS (v2.3.0) para gerarSinalFixture(); gerado por PipelineGolden.teste.ts',
    configBase, patch, entrada: pacotes.map(pk => ({ t: pk.marcaTemporal, f: pk.forcaNewtons })), saida,
  };
}

describe('Pipeline — golden files (Fase 0)', () => {
  const gerar = process.env['GERAR_FIXTURES'] === '1';
  mkdirSync(PASTA, { recursive: true });

  for (const [nome, patch] of Object.entries(CASOS)) {
    it(`${nome}: saída idêntica à gravada`, () => {
      const arquivo = join(PASTA, `${nome}.json`);
      const atual = executar(patch);
      if (gerar || !existsSync(arquivo)) {
        writeFileSync(arquivo, JSON.stringify(atual, null, 1) + '\n');
        return;
      }
      const gravado = JSON.parse(readFileSync(arquivo, 'utf-8')) as Fixture;
      expect(atual.entrada).toEqual(gravado.entrada);
      expect(atual.saida.length).toBe(gravado.saida.length);
      for (let i = 0; i < atual.saida.length; i++) {
        const a = atual.saida[i]!, g = gravado.saida[i]!;
        expect(a.emQueima, `emQueima[${i}]`).toBe(g.emQueima);
        expect(a.forcaNewton, `forcaNewton[${i}]`).toBeCloseTo(g.forcaNewton, 12);
        expect(a.impulsoAcumuladoNs, `impulso[${i}]`).toBeCloseTo(g.impulsoAcumuladoNs, 12);
        expect(a.forcaNewtonCrua, `crua[${i}]`).toBeCloseTo(g.forcaNewtonCrua, 12);
        expect(a.forcaNewtonBruta, `bruta[${i}]`).toEqual(g.forcaNewtonBruta);
      }
    });
  }

  it('o sinal fixture cobre repouso, queima, spike e deriva', () => {
    const s = gerarSinalFixture();
    expect(s).toHaveLength(400);
    expect(Math.abs(s[50]!.forcaNewtons)).toBeLessThan(0.02);
    expect(s[150]!.forcaNewtons).toBeGreaterThan(19);
    expect(s[180]!.forcaNewtons).toBeGreaterThan(500);
    expect(s[399]!.forcaNewtons).toBeGreaterThan(0.05);
    expect(s[1]!.marcaTemporal - s[0]!.marcaTemporal).toBe(12);
    expect(s[2]!.marcaTemporal - s[1]!.marcaTemporal).toBe(13);
  });
});

import { describe, it, expect } from 'vitest';
import { exportarJSON } from '../src/exportadores/ExportadorJSON.js';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { ResultadoAnalise } from '@balancagfig/analise';

const analiseFernanda: ResultadoAnalise = {
  impulsoTotal_Ns: 2.94,
  forcaPico_N: 3.0,
  forcaMedia_N: 1.73,
  forcaRms_N: 1.8,
  coefVariacao: 0.104,
  duracaoQueima_s: 1.7,
  t10_s: 0.07,
  t90_s: 0.35,
  tempoSubida_s: 0.28,
  impulsoEspecifico_s: undefined,
  letraMotor: 'B',
  nomeComum: 'B1.7',
  perfilQueima: 'neutro-plato',
  anomalias: [],
};

const leituras: LeituraProcessada[] = [
  { marcaTemporal: 0, forcaNewton: 1.0, temperatura: 0, emQueima: false, impulsoAcumuladoNs: 0 },
  { marcaTemporal: 100, forcaNewton: 2.0, temperatura: 0, emQueima: true, impulsoAcumuladoNs: 0.15 },
];

describe('ExportadorJSON', () => {
  // UT-4.2.1
  it('JSON válido parseável', () => {
    const json = exportarJSON(leituras, analiseFernanda);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  // UT-4.2.2
  it('campo versaoFormato = "2.0"', () => {
    const obj = JSON.parse(exportarJSON(leituras, analiseFernanda));
    expect(obj.versaoFormato).toBe('2.0');
  });

  // UT-4.2.3
  it('analise.nomeComum = "B1.7"', () => {
    const obj = JSON.parse(exportarJSON(leituras, analiseFernanda));
    expect(obj.analise.nomeComum).toBe('B1.7');
  });

  // UT-4.2.4
  it('analise.perfilQueima = "neutro-plato"', () => {
    const obj = JSON.parse(exportarJSON(leituras, analiseFernanda));
    expect(obj.analise.perfilQueima).toBe('neutro-plato');
  });

  // UT-4.2.5
  it('leituras compactadas têm campos t, f, tc, q, i', () => {
    const obj = JSON.parse(exportarJSON(leituras, analiseFernanda));
    const l = obj.leituras[0];
    expect(l).toHaveProperty('t');
    expect(l).toHaveProperty('f');
    expect(l).toHaveProperty('tc');
    expect(l).toHaveProperty('q');
    expect(l).toHaveProperty('i');
  });

  // UT-4.2.6
  it('impulsoEspecifico_s = null quando não calculado', () => {
    const obj = JSON.parse(exportarJSON(leituras, analiseFernanda));
    expect(obj.analise.impulsoEspecifico_s).toBeNull();
  });

  // UT-4.2.7
  it('anomalias incluídas como array', () => {
    const obj = JSON.parse(exportarJSON(leituras, analiseFernanda));
    expect(Array.isArray(obj.analise.anomalias)).toBe(true);
  });

  // UT-4.2.8
  it('JSON indentado com 2 espaços', () => {
    const json = exportarJSON(leituras, analiseFernanda);
    expect(json).toContain('  "versaoFormato"');
  });
});

import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import { classificarNAR } from './ClassificadorNAR.js';
import { classificarPerfil, type PerfilQueima } from './ClassificadorPerfil.js';
import { detectarAnomalias, type Anomalia } from './DetectorAnomalias.js';

export interface MetadadosMotor {
  massaPropelente_g?: number;
}

export interface ResultadoAnalise {
  impulsoTotal_Ns:    number;
  forcaPico_N:        number;
  forcaMedia_N:       number;
  forcaRms_N:         number;
  coefVariacao:       number;
  duracaoQueima_s:    number;
  t10_s:              number;
  t90_s:              number;
  tempoSubida_s:      number;
  impulsoEspecifico_s?: number;
  letraMotor:         string;
  nomeComum:          string;
  perfilQueima:       PerfilQueima;
  anomalias:          Anomalia[];
}

const G0 = 9.80665;

export function analisarMotor(
  leituras: LeituraProcessada[],
  metadados?: MetadadosMotor,
): ResultadoAnalise {
  const emQueima = leituras.filter(l => l.emQueima);
  if (emQueima.length === 0) throw new Error('Nenhuma leitura com emQueima=true');

  const forcas = emQueima.map(l => l.forcaNewton);
  const n = forcas.length;

  const forcaPico = Math.max(...forcas);
  const forcaMedia = forcas.reduce((s, v) => s + v, 0) / n;
  const forcaRms = Math.sqrt(forcas.reduce((s, v) => s + v * v, 0) / n);
  const variancia = forcas.reduce((s, v) => s + (v - forcaMedia) ** 2, 0) / n;
  const coefVariacao = Math.sqrt(variancia) / forcaMedia;

  const impulsoTotal = emQueima[emQueima.length - 1]!.impulsoAcumuladoNs;
  const tInicio = emQueima[0]!.marcaTemporal;
  const tFim    = emQueima[emQueima.length - 1]!.marcaTemporal;
  const duracaoQueima = (tFim - tInicio) / 1000;

  // t10 e t90 — tempo em que o impulso atinge 10% e 90% do total
  const i10 = impulsoTotal * 0.10;
  const i90 = impulsoTotal * 0.90;
  const t10 = (emQueima.find(l => l.impulsoAcumuladoNs >= i10)?.marcaTemporal ?? tInicio) / 1000;
  const t90 = (emQueima.find(l => l.impulsoAcumuladoNs >= i90)?.marcaTemporal ?? tFim) / 1000;
  const tempoSubida = t90 - t10;

  const { letra: letraMotor, nomeComum } = classificarNAR(impulsoTotal, forcaMedia);
  const perfilQueima = classificarPerfil(leituras);
  const anomalias = detectarAnomalias(leituras);

  const impulsoEspecifico = metadados?.massaPropelente_g != null
    ? impulsoTotal / ((metadados.massaPropelente_g / 1000) * G0)
    : undefined;

  return {
    impulsoTotal_Ns: impulsoTotal,
    forcaPico_N: forcaPico,
    forcaMedia_N: forcaMedia,
    forcaRms_N: forcaRms,
    coefVariacao,
    duracaoQueima_s: duracaoQueima,
    t10_s: t10,
    t90_s: t90,
    tempoSubida_s: tempoSubida,
    impulsoEspecifico_s: impulsoEspecifico,
    letraMotor,
    nomeComum,
    perfilQueima,
    anomalias,
  };
}

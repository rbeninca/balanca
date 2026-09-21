import type { LeituraProcessada } from '@balancagfig/processamento';
import type { ResultadoAnalise } from '@balancagfig/analise';
import { inicioDaGravacao } from './tempo.js';

export interface MetadadosCSV {
  nomeSessao?: string;
  nomeMotor?: string;
  data?: string;
  isp?: number;
}

export interface OpcoesCSV {
  separador?: string;
}

const N_PARA_GF  = 101.972;
const N_PARA_KGF = 0.101972;

export function exportarCSV(
  leituras: LeituraProcessada[],
  analise?: ResultadoAnalise,
  meta?: MetadadosCSV,
  opcoes?: OpcoesCSV,
): string {
  const sep = opcoes?.separador ?? ';';
  const linhas: string[] = [];

  linhas.push(`# Nome${sep}${meta?.nomeSessao ?? '---'}`);
  linhas.push(`# Motor${sep}${meta?.nomeMotor ?? analise?.nomeComum ?? '---'}`);
  linhas.push(`# Data${sep}${meta?.data ?? '---'}`);
  // O arquivo se explica: sem isto, quem abre a planilha não tem como saber
  // que a primeira coluna deixou de ser o millis() do ESP.
  linhas.push(`# Tempo${sep}relativo ao início da gravação (s)`);

  const isp = meta?.isp ?? analise?.impulsoEspecifico_s;
  if (isp != null) {
    linhas.push(`# Isp (s)${sep}${isp.toFixed(2)}`);
  }

  linhas.push(`tempoRelativo_s${sep}forcaNewton_N${sep}forcaGf${sep}forcaKgf${sep}temperatura_C${sep}emQueima${sep}impulsoAcumulado_Ns`);

  const t0 = inicioDaGravacao(leituras);

  for (const l of leituras) {
    const gf   = (l.forcaNewton * N_PARA_GF).toFixed(2);
    const kgf  = (l.forcaNewton * N_PARA_KGF).toFixed(5);
    const eq   = l.emQueima ? '1' : '0';
    // Segundos, com 3 casas: o `marcaTemporal` é um uint32 de milissegundos, então
    // 3 casas representam a amostra exatamente, sem perder nem inventar resolução.
    const t    = ((l.marcaTemporal - t0) / 1000).toFixed(3);
    linhas.push(`${t}${sep}${l.forcaNewton}${sep}${gf}${sep}${kgf}${sep}${l.temperatura}${sep}${eq}${sep}${l.impulsoAcumuladoNs}`);
  }

  return linhas.join('\n');
}

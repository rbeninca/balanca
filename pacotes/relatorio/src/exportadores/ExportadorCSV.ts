import type { LeituraProcessada } from '@balancagfig/processamento';
import type { ResultadoAnalise } from '@balancagfig/analise';

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

  const isp = meta?.isp ?? analise?.impulsoEspecifico_s;
  if (isp != null) {
    linhas.push(`# Isp (s)${sep}${isp.toFixed(2)}`);
  }

  linhas.push(`marcaTemporal_ms${sep}forcaNewton_N${sep}forcaGf${sep}forcaKgf${sep}temperatura_C${sep}emQueima${sep}impulsoAcumulado_Ns`);

  for (const l of leituras) {
    const gf   = (l.forcaNewton * N_PARA_GF).toFixed(2);
    const kgf  = (l.forcaNewton * N_PARA_KGF).toFixed(5);
    const eq   = l.emQueima ? '1' : '0';
    linhas.push(`${l.marcaTemporal}${sep}${l.forcaNewton}${sep}${gf}${sep}${kgf}${sep}${l.temperatura}${sep}${eq}${sep}${l.impulsoAcumuladoNs}`);
  }

  return linhas.join('\n');
}

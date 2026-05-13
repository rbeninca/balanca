import type { LeituraProcessada } from '@balancagfig/processamento';
import type { ResultadoAnalise } from '@balancagfig/analise';

export interface MetadadosENG {
  diametroMm?: number;
  comprimentoMm?: number;
  massaPropelente_g?: number;
  massaTotal_g?: number;
  fabricante?: string;
}

export function exportarENG(
  leituras: LeituraProcessada[],
  analise: ResultadoAnalise,
  meta?: MetadadosENG,
): string {
  const linhas: string[] = [];
  const fabricante = meta?.fabricante ?? 'GFIG';
  const nomeMotor  = analise.nomeComum;
  const diametro   = (meta?.diametroMm ?? 0).toFixed(0);
  const comprimento = (meta?.comprimentoMm ?? 0).toFixed(0);
  const massaProp  = ((meta?.massaPropelente_g ?? 0) / 1000).toFixed(3);
  const massaTotal = ((meta?.massaTotal_g ?? 0) / 1000).toFixed(3);

  linhas.push(`; Gerado por balancaGFIG2`);
  linhas.push(`; Motor: ${nomeMotor}`);
  linhas.push(`; Impulso total: ${analise.impulsoTotal_Ns.toFixed(3)} N·s`);
  linhas.push(`; Forca maxima: ${analise.forcaPico_N.toFixed(3)} N`);
  linhas.push(`; Duracao: ${analise.duracaoQueima_s.toFixed(3)} s`);

  if (analise.impulsoEspecifico_s != null) {
    linhas.push(`; Isp: ${analise.impulsoEspecifico_s.toFixed(2)} s`);
  } else {
    linhas.push(`; Isp: massa propelente nao informada`);
  }

  // Linha de cabeçalho do motor: nome diametro comprimento atraso massaProp massaTotal fabricante
  linhas.push(`${nomeMotor} ${diametro} ${comprimento} 0 ${massaProp} ${massaTotal} ${fabricante}`);

  const emQueima = leituras.filter(l => l.emQueima);
  if (emQueima.length === 0) {
    linhas.push(`   0.0000 0.000`);
    linhas.push(`;`);
    return linhas.join('\n');
  }

  // Recua tZero em 1ms para que o primeiro ponto de queima fique em t=0.001
  const tZero = emQueima[0]!.marcaTemporal - 1;

  // Ponto pré-ignição com força zero
  linhas.push(`   0.0000 0.000`);

  for (const l of emQueima) {
    const t = ((l.marcaTemporal - tZero) / 1000).toFixed(4);
    const f = l.forcaNewton.toFixed(3);
    linhas.push(`   ${t} ${f}`);
  }

  // Ponto final com força zero
  const tFinal = ((emQueima[emQueima.length - 1]!.marcaTemporal - tZero) / 1000 + 0.001).toFixed(4);
  linhas.push(`   ${tFinal} 0.000`);

  linhas.push(`;`);

  return linhas.join('\n');
}

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
  /**
   * Separador decimal: `.` (padrão) ou `,`.
   *
   * Existe porque a planilha em português lê `.` como separador de **milhar**:
   * `0.012` vira doze, e o número aparece mil vezes maior na tela. Não é erro
   * de quem abre — é o arquivo misturando convenções.
   *
   * A regra que evita isso é parear: campo com `;` pede decimal com `,`; campo
   * com `,` pede decimal com `.`. Nunca os dois iguais.
   */
  decimal?: ',' | '.';
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
  const dec = opcoes?.decimal ?? '.';
  /** Troca o ponto decimal pelo separador pedido, sem tocar no resto. */
  const num = (v: number | string): string =>
    dec === '.' ? String(v) : String(v).replace('.', ',');
  const linhas: string[] = [];

  linhas.push(`# Nome${sep}${meta?.nomeSessao ?? '---'}`);
  linhas.push(`# Motor${sep}${meta?.nomeMotor ?? analise?.nomeComum ?? '---'}`);
  linhas.push(`# Data${sep}${meta?.data ?? '---'}`);
  // O arquivo se explica: sem isto, quem abre a planilha não tem como saber
  // que a primeira coluna deixou de ser o millis() do ESP.
  linhas.push(`# Tempo${sep}relativo ao início da gravação (s)`);

  const isp = meta?.isp ?? analise?.impulsoEspecifico_s;
  if (isp != null) {
    linhas.push(`# Isp (s)${sep}${num(isp.toFixed(2))}`);
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
    // Temperatura ausente sai como célula VAZIA, nunca como 0 nem como a
    // string "undefined" (que era o que a interpolação produzia antes).
    //
    // Nada mede temperatura hoje: o firmware não tem sensor e o pipeline
    // preenche o campo com um 0 de espaço reservado. Escrever esse 0 na
    // planilha afirmaria uma medição que ninguém fez — e é o mesmo vazio que a
    // rota da API já usa no CSV dela.
    //
    // ATENÇÃO, sentinela ambíguo: `0` significa "sem dado" aqui. No dia em que
    // entrar um sensor capaz de marcar 0 °C de verdade (banho de gelo), esta
    // linha precisa mudar junto com o `temperatura: 0` do PipelineProcessamento,
    // que é a raiz da ambiguidade.
    const temp = l.temperatura ? l.temperatura : '';
    linhas.push(
      `${num(t)}${sep}${num(l.forcaNewton)}${sep}${num(gf)}${sep}${num(kgf)}${sep}` +
      `${num(temp)}${sep}${eq}${sep}${num(l.impulsoAcumuladoNs)}`,
    );
  }

  return linhas.join('\n');
}

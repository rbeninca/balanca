import type { LeituraProcessada } from '@balancagfig/processamento';
import { inicioDaGravacao } from './tempo.js';

export interface MetadadosCurvaEmpuxo {
  /** Vira o campo `Caso` do cabeçalho. */
  nomeSessao?: string;
  /** Entra no `Título`, junto da data. */
  nomeMotor?: string;
  data?: string;
}

/**
 * Formato **CURVA EMPUXO** — o do programa do Prof. Carlos Marchi (UFPR), que o
 * laboratório usa como referência.
 *
 * Não confundir com o `.eng`: são convenções diferentes, e em pontos opostos.
 * O `.eng` (RASP) exige a primeira amostra em `t > 0`, marca comentário com `;`
 * e escreve o empuxo em decimal. O CURVA EMPUXO começa em `t = 0.0000000`,
 * marca comentário com `#` e escreve o empuxo em notação científica.
 *
 * Sai a gravação inteira, sem recorte de queima — é a curva medida, como no
 * arquivo de referência, que abre em `2.101074E-01` (repouso) e não em zero.
 * O empuxo também não é limitado a zero: perto do repouso ele oscila em torno
 * dele, e cortar isso apagaria informação que a análise a montante usa.
 *
 * O tempo é relativo ao início da gravação, como no CSV.
 */
export function exportarCurvaEmpuxo(
  leituras: LeituraProcessada[],
  meta?: MetadadosCurvaEmpuxo,
): string {
  const linhas: string[] = [];

  // O cabeçalho diz o formato, mas não que a saída é do programa dele — não é.
  linhas.push('#  Saída do balancaGFIG no formato CURVA EMPUXO 2.2');
  linhas.push(`#  Caso   = ${meta?.nomeSessao ?? '---'}`);
  const titulo = [meta?.nomeMotor, meta?.data].filter(Boolean).join(', ');
  linhas.push(`#  Título = ${titulo || '---'}`);
  linhas.push('#  t [s]       F [N]');

  const t0 = inicioDaGravacao(leituras);

  for (const l of leituras) {
    const t = ((l.marcaTemporal - t0) / 1000).toFixed(7);
    linhas.push(`   ${t}   ${cientifica(l.forcaNewton)}`);
  }

  return linhas.join('\n');
}

/**
 * Notação científica como o CURVA EMPUXO escreve: `E` maiúsculo, expoente com
 * sinal e sempre dois dígitos — `2.101074E-01`.
 *
 * O `toExponential` do JS não serve direto: devolve `2.101074e-1`, com `e`
 * minúsculo e o expoente sem o zero à esquerda.
 */
function cientifica(v: number): string {
  const [mantissa, expoente] = v.toExponential(6).split('e') as [string, string];
  const sinal = expoente.startsWith('-') ? '-' : '+';
  const digitos = expoente.replace(/^[+-]/, '').padStart(2, '0');
  return `${mantissa}E${sinal}${digitos}`;
}

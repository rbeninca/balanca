import type { LeituraProcessada } from '@balancagfig/processamento';

/**
 * Origem da coluna de tempo nos arquivos exportados: o começo da gravação.
 *
 * O `marcaTemporal` que sai do pipeline é o `millis()` do ESP — milissegundos
 * desde o boot do microcontrolador, **não** desde o começo da sessão
 * (`processamento/src/tipos.ts`). Exportar aquele valor cru deixava o arquivo
 * começando em algo como 7.200.000, duas horas de uptime, e duas sessões
 * ficavam com bases de tempo sem relação — impossíveis de sobrepor numa
 * planilha.
 *
 * Pelo mínimo, e não pelo primeiro da lista: uma sessão cujas leituras cheguem
 * fora de ordem não gera tempo negativo.
 *
 * O armazenamento continua guardando o valor absoluto, de propósito: é ele que
 * faz a ordenação e a duração da sessão funcionarem, e as telas já re-baseiam
 * por conta própria. Isto aqui é só para o que sai no arquivo.
 */
export function inicioDaGravacao(leituras: LeituraProcessada[]): number {
  let t0 = Number.POSITIVE_INFINITY;
  for (const l of leituras) if (l.marcaTemporal < t0) t0 = l.marcaTemporal;
  return Number.isFinite(t0) ? t0 : 0;
}

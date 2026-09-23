import { COLUNAS_NOVAS, ESQUEMA } from './bancoDados/esquema.js';

/**
 * O pedaço do D1 que este Worker usa.
 *
 * A interface é declarada aqui, e não herdada de `D1Database`, por dois
 * motivos: os testes rodam sem o runtime do Cloudflare (um banco de verdade, em
 * SQLite, atrás desta mesma forma) e a superfície fica pequena o bastante para
 * caber na cabeça.
 */
export interface ComandoPreparado {
  bind(...valores: unknown[]): ComandoPreparado;
  run(): Promise<unknown>;
  all<T>(): Promise<{ results?: T[] }>;
  first<T>(): Promise<T | null>;
}

export interface Banco {
  prepare(sql: string): ComandoPreparado;
}

/**
 * Uma vez por isolate, não uma vez por requisição: `env.DB` chega novo a cada
 * `fetch`, então não dá para pendurar isto no objeto do banco. O estado de
 * módulo sobrevive entre requisições enquanto o isolate durar, que é o que
 * interessa — a primeira requisição de cada isolate paga as quatro instruções
 * de DDL, as outras não pagam nada.
 */
let esquemaPronto = false;

/**
 * Aplica o esquema. Tudo é `IF NOT EXISTS`, então aplicar de novo é inofensivo:
 * dois isolates subindo juntos não se atrapalham, e um banco criado depois do
 * deploy (ou esvaziado à mão) se reconstrói no primeiro acesso.
 */
export async function garantirEsquema(banco: Banco): Promise<void> {
  if (esquemaPronto) return;
  for (const comando of ESQUEMA) await banco.prepare(comando).run();
  for (const coluna of COLUNAS_NOVAS) {
    try {
      await banco.prepare(`ALTER TABLE boxes ADD COLUMN ${coluna}`).run();
    } catch {
      // Coluna que já existe: o SQLite recusa o `ADD COLUMN` repetido, e é o
      // erro que diz "esta migração já passou por aqui". Silenciar é o que
      // torna a migração repetível — o CREATE acima falharia alto se o banco
      // estivesse inacessível, então um erro engolido aqui não esconde isso.
    }
  }
  esquemaPronto = true;
}

/** Só para os testes, que usam um banco novo a cada caso. */
export function esquecerEsquema(): void {
  esquemaPronto = false;
}

import Database from 'better-sqlite3';
import { esquecerEsquema, garantirEsquema } from '../../src/banco.js';
import type { Banco, ComandoPreparado } from '../../src/banco.js';

/**
 * Banco novo, com o esquema já aplicado. É o ponto de partida dos testes que
 * falam com o repositório direto, sem passar pelas rotas.
 */
export async function criarBancoPronto(): Promise<Banco> {
  esquecerEsquema();
  const banco = criarBancoSqlite();
  await garantirEsquema(banco);
  return banco;
}

/**
 * Um banco de verdade para os testes, atrás da mesma interface que o D1 expõe
 * ao Worker — e de propósito do mesmo motor: o D1 é SQLite, então o SQL que
 * roda aqui é o SQL que roda em produção. Um dublê que respondesse "ok" a
 * qualquer consulta não provaria nada sobre o esquema nem sobre o `ON CONFLICT`
 * que mantém o retrato de cada box.
 *
 * O que ele *não* cobre é o que é do Cloudflare e não do SQLite: limites do D1,
 * réplicas de leitura e o binding em si. Isso só se verifica publicando.
 */
export function criarBancoSqlite(): Banco {
  const db = new Database(':memory:');
  return {
    prepare(sql: string): ComandoPreparado {
      const comando = db.prepare(sql);
      const valores: unknown[] = [];
      const preparado: ComandoPreparado = {
        bind(...novos: unknown[]): ComandoPreparado {
          valores.push(...novos);
          return preparado;
        },
        async run(): Promise<unknown> {
          return comando.run(...(valores as never[]));
        },
        async all<T>(): Promise<{ results?: T[] }> {
          return { results: comando.all(...(valores as never[])) as T[] };
        },
        async first<T>(): Promise<T | null> {
          return (comando.get(...(valores as never[])) as T | undefined) ?? null;
        },
      };
      return preparado;
    },
  };
}

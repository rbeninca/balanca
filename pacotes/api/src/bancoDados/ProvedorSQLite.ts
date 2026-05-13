import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class ProvedorSQLite {
  private db: Database.Database;

  constructor(caminho: string) {
    this.db = new Database(caminho);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    this.inicializarEsquema();
  }

  private inicializarEsquema(): void {
    const sql = readFileSync(join(__dirname, 'esquema.sql'), 'utf-8');
    this.db.exec(sql);
  }

  executar(sql: string, params: unknown[] = []): void {
    this.db.prepare(sql).run(...params);
  }

  consultar<T>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  consultarUm<T>(sql: string, params: unknown[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  obterModo(): string {
    const row = this.db.pragma('journal_mode') as Array<{ journal_mode: string }>;
    return row[0]?.journal_mode ?? 'unknown';
  }

  fechar(): void { this.db.close(); }
}

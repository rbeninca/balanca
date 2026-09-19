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
    this.migrar();
  }

  private migrar(): void {
    const colunas = this.db.pragma('table_info(leituras)') as Array<{ name: string }>;
    if (colunas.some(c => c.name === 'forca_newton')) {
      this.db.exec('ALTER TABLE leituras RENAME COLUMN forca_newton TO forca_crua');
    }
    // Colunas de resumo da listagem (CREATE TABLE IF NOT EXISTS não altera tabela existente)
    const colunasSessoes = (this.db.pragma('table_info(sessoes)') as Array<{ name: string }>).map(c => c.name);
    for (const [coluna, tipo] of [
      ['total_leituras', 'INTEGER'], ['forca_media_queima_n', 'REAL'], ['impulso_queima_ns', 'REAL'],
      ['config_pipeline', 'TEXT'], ['config_esp', 'TEXT'],
    ] as const) {
      if (!colunasSessoes.includes(coluna)) this.db.exec(`ALTER TABLE sessoes ADD COLUMN ${coluna} ${tipo}`);
    }
    const colunasMeta = (this.db.pragma('table_info(metadados_sessao)') as Array<{ name: string }>).map(c => c.name);
    if (!colunasMeta.includes('detrend')) this.db.exec('ALTER TABLE metadados_sessao ADD COLUMN detrend TEXT');
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

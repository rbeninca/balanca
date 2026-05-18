import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProvedorSQLite } from '../src/bancoDados/ProvedorSQLite.js';

describe('ProvedorSQLite', () => {
  let db: ProvedorSQLite;

  beforeEach(() => {
    db = new ProvedorSQLite(':memory:');
  });

  afterEach(() => {
    db.fechar();
  });

  // UT-6.1.1 — WAL requer banco em arquivo; :memory: usa modo 'memory'
  it('inicializa em modo WAL para banco em arquivo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'balanca-teste-'));
    const caminho = join(dir, 'teste.db');
    const dbArquivo = new ProvedorSQLite(caminho);
    try {
      expect(dbArquivo.obterModo()).toBe('wal');
    } finally {
      dbArquivo.fechar();
      rmSync(dir, { recursive: true });
    }
  });

  // UT-6.1.2
  it('executa INSERT e consulta registro', () => {
    db.executar(
      "INSERT INTO sessoes (id, nome) VALUES (?, ?)",
      ['id-1', 'Teste'],
    );
    const row = db.consultarUm<{ id: string; nome: string }>('SELECT id, nome FROM sessoes WHERE id = ?', ['id-1']);
    expect(row).toEqual(expect.objectContaining({ id: 'id-1', nome: 'Teste' }));
  });

  // UT-6.1.3
  it('retorna undefined para consultarUm sem resultado', () => {
    const row = db.consultarUm('SELECT id FROM sessoes WHERE id = ?', ['inexistente']);
    expect(row).toBeUndefined();
  });

  // UT-6.1.4
  it('retorna array vazio para consultar sem resultados', () => {
    const rows = db.consultar('SELECT * FROM sessoes');
    expect(rows).toEqual([]);
  });

  // UT-6.1.5
  it('aplica cascade delete de leituras ao deletar sessão', () => {
    db.executar("INSERT INTO sessoes (id, nome) VALUES (?, ?)", ['s1', 'S1']);
    db.executar(
      "INSERT INTO leituras (id_sessao, marca_temporal, forca_crua, em_queima, impulso_acumulado_ns) VALUES (?, ?, ?, ?, ?)",
      ['s1', 100, 10.5, 0, 1050],
    );
    db.executar('DELETE FROM sessoes WHERE id = ?', ['s1']);
    const leituras = db.consultar('SELECT * FROM leituras WHERE id_sessao = ?', ['s1']);
    expect(leituras).toHaveLength(0);
  });

  // UT-6.1.6
  it('campos default de sessão são preenchidos automaticamente', () => {
    db.executar("INSERT INTO sessoes (id, nome) VALUES (?, ?)", ['s2', 'S2']);
    const row = db.consultarUm<{ duracao_ms: number; forca_maxima_n: number; impulso_total_ns: number }>(
      'SELECT duracao_ms, forca_maxima_n, impulso_total_ns FROM sessoes WHERE id = ?', ['s2'],
    );
    expect(row?.duracao_ms).toBe(0);
    expect(row?.forca_maxima_n).toBe(0);
    expect(row?.impulso_total_ns).toBe(0);
  });
});

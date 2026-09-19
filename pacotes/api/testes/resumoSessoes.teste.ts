import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { criarApp } from '../src/principal.js';
import type { FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { ProvedorSQLite } from '../src/bancoDados/ProvedorSQLite.js';
import { analisarMotor, classificarNAR } from '@balancagfig/analise';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

const CHAVE = 'chave-teste';

interface LinhaLeitura {
  marca_temporal: number;
  forca_crua: number;
  em_queima: boolean;
  impulso_acumulado_ns: number;
}

/** Curva de empuxo sintética: silêncio, subida, platô, queda, silêncio. */
function curva(opts: { marcar: boolean; ruido?: number; pico?: number }): LinhaLeitura[] {
  const { marcar, ruido = 0, pico = 20 } = opts;
  const linhas: LinhaLeitura[] = [];
  let impulso = 0;
  let tAnterior = 0;
  for (let i = 0; i < 400; i++) {
    const t = i * 12.5;                                        // 80 Hz
    let f = ruido * Math.sin(i);
    if (i >= 50 && i < 80)       f = pico * (i - 50) / 30;      // subida
    else if (i >= 80 && i < 250) f = pico;                     // platô
    else if (i >= 250 && i < 300) f = pico * (300 - i) / 50;   // queda
    impulso += f * (t - tAnterior) / 1000;
    tAnterior = t;
    linhas.push({
      marca_temporal: t,
      forca_crua: f,
      em_queima: marcar && i >= 55 && i < 295,
      impulso_acumulado_ns: impulso,
    });
  }
  return linhas;
}

function comoLeituras(linhas: LinhaLeitura[]): LeituraProcessada[] {
  return linhas.map(l => ({
    marcaTemporal:      l.marca_temporal,
    forcaNewton:        l.forca_crua,
    emQueima:           l.em_queima,
    impulsoAcumuladoNs: l.impulso_acumulado_ns,
  } as LeituraProcessada));
}

describe('Resumo de sessões na listagem (view resumo_sessoes)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = criarApp({ caminhoBanco: ':memory:', chaveAPI: CHAVE });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  async function criarSessaoCom(nome: string, linhas: LinhaLeitura[]): Promise<string> {
    const post = await app.inject({
      method: 'POST', url: '/sessoes',
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify({ nome }),
    });
    const { id } = JSON.parse(post.body);
    if (linhas.length > 0) {
      const res = await app.inject({
        method: 'POST', url: `/sessoes/${id}/leituras`,
        headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
        body: JSON.stringify(linhas),
      });
      expect(res.statusCode).toBe(201);
    }
    return id;
  }

  async function listar(): Promise<Array<Record<string, unknown>>> {
    const res = await app.inject({ method: 'GET', url: '/sessoes' });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body);
  }

  it('sessão sem leituras vem com total 0 e resumo nulo', async () => {
    const id = await criarSessaoCom('Vazia', []);
    const [s] = await listar();
    expect(s).toMatchObject({ id, total_leituras: 0, forca_media_queima_n: null, impulso_queima_ns: null });
  });

  it('com em_queima marcado, bate com analisarMotor', async () => {
    const linhas = curva({ marcar: true, ruido: 0.3 });
    await criarSessaoCom('Marcada', linhas);
    const esperado = analisarMotor(comoLeituras(linhas), {});

    const [s] = await listar();
    expect(s.total_leituras).toBe(linhas.length);
    expect(s.forca_media_queima_n as number).toBeCloseTo(esperado.forcaMedia_N, 9);
    expect(s.impulso_queima_ns as number).toBeCloseTo(esperado.impulsoTotal_Ns, 9);

    const nar = classificarNAR(s.impulso_queima_ns as number, s.forca_media_queima_n as number);
    expect(nar.letra).toBe(esperado.letraMotor);
    expect(nar.nomeComum).toBe(esperado.nomeComum);
  });

  it('sem marcação, usa a janela de 5% do pico como garantirQueima', async () => {
    const linhas = curva({ marcar: false, ruido: 0.3 });
    await criarSessaoCom('Sem marcação', linhas);
    const esperado = analisarMotor(comoLeituras(linhas), {});

    const [s] = await listar();
    expect(s.forca_media_queima_n as number).toBeCloseTo(esperado.forcaMedia_N, 9);
    expect(s.impulso_queima_ns as number).toBeCloseTo(esperado.impulsoTotal_Ns, 9);
    expect(classificarNAR(s.impulso_queima_ns as number, s.forca_media_queima_n as number).nomeComum)
      .toBe(esperado.nomeComum);
  });

  it('sessão só com ruído em torno de zero (pico <= 0) fica sem resumo de queima', async () => {
    const linhas = curva({ marcar: false, pico: 0 }).map(l => ({ ...l, forca_crua: -0.01 }));
    await criarSessaoCom('Silêncio', linhas);
    const [s] = await listar();
    expect(s.total_leituras).toBe(linhas.length);
    expect(s.forca_media_queima_n).toBeNull();
    expect(s.impulso_queima_ns).toBeNull();
  });

  it('DELETE das leituras zera o resumo', async () => {
    const id = await criarSessaoCom('Apagada', curva({ marcar: true }));
    const del = await app.inject({ method: 'DELETE', url: `/sessoes/${id}/leituras`, headers: { 'x-chave-api': CHAVE } });
    expect(del.statusCode).toBe(204);
    const [s] = await listar();
    expect(s).toMatchObject({ total_leituras: 0, forca_media_queima_n: null, impulso_queima_ns: null });
  });

  it('sessão gravada antes da coluna existir é resumida na primeira listagem e fica gravada', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'balanca-resumo-'));
    const caminho = join(dir, 'banco.db');
    const appArquivo = criarApp({ caminhoBanco: caminho, chaveAPI: CHAVE });
    await appArquivo.ready();
    try {
      const linhas = curva({ marcar: true });
      const post = await appArquivo.inject({
        method: 'POST', url: '/sessoes',
        headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
        body: JSON.stringify({ nome: 'Antiga' }),
      });
      const { id } = JSON.parse(post.body);
      await appArquivo.inject({
        method: 'POST', url: `/sessoes/${id}/leituras`,
        headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
        body: JSON.stringify(linhas),
      });

      // simula banco antigo: resumo nunca calculado
      const db = new Database(caminho);
      db.prepare('UPDATE sessoes SET total_leituras = NULL, forca_media_queima_n = NULL, impulso_queima_ns = NULL WHERE id = ?').run(id);

      const res = await appArquivo.inject({ method: 'GET', url: '/sessoes' });
      const [s] = JSON.parse(res.body);
      const esperado = analisarMotor(comoLeituras(linhas), {});
      expect(s.total_leituras).toBe(linhas.length);
      expect(s.forca_media_queima_n).toBeCloseTo(esperado.forcaMedia_N, 9);

      const gravado = db.prepare('SELECT total_leituras FROM sessoes WHERE id = ?').get(id) as { total_leituras: number };
      expect(gravado.total_leituras).toBe(linhas.length);
      db.close();
    } finally {
      await appArquivo.close();
      rmSync(dir, { recursive: true });
    }
  });

  it('cada sessão recebe o próprio resumo', async () => {
    const a = curva({ marcar: true, pico: 5 });
    const b = curva({ marcar: false, pico: 60 });
    const idA = await criarSessaoCom('A', a);
    const idB = await criarSessaoCom('B', b);
    const lista = await listar();
    const porId = Object.fromEntries(lista.map(s => [s.id as string, s]));
    expect(classificarNAR(porId[idA]!.impulso_queima_ns as number, porId[idA]!.forca_media_queima_n as number).letra)
      .toBe(analisarMotor(comoLeituras(a), {}).letraMotor);
    expect(classificarNAR(porId[idB]!.impulso_queima_ns as number, porId[idB]!.forca_media_queima_n as number).letra)
      .toBe(analisarMotor(comoLeituras(b), {}).letraMotor);
  });
});

describe('Migração das colunas de resumo', () => {
  it('adiciona as colunas a um banco criado antes delas', () => {
    const dir = mkdtempSync(join(tmpdir(), 'balanca-resumo-'));
    const caminho = join(dir, 'antigo.db');
    const antigo = new Database(caminho);
    antigo.exec(`CREATE TABLE sessoes (
      id TEXT PRIMARY KEY, nome TEXT NOT NULL, id_motor TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      duracao_ms INTEGER NOT NULL DEFAULT 0, forca_maxima_n REAL NOT NULL DEFAULT 0,
      impulso_total_ns REAL NOT NULL DEFAULT 0, observacoes TEXT)`);
    antigo.exec("INSERT INTO sessoes (id, nome) VALUES ('s1', 'Velha')");
    antigo.close();

    const db = new ProvedorSQLite(caminho);
    try {
      const s = db.consultarUm<{ total_leituras: number | null }>('SELECT total_leituras FROM sessoes WHERE id = ?', ['s1']);
      expect(s).toEqual({ total_leituras: null });
    } finally {
      db.fechar();
      rmSync(dir, { recursive: true });
    }
  });
});

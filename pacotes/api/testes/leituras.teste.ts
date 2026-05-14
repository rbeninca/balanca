import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { criarApp } from '../src/principal.js';
import type { FastifyInstance } from 'fastify';

const CHAVE = 'chave-teste';

describe('IT-6.2 Rotas de Leituras', () => {
  let app: FastifyInstance;
  let idSessao: string;

  beforeEach(async () => {
    app = criarApp({ caminhoBanco: ':memory:', chaveAPI: CHAVE });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/sessoes',
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify({ nome: 'Sessão Leituras' }),
    });
    idSessao = JSON.parse(res.body).id;
  });

  afterEach(async () => {
    await app.close();
  });

  // IT-6.2.1
  it('GET /sessoes/:id/leituras retorna array vazio inicialmente', async () => {
    const res = await app.inject({ method: 'GET', url: `/sessoes/${idSessao}/leituras` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  // IT-6.2.2
  it('POST /sessoes/:id/leituras insere lote e retorna contagem', async () => {
    const leituras = [
      { marca_temporal: 100, forca_newton: 10.5, em_queima: true, impulso_acumulado_ns: 1050 },
      { marca_temporal: 200, forca_newton: 20.0, em_queima: true, impulso_acumulado_ns: 2550 },
    ];
    const res = await app.inject({
      method: 'POST',
      url: `/sessoes/${idSessao}/leituras`,
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify(leituras),
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toEqual({ inseridas: 2 });
  });

  // IT-6.2.3
  it('POST leituras atualiza métricas da sessão', async () => {
    const leituras = [
      { marca_temporal: 0,   forca_newton: 5.0,  em_queima: false, impulso_acumulado_ns: 0 },
      { marca_temporal: 500, forca_newton: 30.0, em_queima: true,  impulso_acumulado_ns: 8750 },
      { marca_temporal: 900, forca_newton: 2.0,  em_queima: false, impulso_acumulado_ns: 9350 },
    ];
    await app.inject({
      method: 'POST',
      url: `/sessoes/${idSessao}/leituras`,
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify(leituras),
    });

    const sessaoRes = await app.inject({ method: 'GET', url: `/sessoes/${idSessao}` });
    const sessao = JSON.parse(sessaoRes.body);
    expect(sessao.forca_maxima_n).toBe(30.0);
    expect(sessao.impulso_total_ns).toBe(9350);
    expect(sessao.duracao_ms).toBe(900);
  });

  // IT-6.2.4
  it('POST leituras retorna 401 sem chave', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/sessoes/${idSessao}/leituras`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([{ marca_temporal: 0, forca_newton: 1, em_queima: false, impulso_acumulado_ns: 0 }]),
    });
    expect(res.statusCode).toBe(401);
  });

  // IT-6.2.5
  it('POST leituras retorna 404 para sessão inexistente', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sessoes/nao-existe/leituras',
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify([{ marca_temporal: 0, forca_newton: 1, em_queima: false, impulso_acumulado_ns: 0 }]),
    });
    expect(res.statusCode).toBe(404);
  });

  // IT-6.2.6
  it('POST leituras retorna 400 para body vazio', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/sessoes/${idSessao}/leituras`,
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify([]),
    });
    expect(res.statusCode).toBe(400);
  });

  // IT-6.2.7
  it('GET /sessoes/:id/exportar.csv retorna CSV com cabeçalho', async () => {
    await app.inject({
      method: 'POST',
      url: `/sessoes/${idSessao}/leituras`,
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify([
        { marca_temporal: 100, forca_newton: 10.5, em_queima: true, impulso_acumulado_ns: 1050 },
      ]),
    });

    const res = await app.inject({ method: 'GET', url: `/sessoes/${idSessao}/exportar.csv` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const linhas = res.body.split('\n');
    expect(linhas[0]).toBe('marca_temporal,forca_newton,temperatura,em_queima,impulso_acumulado_ns');
    expect(linhas[1]).toContain('100');
    expect(linhas[1]).toContain('10.5');
  });

  // IT-6.2.8
  it('GET exportar.csv retorna 404 para sessão inexistente', async () => {
    const res = await app.inject({ method: 'GET', url: '/sessoes/nao-existe/exportar.csv' });
    expect(res.statusCode).toBe(404);
  });

  // IT-6.2.9
  it('DELETE /sessoes/:id/leituras apaga todas as leituras da sessão', async () => {
    await app.inject({
      method: 'POST',
      url: `/sessoes/${idSessao}/leituras`,
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify([
        { marca_temporal: 100, forca_newton: 10, em_queima: true, impulso_acumulado_ns: 1000 },
        { marca_temporal: 200, forca_newton: 20, em_queima: true, impulso_acumulado_ns: 2000 },
      ]),
    });

    const del = await app.inject({
      method: 'DELETE',
      url: `/sessoes/${idSessao}/leituras`,
      headers: { 'x-chave-api': CHAVE },
    });
    expect(del.statusCode).toBe(204);

    const res = await app.inject({ method: 'GET', url: `/sessoes/${idSessao}/leituras` });
    expect(JSON.parse(res.body)).toEqual([]);
  });

  // IT-6.2.10
  it('DELETE /sessoes/:id/leituras + POST simula substituição de leituras', async () => {
    await app.inject({
      method: 'POST',
      url: `/sessoes/${idSessao}/leituras`,
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify([
        { marca_temporal: 0,   forca_newton: 1, em_queima: false, impulso_acumulado_ns: 0 },
        { marca_temporal: 100, forca_newton: 5, em_queima: true,  impulso_acumulado_ns: 300 },
      ]),
    });

    await app.inject({
      method: 'DELETE',
      url: `/sessoes/${idSessao}/leituras`,
      headers: { 'x-chave-api': CHAVE },
    });

    await app.inject({
      method: 'POST',
      url: `/sessoes/${idSessao}/leituras`,
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify([
        { marca_temporal: 0,   forca_newton: 1, em_queima: false, impulso_acumulado_ns: 0 },
        { marca_temporal: 100, forca_newton: 5, em_queima: false, impulso_acumulado_ns: 300 },
      ]),
    });

    const res = await app.inject({ method: 'GET', url: `/sessoes/${idSessao}/leituras` });
    const leituras = JSON.parse(res.body);
    expect(leituras).toHaveLength(2);
    expect(leituras[1].em_queima).toBe(0);
  });

  // IT-6.2.11
  it('DELETE /sessoes/:id/leituras retorna 401 sem chave', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/sessoes/${idSessao}/leituras` });
    expect(res.statusCode).toBe(401);
  });
});

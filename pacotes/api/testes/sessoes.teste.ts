import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { criarApp } from '../src/principal.js';
import type { FastifyInstance } from 'fastify';

const CHAVE = 'chave-teste';

describe('IT-6.1 Rotas de Sessões', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = criarApp({ caminhoBanco: ':memory:', chaveAPI: CHAVE });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // IT-6.1.1
  it('GET /sessoes retorna lista vazia inicialmente', async () => {
    const res = await app.inject({ method: 'GET', url: '/sessoes' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  // IT-6.1.2
  it('POST /sessoes cria sessão com nome', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sessoes',
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify({ nome: 'Motor A' }),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({ nome: 'Motor A', duracao_ms: 0, forca_maxima_n: 0 });
    expect(body.id).toBeTruthy();
  });

  // IT-6.1.3
  it('POST /sessoes retorna 401 sem chave', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sessoes',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nome: 'Motor B' }),
    });
    expect(res.statusCode).toBe(401);
  });

  // IT-6.1.4
  it('POST /sessoes retorna 400 sem nome', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sessoes',
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
  });

  // IT-6.1.5
  it('GET /sessoes/:id retorna sessão existente', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/sessoes',
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify({ nome: 'Motor C' }),
    });
    const { id } = JSON.parse(post.body);

    const res = await app.inject({ method: 'GET', url: `/sessoes/${id}` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ id, nome: 'Motor C' });
  });

  // IT-6.1.6
  it('GET /sessoes/:id retorna 404 para ID inexistente', async () => {
    const res = await app.inject({ method: 'GET', url: '/sessoes/nao-existe' });
    expect(res.statusCode).toBe(404);
  });

  // IT-6.1.7
  it('DELETE /sessoes/:id remove sessão', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/sessoes',
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify({ nome: 'Motor D' }),
    });
    const { id } = JSON.parse(post.body);

    const del = await app.inject({
      method: 'DELETE',
      url: `/sessoes/${id}`,
      headers: { 'x-chave-api': CHAVE },
    });
    expect(del.statusCode).toBe(204);

    const get = await app.inject({ method: 'GET', url: `/sessoes/${id}` });
    expect(get.statusCode).toBe(404);
  });

  // IT-6.1.8
  it('DELETE /sessoes/:id retorna 404 para inexistente', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/sessoes/nao-existe',
      headers: { 'x-chave-api': CHAVE },
    });
    expect(res.statusCode).toBe(404);
  });

  // IT-6.1.9
  it('GET /saude retorna status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/saude' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ status: 'ok' });
  });
});

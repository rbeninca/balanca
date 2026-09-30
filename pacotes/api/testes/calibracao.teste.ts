import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { criarApp } from '../src/principal.js';
import type { FastifyInstance } from 'fastify';

const CHAVE = 'chave-teste';

describe('Rotas de calibração da célula', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = criarApp({ caminhoBanco: ':memory:', chaveAPI: CHAVE });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /calibracao sem registro retorna 200 com nulls', async () => {
    const res = await app.inject({ method: 'GET', url: '/calibracao' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      massa_referencia_g: null,
      descricao_celula: null,
      capacidade_max_g: null,
      gravidade: null,
      atualizada_em: null,
    });
  });

  it('PUT /calibracao sem chave retorna 401', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/calibracao',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ massa_referencia_g: 100 }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('PUT parcial grava e o GET devolve a linha completa', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/calibracao',
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify({ massa_referencia_g: 100, descricao_celula: 'CALT 500 kg 2023' }),
    });
    expect(put.statusCode).toBe(200);
    const gravada = JSON.parse(put.body);
    expect(gravada).toMatchObject({ massa_referencia_g: 100, descricao_celula: 'CALT 500 kg 2023', capacidade_max_g: null, gravidade: null });
    expect(gravada.atualizada_em).toBeTruthy();

    const get = await app.inject({ method: 'GET', url: '/calibracao' });
    expect(JSON.parse(get.body)).toMatchObject({ massa_referencia_g: 100, descricao_celula: 'CALT 500 kg 2023' });
  });

  it('PUT parcial preserva os campos ausentes e null apaga', async () => {
    const primeiro = await app.inject({
      method: 'PUT',
      url: '/calibracao',
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify({ massa_referencia_g: 100, capacidade_max_g: 500000, gravidade: 9.78769 }),
    });
    expect(primeiro.statusCode).toBe(200);

    const segundo = await app.inject({
      method: 'PUT',
      url: '/calibracao',
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify({ descricao_celula: null }),
    });
    expect(segundo.statusCode).toBe(200);
    const linha = JSON.parse(segundo.body);
    expect(linha).toMatchObject({
      massa_referencia_g: 100,
      descricao_celula: null,
      capacidade_max_g: 500000,
      gravidade: 9.78769,
    });
  });

  it('PUT valida massa, capacidade e gravidade', async () => {
    const casos: Array<[object, number]> = [
      [{ massa_referencia_g: 0 }, 400],
      [{ massa_referencia_g: -5 }, 400],
      [{ capacidade_max_g: 0 }, 400],
      [{ gravidade: 8 }, 400],
      [{ gravidade: 11 }, 400],
      [{ gravidade: 'nove' }, 400],
    ];
    for (const [body, esperado] of casos) {
      const res = await app.inject({
        method: 'PUT',
        url: '/calibracao',
        headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.statusCode).toBe(esperado);
    }
  });

  it('POST /sessoes fotografa as 3 colunas do registro no momento da criação', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/calibracao',
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify({ massa_referencia_g: 100, descricao_celula: 'CALT 500 kg 2023', capacidade_max_g: 500000 }),
    });
    expect(put.statusCode).toBe(200);

    const post = await app.inject({
      method: 'POST',
      url: '/sessoes',
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify({ nome: 'Motor A' }),
    });
    expect(post.statusCode).toBe(201);
    expect(JSON.parse(post.body)).toMatchObject({
      massa_calibracao_g: 100,
      descricao_celula: 'CALT 500 kg 2023',
      capacidade_celula_g: 500000,
    });

    // sessão criada sem registro fica com as colunas nulas (retrocompat)
    await app.inject({
      method: 'PUT',
      url: '/calibracao',
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify({ massa_referencia_g: null, descricao_celula: null, capacidade_max_g: null }),
    });
    const post2 = await app.inject({
      method: 'POST',
      url: '/sessoes',
      headers: { 'x-chave-api': CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify({ nome: 'Motor B' }),
    });
    expect(post2.statusCode).toBe(201);
    expect(JSON.parse(post2.body)).toMatchObject({
      massa_calibracao_g: null,
      descricao_celula: null,
      capacidade_celula_g: null,
    });
  });
});

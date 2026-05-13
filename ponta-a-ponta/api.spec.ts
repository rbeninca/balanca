/**
 * Testes de integração E2E contra a API em execução.
 * Requerem API_URL definida (ex: http://localhost:3000) e API_CHAVE.
 * Se não estiverem definidas, os testes são pulados.
 */
import { describe, it, expect, beforeAll } from 'vitest';

const API_URL  = process.env['API_URL']   ?? '';
const API_CHAVE = process.env['API_CHAVE'] ?? '';

const PULAR = !API_URL;

async function post(caminho: string, corpo: object) {
  return fetch(`${API_URL}${caminho}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(API_CHAVE ? { 'x-chave-api': API_CHAVE } : {}),
    },
    body: JSON.stringify(corpo),
  });
}

async function get(caminho: string) {
  return fetch(`${API_URL}${caminho}`);
}

describe.skipIf(PULAR)('E2E — API REST', () => {
  // IT-8.1.3 / IT-8.1.4
  it('GET /saude retorna status ok', async () => {
    const res = await get('/saude');
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('POST /sessoes cria sessão e GET retorna', async () => {
    const resPost = await post('/sessoes', { nome: 'E2E Motor Test' });
    expect(resPost.status).toBe(201);
    const sessao = await resPost.json();
    expect(sessao.id).toBeTruthy();

    const resGet = await get(`/sessoes/${sessao.id}`);
    expect(resGet.ok).toBe(true);
    const body = await resGet.json();
    expect(body.nome).toBe('E2E Motor Test');
  });

  it('POST leituras em lote e GET retorna', async () => {
    const criarRes = await post('/sessoes', { nome: 'E2E Leituras' });
    const { id } = await criarRes.json();

    const leituras = Array.from({ length: 10 }, (_, i) => ({
      marca_temporal: i * 100,
      forca_newton: 2.0 + i * 0.1,
      em_queima: i > 2 && i < 8,
      impulso_acumulado_ns: i * 0.2,
    }));

    const resLot = await post(`/sessoes/${id}/leituras`, leituras);
    expect(resLot.status).toBe(201);
    const body = await resLot.json();
    expect(body.inseridas).toBe(10);

    const resGet = await get(`/sessoes/${id}/leituras`);
    const ls = await resGet.json();
    expect(ls).toHaveLength(10);
  });

  it('GET exportar.csv retorna CSV válido', async () => {
    const criarRes = await post('/sessoes', { nome: 'E2E CSV' });
    const { id } = await criarRes.json();
    await post(`/sessoes/${id}/leituras`, [
      { marca_temporal: 0, forca_newton: 2.0, em_queima: true, impulso_acumulado_ns: 0 },
    ]);
    const resCSV = await get(`/sessoes/${id}/exportar.csv`);
    expect(resCSV.headers.get('content-type')).toContain('text/csv');
    const texto = await resCSV.text();
    expect(texto).toContain('marca_temporal');
  });

  it('sessão persiste após recriação do cliente', async () => {
    const r1 = await post('/sessoes', { nome: 'Persistencia' });
    const { id } = await r1.json();
    const r2 = await get(`/sessoes/${id}`);
    expect(r2.ok).toBe(true);
  });
});

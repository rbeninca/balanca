import { describe, it, expect } from 'vitest';
import { bancada, postar, CHAVE } from './apoio/painel.js';

describe('/alvo', () => {
  it('o GET é público — é o que o app dos boxes lê sem chave', async () => {
    const b = bancada();
    const r = await b.pedir('/alvo', { chave: null });

    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ alvo: null });
  });

  it('devolve o alvo gravado', async () => {
    const b = bancada();
    await b.pedir('/alvo', postar({ alvo: '2.8.501' }));

    expect(await b.json('/alvo', { chave: null })).toEqual({ alvo: '2.8.501' });
  });

  it('gravar exige a chave', async () => {
    const b = bancada();
    expect((await b.pedir('/alvo', { ...postar({ alvo: '2.8.501' }), chave: 'chute' })).status).toBe(401);
  });

  it('recusa valor que não é versão', async () => {
    const b = bancada();
    for (const alvo of ['a mais nova', 'v2.8.501', '2.8.501.1', '', 42, {}]) {
      expect((await b.pedir('/alvo', postar({ alvo }))).status, `alvo ${JSON.stringify(alvo)}`).toBe(400);
    }
  });

  it('aceita duas casas, como o app aceita', async () => {
    const b = bancada();
    const r = await b.pedir('/alvo', postar({ alvo: '2.9' }));

    expect(r.status).toBe(200);
    expect(await b.json('/alvo', { chave: null })).toEqual({ alvo: '2.9' });
  });

  it('limpa o alvo com null ou sem o campo', async () => {
    const b = bancada();
    await b.pedir('/alvo', postar({ alvo: '2.8.501' }));

    expect(await (await b.pedir('/alvo', postar({ alvo: null }))).json()).toEqual({ alvo: null });
    expect(await b.json('/alvo', { chave: null })).toEqual({ alvo: null });

    await b.pedir('/alvo', postar({ alvo: '2.8.501' }));
    await b.pedir('/alvo', postar({}));
    expect(await b.json('/alvo', { chave: null })).toEqual({ alvo: null });
  });

  it('recusa corpo que não é JSON', async () => {
    const b = bancada();
    const r = await b.pedir('/alvo', { method: 'POST', body: 'nem tenta' });

    expect(r.status).toBe(400);
  });

  it('a chave da URL serve para a página, não para gravar', async () => {
    const b = bancada();
    // Sem o cabeçalho: a chave na query não autoriza um POST.
    const r = await b.pedir(`/alvo?chave=${CHAVE}`, {
      method: 'POST',
      body: JSON.stringify({ alvo: '2.8.501' }),
      chave: null,
    });

    expect(r.status).toBe(401);
  });
});

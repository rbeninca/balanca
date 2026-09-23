import { describe, it, expect } from 'vitest';
import { bancada, batidaCampos, postar, CHAVE } from './apoio/painel.js';

describe('POST /batida', () => {
  it('aceita a batida e devolve ok', async () => {
    const b = bancada();
    const r = await b.pedir('/batida', postar(batidaCampos()));

    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it('recusa sem a chave certa', async () => {
    const b = bancada();
    expect((await b.pedir('/batida', { ...postar(batidaCampos()), chave: 'chute' })).status).toBe(401);
    expect((await b.pedir('/batida', { ...postar(batidaCampos()), chave: null })).status).toBe(401);
  });

  it('recusa um Worker publicado sem o secret, em vez de virar painel aberto', async () => {
    const b = bancada(null);
    const r = await b.pedir('/batida', postar(batidaCampos()));

    expect(r.status).toBe(401);
  });

  it('recusa batida sem serial ou sem versão', async () => {
    const b = bancada();
    expect((await b.pedir('/batida', postar(batidaCampos({ serial: '' })))).status).toBe(400);
    expect((await b.pedir('/batida', postar(batidaCampos({ versao: undefined })))).status).toBe(400);
    expect((await b.pedir('/batida', postar(batidaCampos({ versao: 'a mais nova' })))).status).toBe(400);
  });

  it('recusa corpo que não é JSON, nem objeto', async () => {
    const b = bancada();
    expect((await b.pedir('/batida', { method: 'POST', body: 'nada disso' })).status).toBe(400);
    expect((await b.pedir('/batida', postar([1, 2, 3]))).status).toBe(400);
  });

  it('aceita a batida de um box sem root e sem placa', async () => {
    const b = bancada();
    const r = await b.pedir(
      '/batida',
      postar(batidaCampos({ root: false, placa: null, ip: {} })),
    );
    expect(r.status).toBe(200);

    const { boxes } = await b.json<{ boxes: Array<Record<string, unknown>> }>(`/boxes?chave=${CHAVE}`);
    expect(boxes[0]).toEqual(expect.objectContaining({ root: false, placa: null, ip: {} }));
  });

  it('descarta campos fora de forma em vez de gravar o que veio', async () => {
    const b = bancada();
    await b.pedir(
      '/batida',
      postar(batidaCampos({ modelo: 42, placa: { a: 1 }, versionCode: 'vinte', instaladoEm: 'ontem', root: 'sim' })),
    );

    const { boxes } = await b.json<{ boxes: Array<Record<string, unknown>> }>(`/boxes?chave=${CHAVE}`);
    expect(boxes[0]).toEqual(
      expect.objectContaining({ modelo: null, placa: null, versionCode: null, instaladoEm: null, root: false }),
    );
  });

  it('uma chave parecida não serve', async () => {
    const b = bancada();
    const r = await b.pedir('/batida', { ...postar(batidaCampos()), chave: `${CHAVE}x` });

    expect(r.status).toBe(401);
  });
});

import { describe, it, expect } from 'vitest';
import { bancada, batidaCampos, postar, CHAVE } from './apoio/painel.js';

describe('/painel', () => {
  it('exige a chave', async () => {
    const b = bancada();
    expect((await b.pedir('/painel')).status).toBe(401);
    expect((await b.pedir('/painel?chave=chute')).status).toBe(401);
  });

  it('serve HTML e não guarda em cache', async () => {
    const b = bancada();
    const r = await b.pedir(`/painel?chave=${CHAVE}`, { chave: null });

    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('text/html');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await b.ler(r)).toContain('<title>Painel dos boxes');
  });

  it('embute a chave para a página buscar os boxes sozinha', async () => {
    const b = bancada();
    const html = await b.ler(await b.pedir(`/painel?chave=${CHAVE}`, { chave: null }));

    expect(html).toContain(`const CHAVE = ${JSON.stringify(CHAVE)}`);
    expect(html).toContain("fetch('/boxes?chave='");
  });

  it('a chave que fecha o script não escapa do script', async () => {
    const b = bancada('</script><script>alert(1)</script>');
    const html = await b.ler(await b.pedir('/painel?chave=</script><script>alert(1)</script>', { chave: null }));

    // Nada de `</script>` solto no meio da página: o que existe é o fechamento
    // de verdade, no fim.
    const fechamentos = html.match(/<\/script>/g) ?? [];
    expect(fechamentos).toHaveLength(1);
    expect(html).toContain('\\u003c/script>');
  });

  it('a raiz manda para o painel, levando a chave', async () => {
    const b = bancada();
    const r = await b.pedir(`/?chave=${CHAVE}`, { chave: null, redirect: 'manual' });

    expect(r.status).toBe(302);
    expect(r.headers.get('Location')).toBe(`https://painel.exemplo/painel?chave=${CHAVE}`);
  });

  it('rota desconhecida é 404', async () => {
    const b = bancada();
    const r = await b.pedir('/qualquer', { chave: null });

    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ erro: 'rota desconhecida' });
  });

  it('mostra os boxes que bateram', async () => {
    const b = bancada();
    await b.pedir('/batida', postar(batidaCampos()));

    // A tabela é montada no navegador a partir de /boxes; o que a página
    // precisa garantir é o caminho até lá.
    const html = await b.ler(await b.pedir(`/painel?chave=${CHAVE}`, { chave: null }));
    expect(html).toContain('serial');
    expect(html).toContain('Atualizou em');
    expect(html).toContain('setInterval(carregar, 60000)');
  });
});

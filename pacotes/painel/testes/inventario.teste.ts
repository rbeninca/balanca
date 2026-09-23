import { describe, it, expect } from 'vitest';
import { bancada, CHAVE } from './apoio/painel.js';

/** O HTML servido, para os testes que olham o que a página manda ao navegador. */
async function pagina(b = bancada()): Promise<string> {
  return await b.ler(await b.pedir(`/inventario?chave=${CHAVE}`, { chave: null }));
}

describe('GET /inventario', () => {
  it('exige a chave', async () => {
    const b = bancada();
    expect((await b.pedir('/inventario')).status).toBe(401);
    expect((await b.pedir('/inventario?chave=chute')).status).toBe(401);
    expect((await b.pedir('/inventario', { chave: null })).status).toBe(401);
  });

  it('serve HTML que não fica em cache', async () => {
    const b = bancada();
    const r = await b.pedir(`/inventario?chave=${CHAVE}`, { chave: null });

    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('text/html');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await b.ler(r)).toContain('<title>Inventário dos aparelhos');
  });

  it('embute a chave e lê a mesma lista que o painel', async () => {
    const html = await pagina();

    expect(html).toContain(`const CHAVE = ${JSON.stringify(CHAVE)}`);
    expect(html).toContain("fetch('/boxes?chave='");
  });

  it('liga as duas telas', async () => {
    const html = await pagina();
    const consulta = encodeURIComponent(CHAVE);

    expect(html).toContain(`/painel?chave=${consulta}`);
    expect(html).toContain(`/inventario?chave=${consulta}`);
  });

  it('oferece os três campos e as duas rotas de escrita', async () => {
    const html = await pagina();

    expect(html).toContain('Onde está');
    expect(html).toContain('De quem é');
    expect(html).toContain('Para que serve');
    expect(html).toContain("'/box'");
    expect(html).toContain("'/box/remover'");
  });

  it('desenha a lista inteira, sem filtrar', async () => {
    const html = await pagina();

    // É o que separa esta tela do painel: aqui entra todo mundo, inclusive o
    // aparelho que nunca bateu — que é justamente quem não tem outro lugar.
    expect(html).toContain('desenhar((await r.json()).boxes)');
    expect(html).not.toContain('filter(b =>');
  });

  it('não se redesenha sozinha', async () => {
    const html = await pagina();

    // O painel se atualiza a cada minuto; esta tela não pode, ou o redesenho
    // apagaria a linha que está sendo digitada.
    expect(html).not.toContain('setInterval');
    expect(html).toContain('carregar();');
  });

  it('os controles estão ligados no script', async () => {
    const html = await pagina();

    // Um handler escrito e não ligado não quebra nada visível: a página carrega,
    // a linha marca e o clique não faz nada. Foi assim que o botão de salvar
    // ficou mudo até alguém clicar nele — e é a única prova que dá para fazer
    // disto sem um navegador de verdade no teste.
    expect(html).toContain("botaoSalvar.addEventListener('click', salvar)");
    expect(html).toContain("tabela.addEventListener('input', marcar)");
    expect(html).toContain("document.getElementById('novo').addEventListener('submit'");
  });

  it('a chave que fecha o script não escapa do script', async () => {
    const b = bancada('</script><script>alert(1)</script>');
    const html = await b.ler(await b.pedir('/inventario?chave=</script><script>alert(1)</script>', { chave: null }));

    const fechamentos = html.match(/<\/script>/g) ?? [];
    expect(fechamentos).toHaveLength(1);
    expect(html).toContain('\\u003c/script>');
  });
});

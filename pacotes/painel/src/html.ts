/**
 * O casco das duas páginas: o estilo, o título e os links entre elas.
 *
 * As páginas são HTML puro, servidas pelo Worker, sem build e sem framework —
 * o que muda de uma para a outra é só o corpo e o script do fim.
 */
export const ESTILO = `
  :root { color-scheme: light dark; --linha: #d8d8d8; --fraco: #6b6b6b; --ok: #1a7f37; --alerta: #b54708; }
  @media (prefers-color-scheme: dark) {
    :root { --linha: #3a3a3a; --fraco: #a0a0a0; --ok: #4ac26b; --alerta: #e3a008; }
  }
  body { margin: 0 auto; max-width: 80rem; padding: 1.5rem 1rem 4rem;
         font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  h1 { font-size: 1.35rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.1rem; margin: 2rem 0 .25rem; }
  .sub { color: var(--fraco); margin: 0 0 1.5rem; font-size: .9rem; }
  nav { margin: 0 0 1.25rem; font-size: .9rem; }
  nav a { color: inherit; margin-right: 1rem; }
  nav a[aria-current] { font-weight: 600; text-decoration: none; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid var(--linha); vertical-align: top; }
  th { font-size: .8rem; text-transform: uppercase; letter-spacing: .03em; color: var(--fraco); }
  td.serial { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
  .versao { font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .fraco { color: var(--fraco); font-size: .85rem; }
  .ok { color: var(--ok); }
  .atrasado { color: var(--alerta); font-weight: 600; }
  form { margin: 1.5rem 0 0; padding: 1rem; border: 1px solid var(--linha); border-radius: .5rem; }
  label { display: block; font-size: .85rem; color: var(--fraco); margin-bottom: .4rem; }
  input, button { font: inherit; padding: .45rem .6rem; border-radius: .35rem; border: 1px solid var(--linha); }
  input { width: 10rem; background: transparent; color: inherit; }
  button { cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  .recado { margin-left: .5rem; font-size: .9rem; color: var(--fraco); }
  .erro { color: var(--alerta); margin: 1rem 0 0; }
  table.fichas input { width: 100%; min-width: 9rem; }
  table.fichas td { padding: .35rem .4rem; }
  tr.suja input { border-color: var(--alerta); }
  .remover { color: var(--alerta); }
  .barra { position: sticky; bottom: 0; display: flex; gap: .6rem; align-items: center;
           padding: .8rem 0; background: canvas; }
`;

export interface Casco {
  /** Título da aba e `<h1>` da página. */
  titulo: string;
  sub: string;
  /** Qual das duas telas está aberta, para o link dela ficar marcado. */
  atual: 'painel' | 'inventario';
  chave: string;
  corpo: string;
}

export function casco({ titulo, sub, atual, chave, corpo }: Casco): string {
  const consulta = encodeURIComponent(chave);
  const link = (id: 'painel' | 'inventario', texto: string) =>
    `<a href="/${id}?chave=${consulta}"${id === atual ? ' aria-current="page"' : ''}>${texto}</a>`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${titulo}</title>
<style>${ESTILO}</style>
</head>
<body>
<h1>${titulo}</h1>
<p class="sub">${sub}</p>
<nav>${link('painel', 'Painel')}${link('inventario', 'Inventário')}</nav>
${corpo}
</body>
</html>
`;
}

/**
 * O que as duas páginas usam dentro do `<script>`.
 *
 * As duas montam a tela a partir do mesmo `/boxes`, e o mesmo serial tem que
 * aparecer igual nas duas: uma cópia de `escapar` que ficasse para trás viraria
 * uma tabela que quebra com um `&` no nome do responsável.
 */
export const AJUDANTES = `
function escapar(t) {
  return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function quando(ms) {
  if (ms === null || ms === undefined) return '—';
  return new Date(ms).toLocaleString('pt-BR');
}
`;

/**
 * Um valor que vai virar string dentro de um `<script>`. `JSON.stringify` cuida
 * das aspas, mas não de um `</script>` que viesse no meio do valor — que
 * fecharia o bloco mais cedo e o resto viraria HTML. Escapado o `<`, não sobra
 * como fechar a tag.
 */
export function paraScript(valor: string): string {
  return JSON.stringify(valor).replace(/</g, '\\u003c');
}

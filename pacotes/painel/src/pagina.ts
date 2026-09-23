/**
 * A página do painel: HTML puro, sem framework e sem build, servida pelo
 * próprio Worker.
 *
 * Ela nasce vazia e se preenche por `fetch` em `/boxes?chave=…` — o mesmo
 * endpoint que qualquer outro cliente usaria. A chave vai embutida na página
 * (o usuário já a mandou na URL para chegar aqui), então a página é tão
 * secreta quanto o link.
 *
 * Atualiza sozinha a cada 60 s: a ideia é deixar aberta num canto e ver os
 * boxes aparecerem.
 */
export function pagina(chave: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Painel dos boxes — BalançaGFIG</title>
<style>
  :root { color-scheme: light dark; --linha: #d8d8d8; --fraco: #6b6b6b; --ok: #1a7f37; --alerta: #b54708; }
  @media (prefers-color-scheme: dark) {
    :root { --linha: #3a3a3a; --fraco: #a0a0a0; --ok: #4ac26b; --alerta: #e3a008; }
  }
  body { margin: 0 auto; max-width: 70rem; padding: 1.5rem 1rem 4rem;
         font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  h1 { font-size: 1.35rem; margin: 0 0 .25rem; }
  .sub { color: var(--fraco); margin: 0 0 1.5rem; font-size: .9rem; }
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
  #recado { margin-left: .6rem; font-size: .9rem; }
  #erro { color: var(--alerta); margin: 1rem 0 0; }
</style>
</head>
<body>
<h1>Painel dos boxes</h1>
<p class="sub">Versão instalada, quando atualizou e quando foi visto por último. Atualiza sozinho a cada 60 s.</p>
<p id="erro" hidden></p>
<div id="tabela"></div>

<form id="form">
  <label for="alvo">Alvo de atualização — a versão mais nova que os boxes podem instalar (vazio = sem teto)</label>
  <input id="alvo" name="alvo" placeholder="2.8.501" autocomplete="off">
  <button type="submit">Gravar</button>
  <span id="recado"></span>
</form>

<script>
const CHAVE = ${paraScript(chave)};
const tabela = document.getElementById('tabela');
const erro = document.getElementById('erro');
const recado = document.getElementById('recado');
const campoAlvo = document.getElementById('alvo');
let primeiraCarga = true;

function quando(ms) {
  if (ms === null || ms === undefined) return '—';
  return new Date(ms).toLocaleString('pt-BR');
}

function ha(ms) {
  if (ms === null || ms === undefined) return 'nunca';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 90) return 'agora';
  const m = Math.round(s / 60);
  if (m < 90) return m + ' min';
  const h = Math.round(m / 60);
  if (h < 36) return h + ' h';
  return Math.round(h / 24) + ' dias';
}

function escapar(t) {
  return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function ipTexto(ip) {
  const partes = Object.entries(ip || {}).map(([i, v]) => i + ': ' + v);
  return partes.length ? escapar(partes.join(', ')) : '<span class="fraco">—</span>';
}

function desenhar(dados) {
  const alvo = dados.alvo;
  if (primeiraCarga) {
    campoAlvo.value = alvo || '';
    primeiraCarga = false;
  }
  if (!dados.boxes.length) {
    tabela.innerHTML = '<p class="fraco">Nenhum box bateu ainda. O primeiro contato acontece ~30 s depois de o app subir, e a cada 10 min daí em diante.</p>';
    return;
  }
  const linhas = dados.boxes.map(b => {
    // Sem alvo, qualquer versão instalada está em dia; com alvo, quem está
    // abaixo dele é o que precisa de atenção.
    const atrasado = alvo !== null && comparar(b.versao, alvo) < 0;
    const marca = atrasado
      ? '<span class="atrasado">desatualizado</span>'
      : (alvo === null ? '' : '<span class="ok">em dia</span>');
    return '<tr>' +
      '<td class="serial">' + escapar(b.serial) + '</td>' +
      '<td class="versao">' + escapar(b.versao) + ' ' + marca + '</td>' +
      '<td>' + quando(b.atualizouEm) + (b.atualizouEmEstimado ? ' <span class="fraco">~</span>' : '') + '</td>' +
      '<td>' + quando(b.ultimaBatidaEm) + ' <span class="fraco">(' + ha(b.ultimaBatidaEm) + ')</span></td>' +
      '<td class="fraco">' + escapar(b.modelo || '—') + (b.placa ? ' / ' + escapar(b.placa) : '') + '</td>' +
      '<td class="fraco">' + ipTexto(b.ip) + '</td>' +
      '<td>' + (b.root ? '<span class="ok">sim</span>' : '<span class="fraco">não</span>') + '</td>' +
      '</tr>';
  }).join('');
  tabela.innerHTML =
    '<table><thead><tr>' +
    '<th>Serial</th><th>Versão</th><th>Atualizou em</th><th>Visto por último</th><th>Modelo</th><th>IP</th><th>Root</th>' +
    '</tr></thead><tbody>' + linhas + '</tbody></table>';
}

/** Compara duas versões campo a campo; -1, 0 ou 1. */
function comparar(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

async function carregar() {
  try {
    const r = await fetch('/boxes?chave=' + encodeURIComponent(CHAVE), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    erro.hidden = true;
    desenhar(await r.json());
  } catch (e) {
    erro.hidden = false;
    erro.textContent = 'Não foi possível ler o painel: ' + e.message;
  }
}

document.getElementById('form').addEventListener('submit', async ev => {
  ev.preventDefault();
  recado.textContent = '...';
  try {
    const r = await fetch('/alvo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Chave': CHAVE },
      body: JSON.stringify({ alvo: campoAlvo.value.trim() || null }),
    });
    const corpo = await r.json();
    if (!r.ok) throw new Error(corpo.erro || ('HTTP ' + r.status));
    recado.textContent = corpo.alvo ? 'alvo: ' + corpo.alvo : 'alvo removido';
    await carregar();
  } catch (e) {
    recado.textContent = 'erro: ' + e.message;
  }
});

carregar();
setInterval(carregar, 60000);
</script>
</body>
</html>
`;
}

/**
 * A chave vem da URL e é escrita dentro de um `<script>`. `JSON.stringify` cuida
 * das aspas, mas não de um `</script>` que viesse no meio do valor — que
 * fecharia o bloco mais cedo e transformaria o resto em HTML. Escapado o `<`,
 * não sobra como fechar a tag.
 */
function paraScript(valor: string): string {
  return JSON.stringify(valor).replace(/</g, '\\u003c');
}

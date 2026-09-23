import { AJUDANTES, casco, paraScript } from './html.js';

/**
 * A página do painel: só os boxes da balança, e só o que eles relatam.
 *
 * Ela nasce vazia e se preenche por `fetch` em `/boxes?chave=…` — o mesmo
 * endpoint que qualquer outro cliente usaria. A chave vai embutida na página
 * (o usuário já a mandou na URL para chegar aqui), então a página é tão
 * secreta quanto o link.
 *
 * Quem foi cadastrado no inventário e nunca bateu **não** entra nesta tabela:
 * um aparelho de outro software, ou um box que ainda não recebeu a 2.8.501,
 * apareceria como se estivesse mudo, e o painel deixaria de responder à
 * pergunta dele ("o que a frota está rodando"). Esses ficam na outra tela, e
 * daqui só se vê a contagem e o caminho.
 *
 * Atualiza sozinha a cada 60 s: a ideia é deixar aberta num canto e ver os
 * boxes aparecerem.
 */
export function pagina(chave: string): string {
  return casco({
    titulo: 'Painel dos boxes',
    sub: 'Versão instalada, quando atualizou e quando foi visto por último, para os boxes que batem no painel. Atualiza sozinho a cada 60 s.',
    atual: 'painel',
    chave,
    corpo: `<p class="erro" id="erro" hidden></p>
<div id="tabela"></div>
<p class="sub" id="fora" hidden></p>

<form id="form">
  <label for="alvo">Alvo de atualização — a versão mais nova que os boxes podem instalar (vazio = sem teto)</label>
  <input id="alvo" name="alvo" placeholder="2.8.501" autocomplete="off">
  <button type="submit">Gravar</button>
  <span class="recado" id="recado"></span>
</form>

<script>
const CHAVE = ${paraScript(chave)};
const tabela = document.getElementById('tabela');
const fora = document.getElementById('fora');
const erro = document.getElementById('erro');
const recado = document.getElementById('recado');
const campoAlvo = document.getElementById('alvo');
let primeiraCarga = true;
${AJUDANTES}
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

  const daBalanca = dados.boxes.filter(b => !b.nuncaBateu);
  const soNoInventario = dados.boxes.length - daBalanca.length;
  if (soNoInventario > 0) {
    fora.hidden = false;
    fora.innerHTML = soNoInventario === 1
      ? '1 aparelho do inventário ainda não bateu. <a href="/inventario?chave=' + encodeURIComponent(CHAVE) + '">Ver inventário</a>.'
      : soNoInventario + ' aparelhos do inventário ainda não bateram. <a href="/inventario?chave=' + encodeURIComponent(CHAVE) + '">Ver inventário</a>.';
  } else {
    fora.hidden = true;
  }

  if (!daBalanca.length) {
    tabela.innerHTML = '<p class="fraco">Nenhum box bateu ainda. O primeiro contato acontece ~30 s depois de o app subir, e a cada 10 min daí em diante.</p>';
    return;
  }
  const linhas = daBalanca.map(b => {
    // Sem alvo, qualquer versão instalada está em dia; com alvo, quem está
    // abaixo dele é o que precisa de atenção.
    const atrasado = alvo !== null && comparar(b.versao, alvo) < 0;
    const marca = atrasado
      ? '<span class="atrasado">desatualizado</span>'
      : (alvo === null ? '' : '<span class="ok">em dia</span>');
    return '<tr>' +
      '<td class="serial">' + escapar(b.serial) + '</td>' +
      '<td><span class="versao">' + escapar(b.versao) + '</span> ' + marca + '</td>' +
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
</script>`,
  });
}

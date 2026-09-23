import { AJUDANTES, casco, paraScript } from './html.js';

/**
 * A página do inventário: onde está cada aparelho, de quem é e para que serve.
 *
 * É a única tela que mostra **todos** os cadastros, e não só os boxes que
 * batem. O painel responde "o que a frota está rodando"; esta responde "onde
 * está o quê" — e as duas perguntas têm conjuntos diferentes: um aparelho que
 * nunca se anunciou (outro software, ou um box que ainda não recebeu o app
 * novo) tem lugar aqui e não tem lugar lá.
 *
 * Ao contrário do painel, esta página não se atualiza sozinha. Preencher vinte
 * linhas é uma sentada só, e um redesenho no meio apagaria o que está sendo
 * digitado. O que ela faz é marcar as linhas mexidas e mandar só elas ao
 * salvar.
 *
 * O serial é a chave: o do app (`GFIG-…`) ou uma etiqueta sua, desde que seja
 * a mesma coisa que aparecerá na batida — é o que liga a ficha ao aparelho.
 */
export function paginaInventario(chave: string): string {
  return casco({
    titulo: 'Inventário dos aparelhos',
    sub: 'Onde está cada aparelho, de quem é e para que serve — os que rodam o app da balança e os que não rodam. O painel só mostra quem bate; aqui está tudo o que você cadastrar.',
    atual: 'inventario',
    chave,
    corpo: `<p class="erro" id="erro" hidden></p>

<form id="novo">
  <label for="novoSerial">Cadastrar um aparelho pelo serial — o do app, ou uma etiqueta sua (patrimônio, por exemplo)</label>
  <input id="novoSerial" placeholder="GFIG-TX9-58EB81E3618A" autocomplete="off">
  <button type="submit">Cadastrar</button>
  <span class="recado" id="recadoNovo"></span>
</form>

<h2>Aparelhos cadastrados</h2>
<div id="tabela"></div>

<div class="barra">
  <button id="salvar" disabled>Salvar alterações</button>
  <span class="recado" id="recado"></span>
</div>

<script>
const CHAVE = ${paraScript(chave)};
const CAMPOS = ['local', 'responsavel', 'finalidade'];
const ROTULOS = { local: 'Onde está', responsavel: 'De quem é', finalidade: 'Para que serve' };
const tabela = document.getElementById('tabela');
const erro = document.getElementById('erro');
const recado = document.getElementById('recado');
const recadoNovo = document.getElementById('recadoNovo');
const campoNovo = document.getElementById('novoSerial');
const botaoSalvar = document.getElementById('salvar');
/** O que estava gravado quando a página carregou, por serial. */
let originais = new Map();
${AJUDANTES}
function valores(linha) {
  const saida = {};
  for (const c of CAMPOS) saida[c] = linha.querySelector('[data-campo="' + c + '"]').value.trim();
  return saida;
}

function sujo(linha) {
  const antes = originais.get(linha.dataset.serial);
  if (!antes) return true;
  const agora = valores(linha);
  return CAMPOS.some(c => agora[c] !== (antes[c] || ''));
}

function marcar() {
  let n = 0;
  for (const linha of tabela.querySelectorAll('tr[data-serial]')) {
    const mexida = sujo(linha);
    linha.classList.toggle('suja', mexida);
    if (mexida) n++;
  }
  botaoSalvar.disabled = n === 0;
  botaoSalvar.textContent = n === 1 ? 'Salvar 1 alteração' : 'Salvar ' + n + ' alterações';
}

function desenhar(boxes) {
  originais = new Map(boxes.map(b => [b.serial, Object.assign({}, b.ficha)]));
  if (!boxes.length) {
    tabela.innerHTML = '<p class="fraco">Nada cadastrado ainda. Comece pelo serial de um aparelho, acima.</p>';
    return;
  }
  const linhas = boxes.map(b => {
    const celulas = CAMPOS.map(c =>
      '<td><input data-campo="' + c + '" aria-label="' + ROTULOS[c] + '" maxlength="300" value="' +
      escapar(b.ficha[c] || '') + '"></td>').join('');
    const estado = b.nuncaBateu
      ? '<span class="fraco">nunca bateu</span>'
      : 'v' + escapar(b.versao) + ' <span class="fraco">· ' + escapar(quando(b.ultimaBatidaEm)) + '</span>';
    const acao = b.nuncaBateu
      ? '<button type="button" class="remover" data-remover="' + escapar(b.serial) + '">Remover</button>'
      : '<span class="fraco" title="aparelho que já bateu não sai do inventário por aqui">—</span>';
    return '<tr data-serial="' + escapar(b.serial) + '">' +
      '<td class="serial">' + escapar(b.serial) + '</td>' +
      '<td>' + estado + '</td>' + celulas + '<td>' + acao + '</td>' +
      '</tr>';
  }).join('');
  tabela.innerHTML = '<table class="fichas"><thead><tr><th>Serial</th><th>No painel</th>' +
    CAMPOS.map(c => '<th>' + ROTULOS[c] + '</th>').join('') + '<th></th></tr></thead><tbody>' +
    linhas + '</tbody></table>';
}

async function carregar() {
  try {
    const r = await fetch('/boxes?chave=' + encodeURIComponent(CHAVE), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    erro.hidden = true;
    desenhar((await r.json()).boxes);
    marcar();
  } catch (e) {
    erro.hidden = false;
    erro.textContent = 'Não foi possível ler o inventário: ' + e.message;
  }
}

function cabecalhos() {
  return { 'Content-Type': 'application/json', 'X-Chave': CHAVE };
}

async function pedir(rota, corpo) {
  const r = await fetch(rota, { method: 'POST', headers: cabecalhos(), body: JSON.stringify(corpo) });
  if (!r.ok) {
    const volta = await r.json().catch(() => ({}));
    throw new Error(volta.erro || ('HTTP ' + r.status));
  }
}

async function salvar() {
  const linhas = [...tabela.querySelectorAll('tr[data-serial]')].filter(sujo);
  if (!linhas.length) return;
  botaoSalvar.disabled = true;
  recado.textContent = 'salvando…';
  let salvos = 0;
  const falhas = [];
  for (const linha of linhas) {
    const serial = linha.dataset.serial;
    try {
      await pedir('/box', Object.assign({ serial }, valores(linha)));
      salvos++;
    } catch (e) {
      falhas.push(serial + ' (' + e.message + ')');
    }
  }
  recado.textContent = falhas.length
    ? salvos + ' salvo(s), ' + falhas.length + ' não: ' + falhas.join('; ')
    : (salvos === 1 ? '1 aparelho salvo' : salvos + ' aparelhos salvos');
  await carregar();
}

async function remover(serial) {
  if (!confirm('Tirar ' + serial + ' do inventário?')) return;
  try {
    await pedir('/box/remover', { serial });
    recado.textContent = serial + ' saiu do inventário';
    await carregar();
  } catch (e) {
    erro.hidden = false;
    erro.textContent = 'Não deu para remover ' + serial + ': ' + e.message;
  }
}

tabela.addEventListener('input', marcar);
tabela.addEventListener('click', ev => {
  const botao = ev.target.closest('[data-remover]');
  if (botao) remover(botao.dataset.remover);
});

document.getElementById('novo').addEventListener('submit', async ev => {
  ev.preventDefault();
  const serial = campoNovo.value.trim();
  if (!serial) return;
  recadoNovo.textContent = '…';
  try {
    await pedir('/box', { serial });
    campoNovo.value = '';
    recadoNovo.textContent = serial + ' cadastrado';
    await carregar();
  } catch (e) {
    recadoNovo.textContent = 'erro: ' + e.message;
  }
});

carregar();
</script>`,
  });
}

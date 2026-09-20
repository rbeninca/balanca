import { TelaCreditos } from './TelaCreditos.js';
import { TelaEsquema } from './TelaEsquema.js';
import { TelaPendrive } from './TelaPendrive.js';
import { TelaAtualizacao } from './TelaAtualizacao.js';
import { WizardCalibracao, type Fonte as FonteCalibracao } from './WizardCalibracao.js';
import { resumir, type EstadoAtualizacaoApp } from './atualizacaoApp.js';
import { estadoGateway, estadoConexao, linhasClientes, descreverChip, type EstadoGatewayDados } from '../nucleo/EstadoGateway.js';

export interface StatusConexao {
  endereco: string;   // ex: "192.168.1.100" ou "WebSerial"
  conectado: boolean;
  /** IPv4 por interface do box (ver SaudeGateway.enderecos). Ausente em gateway antigo. */
  enderecos?: Record<string, string>;
}

export interface NavProps {
  ativo:            'conexao' | 'medicao' | 'jogos' | 'sessoes' | 'configuracoes' | 'firmware';
  onConexao:        () => void;
  onMedicao?:       () => void;
  onJogos?:         () => void;
  onSessoes:        () => void;
  onConfiguracoes?: () => void;
  onFirmware:       () => void;
  status?:          StatusConexao;
}

/**
 * Barra: Conexão · Medição · Sessões à esquerda; à direita o chip de status
 * (IP · Hz · clientes), o tema e a engrenagem com o resto (Configurações,
 * Jogos, Firmware, Atualização, Pendrive, Montagem, Créditos).
 */

/** Fonte conectada (para o assistente de calibração no menu); null quando desconectado. */
let fonteCalibracao: FonteCalibracao | null = null;
export function definirFonteCalibracao(fonte: FonteCalibracao | null): void { fonteCalibracao = fonte; }

export interface ItemMenu {
  id: string;
  label: string;
  /** 'tela' navega (callback em NavProps); 'modal' abre um overlay. */
  tipo: 'tela' | 'modal';
  disponivel: boolean;
  ativo: boolean;
  grupo: 'operacao' | 'box' | 'ajuda';
}

/** Itens da engrenagem, na ordem e agrupamento exibidos. */
export function itensMenu(props: Pick<NavProps, 'ativo' | 'onConfiguracoes' | 'onJogos' | 'onFirmware'>, temFonte = fonteCalibracao !== null): ItemMenu[] {
  return [
    { id: 'nav-calibracao',  label: 'Calibração',    tipo: 'modal', disponivel: temFonte,                ativo: false,                           grupo: 'operacao' },
    { id: 'nav-config',      label: 'Configurações', tipo: 'tela',  disponivel: !!props.onConfiguracoes, ativo: props.ativo === 'configuracoes', grupo: 'operacao' },
    { id: 'nav-jogos',       label: 'Jogos',         tipo: 'tela',  disponivel: !!props.onJogos,         ativo: props.ativo === 'jogos',         grupo: 'operacao' },
    { id: 'nav-firmware',    label: 'Firmware',      tipo: 'tela',  disponivel: !!props.onFirmware,      ativo: props.ativo === 'firmware',      grupo: 'box' },
    { id: 'nav-atualizacao', label: 'Atualização',   tipo: 'modal', disponivel: true,                    ativo: false,                           grupo: 'box' },
    { id: 'nav-pendrive',    label: 'Pendrive',      tipo: 'modal', disponivel: true,                    ativo: false,                           grupo: 'box' },
    { id: 'nav-montagem',    label: 'Montagem',      tipo: 'modal', disponivel: true,                    ativo: false,                           grupo: 'ajuda' },
    { id: 'nav-creditos',    label: 'Créditos',      tipo: 'modal', disponivel: true,                    ativo: false,                           grupo: 'ajuda' },
  ];
}

/** Texto do contador de clientes no chip; vazio quando não há gateway com gravação compartilhada. */
export function textoClientes(e: EstadoGatewayDados): string {
  if (!e.disponivel || e.clientes.length === 0) return '';
  return `👥 ${e.clientes.length}`;
}

function itemNav(id: string, label: string, isAtivo: boolean, cb: (() => void) | undefined): string {
  if (isAtivo)  return `<a href="#" id="${id}" class="ativo">${label}</a>`;
  if (!cb)      return `<span class="nav-desativado">${label}</span>`;
  return `<a href="#" id="${id}">${label}</a>`;
}

/**
 * Endereços do box, um por interface: `eth0 192.168.1.110 · wlan0 192.168.43.1`.
 *
 * É o que interessa no chip — com que endereços o box aparece na rede. O
 * endereço de conexão entra junto quando diz outra coisa: visto do próprio box
 * ele é `127.0.0.1`, e aí mostra de onde a tela está olhando. Vindo de um
 * celular pela LAN ele repete o `eth0`, e aí seria só ruído.
 *
 * Gateway anterior à 2.7.0 não publica endereços: aí fica só o de conexão.
 */
export function montarEndereco(endereco: string, enderecos?: Record<string, string>): string {
  const entradas = Object.entries(enderecos ?? {}).filter(([, ip]) => ip);
  if (entradas.length === 0) return endereco;
  const doBox = entradas.map(([nome, ip]) => `${nome} ${ip}`);
  const repete = entradas.some(([, ip]) => ip === endereco);
  return repete ? doBox.join(' · ') : [endereco, ...doBox].join(' · ');
}

/**
 * Endereços que o gateway publicou no SAUDE. Fica no módulo porque o chip é
 * desenhado uma vez e o batimento chega depois — quando chega, [definirEnderecosDoBox]
 * repinta o que já está na tela.
 */
let enderecosDoBox: Record<string, string> = {};

/** Endereço de conexão do chip em tela, para repintar sem perder o contexto. */
let enderecoConexaoAtual = '';

export function definirEnderecosDoBox(enderecos: Record<string, string>): void {
  enderecosDoBox = enderecos;

  const chip = document.querySelector<HTMLElement>('.nav-status-chip');
  const el   = document.querySelector<HTMLElement>('.nav-endereco');
  if (chip && el && enderecoConexaoAtual) {
    el.textContent = montarEndereco(enderecoConexaoAtual, enderecosDoBox);
  }

  // Painel aberto também se atualiza, senão mostraria a lista velha
  const painel = document.querySelector<HTMLElement>('#nav-enderecos-painel');
  if (painel && !painel.classList.contains('hidden')) painel.innerHTML = painelEnderecosHtml();
}

function statusHtml(s: StatusConexao): string {
  const classe = s.conectado ? 'conectado' : 'desconectado';
  const dono   = montarEndereco(s.endereco, s.enderecos);
  const texto  = s.conectado ? dono : `${dono} — desconectado`;
  // O wrap existe para o painel de endereços se posicionar sob o chip
  return `<span class="nav-enderecos-wrap"><span class="nav-status-chip ${classe}" role="button" tabindex="0" title="Endereços do box"><span class="nav-endereco">${texto}</span><span id="nav-hz" class="nav-hz"></span><button id="nav-clientes" class="nav-clientes hidden" type="button" title="Clientes conectados ao gateway"></button></span><div id="nav-enderecos-painel" class="nav-enderecos-painel hidden"></div></span>`;
}

/**
 * Endereços em lista, para o painel que abre ao tocar no chip.
 *
 * Existe porque em tela estreita o texto do chip é escondido por CSS
 * (`@media (max-width: 480px) { .nav-endereco { display: none } }`) — no
 * celular, tocar no chip é como se chega aos endereços.
 */
function painelEnderecosHtml(): string {
  const entradas = Object.entries(enderecosDoBox).filter(([, ip]) => ip);
  const linhas = entradas.map(([nome, ip]) =>
    `<div class="nav-enderecos-linha"><span class="nav-enderecos-nome">${nome}</span><span class="nav-enderecos-ip">${ip}</span></div>`);

  // A conexão entra quando diz outra coisa: no próprio box é 127.0.0.1
  if (enderecoConexaoAtual && !entradas.some(([, ip]) => ip === enderecoConexaoAtual)) {
    const rotulo = /^(127\.|localhost)/.test(enderecoConexaoAtual) ? 'esta tela' : 'conexão';
    linhas.unshift(`<div class="nav-enderecos-linha"><span class="nav-enderecos-nome">${rotulo}</span><span class="nav-enderecos-ip">${enderecoConexaoAtual}</span></div>`);
  }

  if (linhas.length === 0) return '<div class="nav-enderecos-vazio">sem endereço de rede</div>';
  return '<div class="nav-enderecos-titulo">Endereços do box</div>' + linhas.join('');
}

function menuHtml(itens: ItemMenu[]): string {
  const grupos: ItemMenu['grupo'][] = ['operacao', 'box', 'ajuda'];
  const blocos = grupos.map(g => itens.filter(i => i.grupo === g).map(i => {
    const aviso = i.id === 'nav-atualizacao' ? '<span id="nav-atualizacao-aviso" class="nav-aviso hidden">●</span>' : '';
    if (!i.disponivel) return `<span class="nav-menu-item nav-desativado">${i.label}</span>`;
    return `<a href="#" id="${i.id}" class="nav-menu-item${i.ativo ? ' ativo' : ''}">${i.label}${aviso}</a>`;
  }).join(''));
  return blocos.filter(b => b).map(b => `<div class="nav-menu-grupo">${b}</div>`).join('');
}

export function navHtml(props: NavProps): string {
  const escuro = document.documentElement.dataset['tema'] === 'escuro';
  const itens = itensMenu(props);
  const menuAtivo = itens.some(i => i.ativo);
  return `
    <div class="nav-links">
      ${itemNav('nav-conexao', 'Conexão', props.ativo === 'conexao', props.onConexao)}
      ${itemNav('nav-medir',   'Medição', props.ativo === 'medicao', props.onMedicao)}
      ${itemNav('nav-sessoes', 'Sessões', props.ativo === 'sessoes', props.onSessoes)}
      <div class="nav-direita">
        ${props.status ? statusHtml(props.status) : ''}
        <button id="nav-tema" class="nav-icone" type="button" title="Alternar modo escuro/claro">${escuro ? '☀' : '🌙'}</button>
        <div class="nav-menu-wrap">
          <button id="nav-menu-btn" class="nav-icone${menuAtivo ? ' ativo' : ''}" type="button" title="Mais opções" aria-haspopup="true" aria-expanded="false">⚙<span id="nav-menu-aviso" class="nav-aviso hidden">●</span></button>
          <div id="nav-menu" class="nav-menu hidden" role="menu">${menuHtml(itens)}</div>
        </div>
      </div>
      <div id="nav-clientes-painel" class="nav-clientes-painel hidden"></div>
    </div>
  `;
}

let cancelarObservacao: (() => void) | null = null;
let cancelarObservacaoLigacao: (() => void) | null = null;
/** Fecha menu e painel da barra atual; registrado uma vez no document (a barra é recriada a cada tela). */
let fecharFlutuantes: () => void = () => {};
let ouvintesGlobais = false;

export function bindNav(container: HTMLElement, props: NavProps): void {
  const bind = (id: string, cb: (() => void) | undefined) => {
    if (!cb) return;
    container.querySelector(`#${id}`)?.addEventListener('click', (e) => {
      e.preventDefault(); fecharMenu(); cb();
    });
  };

  bind('nav-conexao',  props.onConexao);
  bind('nav-medir',    props.onMedicao);
  bind('nav-sessoes',  props.onSessoes);
  bind('nav-config',   props.onConfiguracoes);
  bind('nav-jogos',    props.onJogos);
  bind('nav-firmware', props.onFirmware);

  const modais: Record<string, () => void> = {
    'nav-calibracao':  () => { if (fonteCalibracao) new WizardCalibracao(fonteCalibracao, () => {}); },
    'nav-atualizacao': () => new TelaAtualizacao(),
    'nav-pendrive':    () => new TelaPendrive(),
    'nav-montagem':    () => new TelaEsquema(),
    'nav-creditos':    () => new TelaCreditos(),
  };
  for (const [id, abrir] of Object.entries(modais)) {
    container.querySelector(`#${id}`)?.addEventListener('click', (e) => { e.preventDefault(); fecharMenu(); abrir(); });
  }

  // Engrenagem: abre/fecha por clique; fecha ao clicar fora ou com Esc
  const menuBtn = container.querySelector<HTMLButtonElement>('#nav-menu-btn');
  const menu    = container.querySelector<HTMLElement>('#nav-menu');
  const fecharMenu = () => { menu?.classList.add('hidden'); menuBtn?.setAttribute('aria-expanded', 'false'); };
  menuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const aberto = !menu?.classList.contains('hidden');
    if (aberto) fecharMenu();
    else { fecharPainelClientes(); menu?.classList.remove('hidden'); menuBtn.setAttribute('aria-expanded', 'true'); }
  });
  menu?.addEventListener('click', (e) => e.stopPropagation());

  // Clientes conectados: painel com a lista
  const btnClientes = container.querySelector<HTMLButtonElement>('#nav-clientes');
  const painel      = container.querySelector<HTMLElement>('#nav-clientes-painel');
  const fecharPainelClientes = () => painel?.classList.add('hidden');
  btnClientes?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!painel) return;
    if (!painel.classList.contains('hidden')) { fecharPainelClientes(); return; }
    fecharMenu();
    painel.innerHTML = painelClientesHtml(estadoGateway.obter());
    painel.classList.remove('hidden');
  });
  painel?.addEventListener('click', (e) => e.stopPropagation());

  // Endereços do box: em tela estreita o CSS esconde o texto do chip
  // (.nav-endereco), então tocar no chip é como se chega aos endereços
  const chipEnd   = container.querySelector<HTMLElement>('.nav-status-chip');
  const painelEnd = container.querySelector<HTMLElement>('#nav-enderecos-painel');
  const fecharPainelEnderecos = () => painelEnd?.classList.add('hidden');
  chipEnd?.addEventListener('click', (e) => {
    if (!painelEnd) return;
    if ((e.target as HTMLElement).closest('#nav-clientes')) return; // tem painel próprio
    e.stopPropagation();
    if (!painelEnd.classList.contains('hidden')) { fecharPainelEnderecos(); return; }
    fecharMenu(); fecharPainelClientes();
    painelEnd.innerHTML = painelEnderecosHtml();
    painelEnd.classList.remove('hidden');
  });
  painelEnd?.addEventListener('click', (e) => e.stopPropagation());

  fecharFlutuantes = () => { fecharMenu(); fecharPainelClientes(); fecharPainelEnderecos(); };
  if (!ouvintesGlobais) {
    ouvintesGlobais = true;
    document.addEventListener('click', () => fecharFlutuantes());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharFlutuantes(); });
  }

  // Chip: contador de clientes acompanha o estado do gateway enquanto esta barra existir
  cancelarObservacao?.();
  cancelarObservacao = estadoGateway.observar((e) => {
    if (!btnClientes) return;
    const texto = textoClientes(e);
    btnClientes.textContent = texto;
    btnClientes.classList.toggle('hidden', texto === '');
    btnClientes.classList.toggle('gravando', e.gravandoPor !== null);
    if (painel && !painel.classList.contains('hidden')) painel.innerHTML = painelClientesHtml(e);
  });

  // Chip: verde (dados) · amarelo (gateway vivo sem célula) · vermelho (reconectando)
  const chip = container.querySelector<HTMLElement>('.nav-status-chip');
  const endereco = container.querySelector<HTMLElement>('.nav-endereco');
  // Guardado para o repintar de definirEnderecosDoBox, quando o SAUDE chegar
  enderecoConexaoAtual = props.status?.endereco ?? '';
  cancelarObservacaoLigacao?.();
  cancelarObservacaoLigacao = estadoConexao.observar((e) => {
    if (!chip || !endereco || !props.status) return;
    const a = descreverChip(e, montarEndereco(enderecoConexaoAtual, enderecosDoBox));
    chip.classList.remove('conectado', 'atencao', 'reconectando', 'desconectado');
    chip.classList.add(a.classe);
    endereco.textContent = a.texto;
    // A contagem de clientes é do gateway: sem ligação, ela está velha
    if (e && e.fase !== 'ok') btnClientes?.classList.add('hidden');
    else if (btnClientes) btnClientes.classList.toggle('hidden', textoClientes(estadoGateway.obter()) === '');
  });

  void marcarAtualizacaoDisponivel(container);

  const temaBtn = container.querySelector<HTMLButtonElement>('#nav-tema');
  if (temaBtn) {
    temaBtn.addEventListener('click', () => {
      const escuro = document.documentElement.dataset['tema'] === 'escuro';
      const novoTema = escuro ? '' : 'escuro';
      document.documentElement.dataset['tema'] = novoTema;
      localStorage.setItem('balancagfig:tema', novoTema);
      temaBtn.textContent = novoTema === 'escuro' ? '☀' : '🌙';
    });
  }
}

function painelClientesHtml(e: EstadoGatewayDados): string {
  const linhas = linhasClientes(e, Date.now());
  if (linhas.length === 0) return '<div class="nav-clientes-vazio">Nenhum cliente conectado.</div>';
  return `
    <div class="nav-clientes-titulo">${linhas.length === 1 ? '1 cliente conectado' : `${linhas.length} clientes conectados`} ao gateway</div>
    ${linhas.map(l => `
      <div class="nav-clientes-linha${l.gravando ? ' gravando' : ''}">
        <span class="nav-clientes-end">${l.endereco}</span>
        <span class="nav-clientes-desde">${l.desde}</span>
        ${l.gravando ? '<span class="nav-clientes-rec">● gravando</span>' : ''}
      </div>`).join('')}
  `;
}

/**
 * Acende o ponto na engrenagem e no item "Atualização" quando o box já sabe
 * de uma versão nova (o serviço consulta o repositório sozinho). Silencioso
 * quando não há gateway.
 */
async function marcarAtualizacaoDisponivel(container: HTMLElement): Promise<void> {
  const avisos = container.querySelectorAll<HTMLElement>('#nav-atualizacao-aviso, #nav-menu-aviso');
  if (avisos.length === 0) return;
  try {
    const r = await fetch(`http://${location.hostname}:3000/atualizacao`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return;
    const e = await r.json() as EstadoAtualizacaoApp;
    const ha = resumir(e).haAtualizacao;
    avisos.forEach(a => a.classList.toggle('hidden', !ha));
  } catch { /* sem gateway (WebSerial / Pages): fica escondido */ }
}

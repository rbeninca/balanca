import { TelaCreditos } from './TelaCreditos.js';
import { TelaEsquema } from './TelaEsquema.js';
import { TelaPendrive } from './TelaPendrive.js';
import { TelaAtualizacao } from './TelaAtualizacao.js';
import { resumir, type EstadoAtualizacaoApp } from './atualizacaoApp.js';

export interface StatusConexao {
  endereco: string;   // ex: "192.168.1.100" ou "WebSerial"
  conectado: boolean;
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

function itemNav(id: string, label: string, isAtivo: boolean, cb: (() => void) | undefined, extra = ''): string {
  if (isAtivo)  return `<a href="#" id="${id}" class="ativo"${extra}>${label}</a>`;
  if (!cb)      return `<span class="nav-desativado"${extra}>${label}</span>`;
  return `<a href="#" id="${id}"${extra}>${label}</a>`;
}

function statusHtml(s: StatusConexao): string {
  const classe = s.conectado ? 'conectado' : 'desconectado';
  const texto  = s.conectado ? s.endereco  : `${s.endereco} — desconectado`;
  return `<div class="nav-status"><span class="nav-status-chip ${classe}">${texto}<span id="nav-hz" class="nav-hz"></span></span></div>`;
}

export function navHtml(props: NavProps): string {
  const escuro = document.documentElement.dataset['tema'] === 'escuro';
  return `
    <div class="nav-links">
      ${itemNav('nav-conexao',  'Conexão',       props.ativo === 'conexao',       props.onConexao)}
      ${itemNav('nav-medir',    'Medição',        props.ativo === 'medicao',       props.onMedicao)}
      ${itemNav('nav-jogos',    'Jogos',          props.ativo === 'jogos',         props.onJogos)}
      ${itemNav('nav-sessoes',  'Sessões',        props.ativo === 'sessoes',       props.onSessoes)}
      ${itemNav('nav-config',   'Configurações',  props.ativo === 'configuracoes', props.onConfiguracoes)}
      ${itemNav('nav-firmware', 'Firmware',       props.ativo === 'firmware',      props.onFirmware, ' style="margin-left:auto"')}
      <a href="#" id="nav-pendrive">Pendrive</a>
      <a href="#" id="nav-atualizacao" title="Atualização do app do TVBox">Atualização<span id="nav-atualizacao-aviso" class="nav-aviso hidden" title="Há versão nova">●</span></a>
      <a href="#" id="nav-montagem">Montagem</a>
      <a href="#" id="nav-creditos">Créditos</a>
      <button id="nav-tema" class="nav-tema-btn" title="Alternar modo escuro/claro">${escuro ? '☀' : '🌙'}</button>
    </div>
    ${props.status ? statusHtml(props.status) : ''}
  `;
}

export function bindNav(container: HTMLElement, props: NavProps): void {
  const bind = (id: string, cb: (() => void) | undefined) => {
    if (!cb) return;
    container.querySelector(`#${id}`)?.addEventListener('click', (e) => {
      e.preventDefault(); cb();
    });
  };

  bind('nav-conexao',  props.onConexao);
  bind('nav-medir',    props.onMedicao);
  bind('nav-jogos',    props.onJogos);
  bind('nav-sessoes',  props.onSessoes);
  bind('nav-config',   props.onConfiguracoes);
  bind('nav-firmware', props.onFirmware);

  container.querySelector('#nav-pendrive')?.addEventListener('click', (e) => {
    e.preventDefault(); new TelaPendrive();
  });
  container.querySelector('#nav-atualizacao')?.addEventListener('click', (e) => {
    e.preventDefault(); new TelaAtualizacao();
  });
  void marcarAtualizacaoDisponivel(container);

  container.querySelector('#nav-montagem')?.addEventListener('click', (e) => {
    e.preventDefault(); new TelaEsquema();
  });
  container.querySelector('#nav-creditos')?.addEventListener('click', (e) => {
    e.preventDefault(); new TelaCreditos();
  });

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

/**
 * Acende o ponto no item "Atualização" quando o box já sabe de uma versão nova
 * (o serviço consulta o repositório sozinho). Silencioso quando não há gateway.
 */
async function marcarAtualizacaoDisponivel(container: HTMLElement): Promise<void> {
  const aviso = container.querySelector<HTMLElement>('#nav-atualizacao-aviso');
  if (!aviso) return;
  try {
    const r = await fetch(`http://${location.hostname}:3000/atualizacao`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return;
    const e = await r.json() as EstadoAtualizacaoApp;
    aviso.classList.toggle('hidden', !resumir(e).haAtualizacao);
  } catch { /* sem gateway (WebSerial / Pages): fica escondido */ }
}

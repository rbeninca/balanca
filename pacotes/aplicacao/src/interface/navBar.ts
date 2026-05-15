import { TelaCreditos } from './TelaCreditos.js';
import { TelaEsquema } from './TelaEsquema.js';

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
  return `
    <div class="nav-links">
      ${itemNav('nav-conexao',  'Conexão',       props.ativo === 'conexao',       props.onConexao)}
      ${itemNav('nav-medir',    'Medição',        props.ativo === 'medicao',       props.onMedicao)}
      ${itemNav('nav-jogos',    'Jogos',          props.ativo === 'jogos',         props.onJogos)}
      ${itemNav('nav-sessoes',  'Sessões',        props.ativo === 'sessoes',       props.onSessoes)}
      ${itemNav('nav-config',   'Configurações',  props.ativo === 'configuracoes', props.onConfiguracoes)}
      ${itemNav('nav-firmware', 'Firmware',       props.ativo === 'firmware',      props.onFirmware, ' style="margin-left:auto"')}
      <a href="#" id="nav-montagem">Montagem</a>
      <a href="#" id="nav-creditos">Créditos</a>
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

  container.querySelector('#nav-montagem')?.addEventListener('click', (e) => {
    e.preventDefault(); new TelaEsquema();
  });
  container.querySelector('#nav-creditos')?.addEventListener('click', (e) => {
    e.preventDefault(); new TelaCreditos();
  });
}

import { ArmazenamentoLocal } from './armazenamento/ArmazenamentoLocal.js';
import { GerenciadorSessao } from './nucleo/GerenciadorSessao.js';
import { TelaConexao } from './interface/TelaConexao.js';
import { TelaMedicao } from './interface/TelaMedicao.js';
import { TelaSessoes } from './interface/TelaSessoes.js';
import { TelaConfiguracoes } from './interface/TelaConfiguracoes.js';
import { TelaFirmware } from './interface/TelaFirmware.js';

const armazenamento = new ArmazenamentoLocal();
const gerenciador   = new GerenciadorSessao(armazenamento);

const app = document.getElementById('app')!;

type Tela = 'conexao' | 'medicao' | 'sessoes' | 'configuracoes' | 'firmware';

let telaAtual:  Tela   = 'conexao';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fonteAtual: any    = null;
let telaMedicaoAtual: TelaMedicao | null = null;
let telaFirmwareAtual: TelaFirmware | null = null;

function navegar(tela: Tela) {
  telaAtual = tela;
  renderizar();
}

function renderizar() {
  telaMedicaoAtual?.destruir();
  telaMedicaoAtual = null;
  telaFirmwareAtual?.destruir();
  telaFirmwareAtual = null;
  app.innerHTML    = '';

  switch (telaAtual) {
    case 'conexao':
      new TelaConexao(app, (fonte) => {
        fonteAtual = fonte;
        navegar('medicao');
      });
      break;

    case 'medicao':
      telaMedicaoAtual = new TelaMedicao(
        app,
        fonteAtual,
        gerenciador,
        armazenamento,
        () => navegar('sessoes'),
        () => navegar('configuracoes'),
      );
      break;

    case 'sessoes':
      new TelaSessoes(
        app,
        armazenamento,
        () => navegar('medicao'),
        () => navegar('configuracoes'),
      );
      break;

    case 'configuracoes':
      new TelaConfiguracoes(
        app,
        fonteAtual,
        () => navegar('medicao'),
        () => navegar('sessoes'),
        () => navegar('firmware'),
      );
      break;

    case 'firmware':
      telaFirmwareAtual = new TelaFirmware(
        app,
        () => navegar('configuracoes'),
      );
      break;
  }
}

renderizar();

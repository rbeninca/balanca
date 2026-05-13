import { ArmazenamentoLocal } from './armazenamento/ArmazenamentoLocal.js';
import { GerenciadorSessao } from './nucleo/GerenciadorSessao.js';
import { TelaConexao } from './interface/TelaConexao.js';
import { TelaMedicao } from './interface/TelaMedicao.js';
import { TelaSessoes } from './interface/TelaSessoes.js';

const armazenamento = new ArmazenamentoLocal();
const gerenciador = new GerenciadorSessao(armazenamento);

const app = document.getElementById('app')!;

type Tela = 'conexao' | 'medicao' | 'sessoes';

let telaAtual: Tela = 'conexao';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fonteAtual: any = null;

function navegar(tela: Tela) {
  telaAtual = tela;
  renderizar();
}

function renderizar() {
  app.innerHTML = '';
  switch (telaAtual) {
    case 'conexao':
      new TelaConexao(app, (fonte) => {
        fonteAtual = fonte;
        navegar('medicao');
      });
      break;
    case 'medicao':
      new TelaMedicao(app, fonteAtual, gerenciador, () => navegar('sessoes'));
      break;
    case 'sessoes':
      new TelaSessoes(app, armazenamento, () => navegar('medicao'));
      break;
  }
}

renderizar();

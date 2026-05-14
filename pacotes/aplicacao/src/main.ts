import { ArmazenamentoLocal, type IArmazenamento } from './armazenamento/ArmazenamentoLocal.js';
import { ArmazenamentoApi } from './armazenamento/ArmazenamentoApi.js';
import { GerenciadorSessao } from './nucleo/GerenciadorSessao.js';
import { TelaConexao } from './interface/TelaConexao.js';
import { TelaMedicao } from './interface/TelaMedicao.js';
import { TelaSessoes } from './interface/TelaSessoes.js';
import { TelaConfiguracoes } from './interface/TelaConfiguracoes.js';
import { TelaFirmware } from './interface/TelaFirmware.js';
import { FonteWebSocket } from './adaptadores/FonteWebSocket.js';
import type { StatusConexao } from './interface/navBar.js';

let armazenamento: IArmazenamento = new ArmazenamentoLocal();
let gerenciador = new GerenciadorSessao(armazenamento);

const app = document.getElementById('app')!;

type Tela = 'conexao' | 'medicao' | 'sessoes' | 'configuracoes' | 'firmware';

let telaAtual:       Tela              = 'conexao';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fonteAtual:      any               = null;
let enderecoAtual:   string | null     = null;
let telaMedicaoAtual:  TelaMedicao  | null = null;
let telaFirmwareAtual: TelaFirmware | null = null;

function statusConexao(): StatusConexao | undefined {
  return enderecoAtual ? { endereco: enderecoAtual, conectado: true } : undefined;
}

function navegar(tela: Tela) {
  telaAtual = tela;
  renderizar();
}

function renderizar() {
  telaMedicaoAtual?.destruir();
  telaMedicaoAtual = null;
  telaFirmwareAtual?.destruir();
  telaFirmwareAtual = null;
  app.innerHTML = '';

  switch (telaAtual) {
    case 'conexao':
      new TelaConexao(
        app,
        (fonte) => {
          fonteAtual = fonte;
          if (fonte instanceof FonteWebSocket) {
            try {
              const cfg = JSON.parse(localStorage.getItem('balancagfig:conexao') ?? '{}') as { ip?: string; chave?: string };
              const ip = cfg.ip || 'localhost';
              armazenamento = new ArmazenamentoApi(ip, cfg.chave || '');
              enderecoAtual = ip;
            } catch {
              armazenamento = new ArmazenamentoLocal();
              enderecoAtual = 'localhost';
            }
          } else {
            armazenamento = new ArmazenamentoLocal();
            enderecoAtual = 'WebSerial';
          }
          gerenciador = new GerenciadorSessao(armazenamento);
          navegar('medicao');
        },
        () => navegar('sessoes'),
        () => navegar('firmware'),
      );
      break;

    case 'medicao':
      telaMedicaoAtual = new TelaMedicao(
        app,
        fonteAtual,
        gerenciador,
        armazenamento,
        () => navegar('conexao'),
        () => navegar('sessoes'),
        () => navegar('configuracoes'),
        () => navegar('firmware'),
        statusConexao(),
      );
      break;

    case 'sessoes':
      new TelaSessoes(
        app,
        armazenamento,
        () => navegar('conexao'),
        () => navegar('firmware'),
        fonteAtual ? () => navegar('medicao')       : undefined,
        fonteAtual ? () => navegar('configuracoes') : undefined,
        statusConexao(),
      );
      break;

    case 'configuracoes':
      new TelaConfiguracoes(
        app,
        fonteAtual,
        () => navegar('conexao'),
        () => navegar('medicao'),
        () => navegar('sessoes'),
        () => navegar('firmware'),
        statusConexao(),
      );
      break;

    case 'firmware':
      if (fonteAtual?.desconectar) {
        void fonteAtual.desconectar();
        fonteAtual = null;
      }
      enderecoAtual = null;
      telaFirmwareAtual = new TelaFirmware(app, {
        onConexao:  () => navegar('conexao'),
        onSessoes:  () => navegar('sessoes'),
        onFirmware: () => navegar('firmware'),
      });
      break;
  }
}

renderizar();

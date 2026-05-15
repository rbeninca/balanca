import { ArmazenamentoLocal, type IArmazenamento } from './armazenamento/ArmazenamentoLocal.js';
import { ArmazenamentoApi } from './armazenamento/ArmazenamentoApi.js';
import { GerenciadorSessao } from './nucleo/GerenciadorSessao.js';
import { TelaConexao } from './interface/TelaConexao.js';
import { TelaMedicao } from './interface/TelaMedicao.js';
import { TelaJogos } from './interface/TelaJogos.js';
import { TelaMarteloThor } from './interface/TelaMarteloThor.js';
import { TelaSessoes } from './interface/TelaSessoes.js';
import { TelaConfiguracoes } from './interface/TelaConfiguracoes.js';
import { TelaFirmware } from './interface/TelaFirmware.js';
import { FonteWebSocket } from './adaptadores/FonteWebSocket.js';
import type { StatusConexao } from './interface/navBar.js';
import { PonteJogosLegados } from './jogos/PonteJogosLegados.js';

let armazenamento: IArmazenamento = new ArmazenamentoLocal();
let gerenciador = new GerenciadorSessao(armazenamento);
const ponteJogos = new PonteJogosLegados(globalThis.window as Window, globalThis.document);

class ContadorHz {
  private contagem = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private handler = () => { this.contagem++; };

  iniciar(fonte: { on: (e: string, cb: () => void) => void; off?: (e: string, cb: () => void) => void }) {
    this.parar();
    fonte.on('dados', this.handler);
    this.timer = setInterval(() => {
      const el = document.getElementById('nav-hz');
      if (el) el.textContent = this.contagem > 0 ? `· ${this.contagem} Hz` : '';
      this.contagem = 0;
    }, 1000);
    this.fonte = fonte;
  }

  parar() {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    this.fonte?.off?.('dados', this.handler);
    this.fonte = null;
    const el = document.getElementById('nav-hz');
    if (el) el.textContent = '';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private fonte: any = null;
}

const app = document.getElementById('app')!;

type Tela = 'conexao' | 'medicao' | 'jogos' | 'martelo-thor' | 'sessoes' | 'configuracoes' | 'firmware';

let telaAtual:       Tela              = 'conexao';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fonteAtual:      any               = null;
let enderecoAtual:   string | null     = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fontePonteAtual: any               = null;
let telaMedicaoAtual:  TelaMedicao  | null = null;
let telaMarteloAtual:  TelaMarteloThor | null = null;
let telaFirmwareAtual: TelaFirmware | null = null;
const contadorHz = new ContadorHz();

function statusConexao(): StatusConexao | undefined {
  return enderecoAtual ? { endereco: enderecoAtual, conectado: true } : undefined;
}

function navegar(tela: Tela) {
  telaAtual = tela;
  renderizar();
}

function atualizarStatusPonteJogos(conectado: boolean): void {
  ponteJogos.atualizarConexao({
    conectado,
    endereco: enderecoAtual,
    transporte: fonteAtual?.obterStatus?.().transporte ?? 'desconhecido',
  });

  if (!conectado) {
    ponteJogos.limparLeitura();
  }
}

function conectarPonteJogos(fonte: any): void {
  if (!fonte || fonte === fontePonteAtual) return;
  fontePonteAtual = fonte;

  fonte.on('dados', (leitura: { forcaNewton: number; marcaTemporal: number }) => {
    ponteJogos.atualizarLeitura(leitura);
  });
  fonte.on('config', (config: unknown) => {
    ponteJogos.atualizarConfiguracao(config);
  });
  fonte.on('status', (evento: unknown) => {
    if (!evento || typeof evento !== 'object') return;
    const conectado = (evento as Record<string, unknown>)['conectado'];
    if (typeof conectado === 'boolean') {
      atualizarStatusPonteJogos(conectado);
    }
  });
}

function renderizar() {
  telaMedicaoAtual?.destruir();
  telaMedicaoAtual = null;
  telaMarteloAtual?.destruir();
  telaMarteloAtual = null;
  telaFirmwareAtual?.destruir();
  telaFirmwareAtual = null;
  app.innerHTML = '';

  switch (telaAtual) {
    case 'conexao':
      contadorHz.parar();
      new TelaConexao(
        app,
        (fonte) => {
          if (fonteAtual?.desconectar) {
            void fonteAtual.desconectar();
          } else if (fonteAtual?.fechar) {
            fonteAtual.fechar();
          }

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
          contadorHz.iniciar(fonte);
          conectarPonteJogos(fonteAtual);
          atualizarStatusPonteJogos(true);
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
        () => navegar('jogos'),
        () => navegar('firmware'),
        statusConexao(),
      );
      break;

    case 'jogos':
      if (!fonteAtual) {
        navegar('conexao');
        return;
      }
      new TelaJogos(
        app,
        () => navegar('conexao'),
        () => navegar('medicao'),
        (idJogo) => navegar(idJogo as Tela),
        () => navegar('sessoes'),
        () => navegar('configuracoes'),
        () => navegar('firmware'),
        statusConexao(),
      );
      break;

    case 'martelo-thor':
      if (!fonteAtual) {
        navegar('conexao');
        return;
      }
      telaMarteloAtual = new TelaMarteloThor(
        app,
        () => navegar('conexao'),
        () => navegar('medicao'),
        () => navegar('jogos'),
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
        fonteAtual ? () => navegar('jogos')         : undefined,
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
        () => navegar('jogos'),
        () => navegar('sessoes'),
        () => navegar('firmware'),
        statusConexao(),
      );
      break;

    case 'firmware':
      contadorHz.parar();
      if (fonteAtual?.desconectar) {
        void fonteAtual.desconectar();
      } else if (fonteAtual?.fechar) {
        fonteAtual.fechar();
      }
      fonteAtual = null;
      enderecoAtual = null;
      fontePonteAtual = null;
      atualizarStatusPonteJogos(false);
      telaFirmwareAtual = new TelaFirmware(app, {
        onConexao:  () => navegar('conexao'),
        onSessoes:  () => navegar('sessoes'),
        onFirmware: () => navegar('firmware'),
      });
      break;
  }
}

renderizar();

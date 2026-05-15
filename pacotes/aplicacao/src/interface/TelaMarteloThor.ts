import {
  CHAVE_RANKING_MARTELO,
  atualizarRankingMartelo,
  criarPartidaMartelo,
  formatarForcaKg,
  formatarForcaN,
  mensagemDesempenho,
  posicaoNoRanking,
  type PartidaMartelo,
  type TentativaMartelo,
} from '../jogos/marteloThor/dominio.js';
import { bindNav, navHtml, type StatusConexao } from './navBar.js';

type FaseJogo = 'pronto' | 'countdown' | 'tentativa' | 'intervalo' | 'finalizado';
type PontoCurva = { tempoMs: number; forcaN: number };

type RefsMartelo = {
  jogo: HTMLElement | null;
  nomeJogador: HTMLInputElement | null;
  btnIniciar: HTMLButtonElement | null;
  btnResetar: HTMLButtonElement | null;
  btnTelaCheia: HTMLButtonElement | null;
  chipFase: HTMLElement | null;
  chipTentativa: HTMLElement | null;
  chipConexao: HTMLElement | null;
  forcaKg: HTMLElement | null;
  forcaN: HTMLElement | null;
  textoFase: HTMLElement | null;
  timer: HTMLElement | null;
  barraAtual: HTMLElement | null;
  barraPico: HTMLElement | null;
  escala: HTMLElement | null;
  tentativas: HTMLElement | null;
  ranking: HTMLElement | null;
  alerta: HTMLElement | null;
  feedback: HTMLElement | null;
  resumoMelhor: HTMLElement | null;
  resumoMedia: HTMLElement | null;
  resumoRanking: HTMLElement | null;
  canvasHost: HTMLElement | null;
  canvas: HTMLCanvasElement | null;
};

const TOTAL_TENTATIVAS = 3;
const CONTAGEM_MS = 3000;
const DURACAO_MAX_TENTATIVA_MS = 6000;
const DURACAO_MIN_TENTATIVA_MS = 700;
const INTERVALO_MS = 1500;
const AMOSTRAGEM_CURVA_MS = 40;
const LIMIAR_GOLPE_N = 35;
const LIMIAR_REPOUSO_N = 18;
const JANELA_REPOUSO_MS = 450;

function tentarNumero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

export class TelaMarteloThor {
  private fase: FaseJogo = 'pronto';
  private ranking: PartidaMartelo[] = [];
  private tentativas: TentativaMartelo[] = [];
  private curvas: PontoCurva[][] = [];
  private curvaAtual: PontoCurva[] = [];
  private jogadorAtual = '';
  private tentativaAtual = 0;
  private ultimoPicoN = 0;
  private forcaAtualN = 0;
  private conectado = false;
  private golpeDetectado = false;
  private posicaoAtual: number | null = null;
  private indiceCurvaEmFoco: number | null = null;
  private resumoAtual: PartidaMartelo | null = null;
  private faseInicioMs = 0;
  private tentativaInicioMs = 0;
  private ultimoPontoMs = 0;
  private ultimaAtividadeMs = 0;
  private rafId: number | null = null;
  private renderPendente = false;
  private contexto: CanvasRenderingContext2D | null = null;
  private fullscreenNativoAtivo = false;
  private fullscreenSimulado = false;
  private refs: RefsMartelo = {
    jogo: null,
    nomeJogador: null,
    btnIniciar: null,
    btnResetar: null,
    btnTelaCheia: null,
    chipFase: null,
    chipTentativa: null,
    chipConexao: null,
    forcaKg: null,
    forcaN: null,
    textoFase: null,
    timer: null,
    barraAtual: null,
    barraPico: null,
    escala: null,
    tentativas: null,
    ranking: null,
    alerta: null,
    feedback: null,
    resumoMelhor: null,
    resumoMedia: null,
    resumoRanking: null,
    canvasHost: null,
    canvas: null,
  };

  private readonly aoAtualizarForca = (evento: Event) => {
    const detalhe = (evento as CustomEvent<{ forcaN?: number }>).detail;
    const forcaN = detalhe?.forcaN ?? 0;
    this.forcaAtualN = Math.max(0, forcaN);

    if (this.fase === 'tentativa') {
      const agora = performance.now();
      this.ultimoPicoN = Math.max(this.ultimoPicoN, this.forcaAtualN);
      if (this.forcaAtualN >= LIMIAR_GOLPE_N) this.golpeDetectado = true;
      if (this.forcaAtualN >= LIMIAR_REPOUSO_N) this.ultimaAtividadeMs = agora;
      if (this.curvaAtual.length === 0 || agora - this.ultimoPontoMs >= AMOSTRAGEM_CURVA_MS) {
        this.curvaAtual.push({
          tempoMs: Math.max(0, Math.round(agora - this.tentativaInicioMs)),
          forcaN: this.forcaAtualN,
        });
        this.ultimoPontoMs = agora;
      }
    }

    this.solicitarRender();
  };

  private readonly aoAtualizarStatus = (evento: Event) => {
    const detalhe = (evento as CustomEvent<{ conectado?: boolean }>).detail;
    const estavaConectado = this.conectado;
    this.conectado = !!detalhe?.conectado;

    if (estavaConectado && !this.conectado && this.estaEmAndamento()) {
      this.interromperDesafio('Conexão perdida. O desafio foi cancelado para evitar leituras incompletas.');
      return;
    }

    this.atualizarControles();
    this.solicitarRender();
  };

  private readonly aoRedimensionar = () => {
    this.redimensionarCanvas();
    this.solicitarRender();
  };

  private readonly aoDigitarNome = () => {
    this.atualizarControles();
    this.solicitarRender();
  };

  private readonly aoPressionarTecla = (evento: KeyboardEvent) => {
    if (evento.key === 'Escape' && this.fullscreenSimulado) {
      evento.preventDefault();
      void this.sairTelaCheia();
      return;
    }
    if (evento.key !== 'Enter') return;
    if (document.activeElement !== this.refs.nomeJogador) return;
    evento.preventDefault();
    this.iniciarDesafio();
  };

  private readonly aoMudarTelaCheia = () => {
    this.fullscreenNativoAtivo = document.fullscreenElement === this.refs.jogo;
    if (this.fullscreenNativoAtivo) {
      this.fullscreenSimulado = false;
    }
    this.aplicarModoTelaCheia();
  };

  constructor(
    private container: HTMLElement,
    private onConexao: () => void,
    private onMedicao: () => void,
    private onJogos: () => void,
    private onSessoes: () => void,
    private onConfiguracoes: () => void,
    private onFirmware: () => void,
    private status?: StatusConexao,
  ) {
    this.ranking = this.carregarRanking();
    this.conectado = window.sharedState?.conectado ?? !!status?.conectado;
    this.forcaAtualN = window.sharedState?.forcaAtual ?? 0;
    this.renderizar();
    this.registrarEventos();
    this.redimensionarCanvas();
    this.atualizarControles();
    this.solicitarRender();
  }

  destruir(): void {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    document.removeEventListener('forca-atualizada', this.aoAtualizarForca as EventListener);
    document.removeEventListener('jogos-status-atualizado', this.aoAtualizarStatus as EventListener);
    document.removeEventListener('keydown', this.aoPressionarTecla);
    document.removeEventListener('fullscreenchange', this.aoMudarTelaCheia);
    window.removeEventListener('resize', this.aoRedimensionar);
    this.refs.nomeJogador?.removeEventListener('input', this.aoDigitarNome);
    this.fullscreenNativoAtivo = false;
    this.fullscreenSimulado = false;
    document.body.classList.remove('martelo-body-fullscreen');
    this.refs.jogo?.classList.remove('martelo-fullscreen');
    if (document.fullscreenElement === this.refs.jogo && typeof document.exitFullscreen === 'function') {
      void document.exitFullscreen().catch(() => undefined);
    }
  }

  private renderizar(): void {
    this.container.innerHTML = `
      ${navHtml({
        ativo: 'jogos',
        onConexao: this.onConexao,
        onMedicao: this.onMedicao,
        onJogos: () => {},
        onSessoes: this.onSessoes,
        onConfiguracoes: this.onConfiguracoes,
        onFirmware: this.onFirmware,
        ...(this.status && { status: this.status }),
      })}

      <div id="martelo-jogo" class="martelo-jogo">
        <div class="martelo-game">

          <div class="martelo-arena">
            <div class="martelo-hud-topo">
              <div class="martelo-status-linha">
                <span class="martelo-chip" id="martelo-chip-fase">Pronto</span>
                <span class="martelo-chip martelo-chip-suave" id="martelo-chip-tentativa">Tentativa 1/3</span>
                <span class="martelo-chip martelo-chip-suave" id="martelo-chip-conexao">Aguardando sensor</span>
              </div>
              <div class="martelo-medidor">
                <div class="martelo-forca-kg" id="martelo-forca-kg">0.0 kg</div>
                <div class="martelo-forca-n" id="martelo-forca-n">0.0 N</div>
              </div>
            </div>

            <div id="martelo-canvas-host" class="martelo-canvas-host">
              <canvas id="martelo-canvas" class="martelo-canvas"></canvas>
            </div>

            <div class="martelo-hud-baixo">
              <div class="martelo-timer-header">
                <span id="martelo-texto-fase">Informe o jogador e prepare o golpe</span>
                <strong id="martelo-timer">--</strong>
              </div>
              <div class="martelo-barra">
                <div class="martelo-barra-atual" id="martelo-barra-atual"></div>
                <div class="martelo-barra-pico" id="martelo-barra-pico"></div>
              </div>
              <div class="martelo-escala" id="martelo-escala">Escala dinâmica</div>
            </div>

            <div class="martelo-tentativas" id="martelo-tentativas"></div>
          </div>

          <div class="martelo-painel">
            <div class="martelo-painel-cabecalho">
              <div>
                <div class="martelo-eyebrow">Jogo Nativo</div>
                <div class="martelo-titulo-jogo">Martelo do Thor</div>
              </div>
              <div class="martelo-painel-acoes">
                <button id="btn-martelo-tela-cheia" class="btn-outline btn-sm">Tela cheia</button>
                <button id="btn-martelo-voltar" class="btn-outline btn-sm">← Catálogo</button>
              </div>
            </div>

            <div class="martelo-entrada">
              <label for="martelo-jogador">Jogador</label>
              <input id="martelo-jogador" type="text" maxlength="24" placeholder="Nome para o ranking">
              <div class="btn-row">
                <button id="btn-martelo-iniciar" class="btn-primary btn-sm">Iniciar desafio</button>
                <button id="btn-martelo-resetar" class="btn-secondary btn-sm">Resetar</button>
              </div>
            </div>

            <div id="martelo-alerta" class="status-box hidden"></div>
            <div id="martelo-feedback" class="status-box">
              Digite o nome e clique em Iniciar.
            </div>

            <div class="martelo-resumo-grid">
              <div class="martelo-resumo-item">
                <span>Melhor</span>
                <strong id="martelo-resumo-melhor">0.0 kg</strong>
              </div>
              <div class="martelo-resumo-item">
                <span>Média</span>
                <strong id="martelo-resumo-media">0.0 kg</strong>
              </div>
              <div class="martelo-resumo-item">
                <span>Ranking</span>
                <strong id="martelo-resumo-ranking">--</strong>
              </div>
            </div>

            <div>
              <div class="martelo-secao-titulo">Top 10 Local</div>
              <div id="martelo-ranking"></div>
            </div>
          </div>

        </div>
      </div>
    `;

    bindNav(this.container, {
      ativo: 'jogos',
      onConexao: this.onConexao,
      onMedicao: this.onMedicao,
      onJogos: () => {},
      onSessoes: this.onSessoes,
      onConfiguracoes: this.onConfiguracoes,
      onFirmware: this.onFirmware,
      ...(this.status && { status: this.status }),
    });

    this.capturarRefs();

    this.refs.btnIniciar?.addEventListener('click', () => this.iniciarDesafio());
    this.refs.btnResetar?.addEventListener('click', () => this.resetar());
    this.refs.btnTelaCheia?.addEventListener('click', () => { void this.alternarTelaCheia(); });
    this.refs.nomeJogador?.addEventListener('input', this.aoDigitarNome);
    this.container.querySelector<HTMLButtonElement>('#btn-martelo-voltar')
      ?.addEventListener('click', () => this.onJogos());

    this.renderizarRanking();
    this.renderizarTentativas();
  }

  private capturarRefs(): void {
    this.refs = {
      jogo: this.container.querySelector<HTMLElement>('#martelo-jogo'),
      nomeJogador: this.container.querySelector<HTMLInputElement>('#martelo-jogador'),
      btnIniciar: this.container.querySelector<HTMLButtonElement>('#btn-martelo-iniciar'),
      btnResetar: this.container.querySelector<HTMLButtonElement>('#btn-martelo-resetar'),
      btnTelaCheia: this.container.querySelector<HTMLButtonElement>('#btn-martelo-tela-cheia'),
      chipFase: this.container.querySelector<HTMLElement>('#martelo-chip-fase'),
      chipTentativa: this.container.querySelector<HTMLElement>('#martelo-chip-tentativa'),
      chipConexao: this.container.querySelector<HTMLElement>('#martelo-chip-conexao'),
      forcaKg: this.container.querySelector<HTMLElement>('#martelo-forca-kg'),
      forcaN: this.container.querySelector<HTMLElement>('#martelo-forca-n'),
      textoFase: this.container.querySelector<HTMLElement>('#martelo-texto-fase'),
      timer: this.container.querySelector<HTMLElement>('#martelo-timer'),
      barraAtual: this.container.querySelector<HTMLElement>('#martelo-barra-atual'),
      barraPico: this.container.querySelector<HTMLElement>('#martelo-barra-pico'),
      escala: this.container.querySelector<HTMLElement>('#martelo-escala'),
      tentativas: this.container.querySelector<HTMLElement>('#martelo-tentativas'),
      ranking: this.container.querySelector<HTMLElement>('#martelo-ranking'),
      alerta: this.container.querySelector<HTMLElement>('#martelo-alerta'),
      feedback: this.container.querySelector<HTMLElement>('#martelo-feedback'),
      resumoMelhor: this.container.querySelector<HTMLElement>('#martelo-resumo-melhor'),
      resumoMedia: this.container.querySelector<HTMLElement>('#martelo-resumo-media'),
      resumoRanking: this.container.querySelector<HTMLElement>('#martelo-resumo-ranking'),
      canvasHost: this.container.querySelector<HTMLElement>('#martelo-canvas-host'),
      canvas: this.container.querySelector<HTMLCanvasElement>('#martelo-canvas'),
    };

    this.contexto = this.refs.canvas?.getContext('2d') ?? null;
  }

  private registrarEventos(): void {
    document.addEventListener('forca-atualizada', this.aoAtualizarForca as EventListener);
    document.addEventListener('jogos-status-atualizado', this.aoAtualizarStatus as EventListener);
    document.addEventListener('keydown', this.aoPressionarTecla);
    document.addEventListener('fullscreenchange', this.aoMudarTelaCheia);
    window.addEventListener('resize', this.aoRedimensionar);
  }

  private readonly redimensionarCanvas = () => {
    if (!this.refs.canvas) return;
    const larguraBase = this.refs.canvasHost?.clientWidth ?? this.refs.canvas.clientWidth ?? 640;
    const alturaBase = this.emTelaCheia()
      ? Math.max(480, Math.floor(window.innerHeight * 0.70))
      : 360;
    const largura = Math.max(280, Math.floor(larguraBase));
    const altura = Math.max(240, Math.floor(this.refs.canvasHost?.clientHeight || alturaBase));
    const dpr = window.devicePixelRatio || 1;

    this.refs.canvas.width = largura * dpr;
    this.refs.canvas.height = altura * dpr;
    this.refs.canvas.style.height = `${altura}px`;
    this.contexto = this.refs.canvas.getContext('2d');
    this.contexto?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  private solicitarRender(): void {
    this.renderPendente = true;
    if (this.rafId != null) return;
    this.rafId = requestAnimationFrame(this.loop);
  }

  private readonly loop = () => {
    this.rafId = null;
    this.renderPendente = false;
    const agora = performance.now();
    this.processarFase(agora);
    this.atualizarHUD(agora);
    this.desenharCurva();

    if (this.renderPendente || this.estaEmAndamento()) {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };

  private processarFase(agora: number): void {
    if (this.fase === 'countdown' && agora - this.faseInicioMs >= CONTAGEM_MS) {
      this.iniciarTentativa(agora);
      return;
    }

    if (this.fase === 'tentativa') {
      const tempoTentativa = agora - this.tentativaInicioMs;
      const repousoSustentado = agora - this.ultimaAtividadeMs >= JANELA_REPOUSO_MS;

      if (
        this.golpeDetectado
        && tempoTentativa >= DURACAO_MIN_TENTATIVA_MS
        && repousoSustentado
        && this.forcaAtualN <= LIMIAR_REPOUSO_N
      ) {
        this.encerrarTentativa(agora);
        return;
      }

      if (tempoTentativa >= DURACAO_MAX_TENTATIVA_MS) {
        this.encerrarTentativa(agora);
        return;
      }
    }

    if (this.fase === 'intervalo' && agora - this.faseInicioMs >= INTERVALO_MS) {
      if (this.tentativaAtual < TOTAL_TENTATIVAS) {
        this.iniciarContagem(agora);
      } else {
        this.finalizarPartida();
      }
    }
  }

  private iniciarDesafio(): void {
    const jogador = this.refs.nomeJogador?.value.trim() ?? '';
    if (jogador.length < 2) {
      this.definirFeedback('erro', 'Digite um nome com pelo menos 2 caracteres.');
      this.refs.nomeJogador?.focus();
      return;
    }
    if (!this.conectado) {
      this.definirFeedback('erro', 'Conecte a balança antes de iniciar o desafio.');
      return;
    }

    this.jogadorAtual = jogador;
    if (this.refs.nomeJogador) this.refs.nomeJogador.value = jogador;

    this.limparPartidaAtual();
    this.fase = 'countdown';
    this.faseInicioMs = performance.now();
    this.definirFeedback('ok', 'Prepare-se. O jogo vai abrir a primeira tentativa.');
    this.renderizarTentativas();
    this.atualizarControles();
    this.solicitarRender();
  }

  private iniciarContagem(agora: number): void {
    this.fase = 'countdown';
    this.faseInicioMs = agora;
    this.curvaAtual = [];
    this.ultimoPicoN = 0;
    this.golpeDetectado = false;
    this.definirFeedback('ok', `Tentativa ${this.tentativaAtual + 1} de ${TOTAL_TENTATIVAS}. Prepare o golpe.`);
    this.atualizarControles();
    this.solicitarRender();
  }

  private iniciarTentativa(agora: number): void {
    this.fase = 'tentativa';
    this.tentativaAtual += 1;
    this.tentativaInicioMs = agora;
    this.ultimoPontoMs = agora;
    this.ultimaAtividadeMs = agora;
    this.ultimoPicoN = this.forcaAtualN;
    this.golpeDetectado = this.forcaAtualN >= LIMIAR_GOLPE_N;
    this.curvaAtual = [{ tempoMs: 0, forcaN: this.forcaAtualN }];
    this.renderizarTentativas();
    this.atualizarControles();
    this.solicitarRender();
  }

  private encerrarTentativa(agora: number): void {
    const duracaoMs = Math.max(0, Math.round(agora - this.tentativaInicioMs));
    const ultimoPonto = this.curvaAtual[this.curvaAtual.length - 1];
    if (!ultimoPonto || ultimoPonto.tempoMs < duracaoMs) {
      this.curvaAtual.push({
        tempoMs: duracaoMs,
        forcaN: this.forcaAtualN,
      });
    }

    const tentativa: TentativaMartelo = {
      indice: this.tentativaAtual,
      picoN: this.ultimoPicoN,
      duracaoMs,
      amostras: this.curvaAtual.length,
    };

    this.tentativas.push(tentativa);
    this.curvas.push([...this.curvaAtual]);
    this.indiceCurvaEmFoco = this.curvas.length - 1;
    this.renderizarTentativas();

    this.fase = 'intervalo';
    this.faseInicioMs = agora;
    const houveGolpe = tentativa.picoN >= LIMIAR_GOLPE_N;
    this.definirFeedback(
      houveGolpe ? 'ok' : 'info',
      houveGolpe
        ? `Tentativa ${tentativa.indice} concluída. Pico: ${formatarForcaKg(tentativa.picoN)}.`
        : `Tentativa ${tentativa.indice} registrada, mas sem um golpe forte o bastante. Tente entrar mais seco na próxima.`,
    );
    this.atualizarControles();
    this.solicitarRender();
  }

  private finalizarPartida(): void {
    const jogador = this.jogadorAtual || this.refs.nomeJogador?.value.trim() || 'Jogador';
    const partida = criarPartidaMartelo(jogador, this.tentativas);
    this.ranking = atualizarRankingMartelo(this.ranking, partida);
    this.salvarRanking();
    this.posicaoAtual = posicaoNoRanking(this.ranking, partida.id);
    this.resumoAtual = partida;
    this.fase = 'finalizado';

    const melhorIndice = this.tentativas.findIndex(tentativa => tentativa.picoN === partida.melhorForcaN);
    this.indiceCurvaEmFoco = melhorIndice >= 0 ? melhorIndice : this.indiceCurvaEmFoco;

    this.renderizarTentativas();
    this.renderizarRanking();
    this.atualizarControles();

    const complementoRanking = this.posicaoAtual
      ? ` Você entrou em ${this.posicaoAtual}º no ranking local.`
      : '';
    this.definirFeedback('ok', `${mensagemDesempenho(partida.melhorForcaN)}${complementoRanking}`);
    this.solicitarRender();
  }

  private resetar(): void {
    const estavaRodando = this.estaEmAndamento();
    this.fase = 'pronto';
    this.limparPartidaAtual();
    this.renderizarTentativas();
    this.renderizarRanking();
    this.atualizarControles();
    this.definirFeedback(
      'info',
      estavaRodando
        ? 'Desafio cancelado. Você pode ajustar o nome e começar de novo.'
        : 'Desafio resetado. Ajuste o nome e inicie quando quiser.',
    );
    this.solicitarRender();
  }

  private interromperDesafio(mensagem: string): void {
    this.fase = 'pronto';
    this.limparPartidaAtual();
    this.renderizarTentativas();
    this.atualizarControles();
    this.definirFeedback('erro', mensagem);
    this.solicitarRender();
  }

  private limparPartidaAtual(): void {
    this.tentativas = [];
    this.curvas = [];
    this.curvaAtual = [];
    this.tentativaAtual = 0;
    this.ultimoPicoN = 0;
    this.golpeDetectado = false;
    this.posicaoAtual = null;
    this.resumoAtual = null;
    this.indiceCurvaEmFoco = null;
    this.faseInicioMs = 0;
    this.tentativaInicioMs = 0;
    this.ultimoPontoMs = 0;
    this.ultimaAtividadeMs = 0;
  }

  private atualizarControles(): void {
    const nomeValido = (this.refs.nomeJogador?.value.trim().length ?? 0) >= 2;
    const bloqueado = this.estaEmAndamento();

    if (this.refs.nomeJogador) {
      this.refs.nomeJogador.disabled = bloqueado;
    }
    if (this.refs.btnIniciar) {
      this.refs.btnIniciar.disabled = !this.conectado || !nomeValido || bloqueado;
      this.refs.btnIniciar.textContent = this.fase === 'finalizado' ? 'Jogar novamente' : 'Iniciar desafio';
    }
    if (this.refs.btnResetar) {
      this.refs.btnResetar.textContent = bloqueado ? 'Cancelar' : 'Resetar';
    }
    if (this.refs.btnTelaCheia) {
      this.refs.btnTelaCheia.textContent = this.emTelaCheia() ? 'Sair da tela cheia' : 'Tela cheia';
    }
  }

  private atualizarHUD(agora = performance.now()): void {
    const tentativaExibida = this.fase === 'countdown'
      ? Math.min(TOTAL_TENTATIVAS, this.tentativaAtual + 1)
      : Math.max(1, Math.min(TOTAL_TENTATIVAS, this.tentativaAtual || 1));
    const escalaN = this.obterEscalaN();
    const melhor = this.resumoAtual?.melhorForcaN
      ?? this.tentativas.reduce((maior, tentativa) => Math.max(maior, tentativa.picoN), 0);
    const media = this.tentativas.length > 0
      ? this.tentativas.reduce((soma, tentativa) => soma + tentativa.picoN, 0) / this.tentativas.length
      : 0;

    if (this.refs.chipFase) this.refs.chipFase.textContent = this.rotuloFase(agora);
    if (this.refs.chipTentativa) this.refs.chipTentativa.textContent = `Tentativa ${tentativaExibida}/${TOTAL_TENTATIVAS}`;
    if (this.refs.chipConexao) {
      this.refs.chipConexao.textContent = this.conectado ? 'Sensor ativo' : 'Sensor offline';
      this.refs.chipConexao.className = `martelo-chip ${this.conectado ? 'martelo-chip-suave' : ''}`;
    }
    if (this.refs.forcaKg) this.refs.forcaKg.textContent = formatarForcaKg(this.forcaAtualN);
    if (this.refs.forcaN) this.refs.forcaN.textContent = formatarForcaN(this.forcaAtualN);
    if (this.refs.textoFase) this.refs.textoFase.textContent = this.textoFaseDetalhado();
    if (this.refs.timer) this.refs.timer.textContent = this.textoTempo(agora);
    if (this.refs.barraAtual) this.refs.barraAtual.style.width = `${Math.min(100, (this.forcaAtualN / escalaN) * 100)}%`;
    if (this.refs.barraPico) this.refs.barraPico.style.width = `${Math.min(100, (this.ultimoPicoN / escalaN) * 100)}%`;
    if (this.refs.escala) {
      this.refs.escala.textContent = `Escala atual: ${formatarForcaKg(escalaN)} (${formatarForcaN(escalaN)})`;
    }
    if (this.refs.resumoMelhor) this.refs.resumoMelhor.textContent = formatarForcaKg(melhor);
    if (this.refs.resumoMedia) this.refs.resumoMedia.textContent = formatarForcaKg(media);
    if (this.refs.resumoRanking) this.refs.resumoRanking.textContent = this.posicaoAtual ? `${this.posicaoAtual}º` : '--';

    if (this.refs.alerta) {
      const overload = window.sharedState?.overloadAlert;
      if (!this.conectado) {
        this.refs.alerta.className = 'status-box erro';
        this.refs.alerta.textContent = 'Sem conexão ativa com a balança. O jogo fica bloqueado até reconectar.';
      } else if (overload?.active) {
        this.refs.alerta.className = 'status-box aviso';
        this.refs.alerta.textContent = `Atenção: carga em ${overload.percent.toFixed(0)}% do limite nominal da célula.`;
      } else {
        this.refs.alerta.className = 'status-box ok';
        this.refs.alerta.textContent = 'Conectado. A leitura da balança já está alimentando o jogo em tempo real.';
      }
    }
  }

  private renderizarTentativas(): void {
    const host = this.refs.tentativas;
    if (!host) return;

    const melhorForcaN = this.tentativas.reduce((maior, tentativa) => Math.max(maior, tentativa.picoN), 0);
    host.innerHTML = Array.from({ length: TOTAL_TENTATIVAS }, (_, indice) => {
      const tentativa = this.tentativas[indice];
      const numero = indice + 1;

      const classes = ['martelo-tentativa-card'];
      if (tentativa) classes.push('concluida');
      else if (this.fase === 'tentativa' && this.tentativaAtual === numero) classes.push('ativa');
      else if (this.fase === 'countdown' && this.tentativaAtual + 1 === numero) classes.push('ativa');
      else classes.push('vazia');

      if (tentativa && this.indiceCurvaEmFoco === indice) classes.push('selecionada');

      const etiqueta = tentativa?.picoN === melhorForcaN && melhorForcaN > 0
        ? '<span class="martelo-tentativa-flag">Melhor</span>'
        : '';
      const subtitulo = tentativa
        ? `${formatarForcaN(tentativa.picoN)} • ${(tentativa.duracaoMs / 1000).toFixed(1)} s`
        : this.fase === 'countdown' && this.tentativaAtual + 1 === numero
          ? 'a seguir'
          : 'aguardando';

      return `
        <button
          type="button"
          class="${classes.join(' ')}"
          ${tentativa ? `data-indice="${indice}"` : 'disabled'}
        >
          <span class="martelo-tentativa-num">Tentativa ${numero}</span>
          <strong>${tentativa ? formatarForcaKg(tentativa.picoN) : '—'}</strong>
          <span>${subtitulo}</span>
          ${etiqueta}
        </button>
      `;
    }).join('');

    host.querySelectorAll<HTMLButtonElement>('[data-indice]').forEach(botao => {
      botao.addEventListener('click', () => {
        const indice = tentarNumero(Number(botao.dataset.indice));
        if (indice == null) return;
        this.indiceCurvaEmFoco = indice;
        this.renderizarTentativas();
        this.solicitarRender();
      });
    });
  }

  private renderizarRanking(): void {
    const host = this.refs.ranking;
    if (!host) return;

    if (this.ranking.length === 0) {
      host.innerHTML = '<div class="vazio">Nenhuma partida registrada ainda.</div>';
      return;
    }

    host.innerHTML = `
      <div class="martelo-ranking-lista">
        ${this.ranking.map((partida, indice) => {
          const atual = this.resumoAtual?.id === partida.id;
          return `
            <div class="martelo-ranking-item ${indice === 0 ? 'lider' : ''} ${atual ? 'atual' : ''}">
              <div>
                <strong>${indice + 1}º ${partida.jogador}</strong>
                <div class="martelo-ranking-meta">${new Date(partida.criadoEm).toLocaleString('pt-BR')}</div>
              </div>
              <div style="text-align:right">
                <strong>${formatarForcaKg(partida.melhorForcaN)}</strong>
                <div class="martelo-ranking-meta">Média ${formatarForcaKg(partida.mediaForcaN)}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  private desenharCurva(): void {
    if (!this.refs.canvas || !this.contexto) return;

    const ctx = this.contexto;
    const largura = this.refs.canvas.clientWidth || 640;
    const altura = this.refs.canvas.clientHeight || 240;
    const modoTelaCheia = this.emTelaCheia();
    const paddingLeft = modoTelaCheia ? 54 : 42;
    const paddingRight = modoTelaCheia ? 22 : 16;
    const paddingTop = modoTelaCheia ? 24 : 18;
    const paddingBottom = modoTelaCheia ? 36 : 30;
    const larguraGrafico = largura - paddingLeft - paddingRight;
    const alturaGrafico = altura - paddingTop - paddingBottom;

    ctx.clearRect(0, 0, largura, altura);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, largura, altura);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = modoTelaCheia ? 1.2 : 1;
    for (let i = 0; i <= 4; i++) {
      const y = paddingTop + (alturaGrafico / 4) * i;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(largura - paddingRight, y);
      ctx.stroke();
    }

    const serie = this.obterSerieExibida();
    if (serie.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = `${modoTelaCheia ? 15 : 13}px system-ui, sans-serif`;
      ctx.fillText('A curva aparece assim que a tentativa começar.', paddingLeft, 30);
      ctx.fillText('Depois da partida, clique em uma tentativa para rever o golpe.', paddingLeft, 48);
      return;
    }

    const maxForca = Math.max(100, ...serie.map(ponto => ponto.forcaN));
    const maxTempo = Math.max(
      this.fase === 'tentativa' ? DURACAO_MAX_TENTATIVA_MS : 2000,
      serie[serie.length - 1]?.tempoMs ?? 1,
    );

    const pontos = serie.map(ponto => ({
      x: paddingLeft + (ponto.tempoMs / maxTempo) * larguraGrafico,
      y: paddingTop + alturaGrafico - (ponto.forcaN / maxForca) * alturaGrafico,
      forcaN: ponto.forcaN,
      tempoMs: ponto.tempoMs,
    }));

    const gradiente = ctx.createLinearGradient(0, paddingTop, 0, altura - paddingBottom);
    gradiente.addColorStop(0, 'rgba(249, 115, 22, 0.30)');
    gradiente.addColorStop(1, 'rgba(249, 115, 22, 0.03)');

    ctx.beginPath();
    ctx.moveTo(pontos[0]!.x, altura - paddingBottom);
    pontos.forEach((ponto, indice) => {
      if (indice === 0) ctx.lineTo(ponto.x, ponto.y);
      else ctx.lineTo(ponto.x, ponto.y);
    });
    ctx.lineTo(pontos[pontos.length - 1]!.x, altura - paddingBottom);
    ctx.closePath();
    ctx.fillStyle = gradiente;
    ctx.fill();

    ctx.beginPath();
    pontos.forEach((ponto, indice) => {
      if (indice === 0) ctx.moveTo(ponto.x, ponto.y);
      else ctx.lineTo(ponto.x, ponto.y);
    });
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = modoTelaCheia ? 3.2 : 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    const pico = pontos.reduce((melhor, ponto) => (ponto.forcaN > melhor.forcaN ? ponto : melhor), pontos[0]!);
    ctx.beginPath();
    ctx.arc(pico.x, pico.y, modoTelaCheia ? 5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ea580c';
    ctx.fill();

    ctx.fillStyle = '#475569';
    ctx.font = `${modoTelaCheia ? 13 : 12}px system-ui, sans-serif`;
    ctx.fillText('0 s', paddingLeft, altura - 8);
    ctx.fillText(`${(maxTempo / 1000).toFixed(1)} s`, largura - 48, altura - 8);
    ctx.fillText(formatarForcaN(maxForca), 8, 18);

    const rotuloPico = `Pico ${formatarForcaKg(pico.forcaN)}`;
    const posXTexto = Math.min(largura - 120, pico.x + 8);
    const posYTexto = Math.max(18, pico.y - 10);
    ctx.fillStyle = '#0f172a';
    ctx.fillText(rotuloPico, posXTexto, posYTexto);
  }

  private obterSerieExibida(): PontoCurva[] {
    if (this.fase === 'tentativa') return this.curvaAtual;
    if (this.indiceCurvaEmFoco != null) return this.curvas[this.indiceCurvaEmFoco] ?? [];
    return this.curvas[this.curvas.length - 1] ?? [];
  }

  private obterEscalaN(): number {
    const maiorRanking = this.ranking[0]?.melhorForcaN ?? 0;
    const maiorTentativa = this.tentativas.reduce((maior, tentativa) => Math.max(maior, tentativa.picoN), 0);
    const base = Math.max(300, this.forcaAtualN, this.ultimoPicoN, maiorTentativa, maiorRanking);
    return Math.ceil(base / 50) * 50;
  }

  private textoTempo(agora: number): string {
    if (this.fase === 'countdown') {
      const restante = Math.max(0, CONTAGEM_MS - (agora - this.faseInicioMs));
      return `${Math.ceil(restante / 1000)}`;
    }
    if (this.fase === 'tentativa') {
      const restante = Math.max(0, DURACAO_MAX_TENTATIVA_MS - (agora - this.tentativaInicioMs));
      return `${(restante / 1000).toFixed(1)} s`;
    }
    if (this.fase === 'intervalo') {
      const restante = Math.max(0, INTERVALO_MS - (agora - this.faseInicioMs));
      return `${(restante / 1000).toFixed(1)} s`;
    }
    if (this.fase === 'finalizado') return 'Fim';
    return '--';
  }

  private textoFaseDetalhado(): string {
    if (this.fase === 'countdown') return 'Contagem regressiva. Entre forte quando liberar.';
    if (this.fase === 'tentativa') return 'Valendo. O sistema fecha a tentativa quando a força volta ao repouso.';
    if (this.fase === 'intervalo') {
      return this.tentativaAtual < TOTAL_TENTATIVAS
        ? 'Respire e prepare a próxima tentativa.'
        : 'Consolidando o resultado final.';
    }
    if (this.fase === 'finalizado') return 'Partida concluída. Clique em uma tentativa para rever a curva.';
    return this.conectado
      ? 'Informe o jogador e prepare o golpe.'
      : 'Conecte a balança para liberar o desafio.';
  }

  private rotuloFase(agora: number): string {
    if (this.fase === 'countdown') {
      const restante = Math.max(0, CONTAGEM_MS - (agora - this.faseInicioMs));
      return `Começa em ${Math.ceil(restante / 1000)}`;
    }
    if (this.fase === 'tentativa') return 'Valendo';
    if (this.fase === 'intervalo') return 'Recuperação';
    if (this.fase === 'finalizado') return 'Encerrado';
    return 'Pronto';
  }

  private definirFeedback(tipo: 'ok' | 'info' | 'erro', texto: string): void {
    if (!this.refs.feedback) return;
    this.refs.feedback.className = tipo === 'info' ? 'status-box' : `status-box ${tipo}`;
    this.refs.feedback.textContent = texto;
  }

  private estaEmAndamento(): boolean {
    return this.fase === 'countdown' || this.fase === 'tentativa' || this.fase === 'intervalo';
  }

  private emTelaCheia(): boolean {
    return this.fullscreenNativoAtivo || this.fullscreenSimulado;
  }

  private async alternarTelaCheia(): Promise<void> {
    if (this.emTelaCheia()) {
      await this.sairTelaCheia();
      return;
    }
    await this.entrarTelaCheia();
  }

  private async entrarTelaCheia(): Promise<void> {
    const alvo = this.refs.jogo;
    if (!alvo) return;

    if (typeof alvo.requestFullscreen === 'function') {
      try {
        await alvo.requestFullscreen();
        return;
      } catch {
        // Fallback visual controlado abaixo.
      }
    }

    this.fullscreenSimulado = true;
    this.aplicarModoTelaCheia();
  }

  private async sairTelaCheia(): Promise<void> {
    this.fullscreenSimulado = false;

    if (document.fullscreenElement === this.refs.jogo && typeof document.exitFullscreen === 'function') {
      try {
        await document.exitFullscreen();
      } catch {
        // Se falhar, ainda limpamos o estado visual local.
      }
    }

    this.fullscreenNativoAtivo = false;
    this.aplicarModoTelaCheia();
  }

  private aplicarModoTelaCheia(): void {
    const ativa = this.emTelaCheia();
    document.body.classList.toggle('martelo-body-fullscreen', ativa);
    this.refs.jogo?.classList.toggle('martelo-fullscreen', ativa);
    this.atualizarControles();
    this.redimensionarCanvas();
    this.solicitarRender();
  }

  private carregarRanking(): PartidaMartelo[] {
    try {
      const bruto = localStorage.getItem(CHAVE_RANKING_MARTELO);
      if (!bruto) return [];
      const lista = JSON.parse(bruto) as PartidaMartelo[];
      if (!Array.isArray(lista)) return [];

      return lista.filter((item): item is PartidaMartelo => {
        return !!item
          && typeof item.id === 'string'
          && typeof item.jogador === 'string'
          && typeof item.criadoEm === 'string'
          && typeof item.melhorForcaN === 'number'
          && typeof item.mediaForcaN === 'number'
          && Array.isArray(item.tentativas);
      }).slice(0, 10);
    } catch {
      return [];
    }
  }

  private salvarRanking(): void {
    localStorage.setItem(CHAVE_RANKING_MARTELO, JSON.stringify(this.ranking));
  }
}

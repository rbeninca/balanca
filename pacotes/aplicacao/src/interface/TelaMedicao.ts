import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { EstadoPipeline, PipelinePatch } from '@balancagfig/processamento';
import type { GerenciadorSessao } from '../nucleo/GerenciadorSessao.js';
import type { IArmazenamento } from '../armazenamento/ArmazenamentoLocal.js';
import { TelaAnalise } from './TelaAnalise.js';
import { WizardCalibracao } from './WizardCalibracao.js';
import { navHtml, bindNav, type StatusConexao } from './navBar.js';

type Unidade = 'N' | 'kg' | 'g';

export type Fonte = {
  on(evento: 'dados',  fn: (l: LeituraProcessada) => void): void;
  on(evento: 'config', fn: (c: unknown) => void): void;
  on(evento: 'status', fn: (s: unknown) => void): void;
  on(evento: string,   fn: (v: unknown) => void): void;
  enviarComando?(cmd: object): void;
  fechar?(): void;
  desconectar?(): Promise<void>;
  atualizarConfigPipeline?(patch: PipelinePatch): void;
  obterConfigPipeline?(): EstadoPipeline;
};

const MAX_FLUXO      = 300;   // pontos no modo fluxo
const MAX_ACUMULADO  = 5000;  // pontos no modo acumulado
const UNIDADES: Unidade[] = ['N', 'kg', 'g'];

function converterForca(valorN: number, unidade: Unidade): number {
  if (unidade === 'kg') return valorN / 9.80665;
  if (unidade === 'g')  return (valorN / 9.80665) * 1000;
  return valorN;
}

export class TelaMedicao {
  private gravando       = false;
  private dadosGravados: LeituraProcessada[] = [];
  private dadosGrafico: { valor: number; tempo: number }[] = [];
  private unidade: Unidade   = 'N';
  private ultimaForca        = 0;
  private ultimaLeitura: LeituraProcessada | null = null;
  private hz                 = 0;
  private contMsgs           = 0;
  private ultimoHzTs         = Date.now();
  private animFrameId: number | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private nomeSessao         = '';
  private impulsoOffset      = 0;

  // Controles do gráfico
  private modoPontos        = false;
  private modoAcumulado     = false;
  private pausado           = false;
  private exibirSinalBruto  = false;
  private dadosBrutos: { valor: number; tempo: number }[] = [];

  // refs DOM
  private elValor:      HTMLElement | null = null;
  private elUnidade:    HTMLElement | null = null;
  private elQueima:     HTMLElement | null = null;
  private elHz:         HTMLElement | null = null;
  private elPonto:      HTMLElement | null = null;
  private elImpulso:    HTMLElement | null = null;
  private elBtnIniciar:    HTMLButtonElement | null = null;
  private elBtnParar:      HTMLButtonElement | null = null;
  private elBadge:         HTMLElement | null = null;
  private elStatus:        HTMLElement | null = null;
  private elNome:          HTMLInputElement | null = null;
  private elBtnPausar:     HTMLButtonElement | null = null;
  private elBtnTelaCheia:  HTMLButtonElement | null = null;
  private elBtnSinalBruto: HTMLButtonElement | null = null;
  private cardMedicao:     HTMLElement | null = null;
  private hoverPos:        { x: number; y: number } | null = null;

  constructor(
    container: HTMLElement,
    private fonte: Fonte,
    private gerenciador: GerenciadorSessao,
    private armazenamento: IArmazenamento,
    private onConexao:       () => void,
    private onSessoes:       () => void,
    private onConfiguracoes: () => void,
    private onJogos:         () => void,
    private onFirmware:      () => void,
    private status?:         StatusConexao,
  ) {
    this.renderizar(container);
    this.fonte.on('dados',  (l) => this.onDados(l as LeituraProcessada));
    this.fonte.on('config', (c) => this.onConfig(c));
    this.fonte.on('status', (s) => this.onStatus(s));
    this.iniciarLoop();
  }

  private renderizar(container: HTMLElement) {
    container.innerHTML = `
      ${navHtml({ ativo: 'medicao', onConexao: this.onConexao, onMedicao: () => {}, onJogos: this.onJogos, onSessoes: this.onSessoes, onConfiguracoes: this.onConfiguracoes, onFirmware: this.onFirmware, ...(this.status && { status: this.status }) })}

      <div class="card">
        <div class="leitura-principal">
          <span id="leit-valor" class="leitura-valor">--.-</span>
          <span id="leit-unidade" class="leitura-unidade" title="Clique para alternar unidade">N</span>
        </div>

        <div class="chart-container">
          <canvas id="grafico-rt" class="grafico-realtime"></canvas>
        </div>

        <div class="chart-controles">
          <div class="ctrl-grupo">
            <button id="ctrl-linha"  class="ctrl-btn ativo" title="Exibir linha contínua">Linha</button>
            <button id="ctrl-pontos" class="ctrl-btn"       title="Exibir pontos individuais">Pontos</button>
          </div>
          <div class="ctrl-grupo">
            <button id="ctrl-fluxo"     class="ctrl-btn ativo" title="Janela deslizante dos últimos pontos">Fluxo</button>
            <button id="ctrl-acumulado" class="ctrl-btn"       title="Acumula todos os pontos desde o último limpar">Acumulado</button>
          </div>
          <button id="ctrl-pausar"     class="ctrl-btn ctrl-btn-solo" title="Pausar/continuar atualização do gráfico">⏸ Pausar</button>
          <button id="ctrl-limpar"     class="ctrl-btn ctrl-btn-solo" title="Limpar gráfico e zerar impulso exibido">↺ Limpar</button>
          <button id="ctrl-sinal-bruto" class="ctrl-btn ctrl-btn-solo" title="Exibir sinal bruto junto com o filtrado" disabled>Bruto</button>
          <button id="btn-tarar"    class="ctrl-btn ctrl-btn-solo" title="Zerar leitura atual (tara)">Tarar</button>
          <button id="btn-calibrar" class="ctrl-btn ctrl-btn-solo" title="Abrir assistente de calibração">Calibração</button>
          <button id="ctrl-tela-cheia" class="ctrl-btn ctrl-btn-solo ctrl-btn-tela-cheia" title="Tela cheia (F11)">⛶</button>
        </div>

        <div class="filtros-painel" id="filtros-painel">
          <button class="filtros-header" id="filtros-toggle">
            <span class="filtros-titulo">Processamento de Sinal</span>
            <span class="filtros-badge" id="filtros-badge">3 ativos</span>
            <span class="filtros-origem" id="filtros-origem"></span>
            <span class="filtros-seta" id="filtros-seta">▼</span>
          </button>
          <div class="filtros-corpo hidden" id="filtros-corpo">
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="checkbox" id="ck-zona-morta" checked>
                Zona Morta
              </label>
              <div class="filtro-params">
                <input type="number" id="in-zona-morta" class="filtro-num" value="0.05" min="0" step="0.01" title="Limiar (N)">
                <span>N</span>
              </div>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="checkbox" id="ck-media-movel" checked>
                Média Móvel
              </label>
              <div class="filtro-params">
                <input type="number" id="in-media-movel" class="filtro-num" value="5" min="1" max="50" step="1" title="Janela (amostras)">
                <span>am</span>
              </div>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="checkbox" id="ck-det-queima" checked>
                Det. Queima
              </label>
              <div class="filtro-params">
                <input type="number" id="in-det-hister" class="filtro-num" value="100" min="0" step="10" title="Histerese (ms)">
                <span>ms</span>
              </div>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="checkbox" id="ck-notch">
                Notch
              </label>
              <div class="filtro-params">
                <input type="number" id="in-notch-freq" class="filtro-num" value="60" min="1" max="500" step="1" title="Frequência a rejeitar (Hz)">
                <span>Hz</span>
              </div>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="checkbox" id="ck-mediana">
                Mediana
              </label>
              <div class="filtro-params">
                <input type="number" id="in-mediana-jan" class="filtro-num" value="5" min="1" max="21" step="2" title="Janela (amostras)">
                <span>am</span>
              </div>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="checkbox" id="ck-ema">
                EMA
              </label>
              <div class="filtro-params">
                <input type="number" id="in-ema-alpha" class="filtro-num" value="0.20" min="0.01" max="1" step="0.01" title="Fator α (0–1)">
                <span>α</span>
              </div>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="checkbox" id="ck-sg">
                Sav-Golay
              </label>
              <div class="filtro-params">
                <input type="number" id="in-sg-jan" class="filtro-num" value="7" min="5" max="11" step="2" title="Janela (amostras, 5-11)">
                <span>am</span>
              </div>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="checkbox" id="ck-kalman">
                Kalman
              </label>
              <div class="filtro-params">
                <span title="Q: ruído de processo">Q</span>
                <input type="number" id="in-kalman-q" class="filtro-num" value="0.01" min="0.0001" max="100" step="0.001" title="Ruído de processo (Q)">
                <span title="R: ruído de medição">R</span>
                <input type="number" id="in-kalman-r" class="filtro-num" value="1.0" min="0.01" max="1000" step="0.1" title="Ruído de medição (R)">
              </div>
            </div>
          </div>
        </div>

        <div class="status-bar">
          <span><span id="ponto-serial" class="status-ponto"></span><span id="txt-serial">Serial desconectado</span></span>
          <span id="txt-hz">0 Hz</span>
          <span id="txt-queima" style="color:#555">Repouso</span>
        </div>

        <div class="info-row">
          <span>Impulso acumulado</span>
          <span id="val-impulso">0.000 N·s</span>
        </div>
      </div>

      <div class="card">
        <h2>Gravação <span id="badge-gravando" class="gravando-badge hidden">REC</span></h2>
        <div style="margin-bottom:0.75rem">
          <label for="nome-sessao">Nome da Sessão</label>
          <input id="nome-sessao" type="text" placeholder="Sessão ${new Date().toLocaleDateString('pt-BR')}">
        </div>
        <div class="controles">
          <button id="btn-iniciar" class="btn-primary">Iniciar</button>
          <button id="btn-parar"   class="btn-danger hidden">Parar</button>
        </div>
        <div id="status-grav" class="status-box hidden" style="margin-top:0.75rem"></div>
      </div>
    `;

    this.canvas          = container.querySelector<HTMLCanvasElement>('#grafico-rt')!;
    this.canvas.addEventListener('mousemove',  this.onCanvasMouseMove);
    this.canvas.addEventListener('mouseleave', this.onCanvasMouseLeave);
    this.elValor         = container.querySelector('#leit-valor');
    this.elUnidade       = container.querySelector('#leit-unidade');
    this.elQueima        = container.querySelector('#txt-queima');
    this.elHz            = container.querySelector('#txt-hz');
    this.elPonto         = container.querySelector('#ponto-serial');
    this.elImpulso       = container.querySelector('#val-impulso');
    this.elBtnIniciar    = container.querySelector('#btn-iniciar');
    this.elBtnParar      = container.querySelector('#btn-parar');
    this.elBadge         = container.querySelector('#badge-gravando');
    this.elStatus        = container.querySelector('#status-grav');
    this.elNome          = container.querySelector('#nome-sessao');
    this.elBtnPausar     = container.querySelector('#ctrl-pausar');
    this.elBtnTelaCheia  = container.querySelector('#ctrl-tela-cheia');
    this.elBtnSinalBruto = container.querySelector('#ctrl-sinal-bruto');
    this.cardMedicao     = container.querySelector('.card');

    this.elUnidade?.addEventListener('click', () => this.alternarUnidade());

    const navComDestruir = (cb: () => void) => () => { this.destruir(); cb(); };
    bindNav(container, {
      ativo:    'medicao',
      onConexao: navComDestruir(this.onConexao),
      onMedicao: () => {},
      onJogos: navComDestruir(this.onJogos),
      onSessoes: navComDestruir(this.onSessoes),
      onFirmware: navComDestruir(this.onFirmware),
      ...(this.onConfiguracoes && { onConfiguracoes: navComDestruir(this.onConfiguracoes) }),
      ...(this.status && { status: this.status }),
    });

    this.elBtnIniciar!.addEventListener('click', () => this.iniciarGravacao());
    this.elBtnParar!.addEventListener('click',   () => this.pararGravacao());

    container.querySelector('#btn-tarar')!.addEventListener('click', () =>
      this.fonte.enviarComando?.({ tipo: 'CMD_TARAR' }));

    container.querySelector('#btn-calibrar')!.addEventListener('click', () =>
      new WizardCalibracao(this.fonte, () => {}));

    // Controles do gráfico
    const ativarModo = (grupo: string, ativo: string) => {
      container.querySelectorAll(`[id^="${grupo}-"]`).forEach(b =>
        b.classList.toggle('ativo', b.id === ativo));
    };

    container.querySelector('#ctrl-linha')!.addEventListener('click', () => {
      this.modoPontos = false; ativarModo('ctrl', 'ctrl-linha');
    });
    container.querySelector('#ctrl-pontos')!.addEventListener('click', () => {
      this.modoPontos = true; ativarModo('ctrl', 'ctrl-pontos');
    });
    container.querySelector('#ctrl-fluxo')!.addEventListener('click', () => {
      this.modoAcumulado = false; ativarModo('ctrl', 'ctrl-fluxo');
    });
    container.querySelector('#ctrl-acumulado')!.addEventListener('click', () => {
      this.modoAcumulado = true; ativarModo('ctrl', 'ctrl-acumulado');
    });
    container.querySelector('#ctrl-pausar')!.addEventListener('click', () => {
      this.pausado = !this.pausado;
      if (this.elBtnPausar) {
        this.elBtnPausar.textContent = this.pausado ? '▶ Continuar' : '⏸ Pausar';
        this.elBtnPausar.classList.toggle('ativo', this.pausado);
      }
    });
    container.querySelector('#ctrl-limpar')!.addEventListener('click', () => this.limpar());

    container.querySelector('#ctrl-sinal-bruto')!.addEventListener('click', () => {
      this.exibirSinalBruto = !this.exibirSinalBruto;
      this.elBtnSinalBruto?.classList.toggle('ativo', this.exibirSinalBruto);
    });

    this.dimensionarCanvas();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);

    container.querySelector('#ctrl-tela-cheia')!.addEventListener('click', () => this.alternarTelaCheia());

    this.inicializarPainelFiltros(container);
  }

  private inicializarPainelFiltros(container: HTMLElement) {
    // Ler estado inicial da fonte (se disponível)
    const cfgInicial = this.fonte.obterConfigPipeline?.();
    const origem = container.querySelector<HTMLElement>('#filtros-origem');
    if (cfgInicial) {
      const ckZona   = container.querySelector<HTMLInputElement>('#ck-zona-morta')!;
      const ckMedia  = container.querySelector<HTMLInputElement>('#ck-media-movel')!;
      const ckQueima = container.querySelector<HTMLInputElement>('#ck-det-queima')!;
      const inZona   = container.querySelector<HTMLInputElement>('#in-zona-morta')!;
      const inMedia  = container.querySelector<HTMLInputElement>('#in-media-movel')!;
      const inHister = container.querySelector<HTMLInputElement>('#in-det-hister')!;
      ckZona.checked   = cfgInicial.ativoZonaMorta;
      ckMedia.checked  = cfgInicial.ativoMediaMovel;
      ckQueima.checked = cfgInicial.ativoDetectorQueima;
      inZona.value     = String(cfgInicial.limiarZonaMortaN);
      inMedia.value    = String(cfgInicial.janelaMediaMovel);
      inHister.value   = String(cfgInicial.tempoMinFimMs);
      // Indica se controla pipeline do gateway (WebSocket) ou local (WebSerial)
      if (origem) {
        const isGateway = cfgInicial.limiarZonaMortaN >= 0.5;
        origem.textContent = isGateway ? 'gateway' : 'local';
        origem.className   = 'filtros-origem' + (isGateway ? ' gateway' : '');
      }
    }

    // Toggle painel
    const toggle = container.querySelector('#filtros-toggle')!;
    const corpo  = container.querySelector('#filtros-corpo')!;
    const seta   = container.querySelector('#filtros-seta')!;
    toggle.addEventListener('click', () => {
      const aberto = !corpo.classList.contains('hidden');
      corpo.classList.toggle('hidden', aberto);
      seta.classList.toggle('aberto', !aberto);
    });

    const num = (id: string, fb: number) =>
      Math.max(0, +(container.querySelector<HTMLInputElement>(id)!.value) || fb);
    const chk = (id: string) =>
      container.querySelector<HTMLInputElement>(id)!.checked;

    const aplicar = () => {
      const patch: PipelinePatch = {
        ativoZonaMorta:      chk('#ck-zona-morta'),
        limiarZonaMortaN:    num('#in-zona-morta', 0.05),
        ativoMediaMovel:     chk('#ck-media-movel'),
        janelaMediaMovel:    Math.max(1, num('#in-media-movel', 5)),
        ativoDetectorQueima: chk('#ck-det-queima'),
        tempoMinFimMs:       num('#in-det-hister', 100),
        ativoNotch:          chk('#ck-notch'),
        freqNotchHz:         Math.max(1, num('#in-notch-freq', 60)),
        ativoMediana:        chk('#ck-mediana'),
        janelaMediana:       Math.max(1, num('#in-mediana-jan', 5)),
        ativoEMA:            chk('#ck-ema'),
        alphaEMA:            Math.min(1, Math.max(0.001, num('#in-ema-alpha', 0.2))),
        ativoSG:             chk('#ck-sg'),
        janelaSG:            Math.max(5, num('#in-sg-jan', 7)),
        ativoKalman:         chk('#ck-kalman'),
        kalmanQ:             Math.max(0.0001, num('#in-kalman-q', 0.01)),
        kalmanR:             Math.max(0.01,   num('#in-kalman-r', 1.0)),
      };
      this.fonte.atualizarConfigPipeline?.(patch);
      this.atualizarBadgeFiltros(container);
      this.atualizarBotaoSinalBruto(patch);
    };

    ['#ck-zona-morta','#ck-media-movel','#ck-det-queima',
     '#ck-notch','#ck-mediana','#ck-ema','#ck-sg','#ck-kalman'].forEach(id =>
      container.querySelector(id)!.addEventListener('change', aplicar));
    ['#in-zona-morta','#in-media-movel','#in-det-hister',
     '#in-notch-freq','#in-mediana-jan','#in-ema-alpha',
     '#in-sg-jan','#in-kalman-q','#in-kalman-r'].forEach(id =>
      container.querySelector(id)!.addEventListener('change', aplicar));

    this.atualizarBadgeFiltros(container);
  }

  private atualizarBadgeFiltros(container: HTMLElement) {
    const badge = container.querySelector<HTMLElement>('#filtros-badge');
    if (!badge) return;
    const ids = ['#ck-zona-morta','#ck-media-movel','#ck-det-queima',
                 '#ck-notch','#ck-mediana','#ck-ema','#ck-sg','#ck-kalman'];
    const total  = ids.length;
    const ativos = ids.filter(id => container.querySelector<HTMLInputElement>(id)?.checked).length;
    badge.textContent = ativos === total ? `${total} ativos` : ativos === 0 ? 'inativo' : `${ativos}/${total} ativos`;
    badge.className   = 'filtros-badge' + (ativos === total ? '' : ativos === 0 ? ' inativo' : ' parcial');
  }

  private atualizarBotaoSinalBruto(patch: PipelinePatch) {
    const algumNovo = patch.ativoNotch || patch.ativoMediana || patch.ativoEMA || patch.ativoSG || patch.ativoKalman;
    if (this.elBtnSinalBruto) {
      this.elBtnSinalBruto.disabled = !algumNovo;
      if (!algumNovo) {
        this.exibirSinalBruto = false;
        this.elBtnSinalBruto.classList.remove('ativo');
        this.dadosBrutos = [];
      }
    }
  }

  private get escuro(): boolean {
    return document.documentElement.dataset['tema'] === 'escuro';
  }

  private onCanvasMouseMove = (e: MouseEvent) => {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.hoverPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  private onCanvasMouseLeave = () => { this.hoverPos = null; };

  private onResize = () => this.dimensionarCanvas();

  private onFullscreenChange = () => {
    const ativo = !!document.fullscreenElement;
    if (this.elBtnTelaCheia) {
      this.elBtnTelaCheia.textContent = ativo ? '✕' : '⛶';
      this.elBtnTelaCheia.title       = ativo ? 'Sair da tela cheia (Esc)' : 'Tela cheia';
      this.elBtnTelaCheia.classList.toggle('ativo', ativo);
    }
    // Pequeno delay para o navegador terminar o resize antes de redimensionar o canvas
    setTimeout(() => this.dimensionarCanvas(), 50);
  };

  private alternarTelaCheia() {
    if (!document.fullscreenElement) {
      this.cardMedicao?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  private dimensionarCanvas() {
    if (!this.canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect  = this.canvas.getBoundingClientRect();
    this.canvas.width  = rect.width  * ratio;
    this.canvas.height = rect.height * ratio;
  }

  private onDados(l: LeituraProcessada) {
    this.ultimaForca   = l.forcaNewton;
    this.ultimaLeitura = l;
    this.contMsgs++;

    const agora = Date.now();
    if (agora - this.ultimoHzTs >= 1000) {
      this.hz = this.contMsgs;
      this.contMsgs  = 0;
      this.ultimoHzTs = agora;
      if (this.elHz) this.elHz.textContent = `${this.hz} Hz`;
    }

    if (!this.pausado) {
      const limite = this.modoAcumulado ? MAX_ACUMULADO : MAX_FLUXO;
      this.dadosGrafico.push({ valor: l.forcaNewton, tempo: l.marcaTemporal });
      if (this.dadosGrafico.length > limite) this.dadosGrafico.shift();

      if (l.forcaNewtonBruta !== undefined) {
        this.dadosBrutos.push({ valor: l.forcaNewtonBruta, tempo: l.marcaTemporal });
        if (this.dadosBrutos.length > limite) this.dadosBrutos.shift();
      }
    }

    if (this.gravando) {
      this.dadosGravados.push(l);
      this.gerenciador.adicionarLeitura(l).catch(() => {});
    }

    this.atualizarDisplay();
  }

  private onConfig(raw: unknown) {
    const c = raw as { capacidadeMaxGramas?: number } | null;
    if (c?.capacidadeMaxGramas) {
      // reservado para range futuro do gráfico
    }
  }

  private onStatus(raw: unknown) {
    const s  = raw as { conectado?: boolean } | null;
    const ok = s?.conectado ?? false;
    if (this.elPonto) {
      this.elPonto.className = 'status-ponto' + (ok ? ' pulsando' : ' erro');
    }
    const txt = this.canvas?.closest('.card')?.querySelector('#txt-serial');
    if (txt) txt.textContent = ok ? 'Serial conectado' : 'Serial desconectado';
  }

  private atualizarDisplay() {
    const convertido = converterForca(this.ultimaForca, this.unidade);
    if (this.elValor) {
      this.elValor.textContent = convertido.toFixed(this.unidade === 'N' ? 2 : 3);
      this.elValor.classList.toggle('em-queima', !!this.ultimaLeitura?.emQueima);
    }

    if (this.elQueima) {
      this.elQueima.textContent = this.ultimaLeitura?.emQueima ? 'Em queima' : 'Repouso';
      (this.elQueima as HTMLElement).style.color = this.ultimaLeitura?.emQueima ? '#ff7040' : '#555';
    }

    if (this.elImpulso) {
      const ns = (this.ultimaLeitura?.impulsoAcumuladoNs ?? 0) - this.impulsoOffset;
      this.elImpulso.textContent = `${Math.max(0, ns).toFixed(3)} N·s`;
    }
  }

  private alternarUnidade() {
    const idx = UNIDADES.indexOf(this.unidade);
    this.unidade = UNIDADES[(idx + 1) % UNIDADES.length]!;
    if (this.elUnidade) this.elUnidade.textContent = this.unidade;
    this.atualizarDisplay();
  }

  private limpar() {
    this.dadosGrafico  = [];
    this.dadosBrutos   = [];
    this.impulsoOffset = this.ultimaLeitura?.impulsoAcumuladoNs ?? 0;
    if (this.elImpulso) this.elImpulso.textContent = '0.000 N·s';
  }

  private iniciarLoop() {
    const loop = () => {
      this.renderizarGrafico();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private renderizarGrafico() {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const ratio = window.devicePixelRatio || 1;
    const W = this.canvas.width  / ratio;
    const H = this.canvas.height / ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (this.dadosGrafico.length === 0) {
      ctx.fillStyle    = this.escuro ? '#334155' : '#c0c8d4';
      ctx.font         = '13px system-ui, sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.pausado ? '⏸ Pausado' : 'Aguardando dados...', W / 2, H / 2);
      return;
    }

    const valores = this.dadosGrafico.map(d => converterForca(d.valor, this.unidade));
    const maxVal  = Math.max(...valores);
    const minVal  = Math.min(...valores, 0);
    const range   = Math.max(maxVal - minVal, 0.1) * 1.15 || 1;

    // margens: bottom maior em modo acumulado para label de tempo
    const mg = { top: 20, right: 56, bottom: this.modoAcumulado ? 32 : 20, left: 8 };
    const pw = W - mg.left - mg.right;
    const ph = H - mg.top  - mg.bottom;

    // grade horizontal
    const numLinhas  = 5;
    const corGrade   = this.escuro ? '#1e293b' : '#e5e7eb';
    const corRotulo  = this.escuro ? '#64748b' : '#9ca3af';
    ctx.strokeStyle  = corGrade;
    ctx.lineWidth    = 1;
    for (let i = 0; i <= numLinhas; i++) {
      const y = mg.top + (ph / numLinhas) * i;
      ctx.beginPath(); ctx.moveTo(mg.left, y); ctx.lineTo(W - mg.right, y); ctx.stroke();
      const vLinha = (maxVal * 1.15) - (range * (i / numLinhas));
      ctx.fillStyle    = corRotulo;
      ctx.font         = '10px system-ui, sans-serif';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${vLinha.toFixed(1)} ${this.unidade}`, W - mg.right + 3, y);
    }

    // eixo X (tempo) no modo acumulado
    if (this.modoAcumulado && this.dadosGrafico.length > 1) {
      const t0 = this.dadosGrafico[0]!.tempo;
      const tN = this.dadosGrafico[this.dadosGrafico.length - 1]!.tempo;
      const durS = (tN - t0) / 1000;
      const numTicks = Math.min(6, Math.floor(pw / 60));
      ctx.fillStyle    = corRotulo;
      ctx.font         = '10px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      for (let i = 0; i <= numTicks; i++) {
        const frac = i / numTicks;
        const x    = mg.left + frac * pw;
        const t    = (durS * frac).toFixed(1);
        ctx.textAlign = i === 0 ? 'left' : i === numTicks ? 'right' : 'center';
        ctx.fillText(`${t}s`, x, mg.top + ph + 4);
      }
    }

    // linha de zero
    if (minVal < 0) {
      const zy = mg.top + ph - ((0 - minVal) / range) * ph;
      ctx.strokeStyle = this.escuro ? '#334155' : '#d1d5db';
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(mg.left, zy); ctx.lineTo(W - mg.right, zy); ctx.stroke();
      ctx.setLineDash([]);
    }

    const cor = this.ultimaLeitura?.emQueima ? '#ff7040' : '#4a9eff';
    const n   = this.dadosGrafico.length;
    const den = Math.max(n - 1, 1);

    // Linha do sinal bruto (atrás da linha filtrada)
    if (this.exibirSinalBruto && this.dadosBrutos.length > 1) {
      const nb   = this.dadosBrutos.length;
      const denB = Math.max(nb - 1, 1);
      ctx.beginPath();
      ctx.strokeStyle = this.escuro ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.40)';
      ctx.lineWidth   = 1;
      this.dadosBrutos.forEach((d, i) => {
        const v = converterForca(d.valor, this.unidade);
        const x = mg.left + (i / denB) * pw;
        const y = mg.top + ph - ((v - minVal) / range) * ph;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    const posX = (i: number) => mg.left + (i / den) * pw;
    const posY = (v: number) => mg.top + ph - ((v - minVal) / range) * ph;

    if (this.modoPontos) {
      // modo pontos
      ctx.fillStyle = cor;
      this.dadosGrafico.forEach((d, i) => {
        const v = converterForca(d.valor, this.unidade);
        ctx.beginPath();
        ctx.arc(posX(i), posY(v), 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    } else {
      // modo linha: fill área + linha + ponto atual
      ctx.beginPath();
      this.dadosGrafico.forEach((d, i) => {
        const v = converterForca(d.valor, this.unidade);
        i === 0 ? ctx.moveTo(posX(i), posY(v)) : ctx.lineTo(posX(i), posY(v));
      });
      ctx.lineTo(posX(n - 1), mg.top + ph);
      ctx.lineTo(mg.left,     mg.top + ph);
      ctx.closePath();
      ctx.fillStyle = cor + '18';
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = cor;
      ctx.lineWidth   = 2;
      ctx.shadowColor = cor;
      ctx.shadowBlur  = 4;
      this.dadosGrafico.forEach((d, i) => {
        const v = converterForca(d.valor, this.unidade);
        i === 0 ? ctx.moveTo(posX(i), posY(v)) : ctx.lineTo(posX(i), posY(v));
      });
      ctx.stroke();
      ctx.shadowBlur = 0;

      // ponto atual
      const ult = this.dadosGrafico[n - 1]!;
      ctx.beginPath();
      ctx.arc(posX(n - 1), posY(converterForca(ult.valor, this.unidade)), 4, 0, Math.PI * 2);
      ctx.fillStyle = cor;
      ctx.fill();
    }

    // Crosshair + tooltip ao passar o mouse
    if (this.hoverPos && n > 1) {
      const mx = this.hoverPos.x;
      if (mx >= mg.left && mx <= W - mg.right) {
        const frac     = (mx - mg.left) / pw;
        const idx      = Math.max(0, Math.min(n - 1, Math.round(frac * den)));
        const d        = this.dadosGrafico[idx]!;
        const v        = converterForca(d.valor, this.unidade);
        const px       = posX(idx);
        const py       = posY(v);

        // Linhas cruzadas
        ctx.save();
        ctx.strokeStyle = 'rgba(100,116,139,0.35)';
        ctx.lineWidth   = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(px, mg.top);       ctx.lineTo(px, mg.top + ph); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mg.left, py);      ctx.lineTo(W - mg.right, py); ctx.stroke();
        ctx.setLineDash([]);

        // Marcador no ponto
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle   = cor;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        // Caixa de tooltip
        const decimais = this.unidade === 'N' ? 2 : 3;
        let   label    = `${v.toFixed(decimais)} ${this.unidade}`;
        if (this.modoAcumulado && n > 1) {
          const t0 = this.dadosGrafico[0]!.tempo;
          label    = `${label}  t=${((d.tempo - t0) / 1000).toFixed(2)}s`;
        }

        const padX = 8, padY = 4, bh = 22;
        ctx.font = 'bold 12px system-ui, sans-serif';
        const tw = ctx.measureText(label).width;
        const bw = tw + padX * 2;

        let bx = px + 12;
        if (bx + bw > W - mg.right - 2) bx = px - bw - 12;
        let by = py - bh / 2;
        if (by < mg.top) by = mg.top;
        if (by + bh > mg.top + ph) by = mg.top + ph - bh;

        ctx.fillStyle = 'rgba(15,23,42,0.80)';
        ctx.beginPath();
        (ctx as CanvasRenderingContext2D & { roundRect: (...a: unknown[]) => void })
          .roundRect(bx, by, bw, bh, 4);
        ctx.fill();

        ctx.fillStyle    = '#f1f5f9';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + padX, by + bh / 2 + 1);
        ctx.restore();
      }
    }
  }

  private async iniciarGravacao() {
    this.nomeSessao    = this.elNome?.value.trim() ||
      `Sessão ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`;
    this.dadosGravados = [];
    this.dadosGrafico  = [];
    await this.gerenciador.iniciarGravacao(this.nomeSessao);
    this.gravando = true;

    this.elBtnIniciar?.classList.add('hidden');
    this.elBtnParar?.classList.remove('hidden');
    this.elBadge?.classList.remove('hidden');

    if (this.elStatus) {
      this.elStatus.className = 'status-box ok';
      this.elStatus.textContent = `Gravando: ${this.nomeSessao}`;
      this.elStatus.classList.remove('hidden');
    }
  }

  private async pararGravacao() {
    this.gravando = false;
    const sessao = await this.gerenciador.pararGravacao();

    this.elBtnIniciar?.classList.remove('hidden');
    this.elBtnParar?.classList.add('hidden');
    this.elBadge?.classList.add('hidden');

    if (this.elStatus) {
      this.elStatus.className = 'status-box aviso';
      this.elStatus.textContent = `Sessão salva — ${sessao.totalLeituras} leituras, F_máx ${sessao.forcaMaximaN.toFixed(1)} N`;
    }

    if (this.dadosGravados.length > 0) {
      new TelaAnalise(
        { leituras: [...this.dadosGravados], nomeSessao: this.nomeSessao, modo: 'nova', idSessao: sessao.id },
        this.armazenamento,
        () => {},
      );
    }
  }

  destruir() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.canvas?.removeEventListener('mousemove',  this.onCanvasMouseMove);
    this.canvas?.removeEventListener('mouseleave', this.onCanvasMouseLeave);
    if (document.fullscreenElement) document.exitFullscreen?.();
  }
}

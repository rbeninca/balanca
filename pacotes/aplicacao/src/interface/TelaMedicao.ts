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
  private gravando          = false;
  private inicioGravacaoMs  = 0;
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
  private elStatsTempo:    HTMLElement | null = null;
  private elStatsAmostras: HTMLElement | null = null;
  private elNome:          HTMLInputElement | null = null;
  private elBtnPausar:     HTMLButtonElement | null = null;
  private elBtnTelaCheia:  HTMLButtonElement | null = null;
  private elBtnSinalBruto: HTMLButtonElement | null = null;
  private cardMedicao:     HTMLElement | null = null;
  private painelFiltros:   HTMLElement | null = null;
  private hoverPos:        { x: number; y: number } | null = null;
  private modalEl:         HTMLElement | null = null;
  private modalTitulo:     HTMLElement | null = null;
  private modalOque:       HTMLElement | null = null;
  private modalComo:       HTMLElement | null = null;
  private modalSvg:        HTMLElement | null = null;
  private modalRefs:       HTMLElement | null = null;
  private fecharModal = () => this.modalEl?.classList.add('hidden');
  private onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') this.fecharModal(); };

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
                <input type="checkbox" id="ck-zona-morta">
                Zona Morta
              </label>
              <button class="filtro-info-btn" data-filtro="zona-morta" type="button" title="Saiba mais">ℹ</button>
              <div class="filtro-params">
                <input type="number" id="in-zona-morta" class="filtro-num" value="0.05" min="0" step="0.01" title="Limiar (N)">
                <span>N</span>
              </div>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="checkbox" id="ck-media-movel">
                Média Móvel
              </label>
              <button class="filtro-info-btn" data-filtro="media-movel" type="button" title="Saiba mais">ℹ</button>
              <div class="filtro-params">
                <input type="number" id="in-media-movel" class="filtro-num" value="5" min="1" max="50" step="1" title="Janela (amostras)">
                <span>am</span>
              </div>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="checkbox" id="ck-det-queima">
                Det. Queima
              </label>
              <button class="filtro-info-btn" data-filtro="det-queima" type="button" title="Saiba mais">ℹ</button>
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
              <button class="filtro-info-btn" data-filtro="notch" type="button" title="Saiba mais">ℹ</button>
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
              <button class="filtro-info-btn" data-filtro="mediana" type="button" title="Saiba mais">ℹ</button>
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
              <button class="filtro-info-btn" data-filtro="ema" type="button" title="Saiba mais">ℹ</button>
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
              <button class="filtro-info-btn" data-filtro="sg" type="button" title="Saiba mais">ℹ</button>
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
              <button class="filtro-info-btn" data-filtro="kalman" type="button" title="Saiba mais">ℹ</button>
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

    const modal = document.createElement('div');
    modal.className = 'fi-overlay hidden';
    modal.innerHTML = `
      <div class="fi-caixa">
        <div class="fi-header">
          <h3 class="fi-titulo"></h3>
          <button class="fi-fechar" type="button" title="Fechar">✕</button>
        </div>
        <div class="fi-corpo">
          <div class="fi-secao"><h4>O que é</h4><p class="fi-oque"></p></div>
          <div class="fi-secao"><h4>Como funciona</h4><p class="fi-como"></p></div>
          <div class="fi-secao"><h4>Exemplo visual</h4><div class="fi-svg"></div></div>
          <div class="fi-secao"><h4>Referências</h4><ul class="fi-refs"></ul></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    this.modalEl     = modal;
    this.modalTitulo = modal.querySelector('.fi-titulo');
    this.modalOque   = modal.querySelector('.fi-oque');
    this.modalComo   = modal.querySelector('.fi-como');
    this.modalSvg    = modal.querySelector('.fi-svg');
    this.modalRefs   = modal.querySelector('.fi-refs');
    modal.addEventListener('click', e => { if (e.target === modal) this.fecharModal(); });
    modal.querySelector('.fi-fechar')!.addEventListener('click', this.fecharModal);
    document.addEventListener('keydown', this.onEsc);

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

  private sincronizarPainel(cfg: EstadoPipeline): void {
    const c = this.painelFiltros;
    if (!c) return;
    const ck  = (id: string, v: boolean)        => { const el = c.querySelector<HTMLInputElement>(id);  if (el) el.checked = v; };
    const inp = (id: string, v: number | undefined, fb: number) => { const el = c.querySelector<HTMLInputElement>(id); if (el) el.value = String(v ?? fb); };

    ck('#ck-zona-morta',  cfg.ativoZonaMorta);
    ck('#ck-media-movel', cfg.ativoMediaMovel);
    ck('#ck-det-queima',  cfg.ativoDetectorQueima);
    ck('#ck-notch',       cfg.ativoNotch);
    ck('#ck-mediana',     cfg.ativoMediana);
    ck('#ck-ema',         cfg.ativoEMA);
    ck('#ck-sg',          cfg.ativoSG);
    ck('#ck-kalman',      cfg.ativoKalman);

    inp('#in-zona-morta',   cfg.limiarZonaMortaN,  0.05);
    inp('#in-media-movel',  cfg.janelaMediaMovel,  5);
    inp('#in-det-hister',   cfg.tempoMinFimMs,     100);
    inp('#in-notch-freq',   cfg.freqNotchHz,       60);
    inp('#in-mediana-jan',  cfg.janelaMediana,     5);
    inp('#in-ema-alpha',    cfg.alphaEMA,          0.2);
    inp('#in-sg-jan',       cfg.janelaSG,          7);
    inp('#in-kalman-q',     cfg.kalmanQ,           0.01);
    inp('#in-kalman-r',     cfg.kalmanR,           1.0);

    this.atualizarBadgeFiltros(c);
    this.atualizarBotaoSinalBruto(cfg);
  }

  private inicializarPainelFiltros(container: HTMLElement) {
    this.painelFiltros = container;

    container.addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.filtro-info-btn');
      if (btn?.dataset['filtro']) this.mostrarInfoFiltro(btn.dataset['filtro']!);
    });

    // Ler estado inicial da fonte (se disponível)
    const cfgInicial = this.fonte.obterConfigPipeline?.();
    const origem = container.querySelector<HTMLElement>('#filtros-origem');
    if (cfgInicial) {
      this.sincronizarPainel(cfgInicial);
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
    const c = raw as Partial<EstadoPipeline> & { capacidadeMaxGramas?: number } | null;
    if (!c) return;
    if (c.ativoZonaMorta !== undefined) {
      this.sincronizarPainel(c as EstadoPipeline);
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
      this.atualizarTempoGravacao();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private atualizarTempoGravacao(): void {
    if (!this.gravando || !this.elStatsTempo || !this.elStatsAmostras) return;
    const elapsed  = Date.now() - this.inicioGravacaoMs;
    const s        = Math.floor(elapsed / 1000);
    const ms       = elapsed % 1000;
    this.elStatsTempo.textContent    = `${s}s ${String(ms).padStart(3, '0')}ms`;
    this.elStatsAmostras.textContent = `${this.dadosGravados.length} amostras`;
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
    this.nomeSessao       = this.elNome?.value.trim() ||
      `Sessão ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`;
    this.dadosGravados    = [];
    this.dadosGrafico     = [];
    this.inicioGravacaoMs = Date.now();
    await this.gerenciador.iniciarGravacao(this.nomeSessao);
    this.gravando = true;

    this.elBtnIniciar?.classList.add('hidden');
    this.elBtnParar?.classList.remove('hidden');
    this.elBadge?.classList.remove('hidden');

    if (this.elStatus) {
      this.elStatus.className = 'status-box ok';
      this.elStatus.classList.remove('hidden');
      this.elStatus.innerHTML = '';

      const nomeEl = document.createElement('div');
      nomeEl.textContent = `Gravando: ${this.nomeSessao}`;

      const statsEl = document.createElement('div');
      statsEl.style.cssText = 'margin-top:4px;font-size:0.82rem;opacity:0.85;font-variant-numeric:tabular-nums';

      const spanTempo    = document.createElement('span');
      const spanAmostras = document.createElement('span');
      statsEl.appendChild(spanTempo);
      statsEl.appendChild(document.createTextNode(' · '));
      statsEl.appendChild(spanAmostras);

      this.elStatus.appendChild(nomeEl);
      this.elStatus.appendChild(statsEl);
      this.elStatsTempo    = spanTempo;
      this.elStatsAmostras = spanAmostras;
    }
  }

  private async pararGravacao() {
    this.gravando = false;
    const sessao = await this.gerenciador.pararGravacao();
    this.elStatsTempo    = null;
    this.elStatsAmostras = null;

    this.elBtnIniciar?.classList.remove('hidden');
    this.elBtnParar?.classList.add('hidden');
    this.elBadge?.classList.add('hidden');

    if (this.elStatus) {
      this.elStatus.className  = 'status-box aviso';
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

  private mostrarInfoFiltro(chave: string): void {
    const info = FILTROS_INFO[chave];
    if (!info || !this.modalEl) return;
    if (this.modalTitulo) this.modalTitulo.textContent = info.nome;
    if (this.modalOque)   this.modalOque.textContent   = info.oque;
    if (this.modalComo)   this.modalComo.textContent   = info.como;
    if (this.modalSvg)    this.modalSvg.innerHTML       = info.svg;
    if (this.modalRefs) {
      this.modalRefs.innerHTML = '';
      for (const r of info.refs) {
        const li = document.createElement('li');
        const a  = document.createElement('a');
        a.href = r.url; a.textContent = r.texto;
        a.target = '_blank'; a.rel = 'noopener noreferrer';
        li.appendChild(a); this.modalRefs.appendChild(li);
      }
    }
    this.modalEl.classList.remove('hidden');
  }

  destruir() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    document.removeEventListener('keydown', this.onEsc);
    this.canvas?.removeEventListener('mousemove',  this.onCanvasMouseMove);
    this.canvas?.removeEventListener('mouseleave', this.onCanvasMouseLeave);
    if (document.fullscreenElement) document.exitFullscreen?.();
    this.modalEl?.remove();
    this.modalEl = null;
  }
}

// ── Dados informativos de cada filtro ─────────────────────────────────────────

interface FiltroInfo {
  nome: string;
  oque: string;
  como: string;
  svg:  string;
  refs: { texto: string; url: string }[];
}

function _svg(entrada: number[], saida: number[]): string {
  const W = 280, H = 92, mid = 46, amp = 38;
  const d = (ys: number[]) =>
    ys.map((y, i) =>
      `${i === 0 ? 'M' : 'L'}${2 + (i / (ys.length - 1)) * (W - 4)},${mid - y * amp}`,
    ).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:8px auto;border-radius:6px;max-width:100%">
<rect width="${W}" height="${H}" fill="#0f172a" rx="6"/>
<line x1="2" y1="${mid}" x2="${W - 2}" y2="${mid}" stroke="#1e293b" stroke-width="1"/>
<path d="${d(entrada)}" stroke="rgba(148,163,184,0.5)" fill="none" stroke-width="1.5" stroke-linejoin="round"/>
<path d="${d(saida)}"   stroke="#22d3ee"               fill="none" stroke-width="2"   stroke-linejoin="round"/>
<text x="6" y="11" font-size="9" fill="rgba(148,163,184,0.65)" font-family="system-ui,sans-serif">entrada</text>
<text x="6" y="${H - 4}" font-size="9" fill="#22d3ee" font-family="system-ui,sans-serif">saída</text>
</svg>`;
}

const FILTROS_INFO: Record<string, FiltroInfo> = (() => {
  const zm_e = [0.20,0.42,0.62,0.75,0.70,0.50,0.25,0.05,-0.10,-0.32,-0.55,-0.70,-0.75,-0.58,-0.38,-0.15,0.12,0.38,0.60,0.70];
  const zm_s = zm_e.map(v => Math.abs(v) < 0.30 ? 0 : v);

  const mm_e = [0.30,0.65,0.20,0.72,0.38,0.78,0.22,0.60,0.18,0.55,0.72,0.28,0.75,0.22,0.65,0.30,0.70,0.38,0.80,0.25];
  const mm_s = mm_e.map((_, i, a) => {
    const fatia = a.slice(Math.max(0, i - 4), i + 1);
    return fatia.reduce((s, v) => s + v, 0) / fatia.length;
  });

  const med_e = [0.28,0.32,0.30,0.95,0.30,0.28,0.32,-0.90,0.30,0.32,0.28,0.30,0.95,0.30,0.28,0.32,-0.88,0.30,0.28,0.32];
  const med_s = med_e.map((_, i, a) => {
    const win = a.slice(Math.max(0, i - 1), i + 2).slice().sort((x, y) => x - y);
    return win[Math.floor(win.length / 2)] ?? 0;
  });

  const ema_e = [0.20,0.55,0.10,0.70,0.30,0.80,0.20,0.60,0.10,0.50,0.75,0.25,0.70,0.15,0.60,0.20,0.65,0.30,0.75,0.20];
  const ema_s = ema_e.reduce<number[]>((acc, v) => {
    acc.push(acc.length === 0 ? v : 0.3 * v + 0.7 * acc[acc.length - 1]!);
    return acc;
  }, []);

  return {
    'zona-morta': {
      nome: 'Zona Morta',
      oque: 'Remove pequenas variações em torno do zero que correspondem ao ruído do sensor — e não a uma força real aplicada. Qualquer leitura com valor absoluto abaixo do limiar configurado é tratada como zero.',
      como: 'Função de transferência: se |x| < limiar → y = 0; caso contrário y = x. O limiar deve ser calibrado para ficar ligeiramente acima do nível de ruído do sensor em repouso. No gráfico, observe que os trechos próximos ao zero da curva de entrada são suprimidos.',
      svg: _svg(zm_e, zm_s),
      refs: [
        { texto: 'Wikipedia — Dead zone (control systems)', url: 'https://en.wikipedia.org/wiki/Dead_zone_(control_systems)' },
        { texto: 'MathWorks — Dead Zone block (Simulink)', url: 'https://www.mathworks.com/help/simulink/slref/deadzone.html' },
      ],
    },
    'media-movel': {
      nome: 'Média Móvel',
      oque: 'Suaviza o sinal calculando a média das últimas N amostras. Um dos filtros passa-baixa mais simples e eficazes para redução de ruído branco.',
      como: 'y[n] = (x[n] + x[n−1] + … + x[n−N+1]) / N. Janelas maiores suavizam mais, mas introduzem mais atraso (latência = (N−1)/2 amostras). Fácil de implementar com custo computacional constante O(1) usando a técnica da soma deslizante.',
      svg: _svg(mm_e, mm_s),
      refs: [
        { texto: 'Wikipedia — Moving average', url: 'https://en.wikipedia.org/wiki/Moving_average' },
        { texto: 'DSP Guide — Chapter 15: Moving Average Filters', url: 'https://www.dspguide.com/ch15.htm' },
      ],
    },
    'det-queima': {
      nome: 'Detector de Queima',
      oque: 'Identifica o início e fim da fase de propulsão de um motor foguete de maneira robusta, mesmo com ruído e oscilações de chama no final da queima.',
      como: 'Usa histerese temporal: a força ultrapassa o limiar → queima ativa. A queima só é marcada como encerrada se a força permanecer abaixo do limiar por pelo menos T ms (configurável). Isso evita falsos términos causados por flutuações transitórias. A saída binária (cinza) indica o estado de queima.',
      svg: _svg(
        [0.00,0.00,0.08,0.58,0.88,0.95,0.90,0.82,0.78,0.84,0.80,0.72,0.55,0.30,0.10,0.02,0.00,0.00,0.00,0.00],
        [0.00,0.00,0.00,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.00,0.00,0.00,0.00,0.00,0.00],
      ),
      refs: [
        { texto: 'Wikipedia — Hysteresis (control systems)', url: 'https://en.wikipedia.org/wiki/Hysteresis#Control_systems' },
        { texto: 'Wikipedia — Solid-fuel rocket', url: 'https://en.wikipedia.org/wiki/Solid-fuel_rocket' },
      ],
    },
    'notch': {
      nome: 'Filtro Notch (Rejeita-Banda)',
      oque: 'Atenua uma frequência específica — tipicamente interferência eletromagnética da rede elétrica (50/60 Hz) — mantendo todas as demais frequências praticamente inalteradas.',
      como: 'Implementado como filtro IIR biquad (2 polos, 2 zeros). Os zeros ficam exatamente na frequência de rejeição f₀; os polos próximos aos zeros controlam a largura da rejeição via fator Q (maior Q = banda mais estreita). Coeficientes calculados pela transformada bilinear a partir da frequência de amostragem.',
      svg: _svg(
        [0.28,0.62,0.20,0.58,0.02,0.50,0.10,0.60,0.15,0.50,0.05,0.42,-0.08,0.28,-0.18,0.18,-0.25,0.12,-0.30,0.08,-0.22,0.02,-0.15,-0.08,-0.05],
        [0.30,0.46,0.50,0.48,0.40,0.30,0.20,0.10,0.02,-0.08,-0.14,-0.20,-0.26,-0.30,-0.28,-0.22,-0.14,-0.06,0.00,0.06,0.10,0.10,0.06,0.00,-0.06],
      ),
      refs: [
        { texto: 'Wikipedia — Band-stop filter', url: 'https://en.wikipedia.org/wiki/Band-stop_filter' },
        { texto: 'Audio EQ Cookbook — Notch filter coefficients', url: 'https://webaudio.github.io/Audio-EQ-Cookbook/audio-eq-cookbook.html' },
      ],
    },
    'mediana': {
      nome: 'Filtro de Mediana',
      oque: 'Remove picos isolados (ruído impulsivo) sem borrar bordas do sinal. Ao contrário da média, é completamente robusto contra valores atípicos extremos. No gráfico, os spikes da entrada desaparecem na saída.',
      como: 'Para cada amostra, ordena as N amostras vizinhas (janela) e retorna a do meio. Um pico isolado, por mais extremo que seja, não altera a mediana enquanto N for ímpar e ≥ 3. Ideal para eliminar leituras errôneas únicas do sensor.',
      svg: _svg(med_e, med_s),
      refs: [
        { texto: 'Wikipedia — Median filter', url: 'https://en.wikipedia.org/wiki/Median_filter' },
        { texto: 'Wikipedia — Nonlinear filter', url: 'https://en.wikipedia.org/wiki/Nonlinear_filter' },
      ],
    },
    'ema': {
      nome: 'EMA — Média Exponencial Móvel',
      oque: 'Suaviza o sinal dando peso exponencialmente decrescente a amostras mais antigas. Mais responsivo que a média móvel simples para o mesmo grau de suavização, e usa menos memória (apenas a última saída).',
      como: 'y[n] = α·x[n] + (1−α)·y[n−1]. O parâmetro α ∈ (0,1]: α=1 reproduz o sinal sem filtrar; α→0 suaviza muito com grande atraso. A constante de tempo equivalente é τ ≈ (1−α)/α amostras. Custo computacional O(1), ideal para sistemas embarcados.',
      svg: _svg(ema_e, ema_s),
      refs: [
        { texto: 'Wikipedia — Exponential smoothing', url: 'https://en.wikipedia.org/wiki/Exponential_smoothing' },
        { texto: 'Wikipedia — Moving average § Exponential moving average', url: 'https://en.wikipedia.org/wiki/Moving_average#Exponential_moving_average' },
      ],
    },
    'sg': {
      nome: 'Savitzky-Golay',
      oque: 'Suaviza o sinal ajustando polinômios de grau baixo por mínimos quadrados a janelas sobrepostas. Preserva forma de picos e vales melhor que a média móvel — essencial quando a morfologia do sinal importa.',
      como: 'Cada saída é obtida convoluindo o sinal com coeficientes pré-calculados derivados de regressão polinomial local. Janela maior ou grau menor = mais suavização; grau maior = melhor preservação de picos e bordas. Os coeficientes são simétricos para fase linear (sem atraso de grupo).',
      svg: _svg(
        [-0.05,0.02,0.20,0.32,0.62,0.70,0.95,0.78,0.68,0.40,0.22,0.08,0.15,-0.02,0.05,-0.04,0.20,0.35,0.60,0.72,0.95,0.80,0.62,0.38,0.15],
        [-0.02,0.02,0.15,0.32,0.58,0.76,0.92,0.85,0.66,0.40,0.20,0.08,0.02,0.00,0.02,-0.02,0.15,0.32,0.58,0.76,0.92,0.85,0.65,0.40,0.15],
      ),
      refs: [
        { texto: 'Wikipedia — Savitzky–Golay filter', url: 'https://en.wikipedia.org/wiki/Savitzky%E2%80%93Golay_filter' },
        { texto: 'Savitzky & Golay (1964) — Artigo original, Anal. Chem.', url: 'https://pubs.acs.org/doi/10.1021/ac60214a047' },
      ],
    },
    'kalman': {
      nome: 'Filtro de Kalman',
      oque: 'Estimador recursivo ótimo que combina um modelo dinâmico do sistema com medições ruidosas para obter a melhor estimativa do estado. Amplamente usado em navegação inercial, rastreamento e controle.',
      como: 'Dois passos por amostra: (1) Predição — propaga o estado anterior pelo modelo; (2) Atualização — corrige com a nova medição, ponderada pelo ganho K = P/(P+R), onde P é a incerteza da predição e R é o ruído de medição. Q controla o quão livre o estado pode evoluir.',
      svg: _svg(
        [0.62,0.35,0.72,0.28,0.68,0.22,0.58,0.82,0.38,0.72,0.30,0.62,0.20,0.58,0.78,0.32,0.68,0.28,0.72,0.42],
        [0.62,0.53,0.58,0.51,0.55,0.47,0.50,0.56,0.52,0.55,0.50,0.53,0.47,0.49,0.54,0.49,0.53,0.49,0.53,0.50],
      ),
      refs: [
        { texto: 'Wikipedia — Kalman filter', url: 'https://en.wikipedia.org/wiki/Kalman_filter' },
        { texto: 'Roger Labbe — Kalman and Bayesian Filters in Python (livro gratuito)', url: 'https://github.com/rlabbe/Kalman-and-Bayesian-Filters-in-Python' },
      ],
    },
  };
})();

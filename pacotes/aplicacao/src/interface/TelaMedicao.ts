import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { GerenciadorSessao } from '../nucleo/GerenciadorSessao.js';
import type { ArmazenamentoLocal } from '../armazenamento/ArmazenamentoLocal.js';
import { TelaAnalise } from './TelaAnalise.js';
import { WizardCalibracao } from './WizardCalibracao.js';

type Unidade = 'N' | 'kg' | 'g';

type Fonte = {
  on(evento: 'dados',   fn: (l: LeituraProcessada) => void): void;
  on(evento: 'config',  fn: (c: unknown) => void): void;
  on(evento: 'status',  fn: (s: unknown) => void): void;
  on(evento: string,    fn: (v: unknown) => void): void;
  enviarComando?(cmd: object): void;
  fechar?(): void;
  desconectar?(): Promise<void>;
};

const MAX_PONTOS = 300;
const UNIDADES: Unidade[] = ['N', 'kg', 'g'];

function converterForca(valorN: number, unidade: Unidade): number {
  if (unidade === 'kg') return valorN / 9.80665;
  if (unidade === 'g')  return (valorN / 9.80665) * 1000;
  return valorN;
}

export class TelaMedicao {
  private gravando      = false;
  private dadosGravados: LeituraProcessada[] = [];
  private dadosGrafico: { valor: number; tempo: number }[] = [];
  private unidade: Unidade = 'N';
  private ultimaForca   = 0;
  private ultimaLeitura: LeituraProcessada | null = null;
  private totalMensagens = 0;
  private hz            = 0;
  private contMsgs      = 0;
  private ultimoHzTs    = Date.now();
  private capacidadeMaxN  = 500;
  private animFrameId: number | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private nomeSessao    = '';

  // refs DOM
  private elValor:   HTMLElement | null = null;
  private elUnidade: HTMLElement | null = null;
  private elQueima:  HTMLElement | null = null;
  private elHz:      HTMLElement | null = null;
  private elPonto:   HTMLElement | null = null;
  private elImpulso: HTMLElement | null = null;
  private elBtnIniciar: HTMLButtonElement | null = null;
  private elBtnParar:   HTMLButtonElement | null = null;
  private elBadge:   HTMLElement | null = null;
  private elStatus:  HTMLElement | null = null;
  private elNome:    HTMLInputElement | null = null;

  constructor(
    container: HTMLElement,
    private fonte: Fonte,
    private gerenciador: GerenciadorSessao,
    private armazenamento: ArmazenamentoLocal,
    private onSessoes: () => void,
  ) {
    this.renderizar(container);
    this.fonte.on('dados',  (l) => this.onDados(l as LeituraProcessada));
    this.fonte.on('config', (c) => this.onConfig(c));
    this.fonte.on('status', (s) => this.onStatus(s));
    this.iniciarLoop();
  }

  private renderizar(container: HTMLElement) {
    container.innerHTML = `
      <div class="nav-links">
        <a href="#" id="nav-medir" class="ativo">Medição</a>
        <a href="#" id="nav-sessoes">Sessões</a>
      </div>

      <div class="card">
        <div class="leitura-principal">
          <span id="leit-valor" class="leitura-valor">--.-</span>
          <span id="leit-unidade" class="leitura-unidade" title="Clique para alternar unidade">N</span>
        </div>

        <div class="chart-container">
          <canvas id="grafico-rt" class="grafico-realtime"></canvas>
          <span id="chart-auto" class="chart-label-auto ativo">AUTO</span>
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
          <button id="btn-tarar"   class="btn-secondary">Tarar</button>
          <button id="btn-calibrar" class="btn-secondary">Calibração</button>
        </div>
        <div id="status-grav" class="status-box hidden" style="margin-top:0.75rem"></div>
      </div>
    `;

    this.canvas     = container.querySelector('#grafico-rt')!;
    this.elValor    = container.querySelector('#leit-valor');
    this.elUnidade  = container.querySelector('#leit-unidade');
    this.elQueima   = container.querySelector('#txt-queima');
    this.elHz       = container.querySelector('#txt-hz');
    this.elPonto    = container.querySelector('#ponto-serial');
    this.elImpulso  = container.querySelector('#val-impulso');
    this.elBtnIniciar = container.querySelector('#btn-iniciar');
    this.elBtnParar   = container.querySelector('#btn-parar');
    this.elBadge    = container.querySelector('#badge-gravando');
    this.elStatus   = container.querySelector('#status-grav');
    this.elNome     = container.querySelector('#nome-sessao');

    this.elUnidade?.addEventListener('click', () => this.alternarUnidade());

    container.querySelector('#nav-sessoes')!.addEventListener('click', (e) => {
      e.preventDefault();
      this.destruir();
      this.onSessoes();
    });

    this.elBtnIniciar!.addEventListener('click', () => this.iniciarGravacao());
    this.elBtnParar!.addEventListener('click',   () => this.pararGravacao());

    container.querySelector('#btn-tarar')!.addEventListener('click', () => {
      this.fonte.enviarComando?.({ tipo: 'CMD_TARAR' });
    });

    container.querySelector('#btn-calibrar')!.addEventListener('click', () => {
      new WizardCalibracao(this.fonte, () => {});
    });

    this.dimensionarCanvas();
    window.addEventListener('resize', () => this.dimensionarCanvas());
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
    this.totalMensagens++;
    this.contMsgs++;

    const agora = Date.now();
    if (agora - this.ultimoHzTs >= 1000) {
      this.hz = this.contMsgs;
      this.contMsgs = 0;
      this.ultimoHzTs = agora;
      if (this.elHz) this.elHz.textContent = `${this.hz} Hz`;
    }

    this.dadosGrafico.push({ valor: l.forcaNewton, tempo: l.marcaTemporal });
    if (!this.gravando && this.dadosGrafico.length > MAX_PONTOS) {
      this.dadosGrafico.shift();
    }

    if (this.gravando) this.dadosGravados.push(l);

    this.atualizarDisplay();
  }

  private onConfig(raw: unknown) {
    const c = raw as { capacidadeMaxGramas?: number } | null;
    if (c?.capacidadeMaxGramas) {
      this.capacidadeMaxN = (c.capacidadeMaxGramas / 1000) * 9.80665;
    }
  }

  private onStatus(raw: unknown) {
    const s = raw as { conectado?: boolean } | null;
    const ok = s?.conectado ?? false;
    if (this.elPonto) {
      this.elPonto.className = 'status-ponto' + (ok ? ' pulsando' : ' erro');
    }
    const txt = this.canvas?.closest('.card')?.querySelector('#txt-serial');
    if (txt) txt.textContent = ok ? 'Serial conectado' : 'Serial desconectado';
  }

  private atualizarDisplay() {
    const convertido = converterForca(this.ultimaForca, this.unidade);
    const formatado  = convertido.toFixed(this.unidade === 'N' ? 2 : 3);
    if (this.elValor) {
      this.elValor.textContent = formatado;
      if (this.ultimaLeitura?.emQueima) {
        this.elValor.classList.add('em-queima');
      } else {
        this.elValor.classList.remove('em-queima');
      }
    }

    if (this.elQueima) {
      this.elQueima.textContent = this.ultimaLeitura?.emQueima ? 'Em queima' : 'Repouso';
      (this.elQueima as HTMLElement).style.color = this.ultimaLeitura?.emQueima ? '#ff7040' : '#555';
    }

    if (this.elImpulso) {
      const ns = this.ultimaLeitura?.impulsoAcumuladoNs ?? 0;
      this.elImpulso.textContent = `${ns.toFixed(3)} N·s`;
    }
  }

  private alternarUnidade() {
    const idx = UNIDADES.indexOf(this.unidade);
    this.unidade = UNIDADES[(idx + 1) % UNIDADES.length]!;
    if (this.elUnidade) this.elUnidade.textContent = this.unidade;
    this.atualizarDisplay();
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
    const ctx   = this.canvas.getContext('2d');
    if (!ctx) return;

    const ratio  = window.devicePixelRatio || 1;
    const W = this.canvas.width  / ratio;
    const H = this.canvas.height / ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (this.dadosGrafico.length === 0) {
      ctx.fillStyle = '#3a3a3a';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Aguardando dados...', W / 2, H / 2);
      return;
    }

    const valores = this.dadosGrafico.map(d => converterForca(d.valor, this.unidade));
    const maxVal  = Math.max(...valores);
    const minVal  = Math.min(...valores, 0);
    const range   = Math.max(maxVal - minVal, 0.1) * 1.15 || 1;

    const mg  = { top: 20, right: 52, bottom: 24, left: 8 };
    const pw  = W - mg.left - mg.right;
    const ph  = H - mg.top  - mg.bottom;

    // grade
    const numLinhas = 5;
    ctx.strokeStyle = '#222';
    ctx.lineWidth   = 1;
    for (let i = 0; i <= numLinhas; i++) {
      const y = mg.top + (ph / numLinhas) * i;
      ctx.beginPath();
      ctx.moveTo(mg.left, y);
      ctx.lineTo(W - mg.right, y);
      ctx.stroke();

      const valorLinha = (maxVal * 1.15) - (range * (i / numLinhas));
      ctx.fillStyle  = '#444';
      ctx.font       = '10px system-ui, sans-serif';
      ctx.textAlign  = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${valorLinha.toFixed(1)} ${this.unidade}`, W - mg.right + 3, y);
    }

    // linha de zero
    if (minVal < 0) {
      const zy = mg.top + ph - ((0 - minVal) / range) * ph;
      ctx.strokeStyle = '#333';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(mg.left, zy);
      ctx.lineTo(W - mg.right, zy);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // fill área
    const cor = this.ultimaLeitura?.emQueima ? '#ff7040' : '#4a9eff';
    const n   = this.dadosGrafico.length;
    const den = Math.max(n - 1, 1);

    ctx.beginPath();
    this.dadosGrafico.forEach((d, i) => {
      const v = converterForca(d.valor, this.unidade);
      const x = mg.left + (i / den) * pw;
      const y = mg.top + ph - ((v - minVal) / range) * ph;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(mg.left + pw, mg.top + ph);
    ctx.lineTo(mg.left,      mg.top + ph);
    ctx.closePath();
    ctx.fillStyle = cor + '18';
    ctx.fill();

    // linha principal
    ctx.beginPath();
    ctx.strokeStyle = cor;
    ctx.lineWidth   = 2;
    ctx.shadowColor = cor;
    ctx.shadowBlur  = 4;
    this.dadosGrafico.forEach((d, i) => {
      const v = converterForca(d.valor, this.unidade);
      const x = mg.left + (i / den) * pw;
      const y = mg.top + ph - ((v - minVal) / range) * ph;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ponto atual
    const ult = this.dadosGrafico[this.dadosGrafico.length - 1]!;
    const ultV = converterForca(ult.valor, this.unidade);
    const lx = mg.left + pw;
    const ly = mg.top + ph - ((ultV - minVal) / range) * ph;
    ctx.beginPath();
    ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fillStyle = cor;
    ctx.fill();
  }

  private async iniciarGravacao() {
    this.nomeSessao = this.elNome?.value.trim() ||
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
      const leituras = [...this.dadosGravados];
      new TelaAnalise(
        { leituras, nomeSessao: this.nomeSessao, modo: 'nova', idSessao: sessao.id },
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
    window.removeEventListener('resize', () => this.dimensionarCanvas());
  }
}

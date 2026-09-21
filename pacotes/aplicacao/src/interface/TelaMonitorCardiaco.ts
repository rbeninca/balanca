import { DetectorBCG, type ResultadoBCG } from '@balancagfig/processamento';
import { navHtml, bindNav, type StatusConexao } from './navBar.js';
import type { LeituraProcessada } from '@balancagfig/processamento';

type QualidadeClasse = 'boa' | 'razoavel' | 'instavel' | 'sem-sinal';

interface AmostraTela {
  tMs: number;
  bruto: number;
  filtrado: number;
  envelope: number;
  pico: boolean;
}

const JANELA_S    = 8;      // tempo visível no gráfico
const COR_BRUTO   = 'rgba(148,163,184,0.4)';
const COR_FILT    = '#22d3ee';
const COR_ENVELOPE = '#4ade80';
const COR_PICO    = '#f59e0b';
const COR_FUNDO   = '#0f172a';
const COR_GRADE   = 'rgba(148,163,184,0.07)';
const COR_ZERO    = 'rgba(148,163,184,0.18)';

export class TelaMonitorCardiaco {
  private destruido  = false;
  private rafId: number | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private refs: {
    bpmNum: HTMLElement; qualChip: HTMLElement; ibiTexto: HTMLElement; statusBar: HTMLElement;
  } | null = null;

  private detector = new DetectorBCG();
  private amostras: AmostraTela[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handler = (leitura: any) => {
    if (this.destruido) return;
    const l = leitura as LeituraProcessada;
    // Antes da zona morta: os impulsos BCG são da ordem de milésimos de N,
    // muito abaixo do limiar típico (0,5 N) que zera a leitura "útil".
    const forcaEntrada = l.forcaNewtonCrua ?? l.forcaNewton;
    const r = this.detector.processar(forcaEntrada, l.marcaTemporal);
    this.amostras.push({
      tMs: l.marcaTemporal,
      bruto: r.sinalBruto,
      filtrado: r.sinalFiltrado,
      envelope: r.envelope,
      pico: r.pico,
    });
    this.cortarJanela(l.marcaTemporal);
    this.atualizarPainel(r);
  };

  constructor(
    container: HTMLElement,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private fonte: any,
    private onConexao:         () => void,
    private onMedicao:         () => void,
    private onJogos:           () => void,
    private onSessoes:         () => void,
    private onConfiguracoes?:  () => void,
    private onFirmware?:       () => void,
    private status?:           StatusConexao,
  ) {
    this.renderizar(container);
    fonte?.on?.('dados', this.handler);
    this.iniciarLoop();
  }

  private renderizar(container: HTMLElement): void {
    container.innerHTML = `
      ${navHtml({
        ativo: 'medicao', onConexao: this.onConexao, onMedicao: this.onMedicao,
        onSessoes: this.onSessoes, onConfiguracoes: this.onConfiguracoes,
        onFirmware: this.onFirmware, status: this.status,
      })}

      <div class="monitor-cardiaco">
        <div class="monitor-layout">

          <div class="monitor-arena">
            <div class="monitor-hud-topo">
              <span class="monitor-status-texto" id="monitor-status">Posicione a célula de carga sobre o peito</span>
              <div class="monitor-legenda-traces">
                <span class="monitor-leg-bruto">Bruto</span>
                <span class="monitor-leg-filtrado">Filtrado</span>
                <span class="monitor-leg-filtrado" style="color:${COR_ENVELOPE}">Envelope</span>
              </div>
            </div>
            <canvas id="monitor-canvas" class="monitor-canvas"></canvas>
            <div class="monitor-legenda-grade">
              <span>7s</span><span>6s</span><span>5s</span>
              <span>4s</span><span>3s</span><span>2s</span><span>1s</span>
              <span class="monitor-agora">agora</span>
            </div>
          </div>

          <div class="monitor-painel">
            <div class="monitor-bpm-bloco">
              <div class="monitor-bpm-num sem-sinal" id="monitor-bpm">--</div>
              <div class="monitor-bpm-label">bpm</div>
            </div>
            <span class="monitor-qualidade-chip sem-sinal" id="monitor-qualidade">Sem sinal</span>
            <div class="monitor-ibi" id="monitor-ibi"></div>
            <hr class="monitor-divisor">
            <div class="monitor-instrucoes">
              <strong>Como usar</strong>
              <ol>
                <li>Deite a célula de carga sobre o peito</li>
                <li>Fique imóvel e respire normalmente</li>
                <li>O número aparece após alguns batimentos</li>
              </ol>
            </div>
            <button class="btn-outline btn-sm monitor-btn-voltar" id="btn-monitor-voltar">
              ← Catálogo
            </button>
          </div>

        </div>
      </div>
    `;

    bindNav(container, {
      ativo: 'medicao', onConexao: this.onConexao, onMedicao: this.onMedicao,
      onSessoes: this.onSessoes, onConfiguracoes: this.onConfiguracoes,
      onFirmware: this.onFirmware, status: this.status,
    });

    this.canvas = container.querySelector<HTMLCanvasElement>('#monitor-canvas')!;
    this.ctx = this.canvas.getContext('2d');
    this.refs = {
      bpmNum:    container.querySelector('#monitor-bpm')!,
      qualChip:  container.querySelector('#monitor-qualidade')!,
      ibiTexto:  container.querySelector('#monitor-ibi')!,
      statusBar: container.querySelector('#monitor-status')!,
    };

    container.querySelector('#btn-monitor-voltar')?.addEventListener('click', (e) => {
      e.preventDefault(); this.onJogos();
    });
    this.redimensionarCanvas();
    window.addEventListener('resize', this.onResize);
  }

  private cortarJanela(tMs: number): void {
    const corte = tMs - JANELA_S * 1000;
    while (this.amostras.length > 0 && this.amostras[0]!.tMs < corte) {
      this.amostras.shift();
    }
  }

  private atualizarPainel(r: ResultadoBCG): void {
    if (!this.refs) return;
    const { bpmNum, qualChip, ibiTexto, statusBar } = this.refs;
    if (r.bpm !== null) {
      bpmNum.textContent = String(r.bpm);
      bpmNum.className   = 'monitor-bpm-num ' + classesBpm(r.bpm);
    } else {
      bpmNum.textContent = '--';
      bpmNum.className   = 'monitor-bpm-num sem-sinal';
    }
    qualChip.className   = `monitor-qualidade-chip ${r.qualidade}`;
    qualChip.textContent = textoQualidade(r.qualidade);
    ibiTexto.textContent = r.ibiMs !== null ? `IBI: ${Math.round(r.ibiMs)} ms` : '';
    statusBar.textContent = textoStatus(r.qualidade);
  }

  private onResize = () => this.redimensionarCanvas();

  private redimensionarCanvas(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  private iniciarLoop(): void {
    const frame = () => {
      if (this.destruido) return;
      this.desenhar();
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  private desenhar(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas || canvas.width === 0) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = COR_FUNDO;
    ctx.fillRect(0, 0, w, h);

    // grade de segundos
    ctx.strokeStyle = COR_GRADE;
    ctx.lineWidth   = 1;
    for (let s = 0; s <= JANELA_S; s++) {
      const x = (s / JANELA_S) * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    ctx.strokeStyle = COR_ZERO;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.setLineDash([]);

    if (this.amostras.length < 2) return;

    // escala pelo filtrado e pelo envelope — o bruto (com o peso e a respiração)
    // é desenhado em escala própria, senão esmaga os traços de interesse
    const maxFilt = Math.max(...this.amostras.map(a => Math.abs(a.filtrado)));
    const maxEnv  = Math.max(...this.amostras.map(a => a.envelope));
    const escala  = maxFilt > 1e-6 ? (h * 0.38) / maxFilt : 1;
    const escalaEnv = maxEnv > 1e-6 ? (h * 0.38) / maxEnv : 1;
    const maxBruto = Math.max(...this.amostras.map(a => Math.abs(a.bruto)));
    const escalaBruto = maxBruto > 1e-6 ? (h * 0.20) / maxBruto : 1;

    const tFim = this.amostras[this.amostras.length - 1]!.tMs;
    const x = (tMs: number) => ((tMs - (tFim - JANELA_S * 1000)) / (JANELA_S * 1000)) * w;

    const tracar = (campo: (a: AmostraTela) => number, cor: string, lw: number, esc: number) => {
      ctx.strokeStyle = cor;
      ctx.lineWidth = lw;
      ctx.beginPath();
      let primeiro = true;
      for (const a of this.amostras) {
        const px = x(a.tMs);
        const py = h / 2 - campo(a) * esc;
        if (primeiro) { ctx.moveTo(px, py); primeiro = false; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };

    tracar(a => a.bruto,    COR_BRUTO,   1.0, escalaBruto);
    tracar(a => a.filtrado, COR_FILT,    1.6, escala);
    tracar(a => a.envelope, COR_ENVELOPE, 1.6, escalaEnv);

    // marcas de batimento sobre o traço filtrado
    ctx.fillStyle = COR_PICO;
    for (const a of this.amostras) {
      if (!a.pico) continue;
      const px = x(a.tMs);
      const py = h / 2 - a.filtrado * escala;
      ctx.beginPath(); ctx.arc(px, py - 6, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  destruir(): void {
    this.destruido = true;
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    window.removeEventListener('resize', this.onResize);
    this.fonte?.off?.('dados', this.handler);
  }
}

function classesBpm(bpm: number): string {
  if (bpm < 50 || bpm > 150) return 'critico';
  if (bpm < 60 || bpm > 100) return 'alto';
  return 'normal';
}

function textoQualidade(q: QualidadeClasse): string {
  switch (q) {
    case 'boa':       return 'Sinal bom';
    case 'razoavel':  return 'Sinal razoável';
    case 'instavel':  return 'Sinal instável';
    case 'sem-sinal': return 'Sem sinal';
  }
}

function textoStatus(q: QualidadeClasse): string {
  switch (q) {
    case 'boa':       return 'Monitorando batimentos cardíacos';
    case 'razoavel':  return 'Fique imóvel para melhorar o sinal';
    case 'instavel':  return 'Sinal com interferência — evite movimentos';
    case 'sem-sinal': return 'Posicione a célula de carga sobre o peito';
  }
}

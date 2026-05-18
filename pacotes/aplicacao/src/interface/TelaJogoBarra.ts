import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import {
  CalibradorBarra,
  EstimadorMovimentoBarra,
  DetectorRepeticaoBarra,
  CalculadorMetricasBarra,
} from '@balancagfig/processamento';
import type { EstadoMovimento } from '@balancagfig/processamento';
import type { Repeticao } from '@balancagfig/processamento';
import type { MetricasBarra } from '@balancagfig/processamento';
import { navHtml, bindNav, type StatusConexao } from './navBar.js';
import type { Fonte } from './TelaMedicao.js';

export class TelaJogoBarra {
  private calibrador  = new CalibradorBarra(100);
  private estimador   = new EstimadorMovimentoBarra(100);
  private detector    = new DetectorRepeticaoBarra();
  private metricas    = new CalculadorMetricasBarra();

  private estado:    EstadoMovimento | null = null;
  private repeticoes: Repeticao[]           = [];
  private metAtual:  MetricasBarra | null   = null;

  private pesoRef  = 0;
  private massaEst = 0;
  private progresso = 0;

  private canvas:    HTMLCanvasElement | null = null;
  private ctx:       CanvasRenderingContext2D | null = null;
  private rafId:     number | null = null;
  private renderPendente = false;

  // Refs HUD
  private elForca:    HTMLElement | null = null;
  private elPosicao:  HTMLElement | null = null;
  private elFase:     HTMLElement | null = null;
  private elReps:     HTMLElement | null = null;
  private elTrabalho: HTMLElement | null = null;
  private elPotencia: HTMLElement | null = null;
  private elCalib:    HTMLElement | null = null;
  private elProgBar:  HTMLElement | null = null;
  private elBtnReset: HTMLButtonElement | null = null;

  constructor(
    container: HTMLElement,
    private readonly fonte: Fonte,
    private readonly onConexao: () => void,
    private readonly onJogos: () => void,
  ) {
    this.renderizar(container);
    this.fonte.on('dados', (l) => this.onDados(l as LeituraProcessada));
  }

  private renderizar(container: HTMLElement): void {
    const navProps = {
      ativo:          'jogos' as const,
      onConexao:      this.onConexao,
      onJogos:        this.onJogos,
    };
    container.innerHTML = `
      ${navHtml(navProps as Parameters<typeof navHtml>[0])}
      <div class="barra-wrapper">
        <div class="barra-canvas-container">
          <canvas class="barra-canvas" id="barra-canvas"></canvas>
          <div class="barra-hud">
            <div class="barra-hud-calib hidden" id="barra-calib">
              <div class="barra-calib-titulo">Fique parado pendurado na barra...</div>
              <div class="barra-prog-outer"><div class="barra-prog-inner" id="barra-prog"></div></div>
            </div>
            <div class="barra-hud-metricas" id="barra-metricas">
              <div class="barra-metric"><span class="barra-label">Força</span><span class="barra-val" id="bh-forca">—</span></div>
              <div class="barra-metric"><span class="barra-label">Posição</span><span class="barra-val" id="bh-pos">—</span></div>
              <div class="barra-metric"><span class="barra-label">Fase</span><span class="barra-val" id="bh-fase">—</span></div>
              <div class="barra-metric"><span class="barra-label">Reps</span><span class="barra-val" id="bh-reps">0</span></div>
              <div class="barra-metric"><span class="barra-label">Trabalho</span><span class="barra-val" id="bh-trabalho">0 J</span></div>
              <div class="barra-metric"><span class="barra-label">Potência pico</span><span class="barra-val" id="bh-pot">0 W</span></div>
            </div>
          </div>
        </div>
        <div class="barra-controles">
          <button class="btn-secondary" id="barra-reset">Reiniciar calibração</button>
        </div>
      </div>
    `;

    bindNav(container, navProps as Parameters<typeof bindNav>[1]);

    this.canvas    = container.querySelector('#barra-canvas');
    this.ctx       = this.canvas?.getContext('2d') ?? null;
    this.elForca   = container.querySelector('#bh-forca');
    this.elPosicao = container.querySelector('#bh-pos');
    this.elFase    = container.querySelector('#bh-fase');
    this.elReps    = container.querySelector('#bh-reps');
    this.elTrabalho= container.querySelector('#bh-trabalho');
    this.elPotencia= container.querySelector('#bh-pot');
    this.elCalib   = container.querySelector('#barra-calib');
    this.elProgBar = container.querySelector('#barra-prog');
    this.elBtnReset= container.querySelector('#barra-reset');

    this.elBtnReset?.addEventListener('click', () => this.resetar());
    this.redimensionar();
    window.addEventListener('resize', this.onResize);
    this.iniciarLoop();
  }

  private onDados(l: LeituraProcessada): void {
    const forca = l.forcaNewton;
    const ts    = l.marcaTemporal;

    const res = this.calibrador.processar(forca);
    this.progresso = res.progresso;

    if (!res.calibrado) {
      this.estado = null;
      this.solicitarRender();
      return;
    }

    if (this.pesoRef === 0) {
      this.pesoRef  = res.pesoRef;
      this.massaEst = res.massaEst;
      this.estimador.ativar();
      this.elCalib?.classList.add('hidden');
    }

    this.estado = this.estimador.processar(forca, ts, this.pesoRef, this.massaEst);
    const rep   = this.detector.processar(this.estado, ts, this.pesoRef);
    this.metAtual = this.metricas.processar(this.estado, ts, rep, this.pesoRef);

    if (rep) this.repeticoes.push(rep);
    this.solicitarRender();
  }

  private solicitarRender(): void {
    this.renderPendente = true;
    if (this.rafId != null) return;
    this.rafId = requestAnimationFrame(this.loop);
  }

  private readonly loop = () => {
    this.rafId = null;
    this.renderPendente = false;
    this.desenhar();
    this.atualizarHUD();
    if (this.renderPendente) {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };

  private desenhar(): void {
    const canvas = this.canvas;
    const ctx    = this.ctx;
    if (!canvas || !ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Fundo
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--cor-fundo').trim() || '#1a1a2e';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Calibrando — exibe progresso
    if (!this.calibrador.calibrado) {
      this.desenharCalib(ctx, W, H);
      return;
    }

    const estado = this.estado;
    if (!estado) return;

    const MARGEM_TOP    = 40;
    const MARGEM_BOTTOM = 40;
    const ESCALA_M      = (H - MARGEM_TOP - MARGEM_BOTTOM) / 2; // px por metro
    const CENTRO_Y      = H - MARGEM_BOTTOM;

    // Barra (no topo)
    const BARRA_Y = MARGEM_TOP;
    ctx.fillStyle = '#888';
    ctx.fillRect(W * 0.1, BARRA_Y, W * 0.8, 8);

    // Posição do personagem
    const posY = CENTRO_Y - estado.posicaoM * ESCALA_M;

    // Corda/braços (linha da barra ao personagem)
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, BARRA_Y + 8);
    ctx.lineTo(W / 2, posY - 20);
    ctx.stroke();

    // Corpo (círculo = cabeça + tronco simplificado)
    const corFase: Record<string, string> = {
      PARADO:    '#4fc3f7',
      SUBINDO:   '#81c784',
      DESCENDO:  '#ffb74d',
      FORCANDO:  '#ff8a65',
      CALIBRANDO:'#90a4ae',
    };
    ctx.fillStyle = corFase[estado.fase] ?? '#4fc3f7';
    ctx.beginPath();
    ctx.arc(W / 2, posY, 16, 0, Math.PI * 2);
    ctx.fill();

    // Barra de força (direita)
    const fRel  = Math.max(0, Math.min(2, estado.forcaRelativa));
    const barH  = (H - MARGEM_TOP - MARGEM_BOTTOM) * 0.6;
    const barX  = W - 28;
    const barY  = H / 2 - barH / 2;

    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, 16, barH);

    // Preenchimento proporcional a forcaRelativa (1.0 = meio)
    const fill = Math.min(barH, (fRel / 2) * barH);
    ctx.fillStyle = fRel > 1.05 ? '#81c784' : fRel < 0.95 ? '#ffb74d' : '#4fc3f7';
    ctx.fillRect(barX, barY + barH - fill, 16, fill);

    // Linha de referência (pesoRef)
    ctx.strokeStyle = '#555';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(barX, barY + barH / 2);
    ctx.lineTo(barX + 16, barY + barH / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Linha de zero (chão)
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W * 0.05, CENTRO_Y);
    ctx.lineTo(W * 0.85, CENTRO_Y);
    ctx.stroke();
  }

  private desenharCalib(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.fillStyle = '#555';
    ctx.font      = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Aguardando calibração...', W / 2, H / 2);

    // Barra de progresso
    const bW = W * 0.6;
    const bH = 8;
    const bX = (W - bW) / 2;
    const bY = H / 2 + 20;
    ctx.fillStyle = '#333';
    ctx.fillRect(bX, bY, bW, bH);
    ctx.fillStyle = '#4fc3f7';
    ctx.fillRect(bX, bY, bW * this.progresso, bH);
  }

  private atualizarHUD(): void {
    const e = this.estado;
    const m = this.metAtual;

    if (!this.calibrador.calibrado) {
      this.elCalib?.classList.remove('hidden');
      if (this.elProgBar) this.elProgBar.style.width = `${Math.round(this.progresso * 100)}%`;
      return;
    }

    this.elCalib?.classList.add('hidden');
    if (!e) return;

    if (this.elForca)   this.elForca.textContent   = `${e.forcaN.toFixed(1)} N (${(e.forcaRelativa * 100).toFixed(0)}%)`;
    if (this.elPosicao) this.elPosicao.textContent = `${(e.posicaoM * 100).toFixed(1)} cm`;
    if (this.elFase)    this.elFase.textContent     = e.fase;
    if (this.elReps && m)     this.elReps.textContent     = String(m.repsTotal);
    if (this.elTrabalho && m) this.elTrabalho.textContent = `${m.trabalhoTotalJ.toFixed(1)} J`;
    if (this.elPotencia && m) this.elPotencia.textContent = `${m.potenciaPicoW.toFixed(0)} W`;
  }

  private resetar(): void {
    this.calibrador.reiniciar();
    this.estimador.reiniciar();
    this.detector.reiniciar();
    this.metricas.reiniciar();
    this.estado    = null;
    this.metAtual  = null;
    this.repeticoes= [];
    this.pesoRef   = 0;
    this.massaEst  = 0;
    this.progresso = 0;
    this.elCalib?.classList.remove('hidden');
  }

  private redimensionar(): void {
    if (!this.canvas) return;
    const cont = this.canvas.parentElement!;
    this.canvas.width  = cont.clientWidth;
    this.canvas.height = cont.clientHeight;
    this.solicitarRender();
  }

  private readonly onResize = () => this.redimensionar();

  iniciarLoop(): void {
    this.solicitarRender();
  }

  destruir(): void {
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    window.removeEventListener('resize', this.onResize);
  }
}

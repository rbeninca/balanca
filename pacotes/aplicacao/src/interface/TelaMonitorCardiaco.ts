import {
  DetectorBatimento,
  CONFIG_DETECTOR_PADRAO,
  type ResultadoBatimento,
  type TipoCamada1,
  type TipoCamada2,
  type ModoPico,
  type ModoBpm,
} from '@balancagfig/processamento';
import { navHtml, bindNav, type StatusConexao } from './navBar.js';
import type { LeituraProcessada } from '@balancagfig/processamento';

type QualidadeClasse = 'boa' | 'razoavel' | 'instavel' | 'sem-sinal';

interface RefsMonitor {
  canvas:    HTMLCanvasElement;
  bpmNum:    HTMLElement;
  bpmAuto:   HTMLElement;
  qualChip:  HTMLElement;
  ibiTexto:  HTMLElement;
  statusBar: HTMLElement;
}

interface RefsControles {
  btnC1:       NodeListOf<HTMLButtonElement>;
  janelaC1:    HTMLInputElement; valJanelaC1: HTMLElement;
  btnC2:       NodeListOf<HTMLButtonElement>;
  fcAlta:      HTMLInputElement; valFcAlta:   HTMLElement;
  fcBaixa:     HTMLInputElement; valFcBaixa:  HTMLElement;
  numTaps:     HTMLInputElement; valNumTaps:  HTMLElement;
  paramTaps:   HTMLElement;
  btnCancelResp: HTMLButtonElement;
  btnModoPico: NodeListOf<HTMLButtonElement>;
  btnModoBpm:  NodeListOf<HTMLButtonElement>;
  limiar:      HTMLInputElement; valLimiar:    HTMLElement;
  ampMin:      HTMLInputElement; valAmpMin:    HTMLElement;
  refratario:  HTMLInputElement; valRefratario:HTMLElement;
  janela:      HTMLInputElement; valJanela:    HTMLElement;
  janelaAuto:  HTMLInputElement; valJanelaAuto:HTMLElement;
  paramDetec:  HTMLElement;
}

const BUFFER_SIZE = 640;
const AMOSTRAS_S  = 80;
const COR_BRUTO   = 'rgba(148,163,184,0.45)';
const COR_FILTRADO = '#22d3ee';
const COR_PICO    = '#f59e0b';
const COR_FUNDO   = '#0f172a';
const COR_GRADE   = 'rgba(148,163,184,0.07)';
const COR_ZERO    = 'rgba(148,163,184,0.18)';

export class TelaMonitorCardiaco {
  private destruido  = false;
  private rafId: number | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private refs: RefsMonitor | null = null;
  private refsCtrl: RefsControles | null = null;

  private detector    = new DetectorBatimento(AMOSTRAS_S, { ...CONFIG_DETECTOR_PADRAO });
  private bufBruto:   number[]  = [];
  private bufFiltrado:number[]  = [];
  private picoFlags:  boolean[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handler = (leitura: any) => {
    if (this.destruido) return;
    const l = leitura as LeituraProcessada;
    // Usa forcaNewtonCrua (antes da zona morta) pois impulsos BCG são da
    // ordem de 0.05–0.2 N, abaixo do limiar típico de zona morta (0.5 N).
    const forcaEntrada = l.forcaNewtonCrua ?? l.forcaNewton;
    const r = this.detector.processar(forcaEntrada, l.marcaTemporal);
    this.bufBruto.push(r.sinalBruto);
    this.bufFiltrado.push(r.sinalFiltrado);
    this.picoFlags.push(r.pico);
    if (this.bufBruto.length > BUFFER_SIZE) {
      this.bufBruto.shift(); this.bufFiltrado.shift(); this.picoFlags.shift();
    }
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
    const cfg = this.detector.obterConfig();

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
              <span class="monitor-status-texto" id="monitor-status">Aguardando sinal...</span>
              <div class="monitor-legenda-traces">
                <span class="monitor-leg-bruto">Bruto</span>
                <span class="monitor-leg-filtrado">Filtrado</span>
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
            <div class="monitor-bpm-auto" id="monitor-bpm-auto"></div>
            <span class="monitor-qualidade-chip sem-sinal" id="monitor-qualidade">Sem sinal</span>
            <div class="monitor-ibi" id="monitor-ibi"></div>
            <hr class="monitor-divisor">
            <div class="monitor-instrucoes">
              <strong>Como usar</strong>
              <ol>
                <li>Deite a célula de carga sobre o peito</li>
                <li>Fique completamente imóvel</li>
                <li>O sinal aparece após alguns batimentos</li>
              </ol>
            </div>
            <button class="btn-outline btn-sm monitor-btn-voltar" id="btn-monitor-voltar">
              ← Catálogo
            </button>
          </div>

        </div>

        <div class="monitor-controles">
          <div class="monitor-controles-titulo">Pipeline de filtros</div>
          <div class="monitor-pipeline-grade">

            <div class="monitor-camada">
              <div class="monitor-camada-titulo">Pré-filtro (C1)</div>
              <div class="monitor-tipo-grupo">
                ${(['nenhum','mediana','mediaMovel'] as TipoCamada1[]).map(t =>
                  `<button class="monitor-tipo-btn${cfg.tipoCamada1 === t ? ' ativo' : ''}"
                    data-camada="1" data-tipo="${t}">${labelC1(t)}</button>`
                ).join('')}
              </div>
              <div class="monitor-param" id="param-janela-c1"${cfg.tipoCamada1 === 'nenhum' ? ' style="opacity:0.35;pointer-events:none"' : ''}>
                ${this.htmlSlider({ id:'janela-c1', nome:'Janela', val:String(cfg.janelaC1),
                  unidade:'amostras', min:'1', max:'15', step:'1', value:String(cfg.janelaC1),
                  dica:'Tamanho da janela do pré-filtro.' })}
              </div>
            </div>

            <div class="monitor-camada">
              <div class="monitor-camada-titulo">Banda cardíaca (C2)</div>
              <div class="monitor-tipo-grupo">
                ${(['fir','iir'] as TipoCamada2[]).map(t =>
                  `<button class="monitor-tipo-btn${cfg.tipoCamada2 === t ? ' ativo' : ''}"
                    data-camada="2" data-tipo="${t}">${labelC2(t)}</button>`
                ).join('')}
              </div>
              ${this.htmlSlider({ id:'fc-alta', nome:'Passa-alta', val:cfg.fcAltaHz.toFixed(2),
                unidade:'Hz', min:'0.05', max:'2', step:'0.05', value:String(cfg.fcAltaHz),
                dica:'Corte inferior — remove DC e respiração.' })}
              ${this.htmlSlider({ id:'fc-baixa', nome:'Passa-baixa', val:cfg.fcBaixaHz.toFixed(1),
                unidade:'Hz', min:'2', max:'20', step:'0.5', value:String(cfg.fcBaixaHz),
                dica:'Corte superior — remove ruído de alta frequência.' })}
              <div id="param-taps"${cfg.tipoCamada2 === 'iir' ? ' style="display:none"' : ''}>
                ${this.htmlSlider({ id:'num-taps', nome:'Taps FIR', val:String(cfg.numTaps),
                  unidade:'', min:'15', max:'127', step:'2', value:String(cfg.numTaps),
                  dica:'Mais taps = roll-off melhor, mais latência.' })}
              </div>
            </div>

            <div class="monitor-camada">
              <div class="monitor-camada-titulo">Cancelador de respiração</div>
              <button class="monitor-tipo-btn${cfg.cancelarRespiracao ? ' ativo' : ''}"
                id="btn-cancel-resp" style="width:100%">
                ${cfg.cancelarRespiracao ? 'Ativo (NLMS)' : 'Desativado'}
              </button>
              <div class="monitor-param-dica" style="margin-top:6px">
                Remove componente respiratório (~0.1–0.4 Hz) via filtro adaptativo.
              </div>
            </div>

            <div class="monitor-camada">
              <div class="monitor-camada-titulo">Detecção de pico</div>
              <div class="monitor-tipo-grupo">
                ${(['limiar','panTompkins'] as ModoPico[]).map(t =>
                  `<button class="monitor-tipo-btn${cfg.modoPico === t ? ' ativo' : ''}"
                    data-modo="pico" data-tipo="${t}">${labelModoPico(t)}</button>`
                ).join('')}
              </div>
              <div id="param-detec-limiar"${cfg.modoPico === 'panTompkins' ? ' style="opacity:0.35;pointer-events:none"' : ''}>
                ${this.htmlSlider({ id:'limiar', nome:'Limiar',
                  val:String(Math.round(cfg.fatorLimiar * 100)), unidade:'%',
                  min:'5', max:'80', step:'1', value:String(Math.round(cfg.fatorLimiar * 100)),
                  dica:'Posição do limiar entre mínimo e máximo da janela.' })}
                ${this.htmlSlider({ id:'amp-min', nome:'Amp. mínima',
                  val:cfg.amplitudeMin.toFixed(4), unidade:'N',
                  min:'0.0001', max:'0.05', step:'0.0001', value:String(cfg.amplitudeMin),
                  dica:'Amplitude mínima para ativar a detecção.' })}
                ${this.htmlSlider({ id:'janela', nome:'Janela',
                  val:cfg.janelaS.toFixed(1), unidade:'s',
                  min:'1', max:'10', step:'0.5', value:String(cfg.janelaS),
                  dica:'Duração da janela do limiar adaptativo.' })}
              </div>
              ${this.htmlSlider({ id:'refratario', nome:'Refratário',
                val:String(cfg.refratarioMs), unidade:'ms',
                min:'100', max:'800', step:'25', value:String(cfg.refratarioMs),
                dica:'Intervalo mínimo entre picos detectados.' })}
            </div>

            <div class="monitor-camada">
              <div class="monitor-camada-titulo">Estimativa de BPM</div>
              <div class="monitor-tipo-grupo">
                ${(['ibi','autocorrelacao','ambos'] as ModoBpm[]).map(t =>
                  `<button class="monitor-tipo-btn${cfg.modoBpm === t ? ' ativo' : ''}"
                    data-modo="bpm" data-tipo="${t}">${labelModoBpm(t)}</button>`
                ).join('')}
              </div>
              ${this.htmlSlider({ id:'janela-auto', nome:'Janela Auto',
                val:cfg.janelaAutoS.toFixed(0), unidade:'s',
                min:'5', max:'30', step:'1', value:String(cfg.janelaAutoS),
                dica:'Janela do estimador por autocorrelação.' })}
            </div>

          </div>
          <div class="monitor-controles-acoes">
            <button class="btn-outline btn-sm" id="btn-reset-params">Restaurar padrões</button>
          </div>
        </div>
      </div>
    `;

    bindNav(container, {
      ativo: 'medicao', onConexao: this.onConexao, onMedicao: this.onMedicao,
      onSessoes: this.onSessoes, onConfiguracoes: this.onConfiguracoes,
      onFirmware: this.onFirmware, status: this.status,
    });

    const canvas = container.querySelector<HTMLCanvasElement>('#monitor-canvas')!;
    this.ctx = canvas.getContext('2d');
    this.refs = {
      canvas,
      bpmNum:    container.querySelector('#monitor-bpm')!,
      bpmAuto:   container.querySelector('#monitor-bpm-auto')!,
      qualChip:  container.querySelector('#monitor-qualidade')!,
      ibiTexto:  container.querySelector('#monitor-ibi')!,
      statusBar: container.querySelector('#monitor-status')!,
    };
    this.refsCtrl = {
      btnC1:        container.querySelectorAll<HTMLButtonElement>('[data-camada="1"]'),
      janelaC1:     container.querySelector<HTMLInputElement>('#sl-janela-c1')!,
      valJanelaC1:  container.querySelector('#val-janela-c1')!,
      btnC2:        container.querySelectorAll<HTMLButtonElement>('[data-camada="2"]'),
      fcAlta:       container.querySelector<HTMLInputElement>('#sl-fc-alta')!,
      valFcAlta:    container.querySelector('#val-fc-alta')!,
      fcBaixa:      container.querySelector<HTMLInputElement>('#sl-fc-baixa')!,
      valFcBaixa:   container.querySelector('#val-fc-baixa')!,
      numTaps:      container.querySelector<HTMLInputElement>('#sl-num-taps')!,
      valNumTaps:   container.querySelector('#val-num-taps')!,
      paramTaps:    container.querySelector('#param-taps')!,
      btnCancelResp:container.querySelector<HTMLButtonElement>('#btn-cancel-resp')!,
      btnModoPico:  container.querySelectorAll<HTMLButtonElement>('[data-modo="pico"]'),
      btnModoBpm:   container.querySelectorAll<HTMLButtonElement>('[data-modo="bpm"]'),
      limiar:       container.querySelector<HTMLInputElement>('#sl-limiar')!,
      valLimiar:    container.querySelector('#val-limiar')!,
      ampMin:       container.querySelector<HTMLInputElement>('#sl-amp-min')!,
      valAmpMin:    container.querySelector('#val-amp-min')!,
      refratario:   container.querySelector<HTMLInputElement>('#sl-refratario')!,
      valRefratario:container.querySelector('#val-refratario')!,
      janela:       container.querySelector<HTMLInputElement>('#sl-janela')!,
      valJanela:    container.querySelector('#val-janela')!,
      janelaAuto:   container.querySelector<HTMLInputElement>('#sl-janela-auto')!,
      valJanelaAuto:container.querySelector('#val-janela-auto')!,
      paramDetec:   container.querySelector('#param-detec-limiar')!,
    };

    this.bindControles(container);
    container.querySelector('#btn-monitor-voltar')?.addEventListener('click', (e) => {
      e.preventDefault(); this.onJogos();
    });
    this.redimensionarCanvas();
    window.addEventListener('resize', this.onResize);
  }

  private htmlSlider(p: {
    id: string; nome: string; val: string; unidade: string;
    min: string; max: string; step: string; value: string; dica: string;
  }): string {
    return `
      <div class="monitor-param">
        <div class="monitor-param-header">
          <span class="monitor-param-nome">${p.nome}</span>
          <span class="monitor-param-val" id="val-${p.id}">${p.val}</span>
          <span class="monitor-param-unidade">${p.unidade}</span>
        </div>
        <input type="range" id="sl-${p.id}"
          min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}">
        <div class="monitor-param-dica">${p.dica}</div>
      </div>`;
  }

  private bindControles(container: HTMLElement): void {
    const c = this.refsCtrl!;
    const limpar = () => {
      this.bufBruto = []; this.bufFiltrado = []; this.picoFlags = [];
    };

    // Camada 1
    c.btnC1.forEach(btn => btn.addEventListener('click', () => {
      const tipo = btn.dataset['tipo'] as TipoCamada1;
      c.btnC1.forEach(b => b.classList.toggle('ativo', b === btn));
      this.detector.atualizarConfig({ tipoCamada1: tipo });
      const paramJanela = container.querySelector<HTMLElement>('#param-janela-c1')!;
      paramJanela.style.opacity = tipo === 'nenhum' ? '0.35' : '1';
      paramJanela.style.pointerEvents = tipo === 'nenhum' ? 'none' : '';
      limpar();
    }));

    c.janelaC1.addEventListener('input', () => {
      const v = parseInt(c.janelaC1.value, 10);
      c.valJanelaC1.textContent = String(v);
      this.detector.atualizarConfig({ janelaC1: v });
      limpar();
    });

    // Camada 2
    c.btnC2.forEach(btn => btn.addEventListener('click', () => {
      const tipo = btn.dataset['tipo'] as TipoCamada2;
      c.btnC2.forEach(b => b.classList.toggle('ativo', b === btn));
      this.detector.atualizarConfig({ tipoCamada2: tipo });
      c.paramTaps.style.display = tipo === 'iir' ? 'none' : '';
      limpar();
    }));

    c.fcAlta.addEventListener('input', () => {
      const v = parseFloat(c.fcAlta.value);
      c.valFcAlta.textContent = v < 1 ? v.toFixed(2) : v.toFixed(1);
      this.detector.atualizarConfig({ fcAltaHz: v });
      limpar();
    });
    c.fcBaixa.addEventListener('input', () => {
      const v = parseFloat(c.fcBaixa.value);
      c.valFcBaixa.textContent = v.toFixed(1);
      this.detector.atualizarConfig({ fcBaixaHz: v });
      limpar();
    });
    c.numTaps.addEventListener('input', () => {
      const v = parseInt(c.numTaps.value, 10);
      c.valNumTaps.textContent = String(v);
      this.detector.atualizarConfig({ numTaps: v });
      limpar();
    });

    // Cancelador de respiração
    c.btnCancelResp.addEventListener('click', () => {
      const ativo = !this.detector.obterConfig().cancelarRespiracao;
      this.detector.atualizarConfig({ cancelarRespiracao: ativo });
      c.btnCancelResp.classList.toggle('ativo', ativo);
      c.btnCancelResp.textContent = ativo ? 'Ativo (NLMS)' : 'Desativado';
      limpar();
    });

    // Modo de pico
    c.btnModoPico.forEach(btn => btn.addEventListener('click', () => {
      const tipo = btn.dataset['tipo'] as ModoPico;
      c.btnModoPico.forEach(b => b.classList.toggle('ativo', b === btn));
      this.detector.atualizarConfig({ modoPico: tipo });
      c.paramDetec.style.opacity = tipo === 'panTompkins' ? '0.35' : '1';
      c.paramDetec.style.pointerEvents = tipo === 'panTompkins' ? 'none' : '';
      limpar();
    }));

    // Modo de BPM
    c.btnModoBpm.forEach(btn => btn.addEventListener('click', () => {
      const tipo = btn.dataset['tipo'] as ModoBpm;
      c.btnModoBpm.forEach(b => b.classList.toggle('ativo', b === btn));
      this.detector.atualizarConfig({ modoBpm: tipo });
    }));

    // Sliders de detecção
    c.limiar.addEventListener('input', () => {
      const v = parseInt(c.limiar.value, 10);
      c.valLimiar.textContent = String(v);
      this.detector.atualizarConfig({ fatorLimiar: v / 100 });
    });
    c.ampMin.addEventListener('input', () => {
      const v = parseFloat(c.ampMin.value);
      c.valAmpMin.textContent = v.toFixed(4);
      this.detector.atualizarConfig({ amplitudeMin: v });
    });
    c.refratario.addEventListener('input', () => {
      const v = parseInt(c.refratario.value, 10);
      c.valRefratario.textContent = String(v);
      this.detector.atualizarConfig({ refratarioMs: v });
    });
    c.janela.addEventListener('input', () => {
      const v = parseFloat(c.janela.value);
      c.valJanela.textContent = v.toFixed(1);
      this.detector.atualizarConfig({ janelaS: v });
    });
    c.janelaAuto.addEventListener('input', () => {
      const v = parseInt(c.janelaAuto.value, 10);
      c.valJanelaAuto.textContent = String(v);
      this.detector.atualizarConfig({ janelaAutoS: v });
      limpar();
    });

    // Restaurar padrões
    container.querySelector('#btn-reset-params')?.addEventListener('click', () => {
      const p = CONFIG_DETECTOR_PADRAO;
      this.detector.atualizarConfig({ ...p });
      limpar();
      c.btnC1.forEach(b => b.classList.toggle('ativo', b.dataset['tipo'] === p.tipoCamada1));
      const paramJanela = container.querySelector<HTMLElement>('#param-janela-c1')!;
      paramJanela.style.opacity = '1'; paramJanela.style.pointerEvents = '';
      c.janelaC1.value = String(p.janelaC1); c.valJanelaC1.textContent = String(p.janelaC1);
      c.btnC2.forEach(b => b.classList.toggle('ativo', b.dataset['tipo'] === p.tipoCamada2));
      c.paramTaps.style.display = p.tipoCamada2 === 'iir' ? 'none' : '';
      c.fcAlta.value  = String(p.fcAltaHz);  c.valFcAlta.textContent  = p.fcAltaHz.toFixed(2);
      c.fcBaixa.value = String(p.fcBaixaHz); c.valFcBaixa.textContent = p.fcBaixaHz.toFixed(1);
      c.numTaps.value = String(p.numTaps);   c.valNumTaps.textContent = String(p.numTaps);
      c.btnCancelResp.classList.remove('ativo');
      c.btnCancelResp.textContent = 'Desativado';
      c.btnModoPico.forEach(b => b.classList.toggle('ativo', b.dataset['tipo'] === p.modoPico));
      c.paramDetec.style.opacity = '1'; c.paramDetec.style.pointerEvents = '';
      c.btnModoBpm.forEach(b => b.classList.toggle('ativo', b.dataset['tipo'] === p.modoBpm));
      c.limiar.value    = String(Math.round(p.fatorLimiar * 100));
      c.valLimiar.textContent = String(Math.round(p.fatorLimiar * 100));
      c.ampMin.value    = String(p.amplitudeMin); c.valAmpMin.textContent = p.amplitudeMin.toFixed(4);
      c.refratario.value = String(p.refratarioMs); c.valRefratario.textContent = String(p.refratarioMs);
      c.janela.value    = String(p.janelaS); c.valJanela.textContent = p.janelaS.toFixed(1);
      c.janelaAuto.value = String(p.janelaAutoS); c.valJanelaAuto.textContent = String(p.janelaAutoS);
    });
  }

  private onResize = () => this.redimensionarCanvas();

  private redimensionarCanvas(): void {
    const canvas = this.refs?.canvas;
    if (!canvas) return;
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  private atualizarPainel(r: ResultadoBatimento): void {
    if (!this.refs) return;
    const { bpmNum, bpmAuto, qualChip, ibiTexto, statusBar } = this.refs;
    if (r.bpm !== null) {
      bpmNum.textContent = String(r.bpm);
      bpmNum.className   = 'monitor-bpm-num ' + classesBpm(r.bpm);
    } else {
      bpmNum.textContent = '--';
      bpmNum.className   = 'monitor-bpm-num sem-sinal';
    }
    if (r.bpmAuto !== null && r.confiancaAuto > 0.1) {
      bpmAuto.textContent = `Auto: ${r.bpmAuto} bpm (${Math.round(r.confiancaAuto * 100)}%)`;
      bpmAuto.style.display = '';
    } else {
      bpmAuto.style.display = 'none';
    }
    qualChip.className   = `monitor-qualidade-chip ${r.qualidade}`;
    qualChip.textContent = textoQualidade(r.qualidade);
    ibiTexto.textContent = r.ibiMs !== null ? `IBI: ${Math.round(r.ibiMs)} ms` : '';
    statusBar.textContent = textoStatus(r.qualidade);
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
    const canvas = this.refs?.canvas;
    if (!ctx || !canvas || canvas.width === 0) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = COR_FUNDO;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = COR_GRADE;
    ctx.lineWidth   = 1;
    for (let s = 0; s < BUFFER_SIZE; s += AMOSTRAS_S) {
      const x = (s / BUFFER_SIZE) * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    ctx.strokeStyle = COR_ZERO;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.setLineDash([]);

    if (this.bufFiltrado.length < 2) return;

    const maxAbs = Math.max(
      ...this.bufBruto.map(Math.abs),
      ...this.bufFiltrado.map(Math.abs),
    );
    const escala = maxAbs > 0.0001 ? (h * 0.38) / maxAbs : 1;

    const tracar = (buf: number[], cor: string, lw: number) => {
      if (buf.length < 2) return;
      ctx.strokeStyle = cor; ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i < buf.length; i++) {
        const x = ((i + BUFFER_SIZE - buf.length) / BUFFER_SIZE) * w;
        const y = h / 2 - (buf[i] ?? 0) * escala;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    tracar(this.bufBruto,    COR_BRUTO,    1.0);
    tracar(this.bufFiltrado, COR_FILTRADO, 1.8);

    ctx.fillStyle = COR_PICO;
    for (let i = 0; i < this.picoFlags.length; i++) {
      if (!this.picoFlags[i]) continue;
      const x = ((i + BUFFER_SIZE - this.bufFiltrado.length) / BUFFER_SIZE) * w;
      const y = h / 2 - (this.bufFiltrado[i] ?? 0) * escala;
      ctx.beginPath(); ctx.arc(x, y - 6, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  destruir(): void {
    this.destruido = true;
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    window.removeEventListener('resize', this.onResize);
    this.fonte?.off?.('dados', this.handler);
  }
}

function labelC1(t: TipoCamada1): string {
  return t === 'nenhum' ? 'Nenhum' : t === 'mediana' ? 'Mediana' : 'Média Móv.';
}
function labelC2(t: TipoCamada2): string {
  return t === 'fir' ? 'FIR ★' : 'IIR';
}
function labelModoPico(t: ModoPico): string {
  return t === 'panTompkins' ? 'Pan-Tompkins' : 'Limiar';
}
function labelModoBpm(t: ModoBpm): string {
  return t === 'ibi' ? 'IBI' : t === 'autocorrelacao' ? 'Autocorr.' : 'Ambos';
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

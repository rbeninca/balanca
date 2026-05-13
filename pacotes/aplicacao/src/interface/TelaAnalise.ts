import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { ArmazenamentoLocal } from '../armazenamento/ArmazenamentoLocal.js';
import { analisarMotor } from '@balancagfig/analise';
import { gerarPDF } from '@balancagfig/relatorio';
import { exportarCSV } from '@balancagfig/relatorio';
import ApexCharts from 'apexcharts';

export interface DadosAnalise {
  leituras:   LeituraProcessada[];
  nomeSessao: string;
  modo:       'nova' | 'revisao';
  idSessao?:  string;
}

// índices no array leituras correspondentes ao início/fim da queima
let instanciaAtual: TelaAnalise | null = null;

export class TelaAnalise {
  private overlay:    HTMLElement;
  private chart:      ApexCharts | null = null;
  private burnInicio  = 0;   // índice
  private burnFim     = 0;   // índice
  private nomeSessao: string;

  constructor(
    private dados: DadosAnalise,
    private armazenamento: ArmazenamentoLocal,
    private onFechar: () => void,
  ) {
    instanciaAtual?.destruir();
    instanciaAtual = this;

    this.nomeSessao = dados.nomeSessao;
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.innerHTML = this.html();
    document.body.appendChild(this.overlay);

    this.detectarQueima();
    setTimeout(() => { this.renderizarGrafico(); this.atualizarStats(); }, 80);
    this.bindEventos();
  }

  private html(): string {
    return `
      <div class="modal" style="max-width:960px">
        <div class="modal-header">
          <div style="flex:1">
            <label for="nome-sessao-analise" style="font-size:0.7rem;color:#555;text-transform:uppercase;letter-spacing:.05em">Nome da Sessão</label>
            <input id="nome-sessao-analise" type="text" value="${this.nomeSessao}" style="font-size:1rem;margin-top:4px">
          </div>
          <button class="modal-fechar" id="btn-fechar-analise">×</button>
        </div>

        <div class="modal-body">
          <div class="analise-layout">
            <div class="analise-grafico">
              <div id="analise-chart"></div>
              <p style="font-size:0.72rem;color:#555;margin-top:6px;text-align:center">
                Clique no gráfico para ajustar início/fim da queima
              </p>
            </div>
            <div class="analise-stats">

              <div class="stats-secao">
                <h3>Geral</h3>
                <div class="stat-item"><span class="stat-label">Leituras</span><span class="stat-valor" id="st-leituras">—</span></div>
                <div class="stat-item"><span class="stat-label">Duração total</span><span class="stat-valor" id="st-duracao">—</span></div>
                <div class="stat-item"><span class="stat-label">F mínima</span><span class="stat-valor" id="st-fmin">—</span></div>
                <div class="stat-item"><span class="stat-label">F máxima</span><span class="stat-valor" id="st-fmax">—</span></div>
              </div>

              <div class="stats-secao">
                <h3>Queima</h3>
                <div class="stat-item"><span class="stat-label">Início queima</span><span class="stat-valor" id="st-t0">—</span></div>
                <div class="stat-item"><span class="stat-label">Fim queima</span><span class="stat-valor" id="st-t1">—</span></div>
                <div class="stat-item"><span class="stat-label">Duração queima</span><span class="stat-valor" id="st-tbq">—</span></div>
                <div class="stat-item"><span class="stat-label">Impulso total</span><span class="stat-valor" id="st-impulso">—</span></div>
                <div class="stat-item"><span class="stat-label">F média</span><span class="stat-valor" id="st-fmed">—</span></div>
                <div class="stat-item"><span class="stat-label">F pico</span><span class="stat-valor" id="st-fpico">—</span></div>
                <div class="stat-item"><span class="stat-label">F RMS</span><span class="stat-valor" id="st-frms">—</span></div>
                <div class="stat-item"><span class="stat-label">Perfil</span><span class="stat-valor" id="st-perfil">—</span></div>
              </div>

              <div class="stats-secao">
                <h3>Classificação NAR</h3>
                <span class="motor-classificacao" id="st-nar">—</span>
                <div class="stat-item" style="margin-top:0.5rem">
                  <span class="stat-label">Nome comum</span>
                  <span class="stat-valor" id="st-nome-motor">—</span>
                </div>
              </div>

              <button id="btn-auto-detectar" class="btn-outline btn-sm" style="width:100%;margin-top:0.5rem">Auto-detectar queima</button>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button id="btn-descartar" class="btn-secondary">Descartar</button>
          <button id="btn-export-csv" class="btn-secondary">Exportar CSV</button>
          <button id="btn-export-pdf" class="btn-secondary">Exportar PDF</button>
          <button id="btn-salvar-sessao" class="btn-success">Salvar Sessão</button>
        </div>
      </div>
    `;
  }

  private detectarQueima() {
    const ls = this.dados.leituras;
    if (ls.length === 0) return;

    // Usa emQueima quando disponível
    const priInicio = ls.findIndex(l => l.emQueima);
    const ultFim    = ls.map(l => l.emQueima).lastIndexOf(true);

    if (priInicio >= 0 && ultFim >= priInicio) {
      this.burnInicio = priInicio;
      this.burnFim    = ultFim;
      return;
    }

    // Fallback: threshold 5% do pico
    const pico = Math.max(...ls.map(l => l.forcaNewton));
    const thr  = pico * 0.05;
    this.burnInicio = ls.findIndex(l => l.forcaNewton >= thr);
    const rev       = [...ls].reverse().findIndex(l => l.forcaNewton >= thr);
    this.burnFim    = rev >= 0 ? ls.length - 1 - rev : ls.length - 1;
    if (this.burnInicio < 0) this.burnInicio = 0;
  }

  private seriesGrafico(): { linha: { x: number; y: number }[]; area: { x: number; y: number | null }[] } {
    const ls   = this.dados.leituras;
    const t0   = ls[0]?.marcaTemporal ?? 0;
    const ti   = (ls[this.burnInicio]?.marcaTemporal ?? t0) - t0;
    const tf   = (ls[this.burnFim]?.marcaTemporal   ?? t0) - t0;

    const linha = ls.map(l => ({ x: (l.marcaTemporal - t0) / 1000, y: l.forcaNewton }));
    const area  = ls.map(l => {
      const tr = l.marcaTemporal - t0;
      return { x: tr / 1000, y: (tr >= ti && tr <= tf) ? l.forcaNewton : null };
    });

    return { linha, area };
  }

  private renderizarGrafico() {
    this.chart?.destroy();
    const el = this.overlay.querySelector<HTMLElement>('#analise-chart');
    if (!el || this.dados.leituras.length === 0) return;

    const { linha, area } = this.seriesGrafico();
    const ls = this.dados.leituras;
    const t0 = ls[0]?.marcaTemporal ?? 0;
    const ti = ((ls[this.burnInicio]?.marcaTemporal ?? t0) - t0) / 1000;
    const tf = ((ls[this.burnFim]?.marcaTemporal   ?? t0) - t0) / 1000;

    const options: ApexCharts.ApexOptions = {
      series: [
        { name: 'Força (N)', type: 'line', data: linha },
        { name: 'Queima',    type: 'area', data: area  },
      ],
      chart: {
        height: 320,
        background: '#111',
        foreColor: '#888',
        animations: { enabled: false },
        toolbar: { show: true, tools: { download: false, selection: false, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true } },
        events: {
          dataPointSelection: (_ev: Event, _ctx: unknown, cfg: { dataPointIndex: number }) => {
            const idx = cfg.dataPointIndex;
            if (idx < 0) return;
            const dI = Math.abs(idx - this.burnInicio);
            const dF = Math.abs(idx - this.burnFim);
            if (dI <= dF) {
              this.burnInicio = Math.min(idx, this.burnFim);
            } else {
              this.burnFim = Math.max(idx, this.burnInicio);
            }
            this.renderizarGrafico();
            this.atualizarStats();
          },
        },
      },
      colors: ['#4a9eff', '#ff7040'],
      stroke: { curve: 'smooth', width: [2, 0] },
      fill:   { type: ['solid', 'solid'], opacity: [1, 0.25] },
      markers: { size: 0, hover: { size: 4 } },
      xaxis: {
        type: 'numeric',
        title: { text: 'Tempo (s)', style: { color: '#555' } },
        labels: { style: { colors: '#666' }, formatter: (v) => (+v).toFixed(2) },
      },
      yaxis: {
        title: { text: 'Força (N)', style: { color: '#555' } },
        labels: { style: { colors: '#666' }, formatter: (v) => v.toFixed(1) },
      },
      annotations: {
        xaxis: [
          { x: ti, borderColor: '#4caf50', label: { borderColor: '#4caf50', style: { color: '#fff', background: '#4caf50', fontSize: '11px' }, text: 'Início' } },
          { x: tf, borderColor: '#ffa040', label: { borderColor: '#ffa040', style: { color: '#fff', background: '#ffa040', fontSize: '11px' }, text: 'Fim'    } },
        ],
      },
      grid: { borderColor: '#222' },
      legend: { show: false },
      tooltip: { theme: 'dark', x: { formatter: (v) => `${(+v).toFixed(3)} s` } },
    };

    this.chart = new ApexCharts(el, options);
    this.chart.render();
  }

  private atualizarStats() {
    const ls = this.dados.leituras;
    if (ls.length === 0) return;

    const t0 = ls[0]!.marcaTemporal;
    const tN = ls[ls.length - 1]!.marcaTemporal;
    const fMax = Math.max(...ls.map(l => l.forcaNewton));
    const fMin = Math.min(...ls.map(l => l.forcaNewton));

    const fmt  = (n: number, d = 3) => n.toFixed(d);
    const setTxt = (id: string, v: string) => {
      const el = this.overlay.querySelector(`#${id}`);
      if (el) el.textContent = v;
    };

    setTxt('st-leituras', `${ls.length}`);
    setTxt('st-duracao',  `${fmt((tN - t0) / 1000, 2)} s`);
    setTxt('st-fmin',     `${fmt(fMin)} N`);
    setTxt('st-fmax',     `${fmt(fMax)} N`);

    // stats de queima
    const inicio = this.burnInicio;
    const fim    = this.burnFim;
    const tInicio = (ls[inicio]?.marcaTemporal ?? t0) - t0;
    const tFim    = (ls[fim]?.marcaTemporal   ?? t0) - t0;

    setTxt('st-t0',  `${fmt(tInicio / 1000, 3)} s`);
    setTxt('st-t1',  `${fmt(tFim   / 1000, 3)} s`);
    setTxt('st-tbq', `${fmt((tFim - tInicio) / 1000, 3)} s`);

    // tenta analisarMotor usando os dados completos (emQueima vem do pipeline)
    try {
      const analise = analisarMotor(ls, {});
      setTxt('st-impulso', `${fmt(analise.impulsoTotal_Ns)} N·s`);
      setTxt('st-fmed',    `${fmt(analise.forcaMedia_N)} N`);
      setTxt('st-fpico',   `${fmt(analise.forcaPico_N)} N`);
      setTxt('st-frms',    `${fmt(analise.forcaRms_N)} N`);
      setTxt('st-perfil',  analise.perfilQueima);
      setTxt('st-nar',     analise.letraMotor);
      setTxt('st-nome-motor', analise.nomeComum);

      // colore badge NAR
      const narEl = this.overlay.querySelector('#st-nar') as HTMLElement | null;
      if (narEl) {
        const cores: Record<string, string> = { A:'#2d7a2d', B:'#246624', C:'#1a7a4a', D:'#1a5a7a', E:'#2a4a9a', F:'#4a2a9a', G:'#7a2a9a', H:'#9a2a6a', I:'#9a2a2a', J:'#c05020', K:'#c08020', L:'#806020', M:'#506020', N:'#306040', O:'#206060' };
        const cor = cores[analise.letraMotor] ?? '#2a5a2a';
        narEl.style.background  = cor + '44';
        narEl.style.color       = '#e0e0e0';
        narEl.style.borderColor = cor;
      }
    } catch {
      // sem emQueima=true nos dados: usa intervalo selecionado
      const queima = ls.slice(inicio, fim + 1);
      if (queima.length > 1) {
        const fMed = queima.reduce((s, l) => s + l.forcaNewton, 0) / queima.length;
        const fP   = Math.max(...queima.map(l => l.forcaNewton));
        const impul = queima[queima.length - 1]?.impulsoAcumuladoNs ?? 0;
        setTxt('st-fmed',    `${fmt(fMed)} N`);
        setTxt('st-fpico',   `${fmt(fP)} N`);
        setTxt('st-impulso', `${fmt(impul)} N·s`);
      }
    }
  }

  private baixarArquivo(blob: Blob, nome: string) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  private exportarCSV() {
    const data = new Date().toLocaleDateString('pt-BR');
    try {
      const analise = analisarMotor(this.dados.leituras, {});
      const csv = exportarCSV(this.dados.leituras, analise, { nomeSessao: this.nomeSessao, data });
      this.baixarArquivo(new Blob([csv], { type: 'text/csv' }), `${this.nomeSessao}.csv`);
    } catch {
      const csv = exportarCSV(this.dados.leituras, undefined, { nomeSessao: this.nomeSessao, data });
      this.baixarArquivo(new Blob([csv], { type: 'text/csv' }), `${this.nomeSessao}.csv`);
    }
  }

  private exportarPDF() {
    try {
      const data    = new Date().toLocaleDateString('pt-BR');
      const analise = analisarMotor(this.dados.leituras, {});
      const blob    = gerarPDF(this.dados.leituras, analise, { nomeSessao: this.nomeSessao, data });
      this.baixarArquivo(blob, `${this.nomeSessao}.pdf`);
    } catch (e) {
      alert(`Erro ao gerar PDF: ${String(e)}\n\nDica: registre pelo menos uma queima para gerar o relatório.`);
    }
  }

  private bindEventos() {
    this.overlay.querySelector('#btn-fechar-analise')!.addEventListener('click', () => this.destruir());
    this.overlay.querySelector('#btn-descartar')!.addEventListener('click',      () => this.destruir());
    this.overlay.querySelector('#btn-auto-detectar')!.addEventListener('click',  () => { this.detectarQueima(); this.renderizarGrafico(); this.atualizarStats(); });
    this.overlay.querySelector('#btn-export-csv')!.addEventListener('click',     () => this.exportarCSV());
    this.overlay.querySelector('#btn-export-pdf')!.addEventListener('click',     () => this.exportarPDF());

    const inputNome = this.overlay.querySelector<HTMLInputElement>('#nome-sessao-analise')!;
    inputNome.addEventListener('input', () => { this.nomeSessao = inputNome.value.trim() || this.dados.nomeSessao; });

    this.overlay.querySelector('#btn-salvar-sessao')!.addEventListener('click', () => this.salvarSessao());
  }

  private async salvarSessao() {
    const idSessao = this.dados.idSessao;
    if (!idSessao) { this.destruir(); return; }

    // Persiste metadados de análise
    try {
      const analise = analisarMotor(this.dados.leituras, {});
      await this.armazenamento.salvarMetadados(idSessao, { descricao: analise.nomeComum });
    } catch { /* sem queima detectada — sem metadados extra */ }

    this.destruir();
  }

  destruir() {
    this.chart?.destroy();
    this.overlay.remove();
    if (instanciaAtual === this) instanciaAtual = null;
    this.onFechar();
  }
}

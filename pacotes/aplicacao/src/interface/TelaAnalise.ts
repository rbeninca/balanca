import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { IArmazenamento, MetadadosLocal } from '../armazenamento/ArmazenamentoLocal.js';
import { analisarMotor } from '@balancagfig/analise';
import { gerarPDF, exportarCSV, exportarENG } from '@balancagfig/relatorio';
import type { MetadadosENG, MetadadosPDF } from '@balancagfig/relatorio';
import ApexCharts from 'apexcharts';

export interface DadosAnalise {
  leituras:   LeituraProcessada[];
  nomeSessao: string;
  modo:       'nova' | 'revisao';
  idSessao?:  string;
}

let instanciaAtual: TelaAnalise | null = null;

export class TelaAnalise {
  private overlay:        HTMLElement;
  private chart:          ApexCharts | null = null;
  private burnInicio      = 0;
  private burnFim         = 0;
  private nomeSessao:     string;
  private leiturasMutadas = false;

  constructor(
    private dados: DadosAnalise,
    private armazenamento: IArmazenamento,
    private onFechar: () => void,
  ) {
    instanciaAtual?.destruir();
    instanciaAtual = this;

    this.nomeSessao = dados.nomeSessao;
    this.normalizarLeiturasPorTempo();
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.innerHTML = this.html();
    document.body.appendChild(this.overlay);

    this.detectarQueima();
    setTimeout(() => { this.renderizarGrafico(); this.atualizarStats(); }, 80);
    this.bindEventos();

    if (dados.modo === 'revisao' && dados.idSessao) {
      this.carregarMetadados(dados.idSessao);
    }
  }

  private async carregarMetadados(idSessao: string) {
    try {
      const meta = await this.armazenamento.obterMetadados(idSessao);
      if (meta) {
        this.preencherFormularioMetadados(meta);
        this.atualizarIsp();
      }
    } catch { /* metadados indisponíveis */ }
  }

  private preencherFormularioMetadados(meta: MetadadosLocal) {
    const set = (id: string, v: string | number | undefined) => {
      const el = this.overlay.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
      if (el && v != null) el.value = String(v);
    };
    set('meta-fabricante',  meta.fabricante);
    set('meta-diametro',    meta.diametro_mm);
    set('meta-comprimento', meta.comprimento_mm);
    set('meta-massa-prop',  meta.massaPropelente_g);
    set('meta-massa-total', meta.massaTotal_g);
    set('meta-descricao',   meta.descricao);
    set('meta-observacoes', meta.observacoes);
  }

  private lerMetadadosFormulario(): MetadadosLocal {
    const num = (id: string): number | undefined => {
      const v = parseFloat((this.overlay.querySelector<HTMLInputElement>(`#${id}`)?.value ?? ''));
      return isNaN(v) ? undefined : v;
    };
    const txt = (id: string): string | undefined => {
      const v = (this.overlay.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)?.value ?? '').trim();
      return v || undefined;
    };
    const meta: MetadadosLocal = {};
    const fabricante = txt('meta-fabricante');        if (fabricante        !== undefined) meta.fabricante        = fabricante;
    const diametro   = num('meta-diametro');          if (diametro          !== undefined) meta.diametro_mm       = diametro;
    const comprimento = num('meta-comprimento');      if (comprimento       !== undefined) meta.comprimento_mm    = comprimento;
    const massaProp  = num('meta-massa-prop');        if (massaProp         !== undefined) meta.massaPropelente_g = massaProp;
    const massaTotal = num('meta-massa-total');       if (massaTotal        !== undefined) meta.massaTotal_g      = massaTotal;
    const descricao  = txt('meta-descricao');         if (descricao         !== undefined) meta.descricao         = descricao;
    const observacoes = txt('meta-observacoes');      if (observacoes       !== undefined) meta.observacoes       = observacoes;
    return meta;
  }

  private atualizarIsp() {
    const massaProp = parseFloat(
      (this.overlay.querySelector<HTMLInputElement>('#meta-massa-prop')?.value ?? ''),
    );
    if (isNaN(massaProp) || massaProp <= 0) {
      const el = this.overlay.querySelector('#st-isp');
      if (el) el.textContent = '—';
      return;
    }
    try {
      const analise = analisarMotor(this.dados.leituras, { massaPropelente_g: massaProp });
      const isp = analise.impulsoEspecifico_s;
      const el  = this.overlay.querySelector('#st-isp');
      if (el) el.textContent = isp != null ? `${isp.toFixed(1)} s` : '—';
    } catch {
      const el = this.overlay.querySelector('#st-isp');
      if (el) el.textContent = '—';
    }
  }

  private normalizarLeiturasPorTempo() {
    if (this.dados.leituras.length < 2) return;
    this.dados.leituras = [...this.dados.leituras].sort((a, b) => a.marcaTemporal - b.marcaTemporal);
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
                <div class="stat-item"><span class="stat-label">Início queima</span><span class="stat-valor"><input type="number" class="stat-input" id="st-t0" step="0.001" min="0"> s</span></div>
                <div class="stat-item"><span class="stat-label">Fim queima</span><span class="stat-valor"><input type="number" class="stat-input" id="st-t1" step="0.001" min="0"> s</span></div>
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

              <div class="stats-secao">
                <h3>Propelente / Motor</h3>
                <div class="stat-item">
                  <span class="stat-label">Fabricante</span>
                  <input type="text" class="stat-input meta-text" id="meta-fabricante" placeholder="—">
                </div>
                <div class="stat-item">
                  <span class="stat-label">Diâmetro (mm)</span>
                  <input type="number" class="stat-input" id="meta-diametro" step="0.1" min="0" placeholder="—">
                </div>
                <div class="stat-item">
                  <span class="stat-label">Comprimento (mm)</span>
                  <input type="number" class="stat-input" id="meta-comprimento" step="0.1" min="0" placeholder="—">
                </div>
                <div class="stat-item">
                  <span class="stat-label">Massa prop. (g)</span>
                  <input type="number" class="stat-input" id="meta-massa-prop" step="0.01" min="0" placeholder="—">
                </div>
                <div class="stat-item">
                  <span class="stat-label">Massa total (g)</span>
                  <input type="number" class="stat-input" id="meta-massa-total" step="0.01" min="0" placeholder="—">
                </div>
                <div class="stat-item">
                  <span class="stat-label">Isp</span>
                  <span class="stat-valor" id="st-isp">—</span>
                </div>
              </div>

              <div class="stats-secao">
                <h3>Notas</h3>
                <label class="meta-label">Descrição</label>
                <textarea id="meta-descricao" class="meta-textarea" rows="2" placeholder="Descrição do propelente..."></textarea>
                <label class="meta-label" style="margin-top:0.4rem">Observações</label>
                <textarea id="meta-observacoes" class="meta-textarea" rows="2" placeholder="Condições do teste, problemas, etc."></textarea>
              </div>

              <button id="btn-auto-detectar" class="btn-outline btn-sm" style="width:100%;margin-top:0.5rem">Auto-detectar queima</button>
              <button id="btn-recortar" class="btn-warning btn-sm" style="width:100%;margin-top:0.4rem" title="Remove amostras fora da região de queima">✂ Recortar fora da queima</button>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button id="btn-descartar" class="btn-secondary">Descartar</button>
          <button id="btn-export-json" class="btn-secondary">JSON</button>
          <button id="btn-export-csv" class="btn-secondary">CSV</button>
          <button id="btn-export-eng" class="btn-secondary">ENG</button>
          <button id="btn-export-pdf" class="btn-secondary">PDF</button>
          <button id="btn-salvar-sessao" class="btn-success">Salvar Sessão</button>
        </div>
      </div>
    `;
  }

  private sincronizarEmQueima() {
    const ls = this.dados.leituras;
    for (let i = 0; i < ls.length; i++) {
      ls[i]!.emQueima = i >= this.burnInicio && i <= this.burnFim;
    }
  }

  private detectarQueima(forcar = false) {
    const ls = this.dados.leituras;
    if (ls.length === 0) return;

    if (!forcar) {
      const priInicio = ls.findIndex(l => l.emQueima);
      const ultFim    = ls.map(l => l.emQueima).lastIndexOf(true);

      if (priInicio >= 0 && ultFim >= priInicio) {
        this.burnInicio = priInicio;
        this.burnFim    = ultFim;
        this.sincronizarEmQueima();
        return;
      }
    }

    const pico = Math.max(...ls.map(l => l.forcaNewton));
    const thr  = pico * 0.05;
    this.burnInicio = ls.findIndex(l => l.forcaNewton >= thr);
    const rev       = [...ls].reverse().findIndex(l => l.forcaNewton >= thr);
    this.burnFim    = rev >= 0 ? ls.length - 1 - rev : ls.length - 1;
    if (this.burnInicio < 0) this.burnInicio = 0;
    this.sincronizarEmQueima();
  }

  private seriesGrafico(): { x: number; y: number }[] {
    const ls = this.dados.leituras;
    const t0 = ls[0]?.marcaTemporal ?? 0;
    return ls.map(l => ({ x: (l.marcaTemporal - t0) / 1000, y: l.forcaNewton }));
  }

  private anotacoesQueima(): ApexCharts.ApexAnnotations {
    const ls = this.dados.leituras;
    const t0 = ls[0]?.marcaTemporal ?? 0;
    const ti = ((ls[this.burnInicio]?.marcaTemporal ?? t0) - t0) / 1000;
    const tf = ((ls[this.burnFim]?.marcaTemporal   ?? t0) - t0) / 1000;
    return {
      xaxis: [
        { x: ti, x2: tf, fillColor: '#ff7040', opacity: 0.12, label: { text: '' } },
        { x: ti, borderColor: '#4caf50', label: { borderColor: '#4caf50', style: { color: '#fff', background: '#4caf50', fontSize: '11px' }, text: 'Início' } },
        { x: tf, borderColor: '#ffa040', label: { borderColor: '#ffa040', style: { color: '#fff', background: '#ffa040', fontSize: '11px' }, text: 'Fim'    } },
      ],
    };
  }

  private atualizarMarcadores() {
    this.sincronizarEmQueima();
    this.chart?.updateOptions({ annotations: this.anotacoesQueima() }, false, false);
    this.atualizarStats();
  }

  private renderizarGrafico() {
    this.chart?.destroy();
    const el = this.overlay.querySelector<HTMLElement>('#analise-chart');
    if (!el || this.dados.leituras.length === 0) return;

    const options: ApexCharts.ApexOptions = {
      series: [
        { name: 'Força (N)', type: 'line', data: this.seriesGrafico() },
      ],
      chart: {
        height: 320,
        background: '#ffffff',
        foreColor: '#374151',
        animations: { enabled: false },
        toolbar: { show: true, tools: { download: false, selection: false, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true } },
        events: {
          click: (_ev: MouseEvent, _ctx: unknown, cfg?: { dataPointIndex?: number }) => {
            const idx = cfg?.dataPointIndex ?? -1;
            if (idx < 0) return;
            const dI = Math.abs(idx - this.burnInicio);
            const dF = Math.abs(idx - this.burnFim);
            if (dI <= dF) {
              this.burnInicio = Math.min(idx, this.burnFim);
            } else {
              this.burnFim = Math.max(idx, this.burnInicio);
            }
            this.atualizarMarcadores();
          },
        },
      },
      colors: ['#2563eb'],
      stroke: { curve: 'straight', width: 2 },
      fill:   { type: 'solid', opacity: 1 },
      markers: { size: 0, hover: { size: 4 } },
      xaxis: {
        type: 'numeric',
        title: { text: 'Tempo (s)', style: { color: '#6b7280' } },
        labels: { style: { colors: '#6b7280' }, formatter: (v) => (+v).toFixed(2) },
      },
      yaxis: {
        title: { text: 'Força (N)', style: { color: '#6b7280' } },
        labels: { style: { colors: '#6b7280' }, formatter: (v) => v.toFixed(1) },
      },
      annotations: this.anotacoesQueima(),
      grid: { borderColor: '#e5e7eb' },
      legend: { show: false },
      tooltip: { theme: 'light', x: { formatter: (v) => `${(+v).toFixed(3)} s` } },
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

    const inicio = this.burnInicio;
    const fim    = this.burnFim;
    const tInicio = (ls[inicio]?.marcaTemporal ?? t0) - t0;
    const tFim    = (ls[fim]?.marcaTemporal   ?? t0) - t0;

    const setInput = (id: string, v: number) => {
      const el = this.overlay.querySelector<HTMLInputElement>(`#${id}`);
      if (el && document.activeElement !== el) el.value = v.toFixed(3);
    };
    setInput('st-t0', tInicio / 1000);
    setInput('st-t1', tFim / 1000);
    setTxt('st-tbq', `${fmt((tFim - tInicio) / 1000, 3)} s`);

    const massaProp = parseFloat(
      this.overlay.querySelector<HTMLInputElement>('#meta-massa-prop')?.value ?? '',
    );
    const optsAnalise = isNaN(massaProp) || massaProp <= 0 ? {} : { massaPropelente_g: massaProp };

    try {
      const analise = analisarMotor(ls, optsAnalise);
      setTxt('st-impulso', `${fmt(analise.impulsoTotal_Ns)} N·s`);
      setTxt('st-fmed',    `${fmt(analise.forcaMedia_N)} N`);
      setTxt('st-fpico',   `${fmt(analise.forcaPico_N)} N`);
      setTxt('st-frms',    `${fmt(analise.forcaRms_N)} N`);
      setTxt('st-perfil',  analise.perfilQueima);
      setTxt('st-nar',     analise.letraMotor);
      setTxt('st-nome-motor', analise.nomeComum);
      setTxt('st-isp', analise.impulsoEspecifico_s != null ? `${analise.impulsoEspecifico_s.toFixed(1)} s` : '—');

      const narEl = this.overlay.querySelector('#st-nar') as HTMLElement | null;
      if (narEl) {
        const cores: Record<string, string> = { A:'#2d7a2d', B:'#246624', C:'#1a7a4a', D:'#1a5a7a', E:'#2a4a9a', F:'#4a2a9a', G:'#7a2a9a', H:'#9a2a6a', I:'#9a2a2a', J:'#c05020', K:'#c08020', L:'#806020', M:'#506020', N:'#306040', O:'#206060' };
        const cor = cores[analise.letraMotor] ?? '#2a5a2a';
        narEl.style.background  = cor + '44';
        narEl.style.color       = '#e0e0e0';
        narEl.style.borderColor = cor;
      }
    } catch {
      const queima = ls.slice(inicio, fim + 1);
      if (queima.length > 1) {
        const fMed = queima.reduce((s, l) => s + l.forcaNewton, 0) / queima.length;
        const fP   = Math.max(...queima.map(l => l.forcaNewton));
        const impul = queima[queima.length - 1]?.impulsoAcumuladoNs ?? 0;
        setTxt('st-fmed',    `${fmt(fMed)} N`);
        setTxt('st-fpico',   `${fmt(fP)} N`);
        setTxt('st-impulso', `${fmt(impul)} N·s`);
      }
      setTxt('st-isp', '—');
    }
  }

  private encontrarIndiceMaisProximo(tempoS: number): number {
    const ls = this.dados.leituras;
    if (ls.length === 0) return 0;
    const t0 = ls[0]!.marcaTemporal;
    const alvo = t0 + tempoS * 1000;
    let best = 0;
    let bestDiff = Math.abs(ls[0]!.marcaTemporal - alvo);
    for (let i = 1; i < ls.length; i++) {
      const d = Math.abs(ls[i]!.marcaTemporal - alvo);
      if (d < bestDiff) { bestDiff = d; best = i; }
    }
    return best;
  }

  private recortarQueima() {
    const ls = this.dados.leituras;
    if (ls.length === 0 || this.burnInicio >= this.burnFim) return;
    this.dados.leituras = ls.slice(this.burnInicio, this.burnFim + 1);
    this.leiturasMutadas = true;
    this.burnInicio = 0;
    this.burnFim    = this.dados.leituras.length - 1;
    this.renderizarGrafico();
    this.atualizarStats();
  }

  private exportarJSON() {
    const meta = this.lerMetadadosFormulario();
    const payload = {
      versao:      2,
      nome:        this.nomeSessao,
      criadoEm:   new Date().toISOString(),
      exportadoEm: new Date().toISOString(),
      metadados:   meta,
      leituras:    this.dados.leituras,
    };
    const json = JSON.stringify(payload, null, 2);
    this.baixarArquivo(new Blob([json], { type: 'application/json' }), `${this.nomeSessao}.json`);
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
    const meta = this.lerMetadadosFormulario();
    const data = new Date().toLocaleDateString('pt-BR');
    const optsAnalise = meta.massaPropelente_g ? { massaPropelente_g: meta.massaPropelente_g } : {};
    let ispNum: number | undefined;
    if (meta.massaPropelente_g) {
      try { ispNum = analisarMotor(this.dados.leituras, optsAnalise).impulsoEspecifico_s ?? undefined; }
      catch { /* sem queima */ }
    }
    const metaCSV = { nomeSessao: this.nomeSessao, data, ...(ispNum !== undefined ? { isp: ispNum } : {}) };
    try {
      const analise = analisarMotor(this.dados.leituras, optsAnalise);
      const csv = exportarCSV(this.dados.leituras, analise, metaCSV);
      this.baixarArquivo(new Blob([csv], { type: 'text/csv' }), `${this.nomeSessao}.csv`);
    } catch {
      const csv = exportarCSV(this.dados.leituras, undefined, metaCSV);
      this.baixarArquivo(new Blob([csv], { type: 'text/csv' }), `${this.nomeSessao}.csv`);
    }
  }

  private exportarENG() {
    try {
      const meta    = this.lerMetadadosFormulario();
      const analise = analisarMotor(this.dados.leituras, meta.massaPropelente_g ? { massaPropelente_g: meta.massaPropelente_g } : {});
      const metaENG: MetadadosENG = {};
      if (meta.diametro_mm        !== undefined) metaENG.diametroMm        = meta.diametro_mm;
      if (meta.comprimento_mm     !== undefined) metaENG.comprimentoMm     = meta.comprimento_mm;
      if (meta.massaPropelente_g  !== undefined) metaENG.massaPropelente_g = meta.massaPropelente_g;
      if (meta.massaTotal_g       !== undefined) metaENG.massaTotal_g      = meta.massaTotal_g;
      if (meta.fabricante         !== undefined) metaENG.fabricante        = meta.fabricante;
      const eng = exportarENG(this.dados.leituras, analise, metaENG);
      this.baixarArquivo(new Blob([eng], { type: 'text/plain' }), `${this.nomeSessao}.eng`);
    } catch (e) {
      alert(`Não foi possível gerar o ENG: ${String(e)}\n\nA sessão precisa ter pelo menos uma leitura em queima.`);
    }
  }

  private exportarPDF() {
    try {
      const meta    = this.lerMetadadosFormulario();
      const data    = new Date().toLocaleDateString('pt-BR');
      const analise = analisarMotor(this.dados.leituras, meta.massaPropelente_g ? { massaPropelente_g: meta.massaPropelente_g } : {});
      const metaPDF: MetadadosPDF = { nomeSessao: this.nomeSessao, data };
      if (meta.fabricante        !== undefined) metaPDF.fabricante        = meta.fabricante;
      if (meta.diametro_mm       !== undefined) metaPDF.diametro_mm       = meta.diametro_mm;
      if (meta.comprimento_mm    !== undefined) metaPDF.comprimento_mm    = meta.comprimento_mm;
      if (meta.massaPropelente_g !== undefined) metaPDF.massaPropelente_g = meta.massaPropelente_g;
      if (meta.massaTotal_g      !== undefined) metaPDF.massaTotal_g      = meta.massaTotal_g;
      if (meta.descricao         !== undefined) metaPDF.descricao         = meta.descricao;
      if (meta.observacoes       !== undefined) metaPDF.observacoes       = meta.observacoes;
      const blob = gerarPDF(this.dados.leituras, analise, metaPDF);
      const url  = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      alert(`Erro ao gerar PDF: ${String(e)}\n\nDica: registre pelo menos uma queima para gerar o relatório.`);
    }
  }

  private bindEventos() {
    this.overlay.querySelector('#btn-fechar-analise')!.addEventListener('click', () => this.destruir());
    this.overlay.querySelector('#btn-descartar')!.addEventListener('click',      () => this.destruir());
    this.overlay.querySelector('#btn-auto-detectar')!.addEventListener('click',  () => { this.detectarQueima(true); this.renderizarGrafico(); this.atualizarStats(); });
    this.overlay.querySelector('#btn-recortar')!.addEventListener('click',       () => this.recortarQueima());
    this.overlay.querySelector('#btn-export-json')!.addEventListener('click',    () => this.exportarJSON());
    this.overlay.querySelector('#btn-export-csv')!.addEventListener('click',     () => this.exportarCSV());
    this.overlay.querySelector('#btn-export-eng')!.addEventListener('click',     () => this.exportarENG());
    this.overlay.querySelector('#btn-export-pdf')!.addEventListener('click',     () => this.exportarPDF());
    this.overlay.querySelector('#btn-salvar-sessao')!.addEventListener('click',  () => { void this.salvarSessao(); });

    const inputNome = this.overlay.querySelector<HTMLInputElement>('#nome-sessao-analise')!;
    inputNome.addEventListener('input', () => { this.nomeSessao = inputNome.value.trim() || this.dados.nomeSessao; });

    const inputT0 = this.overlay.querySelector<HTMLInputElement>('#st-t0')!;
    const inputT1 = this.overlay.querySelector<HTMLInputElement>('#st-t1')!;
    inputT0.addEventListener('change', () => {
      const v = parseFloat(inputT0.value);
      if (!isNaN(v)) {
        this.burnInicio = Math.min(this.encontrarIndiceMaisProximo(v), this.burnFim);
        this.atualizarMarcadores();
      }
    });
    inputT1.addEventListener('change', () => {
      const v = parseFloat(inputT1.value);
      if (!isNaN(v)) {
        this.burnFim = Math.max(this.encontrarIndiceMaisProximo(v), this.burnInicio);
        this.atualizarMarcadores();
      }
    });

    this.overlay.querySelector('#meta-massa-prop')!.addEventListener('input', () => this.atualizarStats());
  }

  private async salvarSessao() {
    const idSessao = this.dados.idSessao;
    if (!idSessao) { this.destruir(); return; }

    const btnSalvar = this.overlay.querySelector<HTMLButtonElement>('#btn-salvar-sessao');
    if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.textContent = 'Salvando…'; }

    // Lê os inputs diretamente — garante captura mesmo sem blur antes do clique
    const vT0 = parseFloat(this.overlay.querySelector<HTMLInputElement>('#st-t0')?.value ?? '');
    const vT1 = parseFloat(this.overlay.querySelector<HTMLInputElement>('#st-t1')?.value ?? '');
    if (!isNaN(vT0)) this.burnInicio = Math.min(this.encontrarIndiceMaisProximo(vT0), this.burnFim);
    if (!isNaN(vT1)) this.burnFim   = Math.max(this.encontrarIndiceMaisProximo(vT1), this.burnInicio);

    // Aplica burnInicio/burnFim de volta nos flags emQueima
    const ls = this.dados.leituras;
    let queimaAlterada = false;
    for (let i = 0; i < ls.length; i++) {
      const deveQueimar = i >= this.burnInicio && i <= this.burnFim;
      if (ls[i]!.emQueima !== deveQueimar) {
        ls[i]!.emQueima = deveQueimar;
        queimaAlterada = true;
      }
    }

    if (this.leiturasMutadas || queimaAlterada) {
      try {
        await this.armazenamento.substituirLeituras(idSessao, ls);
      } catch (e) {
        if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.textContent = 'Salvar Sessão'; }
        alert(`Não foi possível salvar as leituras:\n${String(e)}\n\nSe estiver usando o gateway, reconstrua o container da API:\n  docker compose build api && docker compose up -d api`);
        return;
      }
    }

    const meta = this.lerMetadadosFormulario();
    try {
      const analise = analisarMotor(this.dados.leituras, {});
      if (!meta.descricao) meta.descricao = analise.nomeComum;
    } catch { /* sem queima detectada */ }

    await this.armazenamento.salvarMetadados(idSessao, meta);

    this.destruir();
  }

  destruir() {
    this.chart?.destroy();
    this.overlay.remove();
    if (instanciaAtual === this) instanciaAtual = null;
    this.onFechar();
  }
}

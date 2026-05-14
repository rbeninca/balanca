import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { SessaoLocal, MetadadosLocal } from '../armazenamento/ArmazenamentoLocal.js';
import { analisarMotor } from '@balancagfig/analise';
import ApexCharts from 'apexcharts';

export interface SessaoComparacao {
  sessao:    SessaoLocal;
  leituras:  LeituraProcessada[];
  metadados: MetadadosLocal | null;
}

const CORES = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

let instanciaAtual: TelaComparacao | null = null;

export class TelaComparacao {
  private overlay: HTMLElement;
  private chart:   ApexCharts | null = null;

  constructor(private sessoes: SessaoComparacao[]) {
    instanciaAtual?.destruir();
    instanciaAtual = this;

    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.innerHTML = this.html();
    document.body.appendChild(this.overlay);

    this.overlay.querySelector('#btn-fechar-comp')!.addEventListener('click', () => this.destruir());
    this.overlay.querySelector('#btn-fechar-comp-footer')!.addEventListener('click', () => this.destruir());
    this.overlay.querySelector('#btn-imprimir-comp')!.addEventListener('click', () => { void this.exportarImpressao(); });

    setTimeout(() => { this.renderizarGrafico(); this.renderizarCards(); }, 80);
  }

  private encontrarBurnInicio(leituras: LeituraProcessada[]): number {
    const idx = leituras.findIndex(l => l.emQueima);
    if (idx >= 0) return idx;
    const pico = Math.max(...leituras.map(l => l.forcaNewton));
    const thr  = pico * 0.05;
    const i    = leituras.findIndex(l => l.forcaNewton >= thr);
    return i >= 0 ? i : 0;
  }

  private html(): string {
    return `
      <div class="modal" style="max-width:980px">
        <div class="modal-header">
          <h2 style="margin:0">Comparação de Sessões</h2>
          <button class="modal-fechar" id="btn-fechar-comp">×</button>
        </div>
        <div class="modal-body">
          <div id="comparacao-chart"></div>
          <div id="comparacao-cards" class="comparacao-cards"></div>
        </div>
        <div class="modal-footer">
          <button id="btn-fechar-comp-footer" class="btn-secondary">Fechar</button>
          <button id="btn-imprimir-comp" class="btn-secondary">Imprimir / PDF</button>
        </div>
      </div>
    `;
  }

  private renderizarGrafico() {
    const el = this.overlay.querySelector<HTMLElement>('#comparacao-chart');
    if (!el) return;

    const series = this.sessoes.map((s, i) => {
      const burnIdx = this.encontrarBurnInicio(s.leituras);
      const t0ms    = s.leituras[burnIdx]?.marcaTemporal ?? s.leituras[0]?.marcaTemporal ?? 0;
      return {
        name:  s.sessao.nome,
        type:  'line' as const,
        data:  s.leituras.map(l => ({ x: (l.marcaTemporal - t0ms) / 1000, y: l.forcaNewton })),
        color: CORES[i % CORES.length],
      };
    });

    const options: ApexCharts.ApexOptions = {
      series,
      chart: {
        height: 340,
        background: '#ffffff',
        foreColor: '#374151',
        animations: { enabled: false },
        toolbar: { show: true, tools: { download: false, selection: false, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true } },
      },
      colors: CORES,
      stroke: { curve: 'straight', width: 2 },
      markers: { size: 0 },
      xaxis: {
        type: 'numeric',
        title: { text: 'Tempo desde início da queima (s)', style: { color: '#6b7280' } },
        labels: { style: { colors: '#6b7280' }, formatter: (v) => (+v).toFixed(2) },
      },
      yaxis: {
        title: { text: 'Força (N)', style: { color: '#6b7280' } },
        labels: { style: { colors: '#6b7280' }, formatter: (v) => v.toFixed(1) },
      },
      grid:    { borderColor: '#e5e7eb' },
      legend:  { show: true, position: 'top' },
      tooltip: { theme: 'light', x: { formatter: (v) => `${(+v).toFixed(3)} s` } },
    };

    this.chart = new ApexCharts(el, options);
    void this.chart.render();
  }

  private renderizarCards() {
    const el = this.overlay.querySelector<HTMLElement>('#comparacao-cards');
    if (!el) return;

    const fmt = (n: number | null | undefined, d = 3) => n != null ? n.toFixed(d) : '—';

    el.innerHTML = this.sessoes.map((s, i) => {
      const cor = CORES[i % CORES.length]!;

      let analise: ReturnType<typeof analisarMotor> | null = null;
      try {
        analise = analisarMotor(
          s.leituras,
          s.metadados?.massaPropelente_g ? { massaPropelente_g: s.metadados.massaPropelente_g } : {},
        );
      } catch { /* sem queima detectável */ }

      const dataFmt = new Date(s.sessao.criadoEm).toLocaleString('pt-BR');

      const linhas: [string, string][] = [
        ['Data',            dataFmt],
        ['Leituras',        `${s.leituras.length}`],
        ['Classe NAR',      analise?.letraMotor ?? '—'],
        ['Nome comum',      analise?.nomeComum ?? '—'],
        ['Impulso total',   analise ? `${fmt(analise.impulsoTotal_Ns)} N·s` : '—'],
        ['F pico',          analise ? `${fmt(analise.forcaPico_N)} N` : '—'],
        ['F média',         analise ? `${fmt(analise.forcaMedia_N)} N` : '—'],
        ['F RMS',           analise ? `${fmt(analise.forcaRms_N)} N` : '—'],
        ['Duração queima',  analise ? `${fmt(analise.duracaoQueima_s)} s` : '—'],
        ['Isp',             analise?.impulsoEspecifico_s != null ? `${analise.impulsoEspecifico_s.toFixed(1)} s` : '—'],
        ['Perfil',          analise?.perfilQueima ?? '—'],
      ];

      if (s.metadados?.fabricante)        linhas.push(['Fabricante',    s.metadados.fabricante]);
      if (s.metadados?.diametro_mm)       linhas.push(['Diâmetro',      `${s.metadados.diametro_mm} mm`]);
      if (s.metadados?.comprimento_mm)    linhas.push(['Comprimento',   `${s.metadados.comprimento_mm} mm`]);
      if (s.metadados?.massaPropelente_g) linhas.push(['Massa prop.',   `${s.metadados.massaPropelente_g} g`]);
      if (s.metadados?.massaTotal_g)      linhas.push(['Massa total',   `${s.metadados.massaTotal_g} g`]);
      if (s.metadados?.descricao)         linhas.push(['Descrição',     s.metadados.descricao]);
      if (s.metadados?.observacoes)       linhas.push(['Observações',   s.metadados.observacoes]);

      return `
        <div class="comparacao-card" style="border-top:3px solid ${cor}">
          <div class="comparacao-card-titulo" style="color:${cor}">${s.sessao.nome}</div>
          ${linhas.map(([k, v]) => `
            <div class="comparacao-card-linha">
              <span class="comparacao-card-label">${k}</span>
              <span class="comparacao-card-valor">${v}</span>
            </div>
          `).join('')}
        </div>
      `;
    }).join('');
  }

  private cardHtmlImpressao(s: SessaoComparacao, cor: string): string {
    const fmt = (n: number | null | undefined, d = 3) => n != null ? n.toFixed(d) : '—';

    let analise: ReturnType<typeof analisarMotor> | null = null;
    try {
      analise = analisarMotor(
        s.leituras,
        s.metadados?.massaPropelente_g ? { massaPropelente_g: s.metadados.massaPropelente_g } : {},
      );
    } catch { /* sem queima */ }

    const dataFmt = new Date(s.sessao.criadoEm).toLocaleString('pt-BR');

    const linhas: [string, string][] = [
      ['Data',           dataFmt],
      ['Leituras',       `${s.leituras.length}`],
      ['Classe NAR',     analise?.letraMotor ?? '—'],
      ['Nome comum',     analise?.nomeComum ?? '—'],
      ['Impulso total',  analise ? `${fmt(analise.impulsoTotal_Ns)} N·s` : '—'],
      ['F pico',         analise ? `${fmt(analise.forcaPico_N)} N` : '—'],
      ['F média',        analise ? `${fmt(analise.forcaMedia_N)} N` : '—'],
      ['F RMS',          analise ? `${fmt(analise.forcaRms_N)} N` : '—'],
      ['Duração queima', analise ? `${fmt(analise.duracaoQueima_s)} s` : '—'],
      ['Isp',            analise?.impulsoEspecifico_s != null ? `${analise.impulsoEspecifico_s.toFixed(1)} s` : '—'],
      ['Perfil',         analise?.perfilQueima ?? '—'],
    ];
    if (s.metadados?.fabricante)        linhas.push(['Fabricante',    s.metadados.fabricante]);
    if (s.metadados?.diametro_mm)       linhas.push(['Diâmetro',      `${s.metadados.diametro_mm} mm`]);
    if (s.metadados?.comprimento_mm)    linhas.push(['Comprimento',   `${s.metadados.comprimento_mm} mm`]);
    if (s.metadados?.massaPropelente_g) linhas.push(['Massa prop.',   `${s.metadados.massaPropelente_g} g`]);
    if (s.metadados?.massaTotal_g)      linhas.push(['Massa total',   `${s.metadados.massaTotal_g} g`]);
    if (s.metadados?.descricao)         linhas.push(['Descrição',     s.metadados.descricao]);
    if (s.metadados?.observacoes)       linhas.push(['Observações',   s.metadados.observacoes]);

    const linhasHtml = linhas.map(([k, v]) => `
      <tr>
        <td style="color:#6b7280;padding:2px 6px 2px 0;white-space:nowrap">${k}</td>
        <td style="color:#111827;text-align:right;padding:2px 0;word-break:break-word">${v}</td>
      </tr>`).join('');

    return `
      <div style="border:1px solid #e5e7eb;border-top:3px solid ${cor};border-radius:6px;padding:10px;break-inside:avoid">
        <div style="font-weight:600;font-size:11pt;color:${cor};margin-bottom:6px;word-break:break-word">${s.sessao.nome}</div>
        <table style="width:100%;border-collapse:collapse;font-size:8.5pt">${linhasHtml}</table>
      </div>`;
  }

  private async exportarImpressao() {
    const btn = this.overlay.querySelector<HTMLButtonElement>('#btn-imprimir-comp');
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando…'; }

    try {
      const { imgURI } = await (this.chart as ApexCharts & {
        dataURI(opts?: { scale?: number }): Promise<{ imgURI: string }>;
      }).dataURI({ scale: 2 });

      const cardsHtml = this.sessoes
        .map((s, i) => this.cardHtmlImpressao(s, CORES[i % CORES.length]!))
        .join('');

      const dataGeracao = new Date().toLocaleString('pt-BR');
      const nomeSessoes = this.sessoes.map(s => s.sessao.nome).join(', ');

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Comparação — ${nomeSessoes}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; color: #111827; padding: 1.5cm; }
    @page { size: A4 landscape; margin: 1.5cm; }
    h1 { font-size: 15pt; margin-bottom: 4px; }
    .sub { font-size: 8.5pt; color: #6b7280; margin-bottom: 14px; }
    .grafico { width: 100%; margin-bottom: 16px; }
    .grafico img { width: 100%; height: auto; display: block; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Comparação de Sessões</h1>
  <p class="sub">Gerado em ${dataGeracao} &nbsp;·&nbsp; ${this.sessoes.length} sessões: ${nomeSessoes}</p>
  <div class="grafico"><img src="${imgURI}" alt="Gráfico de comparação"></div>
  <div class="cards">${cardsHtml}</div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

      const win = window.open('', '_blank');
      if (!win) { alert('Permita pop-ups para gerar a impressão.'); return; }
      win.document.write(html);
      win.document.close();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Imprimir / PDF'; }
    }
  }

  destruir() {
    this.chart?.destroy();
    this.overlay.remove();
    if (instanciaAtual === this) instanciaAtual = null;
  }
}

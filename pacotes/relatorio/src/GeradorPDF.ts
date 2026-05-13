import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { ResultadoAnalise } from '@balancagfig/analise';

export interface MetadadosPDF {
  nomeSessao?: string;
  data?: string;
  massaPropelente_g?: number;
  fabricante?: string;
  diametro_mm?: number;
  comprimento_mm?: number;
  massaTotal_g?: number;
  temperatura_C?: number;
  umidade_pct?: number;
  pressao_hPa?: number;
  descricao?: string;
  observacoes?: string;
}

const CLASSES_NAR = [
  { letra: '1/8A', min: 0,        max: 0.3125,   tipo: 'FM (foguete modelo)', nivel: 'Micro',          cor: '#8e44ad' },
  { letra: '1/4A', min: 0.3125,   max: 0.625,    tipo: 'FM (foguete modelo)', nivel: 'Baixa potência', cor: '#9b59b6' },
  { letra: '1/2A', min: 0.625,    max: 1.25,     tipo: 'FM (foguete modelo)', nivel: 'Baixa potência', cor: '#e74c3c' },
  { letra: 'A',    min: 1.25,     max: 2.50,     tipo: 'FM (foguete modelo)', nivel: 'Baixa potência', cor: '#e67e22' },
  { letra: 'B',    min: 2.50,     max: 5.00,     tipo: 'FM (foguete modelo)', nivel: 'Baixa potência', cor: '#f39c12' },
  { letra: 'C',    min: 5.00,     max: 10.00,    tipo: 'FM (foguete modelo)', nivel: 'Baixa potência', cor: '#f1c40f' },
  { letra: 'D',    min: 10.00,    max: 20.00,    tipo: 'FM (foguete modelo)', nivel: 'Baixa potência', cor: '#2ecc71' },
  { letra: 'E',    min: 20.00,    max: 40.00,    tipo: 'FM (foguete modelo)', nivel: 'Média potência',  cor: '#1abc9c' },
  { letra: 'F',    min: 40.00,    max: 80.00,    tipo: 'FM (foguete modelo)', nivel: 'Média potência',  cor: '#3498db' },
  { letra: 'G',    min: 80.00,    max: 160.00,   tipo: 'FM (foguete modelo)', nivel: 'Média potência',  cor: '#9b59b6' },
  { letra: 'H',    min: 160.00,   max: 320.00,   tipo: 'MFE (experimental)', nivel: 'Nível 1',         cor: '#e74c3c' },
  { letra: 'I',    min: 320.00,   max: 640.00,   tipo: 'MFE (experimental)', nivel: 'Nível 1',         cor: '#e67e22' },
  { letra: 'J',    min: 640.00,   max: 1280.00,  tipo: 'MFE (experimental)', nivel: 'Nível 2',         cor: '#f39c12' },
  { letra: 'K',    min: 1280.00,  max: 2560.00,  tipo: 'MFE (experimental)', nivel: 'Nível 2',         cor: '#2ecc71' },
  { letra: 'L',    min: 2560.00,  max: 5120.00,  tipo: 'MFE (experimental)', nivel: 'Nível 2',         cor: '#3498db' },
  { letra: 'M',    min: 5120.00,  max: 10240.00, tipo: 'MFE (experimental)', nivel: 'Nível 3',         cor: '#9b59b6' },
  { letra: 'N',    min: 10240.00, max: 20480.00, tipo: 'MFE (experimental)', nivel: 'Nível 3',         cor: '#e74c3c' },
  { letra: 'O',    min: 20480.00, max: 40960.00, tipo: 'MFE (experimental)', nivel: 'Nível 3',         cor: '#c0392b' },
];

function infoClasse(letra: string) {
  return CLASSES_NAR.find(c => c.letra === letra)
    ?? { letra, cor: '#607d8b', tipo: '—', nivel: '—', min: 0, max: 0 };
}

function fmtOpc(v: number | undefined | null, dec: number, suf: string): string {
  return v != null ? `${v.toFixed(dec)} ${suf}` : '---';
}

function gerarHTMLRelatorio(
  leituras: LeituraProcessada[],
  analise: ResultadoAnalise,
  meta: MetadadosPDF,
): string {
  const info  = infoClasse(analise.letraMotor);
  const cor   = info.cor;
  const faixa = `${info.min.toFixed(2)} – ${info.max.toFixed(2)} N⋅s`;

  const t0 = leituras[0]?.marcaTemporal ?? 0;
  const tN = leituras[leituras.length - 1]?.marcaTemporal ?? 0;
  const duracaoTotal  = (tN - t0) / 1000;
  const hz = duracaoTotal > 0 ? (leituras.length / duracaoTotal).toFixed(1) : '0.0';

  const queima    = leituras.filter(l => l.emQueima);
  const tIgnicao  = queima.length > 0 ? (queima[0]!.marcaTemporal  - t0) / 1000 : 0;
  const tBurnout  = queima.length > 0 ? (queima[queima.length - 1]!.marcaTemporal - t0) / 1000 : 0;

  let impulsoPositivo = 0;
  let impulsoNegativo = 0;
  for (let i = 1; i < leituras.length; i++) {
    const dt = (leituras[i]!.marcaTemporal - leituras[i - 1]!.marcaTemporal) / 1000;
    const fm = (leituras[i]!.forcaNewton + leituras[i - 1]!.forcaNewton) / 2;
    if (fm >= 0) impulsoPositivo += fm * dt;
    else         impulsoNegativo += fm * dt;
  }
  const impulsoLiquido = impulsoPositivo + impulsoNegativo;

  const n = leituras.length || 1;
  const forcaMediaAmostral = leituras.reduce((s, l) => s + l.forcaNewton, 0) / n;
  const forcasPos = leituras.filter(l => l.forcaNewton > 0);
  const forcaMediaPositiva = forcasPos.length > 0
    ? forcasPos.reduce((s, l) => s + l.forcaNewton, 0) / forcasPos.length : 0;
  const forcaMediaQueima = analise.duracaoQueima_s > 0
    ? analise.impulsoTotal_Ns / analise.duracaoQueima_s : 0;
  const forcaMin = leituras.length > 0 ? Math.min(...leituras.map(l => l.forcaNewton)) : 0;
  const maxF     = leituras.length > 0 ? Math.max(...leituras.map(l => l.forcaNewton)) : 1;

  const ispTexto = analise.impulsoEspecifico_s != null
    ? `${analise.impulsoEspecifico_s.toFixed(2)} s`
    : 'Aguardando massa propelente';

  const GF_PER_N  = 1000 / 9.80665;
  const KGF_PER_N = 1    / 9.80665;

  const linhasTabela = leituras.map((l, i) => {
    const t   = ((l.marcaTemporal - t0) / 1000).toFixed(6);
    const nN  = l.forcaNewton.toFixed(6);
    const gf  = (l.forcaNewton * GF_PER_N).toFixed(6);
    const kgf = (l.forcaNewton * KGF_PER_N).toFixed(6);
    const norm = maxF > 0 ? Math.max(0, l.forcaNewton) / maxF : 0;
    const bg = l.forcaNewton > 0.05
      ? `background:rgba(255,165,0,${Math.min(0.5, Math.max(0.1, norm * 0.5)).toFixed(2)}) !important;` : '';
    return `<tr style="${bg}"><td>${i + 1}</td><td>${t}</td><td>${nN}</td><td>${gf}</td><td>${kgf}</td></tr>`;
  }).join('\n');

  const narLinhas = CLASSES_NAR.map(c => {
    const isMotor  = c.letra === analise.letraMotor;
    const rowStyle = isMotor ? `background:${c.cor}30;border-left:4px solid ${c.cor};font-weight:bold;` : '';
    const marker   = isMotor ? '🎯 ' : '';
    return `<tr style="${rowStyle}">
      <td style="text-align:center;padding:4px">${marker}${c.letra}</td>
      <td style="text-align:center;padding:4px">${c.min.toFixed(2)} – ${c.max.toFixed(2)}</td>
      <td style="text-align:center;padding:4px">${c.tipo}</td>
      <td style="text-align:center;padding:4px">${c.nivel}</td>
    </tr>`;
  }).join('\n');

  const chartData = JSON.stringify(leituras.map(l => ({
    t: (l.marcaTemporal - t0) / 1000,
    f: l.forcaNewton,
  })));

  const chartInfo = JSON.stringify({
    nomeSessao:   meta.nomeSessao ?? '---',
    nomeMotor:    analise.nomeComum,
    letraMotor:   analise.letraMotor,
    impulsoTotal: analise.impulsoTotal_Ns,
    tIgnicao,
    tBurnout,
    cor,
  });

  const temMeta = meta.fabricante || meta.diametro_mm != null || meta.comprimento_mm != null
    || meta.massaPropelente_g != null || meta.massaTotal_g != null
    || meta.temperatura_C != null || meta.descricao || meta.observacoes;

  const secaoMeta = temMeta ? `
  <div class="secao avoid-break" style="background:#fff9e6;padding:5px;border-radius:3px;margin:4px 0;border-left:3px solid #ffc107;">
    <h2 style="margin-bottom:4px;color:#f39c12;font-size:11px;">Metadados do Motor</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;font-size:8px;">
      <div><strong>Fabricante:</strong> ${meta.fabricante ?? '---'}</div>
      <div><strong>Diâmetro:</strong> ${fmtOpc(meta.diametro_mm, 1, 'mm')}</div>
      <div><strong>Comprimento:</strong> ${fmtOpc(meta.comprimento_mm, 1, 'mm')}</div>
      <div><strong>Massa Propelente:</strong> ${fmtOpc(meta.massaPropelente_g, 2, 'g')}</div>
      <div><strong>Massa Total:</strong> ${fmtOpc(meta.massaTotal_g, 2, 'g')}</div>
      <div><strong>Fração Propelente:</strong> ${(meta.massaPropelente_g && meta.massaTotal_g)
        ? ((meta.massaPropelente_g / meta.massaTotal_g * 100).toFixed(1) + ' %') : '---'}</div>
    </div>
    ${(meta.temperatura_C != null || meta.umidade_pct != null || meta.pressao_hPa != null) ? `
    <h3 style="margin:4px 0 3px;color:#2980b9;font-size:9px;">Condições Ambientais</h3>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;font-size:8px;">
      <div><strong>Temperatura:</strong> ${fmtOpc(meta.temperatura_C, 1, '°C')}</div>
      <div><strong>Umidade:</strong> ${fmtOpc(meta.umidade_pct, 1, '%')}</div>
      <div><strong>Pressão:</strong> ${fmtOpc(meta.pressao_hPa, 2, 'hPa')}</div>
    </div>` : ''}
    ${meta.descricao   ? `<div style="margin-top:4px;font-size:8px;"><strong>Descrição:</strong> ${meta.descricao}</div>` : ''}
    ${meta.observacoes ? `<div style="margin-top:3px;font-size:8px;"><strong>Observações:</strong> ${meta.observacoes}</div>` : ''}
  </div>` : '';

  const anomaliasHTML = analise.anomalias.length > 0
    ? `<tr><td colspan="4" style="padding:2px;background:#fff3cd;color:#856404;">
        Atenção: ${analise.anomalias.filter(a => a.nivel === 'CRITICO').length} anomalia(s) CRITICO detectada(s) —
        ${analise.anomalias.map(a => `[${a.nivel}] ${a.tipo}`).join(', ')}
      </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório — ${meta.nomeSessao ?? '---'}</title>
  <style>
    @media print {
      @page { size: A4; margin: 12mm; }
      body { margin: 0; padding: 0; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
      .avoid-break { page-break-inside: avoid; }
    }
    body { font-family: Arial, sans-serif; line-height: 1.3; color: #2c3e50; max-width: 210mm; margin: 0 auto; padding: 6px; background: white; font-size: 10px; }
    .header { text-align: center; border-bottom: 2px solid #3498db; padding-bottom: 5px; margin-bottom: 5px; }
    .header h1 { color: #2c3e50; margin: 3px 0; font-size: 18px; }
    .header .sub { color: #7f8c8d; font-size: 9px; margin: 2px 0; }
    .secao { margin: 5px 0; }
    .secao h2 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 3px; margin-bottom: 5px; font-size: 12px; }
    .graf-box { text-align: center; margin: 5px 0; background: #f8f9fa; padding: 5px; border-radius: 4px; }
    .graf-box canvas { max-width: 100%; border: 1px solid #dee2e6; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 8px; }
    th, td { padding: 3px; text-align: left; border-bottom: 1px solid #dee2e6; }
    th { background: #3498db; color: white; font-weight: bold; font-size: 9px; }
    tr:nth-child(even) { background: #f8f9fa; }
    .footer { margin-top: 10px; padding-top: 5px; border-top: 1px solid #dee2e6; text-align: center; color: #7f8c8d; font-size: 7px; }
    .info-box { background: #f8f9fa; border-left: 3px solid #3498db; padding: 5px; margin: 3px 0; font-size: 7px; }
    .btn-p { background: #3498db; color: white; border: none; padding: 10px 20px; border-radius: 5px; font-size: 14px; cursor: pointer; margin: 15px 5px; }
    .btn-p:hover { background: #2980b9; }
    .btn-c { background: #95a5a6; }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;margin-bottom:15px;">
    <button class="btn-p" onclick="window.print()">Imprimir / Salvar como PDF</button>
    <button class="btn-p btn-c" onclick="window.close()">Fechar</button>
  </div>

  <div class="header avoid-break">
    <h1>balançaGFIG — RELATÓRIO DE TESTE ESTÁTICO</h1>
    <div class="sub">${meta.nomeSessao ?? '---'} • ${meta.data ?? new Date().toLocaleDateString('pt-BR')}</div>
    <div class="sub">IFSC Campus Gaspar • GFIG • CompSteam • BoxSteam</div>
  </div>

  <div class="secao avoid-break" style="background:${cor}20;border-left:4px solid ${cor};padding:5px;border-radius:3px;margin:4px 0;">
    <div style="display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center;">
      <div style="text-align:center;padding:6px;background:${cor};color:white;border-radius:3px;min-width:70px;">
        <div style="font-size:16px;font-weight:bold;">${analise.impulsoTotal_Ns.toFixed(2)}</div>
        <div style="font-size:8px;">N⋅s</div>
      </div>
      <div style="font-size:9px;line-height:1.4;">
        <strong>Classe:</strong> ${analise.letraMotor} • <strong>Tipo:</strong> ${info.tipo} • <strong>Nível:</strong> ${info.nivel}<br>
        <strong>Faixa:</strong> ${faixa} • <strong>Impulso Total:</strong> ${analise.impulsoTotal_Ns.toFixed(2)} N⋅s
      </div>
    </div>
  </div>

  ${secaoMeta}

  <div class="secao avoid-break">
    <h2 style="font-size:11px;margin-bottom:4px;">Métricas de Desempenho</h2>
    <table style="font-size:8px;">
      <tr style="background:#f8f9fa;">
        <td style="padding:2px;font-weight:bold;">Impulso Total</td><td style="padding:2px;">${analise.impulsoTotal_Ns.toFixed(3)} N⋅s</td>
        <td style="padding:2px;font-weight:bold;">Força Máxima</td><td style="padding:2px;">${analise.forcaPico_N.toFixed(3)} N</td>
      </tr>
      <tr>
        <td style="padding:2px;font-weight:bold;">Duração Queima</td><td style="padding:2px;">${analise.duracaoQueima_s.toFixed(3)} s</td>
        <td style="padding:2px;font-weight:bold;">Força Média (Queima)</td><td style="padding:2px;">${forcaMediaQueima.toFixed(3)} N</td>
      </tr>
      <tr style="background:#f8f9fa;">
        <td style="padding:2px;font-weight:bold;">Tempo Ignição</td><td style="padding:2px;">${tIgnicao.toFixed(3)} s</td>
        <td style="padding:2px;font-weight:bold;">Tempo Burnout</td><td style="padding:2px;">${tBurnout.toFixed(3)} s</td>
      </tr>
      <tr>
        <td style="padding:2px;font-weight:bold;">Impulso Líquido</td><td style="padding:2px;">${impulsoLiquido.toFixed(3)} N⋅s</td>
        <td style="padding:2px;font-weight:bold;">Impulso Específico (Isp)</td><td style="padding:2px;">${ispTexto}</td>
      </tr>
    </table>
  </div>

  <div class="secao">
    <h2 style="font-size:11px;margin-bottom:4px;">Curva de Propulsão</h2>
    <div class="graf-box"><canvas id="propulsion-chart" width="1200" height="600"></canvas></div>
  </div>

  <div class="secao avoid-break" style="background:#f8f9fa;padding:4px;border-radius:3px;margin:4px 0;">
    <h2 style="margin-bottom:3px;font-size:10px;">Análise de Tempo</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
      <div>
        <div style="background:#3498db;color:white;padding:3px 6px;border-radius:2px 2px 0 0;font-weight:bold;font-size:8px;">HORÁRIO DO TESTE ESTÁTICO</div>
        <table style="width:100%;background:white;border:1px solid #dee2e6;font-size:8px;">
          <tr><td style="padding:2px;font-weight:bold;width:40%;">Duração Total:</td><td style="padding:2px;">${duracaoTotal.toFixed(3)} s</td></tr>
          <tr><td style="padding:2px;font-weight:bold;">Leituras:</td><td style="padding:2px;">${leituras.length}</td></tr>
          <tr><td style="padding:2px;font-weight:bold;">Taxa de Amostragem:</td><td style="padding:2px;">${hz} Hz</td></tr>
          <tr><td style="padding:2px;font-weight:bold;">F mínima:</td><td style="padding:2px;">${forcaMin.toFixed(3)} N</td></tr>
          <tr><td style="padding:2px;font-weight:bold;">F máxima:</td><td style="padding:2px;">${analise.forcaPico_N.toFixed(3)} N</td></tr>
        </table>
      </div>
      <div>
        <div style="background:#27ae60;color:white;padding:3px 6px;border-radius:2px 2px 0 0;font-weight:bold;font-size:8px;">QUEIMA DETECTADA</div>
        <table style="width:100%;background:white;border:1px solid #dee2e6;font-size:8px;">
          <tr><td style="padding:2px;font-weight:bold;width:40%;">Ignição:</td><td style="padding:2px;">${tIgnicao.toFixed(3)} s</td></tr>
          <tr><td style="padding:2px;font-weight:bold;">Burnout:</td><td style="padding:2px;">${tBurnout.toFixed(3)} s</td></tr>
          <tr><td style="padding:2px;font-weight:bold;">Duração Queima:</td><td style="padding:2px;">${analise.duracaoQueima_s.toFixed(3)} s</td></tr>
          <tr><td style="padding:2px;font-weight:bold;">Leituras Queima:</td><td style="padding:2px;">${queima.length}</td></tr>
          <tr><td style="padding:2px;font-weight:bold;">Perfil:</td><td style="padding:2px;">${analise.perfilQueima}</td></tr>
        </table>
      </div>
    </div>
  </div>

  <div class="secao avoid-break">
    <h2 style="font-size:10px;margin-bottom:3px;">Análise Detalhada</h2>
    <table style="font-size:8px;">
      <tr>
        <td style="padding:2px;">Impulso Positivo</td><td style="padding:2px;">${impulsoPositivo.toFixed(3)} N⋅s</td>
        <td style="padding:2px;">Área Negativa</td><td style="padding:2px;">${impulsoNegativo.toFixed(3)} N⋅s</td>
      </tr>
      <tr>
        <td style="padding:2px;">Força Média (Amostral)</td><td style="padding:2px;">${forcaMediaAmostral.toFixed(3)} N</td>
        <td style="padding:2px;">Força Média (Positiva)</td><td style="padding:2px;">${forcaMediaPositiva.toFixed(3)} N</td>
      </tr>
      <tr>
        <td style="padding:2px;">Força RMS</td><td style="padding:2px;">${analise.forcaRms_N.toFixed(3)} N</td>
        <td style="padding:2px;">Coef. Variação</td><td style="padding:2px;">${(analise.coefVariacao * 100).toFixed(1)} %</td>
      </tr>
      <tr>
        <td style="padding:2px;">Duração Total</td><td style="padding:2px;">${duracaoTotal.toFixed(3)} s</td>
        <td style="padding:2px;">Número de Leituras</td><td style="padding:2px;">${leituras.length}</td>
      </tr>
      <tr>
        <td style="padding:2px;">Classificação NAR/TRA</td><td style="padding:2px;">${analise.letraMotor}</td>
        <td style="padding:2px;">Nome Comum</td><td style="padding:2px;">${analise.nomeComum}</td>
      </tr>
      ${anomaliasHTML}
    </table>
  </div>

  <div class="secao">
    <h2 style="font-size:10px;margin-bottom:3px;">Tabela Completa de Dados (${leituras.length} leituras)</h2>
    <table style="font-size:7px;">
      <thead><tr>
        <th style="padding:2px;">#</th>
        <th style="padding:2px;">Tempo (s)</th>
        <th style="padding:2px;">Força (N)</th>
        <th style="padding:2px;">Força (gf)</th>
        <th style="padding:2px;">Força (kgf)</th>
      </tr></thead>
      <tbody>${linhasTabela}</tbody>
    </table>
  </div>

  <div class="secao">
    <h2 style="font-size:10px;margin-bottom:3px;">Fundamentação Teórica e Metodologia de Cálculo</h2>

    <h3 style="margin-top:.5rem;color:#2c3e50;font-size:9px;">1. Integração Numérica — Método dos Trapézios</h3>
    <div class="info-box">
      <p style="margin:2px 0;"><strong>Referência:</strong> MARCHI, C. H. et al. "Verificação de Soluções Numéricas". UFPR, 2015.</p>
      <p style="margin:2px 0;">O <strong>Impulso Total</strong> é calculado pela integração numérica da curva força-tempo usando o <strong>Método dos Trapézios Composto</strong>:</p>
      <p style="text-align:center;font-family:'Courier New',monospace;background:white;padding:3px;border-radius:2px;margin:3px 0;">
        I = ∫F(t) dt ≈ Σ [(F<sub>i</sub> + F<sub>i+1</sub>)/2] × Δt<sub>i</sub>
      </p>
      <p style="margin:2px 0;"><strong>Erro de Truncamento:</strong> O(h²). Com ~100 Hz de amostragem, desprezível frente à incerteza da célula de carga (±0,05% F.S.).</p>
    </div>

    <h3 style="margin-top:.5rem;color:#2c3e50;font-size:9px;">2. Métricas Estatísticas</h3>
    <table style="font-size:7px;width:100%;margin:3px 0;">
      <tr>
        <th style="width:22%;padding:2px;">Métrica</th>
        <th style="width:32%;padding:2px;">Fórmula</th>
        <th style="width:46%;padding:2px;">Interpretação Física</th>
      </tr>
      <tr><td style="padding:2px;">Impulso Total</td><td style="padding:2px;">I = ∫ F(t) dt [N⋅s]</td><td style="padding:2px;">Quantidade total de movimento transferida. Área sob a curva força-tempo.</td></tr>
      <tr><td style="padding:2px;">Força Máxima</td><td style="padding:2px;">F<sub>max</sub> = max{F(t)} [N]</td><td style="padding:2px;">Pico de empuxo. Crítico para dimensionamento estrutural.</td></tr>
      <tr><td style="padding:2px;">Força Média (Queima)</td><td style="padding:2px;">F̄ = I / Δt<sub>queima</sub> [N]</td><td style="padding:2px;">Empuxo constante equivalente durante a fase de propulsão efetiva.</td></tr>
      <tr><td style="padding:2px;">Força RMS</td><td style="padding:2px;">F<sub>rms</sub> = √(Σ F<sub>i</sub>² / n) [N]</td><td style="padding:2px;">Medida da intensidade eficaz do empuxo.</td></tr>
      <tr><td style="padding:2px;">Impulso Líquido</td><td style="padding:2px;">I<sub>liq</sub> = I<sub>pos</sub> − |I<sub>neg</sub>| [N⋅s]</td><td style="padding:2px;">Impulso útil descontando forças resistivas.</td></tr>
      <tr><td style="padding:2px;">Impulso Específico</td><td style="padding:2px;">I<sub>sp</sub> = I / (m<sub>prop</sub> × g₀) [s]</td><td style="padding:2px;">Eficiência do propelente (requer massa propelente).</td></tr>
    </table>

    <h3 style="margin-top:.5rem;color:#2c3e50;font-size:9px;">3. Classificação NAR/TRA</h3>
    <div class="info-box" style="border-left-color:#27ae60;">
      <p style="margin:2px 0;"><strong>Referências:</strong> NFPA 1122, NFPA 1127, NAR/TRA Standards.</p>
      <p style="margin:2px 0;">Progressão logarítmica base 2 — cada classe possui o dobro do impulso máximo da anterior.</p>
      <p style="text-align:center;font-family:'Courier New',monospace;background:white;padding:3px;border-radius:2px;margin:3px 0;">
        Classe N: 2<sup>N−1</sup> × I<sub>A_max</sub> &lt; I ≤ 2<sup>N</sup> × I<sub>A_max</sub>
      </p>
    </div>

    <h3 style="margin-top:.5rem;color:#2c3e50;font-size:9px;">4. Incertezas de Medição</h3>
    <div class="info-box" style="background:#fff3cd;border-left-color:#f39c12;">
      <p style="margin:2px 0;"><strong>Referência:</strong> JCGM 100:2008 — GUM.</p>
      <p style="margin:2px 0;"><strong>Tipo B (Sistemática):</strong> Especificação do fabricante da célula de carga (±0,05% F.S.).</p>
      <p style="text-align:center;font-family:'Courier New',monospace;background:white;padding:3px;border-radius:2px;margin:3px 0;">
        u<sub>c</sub>(I) = √[(∂I/∂F)² u²(F) + (∂I/∂t)² u²(t)]
      </p>
    </div>

    <h3 style="margin-top:.5rem;color:#2c3e50;font-size:9px;">5. Limitações</h3>
    <div class="info-box" style="background:#f8d7da;border-left-color:#e74c3c;">
      <ul style="margin:3px 0;padding-left:15px;">
        <li>Método dos trapézios assume variação linear entre pontos consecutivos.</li>
        <li>Cálculo de I<sub>sp</sub> requer pesagem precisa do propelente antes e após o teste.</li>
        <li>Tara deve ser verificada antes de cada teste para eliminar offset sistemático.</li>
        <li>Vibrações externas podem introduzir ruído que afeta a precisão.</li>
      </ul>
    </div>

    <h3 style="margin-top:.5rem;color:#2c3e50;font-size:9px;">6. Referências Bibliográficas</h3>
    <div style="font-size:7px;line-height:1.4;background:#f8f9fa;padding:5px;border-radius:3px;margin:3px 0;">
      <p style="margin:2px 0;">[1] MARCHI, C. H. <em>"Verificação de Soluções Numéricas"</em>. UFPR, 2015.</p>
      <p style="margin:2px 0;">[2] NFPA 1122: <em>Code for Model Rocketry</em>. NFPA, 2018.</p>
      <p style="margin:2px 0;">[3] NFPA 1127: <em>Code for High Power Rocketry</em>. NFPA, 2018.</p>
      <p style="margin:2px 0;">[4] NAR Standards and Testing Committee. <em>"Model Rocket Motor Classification"</em>.</p>
      <p style="margin:2px 0;">[5] SUTTON, G. P.; BIBLARZ, O. <em>"Rocket Propulsion Elements"</em>. 9ª ed., Wiley, 2017.</p>
      <p style="margin:2px 0;">[6] JCGM 100:2008. <em>"Guide to the Expression of Uncertainty in Measurement"</em> (GUM).</p>
    </div>
  </div>

  <div class="secao avoid-break">
    <h2 style="font-size:10px;margin-bottom:3px;">Informações do Sistema</h2>
    <table style="font-size:8px;">
      <tr><td style="padding:2px;font-weight:bold;">Sistema de Aquisição:</td><td style="padding:2px;">balançaGFIG v2 — GFIG / IFSC Campus Gaspar</td></tr>
      <tr><td style="padding:2px;font-weight:bold;">Gravidade Local:</td><td style="padding:2px;">9,80665 m/s²</td></tr>
      <tr><td style="padding:2px;font-weight:bold;">Taxa de Amostragem:</td><td style="padding:2px;">${hz} Hz</td></tr>
      <tr><td style="padding:2px;font-weight:bold;">Normas de Referência:</td><td style="padding:2px;">NFPA 1122, NFPA 1127, NAR/TRA Standards</td></tr>
    </table>
  </div>

  <div class="secao avoid-break" style="padding:4px 0;">
    <h2 style="font-size:10px;margin-bottom:3px;">Classificação NAR/TRA Completa</h2>
    <div style="background:${cor}20;border-left:3px solid ${cor};padding:5px;border-radius:3px;margin-bottom:3px;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;font-size:8px;">
        <div><strong>Classe:</strong> ${analise.letraMotor}</div>
        <div><strong>Tipo:</strong> ${info.tipo}</div>
        <div><strong>Nível:</strong> ${info.nivel}</div>
      </div>
      <div style="margin-top:3px;font-size:7px;color:#555;">
        <strong>Faixa:</strong> ${faixa} • <strong>Impulso:</strong> ${analise.impulsoTotal_Ns.toFixed(2)} N⋅s
      </div>
    </div>
    <table style="font-size:7px;width:100%;">
      <thead><tr>
        <th style="padding:2px;text-align:center;">Classe</th>
        <th style="padding:2px;text-align:center;">Faixa (N⋅s)</th>
        <th style="padding:2px;text-align:center;">Tipo</th>
        <th style="padding:2px;text-align:center;">Nível</th>
      </tr></thead>
      <tbody>${narLinhas}</tbody>
    </table>
  </div>

  <div class="footer">
    <p style="margin:2px 0;"><strong>GFIG / IFSC Campus Gaspar</strong></p>
    <p style="margin:2px 0;">Grupo de Foguetes do Campus Gaspar (GFIG) • CompSteam • Projeto BoxSteam</p>
    <p style="margin:2px 0;">Instituto Federal de Santa Catarina — Campus Gaspar</p>
    <p style="margin:2px 0;">Data de geração: ${new Date().toLocaleString('pt-BR')}</p>
  </div>

  <script>
  (function() {
    var DATA = ${chartData};
    var INFO = ${chartInfo};

    function renderChart() {
      var canvas = document.getElementById('propulsion-chart');
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      var w = canvas.width, h = canvas.height;
      var cor = INFO.cor || '#3498db';

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#2c3e50';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Curva de Propulsão — ' + INFO.nomeSessao, w / 2, 34);

      ctx.fillStyle = cor;
      ctx.font = 'bold 15px Arial';
      ctx.fillText('Impulso: ' + INFO.impulsoTotal.toFixed(2) + ' N⋅s  |  Classe ' + INFO.letraMotor + ' (' + INFO.nomeMotor + ')', w / 2, 56);

      var gx = 100, gy = 80, gw = w - 160, gh = h - 155;

      ctx.fillStyle = '#f8f9fa';
      ctx.fillRect(gx, gy, gw, gh);
      ctx.strokeStyle = '#95a5a6';
      ctx.lineWidth = 2;
      ctx.strokeRect(gx, gy, gw, gh);

      var tempos = DATA.map(function(d) { return d.t; });
      var valores = DATA.map(function(d) { return d.f; });

      if (valores.length < 2) {
        ctx.fillStyle = '#e74c3c';
        ctx.font = '18px Arial';
        ctx.fillText('Dados insuficientes', w / 2, h / 2);
        return;
      }

      var maxV = Math.max.apply(null, valores);
      var minV = Math.min.apply(null, [0].concat(valores));
      var pad  = (maxV - minV) * 0.1 || 0.1;
      var yMin = minV - pad, yMax = maxV + pad, yRange = yMax - yMin;
      var maxT = Math.max.apply(null, tempos) || 1;

      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      for (var i = 0; i <= 6; i++) {
        var yg = gy + (gh / 6) * i;
        var vl = yMax - (yRange / 6) * i;
        ctx.beginPath(); ctx.moveTo(gx, yg); ctx.lineTo(gx + gw, yg); ctx.stroke();
        ctx.fillStyle = '#2c3e50'; ctx.font = '12px Arial'; ctx.textAlign = 'right';
        ctx.fillText(vl.toFixed(1) + ' N', gx - 8, yg + 4);
      }
      for (var j = 0; j <= 8; j++) {
        var xg = gx + (gw / 8) * j;
        var tl = (maxT / 8) * j;
        ctx.beginPath(); ctx.moveTo(xg, gy); ctx.lineTo(xg, gy + gh); ctx.stroke();
        ctx.fillStyle = '#2c3e50'; ctx.font = '12px Arial'; ctx.textAlign = 'center';
        ctx.fillText(tl.toFixed(2) + 's', xg, gy + gh + 18);
      }
      ctx.setLineDash([]);

      ctx.fillStyle = '#2c3e50';
      ctx.font = 'bold 13px Arial';
      ctx.save(); ctx.translate(26, gy + gh / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.fillText('Força (N)', 0, 0); ctx.restore();
      ctx.textAlign = 'center';
      ctx.fillText('Tempo (s)', gx + gw / 2, gy + gh + 44);

      var px = function(t) { return gx + (t / maxT) * gw; };
      var py = function(v) { return gy + gh - ((v - yMin) / yRange) * gh; };

      ctx.fillStyle = 'rgba(52,152,219,0.25)';
      ctx.beginPath();
      var z0 = py(0);
      ctx.moveTo(px(tempos[0]), z0);
      for (var k = 0; k < DATA.length; k++) {
        ctx.lineTo(px(DATA[k].t), py(DATA[k].f));
      }
      ctx.lineTo(px(tempos[tempos.length - 1]), z0);
      ctx.closePath(); ctx.fill();

      ctx.strokeStyle = '#3498db'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (var m = 0; m < DATA.length; m++) {
        m === 0 ? ctx.moveTo(px(DATA[m].t), py(DATA[m].f)) : ctx.lineTo(px(DATA[m].t), py(DATA[m].f));
      }
      ctx.stroke();

      if (yMin < 0) {
        var zy = py(0);
        ctx.strokeStyle = '#bdc3c7'; ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(gx, zy); ctx.lineTo(gx + gw, zy); ctx.stroke();
        ctx.setLineDash([]);
      }

      var maxIdx = 0;
      for (var p = 1; p < valores.length; p++) { if (valores[p] > valores[maxIdx]) maxIdx = p; }
      var pkx = px(tempos[maxIdx]), pky = py(valores[maxIdx]);
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath(); ctx.arc(pkx, pky, 7, 0, 2 * Math.PI); ctx.fill();
      ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
      ctx.fillText('Fmax: ' + valores[maxIdx].toFixed(2) + ' N', pkx, pky - 12);

      if (INFO.tIgnicao > 0) {
        var ix = px(INFO.tIgnicao);
        ctx.strokeStyle = '#27ae60'; ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        ctx.beginPath(); ctx.moveTo(ix, gy); ctx.lineTo(ix, gy + gh); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#27ae60'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
        ctx.fillText('Ignição', ix, gy - 5);
      }
      if (INFO.tBurnout > INFO.tIgnicao) {
        var bx = px(INFO.tBurnout);
        ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        ctx.beginPath(); ctx.moveTo(bx, gy); ctx.lineTo(bx, gy + gh); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#e67e22'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
        ctx.fillText('Burnout', bx, gy - 5);
      }

      var lx = gx + gw - 175, ly = gy + 18;
      ctx.fillStyle = 'rgba(52,152,219,0.25)'; ctx.fillRect(lx, ly, 26, 14);
      ctx.strokeStyle = '#3498db'; ctx.lineWidth = 2; ctx.strokeRect(lx, ly, 26, 14);
      ctx.fillStyle = '#2c3e50'; ctx.font = '11px Arial'; ctx.textAlign = 'left';
      ctx.fillText('Área = Impulso', lx + 32, ly + 11);
      ctx.fillStyle = '#27ae60';
      ctx.fillText(INFO.impulsoTotal.toFixed(2) + ' N⋅s', lx + 32, ly + 24);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderChart);
    } else {
      renderChart();
    }
    setTimeout(function() { window.print(); }, 800);
  })();
  </script>
</body>
</html>`;
}

export function gerarPDF(
  leituras: LeituraProcessada[],
  analise: ResultadoAnalise,
  meta?: MetadadosPDF,
): Blob {
  const html = gerarHTMLRelatorio(leituras, analise, meta ?? {});
  return new Blob([html], { type: 'text/html; charset=utf-8' });
}

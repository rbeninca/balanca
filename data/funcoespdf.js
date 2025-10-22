// ============================================
// GERAÇÃO DE RELATÓRIOS EM PDF COM GRÁFICO REAL - GFIG
// ============================================

/**
 * Exporta PDF com gráfico real e todos os dados via impressão do navegador
 * @param {number} sessionId - ID da sessão a ser exportada
 */
function exportarPDFViaPrint(sessionId) {
  try {
    const gravacoes = JSON.parse(localStorage.getItem('balancaGravacoes')) || [];
    const sessao = gravacoes.find(g => g.id === sessionId);
    
    if (!sessao || !sessao.dadosTabela || sessao.dadosTabela.length === 0) {
      showNotification('error', 'Sessão não encontrada ou sem dados');
      return;
    }
    
    showNotification('info', 'Gerando relatório PDF com gráfico...', 2000);
    
    // Processa dados
    const dados = processarDadosSimples(sessao.dadosTabela);
    const impulsoData = calcularAreaSobCurva(dados.tempos, dados.newtons, false);
    const metricasPropulsao = calcularMetricasPropulsao(impulsoData);
    
    // Gera o gráfico em canvas e converte para imagem
    gerarGraficoParaPDF(sessao, dados, impulsoData, metricasPropulsao, (imagemBase64) => {
      // Cria janela de impressão com o gráfico
      const printWindow = window.open('', '_blank');
      
      // Gera HTML do relatório COM a imagem do gráfico
      const html = gerarHTMLRelatorioCompleto(sessao, dados, impulsoData, metricasPropulsao, imagemBase64);
      
      printWindow.document.write(html);
      printWindow.document.close();
      
      // Aguarda carregamento e abre diálogo de impressão
      printWindow.onload = function() {
        setTimeout(() => {
          printWindow.print();
        }, 500);
      };
      
      showNotification('success', 'Relatório pronto! Use "Salvar como PDF" no diálogo', 5000);
    });
    
  } catch (e) {
    console.error('Erro ao gerar PDF:', e);
    showNotification('error', 'Erro ao gerar relatório: ' + e.message);
  }
}

/**
 * Gera o gráfico em canvas e retorna como base64
 */
function gerarGraficoParaPDF(sessao, dados, impulsoData, metricasPropulsao, callback) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Dimensões do gráfico
  const w = 1400;
  const h = 800;
  canvas.width = w;
  canvas.height = h;
  
  // Cores
  const cor = {
    fundo: '#ffffff',
    titulo: '#2c3e50',
    subtitulo: '#7f8c8d',
    azul: '#3498db',
    verde: '#27ae60',
    vermelho: '#e74c3c',
    cinza: '#95a5a6',
    fundo2: '#f8f9fa',
    roxo: '#9b59b6',
    laranja: '#e67e22'
  };
  
  // Fundo branco
  ctx.fillStyle = cor.fundo;
  ctx.fillRect(0, 0, w, h);
  
  // Cabeçalho do gráfico
  ctx.fillStyle = cor.titulo;
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`Curva de Propulsão - ${sessao.nome}`, w/2, 40);
  
  ctx.fillStyle = cor.roxo;
  ctx.font = 'bold 20px Arial';
  const classificacao = metricasPropulsao.classificacaoMotor;
  ctx.fillText(`💥 Impulso: ${impulsoData.impulsoTotal.toFixed(2)} N⋅s | Classe ${classificacao.classe}`, w/2, 70);
  
  // Desenha o gráfico
  const gx = 120;  // X inicial do gráfico
  const gy = 100;  // Y inicial do gráfico
  const gw = w - 200;  // Largura do gráfico
  const gh = h - 200;  // Altura do gráfico
  
  // Caixa do gráfico
  ctx.fillStyle = cor.fundo2;
  ctx.fillRect(gx, gy, gw, gh);
  
  ctx.strokeStyle = cor.cinza;
  ctx.lineWidth = 2;
  ctx.strokeRect(gx, gy, gw, gh);
  
  // Valores e escalas
  const valores = dados.newtons;
  const tempos = dados.tempos;
  
  if (valores.length < 2) {
    ctx.fillStyle = cor.vermelho;
    ctx.font = '20px Arial';
    ctx.fillText('Dados insuficientes para gráfico', w/2, h/2);
    callback(canvas.toDataURL('image/png'));
    return;
  }
  
  const maxVal = Math.max(...valores);
  const minVal = Math.min(...valores, 0);
  const range = maxVal - minVal || 0.001;
  const padding = range * 0.1;
  
  const yMin = minVal - padding;
  const yMax = maxVal + padding;
  const yRange = yMax - yMin;
  
  // Grid horizontal
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  
  for (let i = 0; i <= 6; i++) {
    const y = gy + (gh/6) * i;
    const valor = yMax - (yRange/6) * i;
    
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx + gw, y);
    ctx.stroke();
    
    // Label Y
    ctx.fillStyle = cor.titulo;
    ctx.font = '14px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(valor.toFixed(1) + ' N', gx - 10, y + 5);
  }
  
  // Grid vertical (tempo)
  const numVerticalLines = 10;
  const maxTempo = Math.max(...tempos);
  for (let i = 0; i <= numVerticalLines; i++) {
    const x = gx + (gw / numVerticalLines) * i;
    const tempo = (maxTempo / numVerticalLines) * i;
    
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x, gy + gh);
    ctx.stroke();
    
    // Label X
    ctx.fillStyle = cor.titulo;
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(tempo.toFixed(2) + 's', x, gy + gh + 20);
  }
  
  ctx.setLineDash([]);
  
  // ÁREA SOB A CURVA (representa o impulso)
  if (valores.length > 1) {
    ctx.fillStyle = 'rgba(52, 152, 219, 0.3)';
    ctx.beginPath();
    
    const zeroY = gy + gh - ((0 - yMin) / yRange) * gh;
    ctx.moveTo(gx, zeroY);
    
    for (let i = 0; i < valores.length; i++) {
      const x = gx + (gw / (valores.length - 1)) * i;
      const valorPositivo = Math.max(0, valores[i]);
      const y = gy + gh - ((valorPositivo - yMin) / yRange) * gh;
      ctx.lineTo(x, y);
    }
    
    ctx.lineTo(gx + gw, zeroY);
    ctx.closePath();
    ctx.fill();
  }
  
  // LINHA DE FORÇA
  if (valores.length > 1) {
    ctx.strokeStyle = cor.azul;
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    for (let i = 0; i < valores.length; i++) {
      const x = gx + (gw / (valores.length - 1)) * i;
      const y = gy + gh - ((valores[i] - yMin) / yRange) * gh;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
  
  // LINHA DO ZERO
  if (yMin < 0 && yMax > 0) {
    const zeroY = gy + gh - ((0 - yMin) / yRange) * gh;
    ctx.strokeStyle = cor.cinza;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(gx, zeroY);
    ctx.lineTo(gx + gw, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  
  // PONTO DE FORÇA MÁXIMA
  const maxIndex = valores.indexOf(Math.max(...valores));
  if (maxIndex >= 0) {
    const x = gx + (gw / (valores.length - 1)) * maxIndex;
    const y = gy + gh - ((valores[maxIndex] - yMin) / yRange) * gh;
    
    ctx.fillStyle = cor.vermelho;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, 2 * Math.PI);
    ctx.fill();
    
    // Label do pico
    ctx.fillStyle = cor.vermelho;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Fmax: ${valores[maxIndex].toFixed(2)}N`, x, y - 15);
  }
  
  // MARCADORES DE IGNIÇÃO E BURNOUT
  // Ignição
  if (impulsoData.tempoIgnicao > 0) {
    const ignicaoIndex = tempos.findIndex(t => t >= impulsoData.tempoIgnicao);
    if (ignicaoIndex >= 0) {
      const x = gx + (gw / (valores.length - 1)) * ignicaoIndex;
      ctx.strokeStyle = cor.verde;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x, gy + gh);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = cor.verde;
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Ignição', x, gy - 5);
    }
  }
  
  // Burnout
  if (impulsoData.tempoBurnout > 0) {
    const burnoutIndex = tempos.findIndex(t => t >= impulsoData.tempoBurnout);
    if (burnoutIndex >= 0) {
      const x = gx + (gw / (valores.length - 1)) * burnoutIndex;
      ctx.strokeStyle = cor.laranja;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x, gy + gh);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = cor.laranja;
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Burnout', x, gy - 5);
    }
  }
  
  // LABELS DOS EIXOS
  ctx.fillStyle = cor.titulo;
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'center';
  
  // Eixo Y
  ctx.save();
  ctx.translate(30, gy + gh/2);
  ctx.rotate(-Math.PI/2);
  ctx.fillText('Força (N)', 0, 0);
  ctx.restore();
  
  // Eixo X
  ctx.fillText('Tempo (s)', gx + gw/2, gy + gh + 50);
  
  // LEGENDA
  const legX = gx + gw - 200;
  const legY = gy + 20;
  
  // Área = Impulso
  ctx.fillStyle = 'rgba(52, 152, 219, 0.3)';
  ctx.fillRect(legX, legY, 30, 20);
  ctx.strokeStyle = cor.azul;
  ctx.lineWidth = 2;
  ctx.strokeRect(legX, legY, 30, 20);
  
  ctx.fillStyle = cor.titulo;
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Área = Impulso', legX + 40, legY + 15);
  
  ctx.font = '12px Arial';
  ctx.fillStyle = cor.verde;
  ctx.fillText(`${impulsoData.impulsoTotal.toFixed(2)} N⋅s`, legX + 40, legY + 30);
  
  // Converte canvas para base64
  callback(canvas.toDataURL('image/png', 1.0));
}

/**
 * Gera HTML completo do relatório com gráfico embutido e todos os dados
 */
function gerarHTMLRelatorioCompleto(sessao, dados, impulsoData, metricasPropulsao, imagemGrafico) {
  const dataSessao = new Date(sessao.timestamp).toLocaleString('pt-BR');
  const classificacao = metricasPropulsao.classificacaoMotor;
  
  // Gera linhas da tabela com TODOS os dados
  let linhasTabela = '';
  sessao.dadosTabela.forEach((dado, index) => {
    const tempo = parseFloat(dado.tempo_esp) || 0;
    const newtons = parseFloat(dado.newtons) || 0;
    const gramaForca = parseFloat(dado.grama_forca) || 0;
    const quiloForca = parseFloat(dado.quilo_forca) || 0;
    
    linhasTabela += `
      <tr>
        <td>${index + 1}</td>
        <td>${tempo.toFixed(3)}</td>
        <td>${newtons.toFixed(4)}</td>
        <td>${gramaForca.toFixed(2)}</td>
        <td>${quiloForca.toFixed(6)}</td>
      </tr>
    `;
  });
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Relatório - ${sessao.nome}</title>
  <style>
    @media print {
      @page {
        size: A4;
        margin: 12mm;
      }
      body {
        margin: 0;
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
      .page-break {
        page-break-before: always;
      }
      .avoid-break {
        page-break-inside: avoid;
      }
    }
    
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #2c3e50;
      max-width: 210mm;
      margin: 0 auto;
      padding: 15px;
      background: white;
    }
    
    .header {
      text-align: center;
      border-bottom: 3px solid #3498db;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    
    .header h1 {
      color: #2c3e50;
      margin: 10px 0;
      font-size: 26px;
    }
    
    .header .subtitle {
      color: #7f8c8d;
      font-size: 13px;
      margin: 5px 0;
    }
    
    .impulso-destaque {
      background: linear-gradient(135deg, ${classificacao.cor || '#667eea'} 0%, #764ba2 100%);
      color: white;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
      margin: 15px 0;
      box-shadow: 0 3px 5px rgba(0,0,0,0.1);
    }
    
    .impulso-destaque h2 {
      margin: 0 0 8px 0;
      font-size: 28px;
    }
    
    .impulso-destaque .classe {
      font-size: 20px;
      font-weight: bold;
      background: rgba(255,255,255,0.2);
      padding: 8px 15px;
      border-radius: 5px;
      display: inline-block;
      margin-top: 8px;
    }
    
    .metricas-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin: 15px 0;
    }
    
    .metrica-card {
      background: #f8f9fa;
      padding: 12px;
      border-radius: 6px;
      border-left: 4px solid #3498db;
    }
    
    .metrica-card h3 {
      margin: 0 0 5px 0;
      font-size: 12px;
      color: #7f8c8d;
      text-transform: uppercase;
    }
    
    .metrica-card .valor {
      font-size: 20px;
      font-weight: bold;
      color: #2c3e50;
    }
    
    .metrica-card .unidade {
      font-size: 12px;
      color: #7f8c8d;
    }
    
    .secao {
      margin: 20px 0;
    }
    
    .secao h2 {
      color: #2c3e50;
      border-bottom: 2px solid #3498db;
      padding-bottom: 8px;
      margin-bottom: 12px;
      font-size: 18px;
    }
    
    .grafico-container {
      text-align: center;
      margin: 15px 0;
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
    }
    
    .grafico-container img {
      max-width: 100%;
      height: auto;
      border: 1px solid #dee2e6;
      border-radius: 5px;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 10px;
    }
    
    th, td {
      padding: 6px;
      text-align: left;
      border-bottom: 1px solid #dee2e6;
    }
    
    th {
      background: #3498db;
      color: white;
      font-weight: bold;
      font-size: 10px;
    }
    
    tr:nth-child(even) {
      background: #f8f9fa;
    }
    
    tr:hover {
      background: #e9ecef;
    }
    
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 2px solid #dee2e6;
      text-align: center;
      color: #7f8c8d;
      font-size: 11px;
    }
    
    .classificacao-info {
      background: ${classificacao.cor}20;
      border: 2px solid ${classificacao.cor};
      padding: 12px;
      border-radius: 6px;
      margin: 12px 0;
    }
    
    .classificacao-info h3 {
      margin: 0 0 8px 0;
      color: ${classificacao.cor};
      font-size: 16px;
    }
    
    .btn-print {
      background: #3498db;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      font-size: 14px;
      cursor: pointer;
      margin: 15px 5px;
    }
    
    .btn-print:hover {
      background: #2980b9;
    }
    
    .btn-close {
      background: #95a5a6;
    }
    
    .btn-close:hover {
      background: #7f8c8d;
    }
    
    .info-box {
      background: #e3f2fd;
      border-left: 4px solid #2196f3;
      padding: 10px;
      margin: 10px 0;
      border-radius: 4px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <!-- Botões de controle (ocultos na impressão) -->
  <div class="no-print" style="text-align: center; margin-bottom: 15px;">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar como PDF</button>
    <button class="btn-print btn-close" onclick="window.close()">❌ Fechar</button>
  </div>

  <!-- CABEÇALHO -->
  <div class="header avoid-break">
    <h1>🚀 GFIG - RELATÓRIO DE TESTE ESTÁTICO</h1>
    <div class="subtitle">Projeto de Foguetes de Modelismo Experimental - Campus Gaspar</div>
    <h2 style="color: #3498db; margin: 12px 0;">${sessao.nome}</h2>
    <div class="subtitle">Teste realizado em: ${dataSessao}</div>
    <div class="subtitle">${sessao.dadosTabela.length} leituras coletadas • Taxa: ${(sessao.dadosTabela.length / dados.duracao).toFixed(0)} Hz</div>
  </div>

  <!-- IMPULSO EM DESTAQUE -->
  <div class="impulso-destaque avoid-break">
    <h2>💥 ${impulsoData.impulsoTotal.toFixed(2)} N⋅s</h2>
    <div>Impulso Total Positivo</div>
    <div class="classe">Motor Classe ${classificacao.classe}</div>
    <div style="margin-top: 8px; font-size: 13px;">
      ${classificacao.tipo} • ${classificacao.nivel}
    </div>
  </div>

  <!-- CLASSIFICAÇÃO -->
  <div class="classificacao-info avoid-break">
    <h3>📊 Classificação do Motor</h3>
    <table style="margin: 0; font-size: 12px;">
      <tr>
        <td><strong>Classe:</strong></td>
        <td>${classificacao.classe}</td>
        <td><strong>Tipo:</strong></td>
        <td>${classificacao.tipo}</td>
      </tr>
      <tr>
        <td><strong>Nível:</strong></td>
        <td>${classificacao.nivel}</td>
        <td><strong>Faixa:</strong></td>
        <td>${classificacao.faixa}</td>
      </tr>
    </table>
  </div>

  <!-- MÉTRICAS PRINCIPAIS -->
  <div class="secao avoid-break">
    <h2>📈 Métricas de Desempenho</h2>
    <div class="metricas-grid">
      <div class="metrica-card">
        <h3>Impulso Total</h3>
        <div class="valor">${impulsoData.impulsoTotal.toFixed(2)}</div>
        <div class="unidade">N⋅s</div>
      </div>
      <div class="metrica-card">
        <h3>Força Máxima</h3>
        <div class="valor">${impulsoData.forcaMaxima.toFixed(2)}</div>
        <div class="unidade">N</div>
      </div>
      <div class="metrica-card">
        <h3>Duração da Queima</h3>
        <div class="valor">${impulsoData.duracaoQueima.toFixed(3)}</div>
        <div class="unidade">segundos</div>
      </div>
      <div class="metrica-card">
        <h3>Força Média (Queima)</h3>
        <div class="valor">${(impulsoData.duracaoQueima > 0 ? impulsoData.impulsoTotal / impulsoData.duracaoQueima : 0).toFixed(2)}</div>
        <div class="unidade">N</div>
      </div>
      <div class="metrica-card">
        <h3>Tempo de Ignição</h3>
        <div class="valor">${impulsoData.tempoIgnicao.toFixed(3)}</div>
        <div class="unidade">segundos</div>
      </div>
      <div class="metrica-card">
        <h3>Tempo de Burnout</h3>
        <div class="valor">${impulsoData.tempoBurnout.toFixed(3)}</div>
        <div class="unidade">segundos</div>
      </div>
      <div class="metrica-card">
        <h3>Eficiência da Queima</h3>
        <div class="valor">${metricasPropulsao.eficienciaQueima.toFixed(1)}</div>
        <div class="unidade">%</div>
      </div>
      <div class="metrica-card">
        <h3>Impulso Líquido</h3>
        <div class="valor">${impulsoData.impulsoLiquido.toFixed(2)}</div>
        <div class="unidade">N⋅s</div>
      </div>
    </div>
  </div>

  <!-- GRÁFICO -->
  <div class="page-break"></div>
  <div class="secao">
    <h2>📉 Curva de Propulsão</h2>
    <div class="grafico-container">
      <img src="${imagemGrafico}" alt="Gráfico de Propulsão" />
    </div>
    <div class="info-box">
      <strong>Legenda:</strong> A área sob a curva (preenchimento azul) representa o impulso total do motor. 
      O ponto vermelho marca a força máxima atingida. As linhas tracejadas indicam ignição (verde) e burnout (laranja).
    </div>
  </div>

  <!-- ANÁLISE DETALHADA -->
  <div class="secao avoid-break">
    <h2>🔍 Análise Detalhada</h2>
    <table style="font-size: 11px;">
      <tr>
        <td><strong>Parâmetro</strong></td>
        <td><strong>Valor</strong></td>
        <td><strong>Parâmetro</strong></td>
        <td><strong>Valor</strong></td>
      </tr>
      <tr>
        <td>Impulso Positivo</td>
        <td>${impulsoData.impulsoPositivo.toFixed(3)} N⋅s</td>
        <td>Área Negativa</td>
        <td>${impulsoData.areaNegativa.toFixed(3)} N⋅s</td>
      </tr>
      <tr>
        <td>Força Média (Amostral)</td>
        <td>${impulsoData.forcaMedia.toFixed(2)} N</td>
        <td>Força Média (Positiva)</td>
        <td>${impulsoData.forcaMediaPositiva.toFixed(2)} N</td>
      </tr>
      <tr>
        <td>Duração Total</td>
        <td>${dados.duracao.toFixed(3)} s</td>
        <td>Número de Leituras</td>
        <td>${sessao.dadosTabela.length}</td>
      </tr>
      <tr>
        <td>Classificação NAR/TRA</td>
        <td>${classificacao.classe}</td>
        <td>Cor de Identificação</td>
        <td><span style="background: ${classificacao.cor}; color: white; padding: 2px 8px; border-radius: 3px;">${classificacao.cor}</span></td>
      </tr>
    </table>
  </div>

  <!-- TABELA COMPLETA DE DADOS -->
  <div class="page-break"></div>
  <div class="secao">
    <h2>📋 Tabela Completa de Dados (${sessao.dadosTabela.length} leituras)</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Tempo (s)</th>
          <th>Força (N)</th>
          <th>Força (gf)</th>
          <th>Força (kgf)</th>
        </tr>
      </thead>
      <tbody>
        ${linhasTabela}
      </tbody>
    </table>
  </div>

  <!-- INFORMAÇÕES TÉCNICAS -->
  <div class="secao avoid-break">
    <h2>⚙️ Informações do Sistema</h2>
    <table style="font-size: 11px;">
      <tr>
        <td><strong>Sistema de Aquisição:</strong></td>
        <td>Balança GFIG Wi-Fi v2.0</td>
      </tr>
      <tr>
        <td><strong>Resolução:</strong></td>
        <td>0.001 N</td>
      </tr>
      <tr>
        <td><strong>Gravidade Local:</strong></td>
        <td>9.80665 m/s²</td>
      </tr>
      <tr>
        <td><strong>Taxa de Amostragem:</strong></td>
        <td>${(sessao.dadosTabela.length / dados.duracao).toFixed(1)} Hz</td>
      </tr>
      <tr>
        <td><strong>Classificação:</strong></td>
        <td>NAR/TRA Standards</td>
      </tr>
      <tr>
        <td><strong>Normas de Referência:</strong></td>
        <td>NFPA 1122, NFPA 1127</td>
      </tr>
    </table>
  </div>

  <!-- RODAPÉ -->
  <div class="footer">
    <p><strong>Relatório gerado automaticamente pelo Sistema GFIG</strong></p>
    <p>Projeto de Foguetes de Modelismo Experimental - Campus Gaspar - IFC</p>
    <p>© 2025 GFIG - Todos os direitos reservados</p>
    <p>Data de geração: ${new Date().toLocaleString('pt-BR')}</p>
  </div>

</body>
</html>
  `;
}
// --- Variáveis Globais da UI (mantidas as originais) ---
let chart;
let dataWorker;
const MAX_DATA_POINTS = 60;
let chartMode = 'deslizante';
let displayUnit = 'kgf';
let maxForceInN = -Infinity;
let minForceInN = Infinity;
let chartData = { labels: [], series: [[]] };
let rawDataN = [];
let connectionTimeout;
let antiNoisingAtivo = false;
let isSessionActive = false;

let noiseBuffer = [];
const NOISE_BUFFER_SIZE = 50;
let currentStdDev = 0;
let noiseMean = 0;
let antiNoisingMultiplier = 2.0;
let isStabilityMode = false;

// === NOVAS VARIÁVEIS PARA MELHORIAS ===
let avisosAudioAtivados = false;
let audioContext = null;
let ultimoStatusEstabilizacao = true;
let contadorFalhasEstabilizacao = 0;

// --- NOVAS VARIÁVEIS PARA MELHORIAS (sem quebrar compatibilidade) ---
let showDataLabels = false; // Começa desabilitado para não afetar performance
let showPeaks = true;
let showGrid = true;
let isZoomed = false;
let originalChartData = null;
let peakThreshold = 0.15; // 15% da variação para detectar picos

// --- Funções de Inicialização (MODIFICADA para manter compatibilidade) ---
window.onload = () => {
  abrirAba(document.getElementById("padrao"), 'abaGrafico');
  
  // Inicializa o gráfico com melhorias, mas mantendo a estrutura original
  initializeEnhancedChart();
  
  setDisplayUnit('kgf');
  setChartMode('deslizante');
  //carregarGravacoes();
   carregarGravacoesComImpulso();
  conectarWorker();
  setInterval(updateReadingsPerSecond, 1000);
  
  // Adiciona controles melhorados se existir o container
  addEnhancedControls();
   // NOVA LINHA: Adiciona controles de ruído
  setTimeout(addNoiseControlsToUI, 500);
  
  // === NOVO: Inicializa contexto de áudio ===
  inicializarAudioContext();
  
  // === NOVO: Configura atalhos de teclado ===
  setupKeyboardShortcuts();
};

// --- INICIALIZAÇÃO MELHORADA (mas compatível) ---
function initializeEnhancedChart() {
  const chartOptions = {
    showPoint: true,
    lineSmooth: Chartist.Interpolation.cardinal({ tension: 0.2 }),
    axisX: { 
      showGrid: showGrid, 
      showLabel: true,
      labelInterpolationFnc: (value) => value + "s"
    },
    axisY: { 
      showGrid: showGrid, 
      showLabel: true,
      labelInterpolationFnc: (value) => {
        const formatted = formatForce(value, displayUnit);
        return formatted + displayUnit;
      }
    },
    fullWidth: true,
    chartPadding: { right: 50, left: 20, top: 20, bottom: 20 }
  };

  chart = new Chartist.Line('#grafico', chartData, chartOptions);
  
  // Adiciona melhorias visuais
  chart.on('draw', function(data) {
    if (data.type === 'line') {
      // Melhora a aparência da linha
      data.element.attr({
        style: 'stroke-width: 2.5px; stroke: #3498db;'
      });
    }
    
    if (data.type === 'point') {
      // Destaca picos se habilitado
      if (showPeaks && isPeak(data.value.y, data.index)) {
        data.element.attr({
          style: 'stroke: #e74c3c; stroke-width: 6px; fill: #e74c3c;'
        });
      } else {
        data.element.attr({
          style: 'stroke: #3498db; stroke-width: 3px; fill: #3498db;'
        });
      }
      
      // Adiciona interatividade (tooltip simples)
      data.element._node.addEventListener('mouseenter', function() {
        showSimpleTooltip(data.x, data.y, data.value.y, data.value.x);
      });
      
      data.element._node.addEventListener('mouseleave', function() {
        hideSimpleTooltip();
      });
      
      // Adiciona valores nos pontos se habilitado
      if (showDataLabels && data.index % 3 === 0) { // Mostra a cada 3 pontos para não poluir
        const svg = data.group._node.ownerSVGElement;
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", data.x);
        text.setAttribute("y", data.y - 15);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", "10px");
        text.setAttribute("fill", "#2c3e50");
        text.setAttribute("font-weight", "bold");
        text.textContent = formatForce(data.value.y, displayUnit);
        svg.appendChild(text);
      }
    }
  });
}

// --- FUNÇÃO DE DETECÇÃO DE PICOS (nova) ---
function isPeak(value, index) {
  if (chartData.series[0].length < 3 || index < 1 || index >= chartData.series[0].length - 1) {
    return false;
  }
  
  const data = chartData.series[0];
  const prevValue = data[index - 1];
  const nextValue = data[index + 1];
  
  // Calcula a faixa de variação
  const maxVal = Math.max(...data);
  const minVal = Math.min(...data);
  const range = maxVal - minVal;
  
  if (range === 0) return false;
  
  const threshold = range * peakThreshold;
  
  // Verifica se é um pico (máximo local) ou vale (mínimo local) significativo
  const isPeakPoint = value > prevValue && value > nextValue && 
                      (value - Math.min(prevValue, nextValue)) > threshold;
  const isValleyPoint = value < prevValue && value < nextValue && 
                        (Math.max(prevValue, nextValue) - value) > threshold;
  
  return isPeakPoint || isValleyPoint;
}

// --- TOOLTIP SIMPLES (nova funcionalidade) ---
function showSimpleTooltip(x, y, value, time) {
  let tooltip = document.getElementById('simple-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'simple-tooltip';
    tooltip.style.cssText = `
      position: absolute;
      background: rgba(44, 62, 80, 0.95);
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: bold;
      pointer-events: none;
      z-index: 1000;
      display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      border: 1px solid #3498db;
    `;
    document.body.appendChild(tooltip);
  }
  
  tooltip.innerHTML = `
    <div>⏱️ ${time}s</div>
    <div>⚖️ ${formatForce(value, displayUnit)} ${displayUnit}</div>
  `;
  
  const rect = document.getElementById('grafico').getBoundingClientRect();
  tooltip.style.left = (rect.left + x + 15) + 'px';
  tooltip.style.top = (rect.top + y - 45) + 'px';
  tooltip.style.display = 'block';
}

function hideSimpleTooltip() {
  const tooltip = document.getElementById('simple-tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

// --- CONTROLES MELHORADOS (adicionados dinamicamente) ---
function addEnhancedControls() {
  // Procura por um container de controles existente ou cria um
  let controlsContainer = document.getElementById('chart-enhanced-controls');
  if (!controlsContainer) {
    // Procura onde inserir os controles
    const graficoElement = document.getElementById('grafico');
    if (graficoElement && graficoElement.parentNode) {
      controlsContainer = document.createElement('div');
      controlsContainer.id = 'chart-enhanced-controls';
      controlsContainer.style.cssText = `
        display: flex;
        gap: 10px;
        margin: 15px 0;
        flex-wrap: wrap;
        align-items: center;
        padding: 10px;
        background: #f8f9fa;
        border-radius: 6px;
        border: 1px solid #dee2e6;
      `;
      graficoElement.parentNode.insertBefore(controlsContainer, graficoElement);
    } else {
      return; // Não consegue adicionar controles
    }
  }
  
  // Limpa controles existentes
  controlsContainer.innerHTML = '';
  
  // Adiciona controles melhorados
  const controls = [
    {
      text: showDataLabels ? '🏷️ Labels: ON' : '🏷️ Labels: OFF',
      onclick: 'toggleDataLabels()',
      class: showDataLabels ? 'enhanced-btn enhanced-btn-active' : 'enhanced-btn'
    },
    {
      text: showPeaks ? '📈 Picos: ON' : '📈 Picos: OFF',
      onclick: 'togglePeaks()',
      class: showPeaks ? 'enhanced-btn enhanced-btn-active' : 'enhanced-btn'
    },
    {
      text: showGrid ? '⊞ Grid: ON' : '⊞ Grid: OFF',
      onclick: 'toggleGrid()',
      class: showGrid ? 'enhanced-btn enhanced-btn-active' : 'enhanced-btn'
    },
    {
      text: isZoomed ? '🔍 Zoom: ON' : '🔍 Zoom: OFF',
      onclick: 'toggleZoom()',
      class: isZoomed ? 'enhanced-btn enhanced-btn-zoom' : 'enhanced-btn'
    },
    {
     text: '🚀 Impulso',
      onclick: 'mostrarImpulsoAtual()',
    class: 'enhanced-btn enhanced-btn-info'
    },
    {
      text: '📊 Stats',
      onclick: 'showEnhancedStatistics()',
      class: 'enhanced-btn enhanced-btn-info'
    },
    {
      text: '💾 Export PNG',
      onclick: 'exportChartAsPNG()',
      class: 'enhanced-btn enhanced-btn-success'
    }
  ];
  
  controls.forEach(control => {
    const button = document.createElement('button');
    button.innerHTML = control.text;
    button.setAttribute('onclick', control.onclick);
    button.className = control.class;
    controlsContainer.appendChild(button);
  });
  
  // Adiciona estilos CSS se ainda não existem
  addEnhancedCSS();
}

// --- ESTILOS CSS PARA OS CONTROLES MELHORADOS ---
function addEnhancedCSS() {
  if (document.getElementById('enhanced-chart-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'enhanced-chart-styles';
  style.textContent = `
    .enhanced-btn {
      background: #3498db;
      color: white;
      border: none;
      padding: 8px 15px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 12px;
      font-weight: bold;
      transition: all 0.3s ease;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .enhanced-btn:hover {
      background: #2980b9;
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.15);
    }
    .enhanced-btn-active {
      background: #27ae60 !important;
    }
    .enhanced-btn-zoom {
      background: #f39c12 !important;
    }
    .enhanced-btn-info {
      background: #9b59b6;
    }
    .enhanced-btn-success {
      background: #27ae60;
    }
    .enhanced-btn:active {
      transform: translateY(0);
    }
  `;
  document.head.appendChild(style);
}

// --- FUNÇÕES DE TOGGLE MELHORADAS ---
function toggleDataLabels() {
  showDataLabels = !showDataLabels;
  recreateChart();
  showNotification('info', `Labels nos pontos ${showDataLabels ? 'ativados' : 'desativados'}`);
  addEnhancedControls(); // Atualiza os botões
}

function togglePeaks() {
  showPeaks = !showPeaks;
  recreateChart();
  showNotification('info', `Destaque de picos ${showPeaks ? 'ativado' : 'desativado'}`);
  addEnhancedControls();
}

function toggleGrid() {
  showGrid = !showGrid;
  recreateChart();
  showNotification('info', `Grid ${showGrid ? 'ativado' : 'desativado'}`);
  addEnhancedControls();
}

function toggleZoom() {
  if (!isZoomed) {
    // Aplica zoom nos últimos 20 pontos (10 segundos a 200ms)
    originalChartData = JSON.parse(JSON.stringify(chartData));
    const zoomPoints = Math.min(20, chartData.labels.length);
    
    if (zoomPoints > 0) {
      chartData.labels = chartData.labels.slice(-zoomPoints);
      chartData.series[0] = chartData.series[0].slice(-zoomPoints);
      rawDataN = rawDataN.slice(-zoomPoints);
    }
    
    isZoomed = true;
    showNotification('info', 'Zoom aplicado - últimos 10 segundos');
  } else {
    // Remove zoom
    if (originalChartData) {
      chartData = originalChartData;
      // Reconstrói rawDataN baseado nos dados restaurados
      rawDataN = chartData.series[0].map(value => value / getDisplayUnitFactor(displayUnit));
      originalChartData = null;
    }
    isZoomed = false;
    showNotification('info', 'Zoom removido');
  }
  
  chart.update(chartData);
  addEnhancedControls();
}

function getDisplayUnitFactor(unit) {
  const g_force_conversion = 101.9716;
  if (unit === 'gf') return g_force_conversion;
  if (unit === 'kgf') return g_force_conversion / 1000;
  return 1; // N
}

function recreateChart() {
  document.getElementById('grafico').innerHTML = '';
  initializeEnhancedChart();
  chart.update(chartData);
}

// --- ESTATÍSTICAS MELHORADAS ---
function showEnhancedStatistics() {
  if (chartData.series[0].length === 0) {
    showNotification('info', 'Sem dados para calcular estatísticas');
    return;
  }
  
  const data = chartData.series[0];
  const n = data.length;
  
  // Cálculos estatísticos
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const sorted = [...data].sort((a, b) => a - b);
  const median = n % 2 === 0 ? (sorted[n/2 - 1] + sorted[n/2]) / 2 : sorted[Math.floor(n/2)];
  const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  const cv = (stdDev / mean) * 100;
  const min = Math.min(...data);
  const max = Math.max(...data);
  
  const statsText = `
📊 ESTATÍSTICAS (${n} pontos):
📏 Média: ${formatForce(mean, displayUnit)} ${displayUnit}
📍 Mediana: ${formatForce(median, displayUnit)} ${displayUnit}
📉 Mínimo: ${formatForce(min, displayUnit)} ${displayUnit}
📈 Máximo: ${formatForce(max, displayUnit)} ${displayUnit}
📊 Desvio: ${formatForce(stdDev, displayUnit)} ${displayUnit}
📋 CV: ${cv.toFixed(2)}%
  `;
  
  showNotification('info', statsText, 10000);
}

// --- EXPORTAÇÃO DE PNG MELHORADA ---

// --- FUNÇÃO DE EXPORTAÇÃO PNG COMPLETAMENTE CORRIGIDA ---
function exportChartAsPNG() {
  const svg = document.querySelector('#grafico svg');
  if (!svg) {
    showNotification('error', 'Nenhum gráfico para exportar');
    return;
  }
  
  try {
    // Método 1: Usar html2canvas se disponível
    if (typeof html2canvas !== 'undefined') {
      exportWithHtml2Canvas();
      return;
    }
    
    // Método 2: Conversão SVG manual (mais compatível)
    exportSVGManually();
    
  } catch (e) {
    console.error('Erro na exportação:', e);
    // Método 3: Fallback - criar gráfico simples no canvas
    exportFallbackChart();
  }
}

// Método 1: Usando html2canvas (se disponível)
function exportWithHtml2Canvas() {
  const graficoContainer = document.getElementById('grafico');
  
  html2canvas(graficoContainer, {
    backgroundColor: '#ffffff',
    scale: 2,
    logging: false,
    useCORS: true
  }).then(canvas => {
    // Adiciona informações extras
    const finalCanvas = addChartInfo(canvas);
    downloadCanvas(finalCanvas, 'grafico_balanca_html2canvas.png');
    showNotification('success', 'Gráfico exportado com sucesso!');
  }).catch(error => {
    console.error('Erro html2canvas:', error);
    exportSVGManually();
  });
}

// Método 2: Conversão SVG manual (mais compatível)
function exportSVGManually() {
  const svg = document.querySelector('#grafico svg');
  const svgRect = svg.getBoundingClientRect();
  
  // Cria canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Define dimensões
  canvas.width = 1200;
  canvas.height = 800;
  
  // Fundo branco
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Adiciona título e informações
  addCanvasHeader(ctx, canvas.width, canvas.height);
  
  // Clona o SVG e limpa estilos problemáticos
  const svgClone = svg.cloneNode(true);
  cleanSVGForExport(svgClone);
  
  // Converte SVG para string
  const svgString = new XMLSerializer().serializeToString(svgClone);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  
  const img = new Image();
  img.onload = function() {
    try {
      // Desenha o gráfico
      const graphY = 120;
      const graphHeight = canvas.height - 200;
      ctx.drawImage(img, 100, graphY, canvas.width - 200, graphHeight);
      
      // Adiciona dados estatísticos
      addCanvasStats(ctx, canvas.width, canvas.height);
      
      // Download
      downloadCanvas(canvas, 'grafico_balanca_svg.png');
      showNotification('success', 'Gráfico exportado com sucesso!');
      
    } catch (e) {
      console.error('Erro ao desenhar SVG:', e);
      exportFallbackChart();
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  
  img.onerror = function() {
    console.error('Erro ao carregar SVG como imagem');
    URL.revokeObjectURL(url);
    exportFallbackChart();
  };
  
  img.src = url;
}

// Método 3: Fallback - criar gráfico simples no canvas
function exportFallbackChart() {
  if (chartData.series[0].length === 0) {
    showNotification('error', 'Sem dados para exportar');
    return;
  }
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Dimensões
  canvas.width = 1200;
  canvas.height = 800;
  
  // Fundo branco
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Adiciona cabeçalho
  addCanvasHeader(ctx, canvas.width, canvas.height);
  
  // Desenha o gráfico manualmente
  drawFallbackChart(ctx, canvas.width, canvas.height);
  
  // Adiciona estatísticas
  addCanvasStats(ctx, canvas.width, canvas.height);
  
  // Download
  downloadCanvas(canvas, 'grafico_balanca_fallback.png');
  showNotification('success', 'Gráfico exportado com sucesso (modo compatibilidade)!');
}

// Função para limpar SVG antes da exportação
function cleanSVGForExport(svgElement) {
  // Remove estilos CSS externos que podem causar problemas
  svgElement.removeAttribute('class');
  
  // Define estilos inline para elementos importantes
  const lines = svgElement.querySelectorAll('.ct-line');
  lines.forEach(line => {
    line.setAttribute('stroke', '#3498db');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('fill', 'none');
  });
  
  const points = svgElement.querySelectorAll('.ct-point');
  points.forEach(point => {
    point.setAttribute('stroke', '#3498db');
    point.setAttribute('stroke-width', '3');
    point.setAttribute('fill', '#3498db');
  });
  
  const grids = svgElement.querySelectorAll('.ct-grid');
  grids.forEach(grid => {
    grid.setAttribute('stroke', '#bdc3c7');
    grid.setAttribute('stroke-width', '1');
    grid.setAttribute('stroke-dasharray', '2,2');
  });
  
  const labels = svgElement.querySelectorAll('.ct-label');
  labels.forEach(label => {
    label.setAttribute('fill', '#2c3e50');
    label.setAttribute('font-family', 'Arial, sans-serif');
    label.setAttribute('font-size', '12px');
  });
  
  // Remove textos de tooltip que podem ter ficado
  const tooltips = svgElement.querySelectorAll('text');
  tooltips.forEach(text => {
    if (text.textContent && text.textContent.includes('Tempo:')) {
      text.remove();
    }
  });
}

// Função para adicionar cabeçalho ao canvas
function addCanvasHeader(ctx, width, height) {
  // Título principal
  ctx.fillStyle = '#2c3e50';
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Gráfico de Força - Balança Digital', width / 2, 40);
  
  // Subtítulo com informações
  ctx.font = '16px Arial';
  ctx.fillStyle = '#7f8c8d';
  const info = `Unidade: ${displayUnit} | Modo: ${chartMode} | Pontos: ${chartData.series[0].length}`;
  ctx.fillText(info, width / 2, 70);
  
  // Data e hora
  ctx.font = '14px Arial';
  ctx.textAlign = 'right';
  ctx.fillText(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, width - 50, height - 30);
  
  // Reset align
  ctx.textAlign = 'left';
}

// Função para adicionar estatísticas ao canvas
function addCanvasStats(ctx, width, height) {
  if (chartData.series[0].length === 0) return;
  
  const data = chartData.series[0];
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const max = Math.max(...data);
  const min = Math.min(...data);
  
  // Caixa de estatísticas
  const statsX = 50;
  const statsY = height - 120;
  const statsWidth = 300;
  const statsHeight = 80;
  
  // Fundo da caixa
  ctx.fillStyle = 'rgba(52, 152, 219, 0.1)';
  ctx.fillRect(statsX, statsY, statsWidth, statsHeight);
  
  // Borda da caixa
  ctx.strokeStyle = '#3498db';
  ctx.lineWidth = 2;
  ctx.strokeRect(statsX, statsY, statsWidth, statsHeight);
  
  // Texto das estatísticas
  ctx.fillStyle = '#2c3e50';
  ctx.font = 'bold 14px Arial';
  ctx.fillText('ESTATÍSTICAS:', statsX + 10, statsY + 20);
  
  ctx.font = '12px Arial';
  ctx.fillText(`Média: ${formatForce(mean, displayUnit)} ${displayUnit}`, statsX + 10, statsY + 40);
  ctx.fillText(`Máximo: ${formatForce(max, displayUnit)} ${displayUnit}`, statsX + 10, statsY + 55);
  ctx.fillText(`Mínimo: ${formatForce(min, displayUnit)} ${displayUnit}`, statsX + 10, statsY + 70);
}

// Função para desenhar gráfico fallback
function drawFallbackChart(ctx, width, height) {
  if (chartData.series[0].length === 0) return;
  
  const data = chartData.series[0];
  const labels = chartData.labels;
  
  // Área do gráfico
  const graphX = 100;
  const graphY = 120;
  const graphWidth = width - 200;
  const graphHeight = height - 250;
  
  // Fundo do gráfico
  ctx.fillStyle = '#f8f9fa';
  ctx.fillRect(graphX, graphY, graphWidth, graphHeight);
  
  // Borda do gráfico
  ctx.strokeStyle = '#dee2e6';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  
  for (let i = 0; i <= 5; i++) {
    const y = graphY + (graphHeight / 5) * i;
    ctx.beginPath();
    ctx.moveTo(graphX, y);
    ctx.lineTo(graphX + graphWidth, y);
    ctx.stroke();
    
    // Labels do eixo Y
    const value = maxValue + padding - (range + 2 * padding) * (i / 5);
    ctx.fillStyle = '#6c757d';
    ctx.font = '11px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(formatForce(value, displayUnit), graphX - 10, y + 4);
  }
  
  // Grid vertical
  const gridStep = Math.max(1, Math.floor(data.length / 10));
  for (let i = 0; i < data.length; i += gridStep) {
    const x = graphX + scaleX * i;
    ctx.beginPath();
    ctx.moveTo(x, graphY);
    ctx.lineTo(x, graphY + graphHeight);
    ctx.stroke();
    
    // Labels do eixo X
    ctx.fillStyle = '#6c757d';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i] + 's', x, graphY + graphHeight + 20);
  }
  
  ctx.setLineDash([]); // Remove dash
  
  // Desenha a linha dos dados
  ctx.strokeStyle = '#3498db';
  ctx.lineWidth = 3;
  ctx.beginPath();
  
  for (let i = 0; i < data.length; i++) {
    const x = graphX + scaleX * i;
    const y = graphY + graphHeight - (data[i] - minValue + padding) * scaleY;
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  
  // Desenha pontos
  ctx.fillStyle = '#3498db';
  for (let i = 0; i < data.length; i++) {
    const x = graphX + scaleX * i;
    const y = graphY + graphHeight - (data[i] - minValue + padding) * scaleY;
    
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fill();
    
    // Destaca picos se habilitado
    if (showPeaks && isPeak(data[i], i)) {
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#3498db';
    }
  }
  
  // Labels dos eixos
  ctx.fillStyle = '#2c3e50';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`Força (${displayUnit})`, graphX - 60, graphY + graphHeight / 2);
  ctx.fillText('Tempo (s)', graphX + graphWidth / 2, graphY + graphHeight + 50);
}

// Função para adicionar informações ao canvas existente
function addChartInfo(originalCanvas) {
  const newCanvas = document.createElement('canvas');
  const ctx = newCanvas.getContext('2d');
  
  // Dimensões expandidas
  newCanvas.width = originalCanvas.width;
  newCanvas.height = originalCanvas.height + 100;
  
  // Fundo branco
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);
  
  // Título
  ctx.fillStyle = '#2c3e50';
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Gráfico de Força - Balança Digital', newCanvas.width / 2, 30);
  
  // Informações
  ctx.font = '14px Arial';
  ctx.fillStyle = '#7f8c8d';
  const info = `Unidade: ${displayUnit} | Modo: ${chartMode} | Pontos: ${chartData.series[0].length}`;
  ctx.fillText(info, newCanvas.width / 2, 50);
  
  // Desenha o gráfico original
  ctx.drawImage(originalCanvas, 0, 70);
  
  // Data
  ctx.font = '12px Arial';
  ctx.textAlign = 'right';
  ctx.fillText(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, newCanvas.width - 20, newCanvas.height - 10);
  
  return newCanvas;
}

// Função para fazer download do canvas
function downloadCanvas(canvas, filename) {
  try {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png', 1.0);
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
  } catch (e) {
    console.error('Erro no download:', e);
    showNotification('error', 'Erro ao fazer download da imagem');
  }
}

// Função alternativa usando o Chartist para recriar o gráfico
function exportChartUsingChartist() {
  try {
    // Cria um container temporário
    const tempContainer = document.createElement('div');
    tempContainer.style.cssText = `
      position: absolute;
      top: -9999px;
      left: -9999px;
      width: 800px;
      height: 400px;
      background: white;
    `;
    document.body.appendChild(tempContainer);
    
    // Cria gráfico temporário para exportação
    const exportChart = new Chartist.Line(tempContainer, chartData, {
      showPoint: true,
      lineSmooth: Chartist.Interpolation.cardinal({ tension: 0.2 }),
      axisX: { 
        showGrid: true, 
        showLabel: true,
        labelInterpolationFnc: (value) => value + "s"
      },
      axisY: { 
        showGrid: true, 
        showLabel: true,
        labelInterpolationFnc: (value) => formatForce(value, displayUnit) + displayUnit
      },
      fullWidth: true,
      chartPadding: { right: 50, left: 50, top: 20, bottom: 40 }
    });
    
    exportChart.on('created', function() {
      setTimeout(() => {
        const svg = tempContainer.querySelector('svg');
        if (svg) {
          cleanSVGForExport(svg);
          
          // Converte para canvas
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = 1200;
          canvas.height = 800;
          
          // Fundo branco
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Adiciona cabeçalho
          addCanvasHeader(ctx, canvas.width, canvas.height);
          
          // Serializa SVG
          const svgString = new XMLSerializer().serializeToString(svg);
          const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);
          
          const img = new Image();
          img.onload = function() {
            ctx.drawImage(img, 200, 120, 800, 400);
            addCanvasStats(ctx, canvas.width, canvas.height);
            downloadCanvas(canvas, 'grafico_balanca_chartist.png');
            showNotification('success', 'Gráfico exportado com sucesso!');
            URL.revokeObjectURL(url);
            document.body.removeChild(tempContainer);
          };
          
          img.onerror = function() {
            URL.revokeObjectURL(url);
            document.body.removeChild(tempContainer);
            exportFallbackChart();
          };
          
          img.src = url;
        } else {
          document.body.removeChild(tempContainer);
          exportFallbackChart();
        }
      }, 500);
    });
    
  } catch (e) {
    console.error('Erro no método Chartist:', e);
    exportFallbackChart();
  }
}

// Função principal melhorada com múltiplas tentativas
function exportChartAsPNG() {
  const svg = document.querySelector('#grafico svg');
  if (!svg) {
    showNotification('error', 'Nenhum gráfico para exportar');
    return;
  }
  
  showNotification('info', 'Iniciando exportação...', 2000);
  
  // Tenta método Chartist primeiro (mais confiável)
  setTimeout(() => {
    exportChartUsingChartist();
  }, 100);
}


// =======================================
// --- FUNÇÃO updateUIFromData MELHORADA (mantém compatibilidade total) ---
function updateUIFromData(dado) {
  const { tempo, forca, ema, maxForce, massaKg } = dado;

  // Mantém a lógica original
  if (forca > maxForceInN) maxForceInN = forca;
  if (forca < minForceInN) minForceInN = forca;

  // NOVO SISTEMA ANTI-NOISING
  let forcaFiltrada = forca;
  
  // Se está em modo de análise de estabilidade, coleta dados
  if (isStabilityMode) {
    calculateNoiseStatistics(forca);
  }
  
  // Aplica o filtro anti-noising melhorado
  if (antiNoisingAtivo) {
    forcaFiltrada = applyAntiNoising(forca);
  }
  
  const displayForce = convertForce(forcaFiltrada, displayUnit);
  const maxDisplayForce = convertForce(maxForceInN, displayUnit);
  const emaDisplay = convertForce(ema, displayUnit);
  const minDisplayForce = convertForce(minForceInN, displayUnit);

  // Atualiza painéis (resto da função permanece igual)
  document.getElementById('forca-atual').textContent = `${formatForce(displayForce, displayUnit)} ${displayUnit}`;
  document.getElementById('forca-maxima').textContent = `${formatForce(maxDisplayForce, displayUnit)} ${displayUnit}`;
  document.getElementById('forca-minima').textContent = `mín: ${formatForce(minDisplayForce, displayUnit)} ${displayUnit}`;
  document.getElementById('forca-ems').textContent = `${formatForce(emaDisplay, displayUnit)} ${displayUnit}`;

  // Atualiza gráfico (mantém lógica existente)
  if (chartMode !== 'pausado') {
    rawDataN.push(forca);
    
    if (isZoomed && originalChartData) {
      originalChartData.labels.push(tempo.toFixed(1));
      originalChartData.series[0].push(parseFloat(formatForce(displayForce, displayUnit)));
      
      const zoomPoints = Math.min(20, originalChartData.labels.length);
      chartData.labels = originalChartData.labels.slice(-zoomPoints);
      chartData.series[0] = originalChartData.series[0].slice(-zoomPoints);
      
      if (originalChartData.labels.length > MAX_DATA_POINTS) {
        originalChartData.labels.shift();
        originalChartData.series[0].shift();
      }
    } else {
      chartData.labels.push(tempo.toFixed(1));
      chartData.series[0].push(parseFloat(formatForce(displayForce, displayUnit)));
      
      if (chartMode === 'deslizante' && chartData.labels.length > MAX_DATA_POINTS) {
        chartData.labels.shift();
        chartData.series[0].shift();
      }
    }
    
    if (rawDataN.length > MAX_DATA_POINTS) {
      rawDataN.shift();
    }
    
    chart.update(chartData);
  }

  // Tabela (mantém lógica original)
  if (isSessionActive) {
    const tbody = document.getElementById("tabela").querySelector("tbody");
    const linha = tbody.insertRow(0);
    const agora = new Date();
    const timestamp = `${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR')}.${String(agora.getMilliseconds()).padStart(3, '0')}`;

    linha.insertCell(0).innerText = timestamp;
    linha.insertCell(1).innerText = tempo.toFixed(1);
    linha.insertCell(2).innerText = forca.toFixed(3);
    linha.insertCell(3).innerText = (massaKg * 1000).toFixed(1);
    linha.insertCell(4).innerText = massaKg.toFixed(4);

    if (tbody.rows.length > 5000) {
      tbody.deleteRow(tbody.rows.length - 1);
    }
  }
}

// --- FUNÇÃO clearChart MELHORADA ---
function clearChart() {
  chartData.labels = [];
  chartData.series = [[]];
  rawDataN = [];
  maxForceInN = -Infinity;
  minForceInN = Infinity;
  
  // Limpa zoom se ativo
  if (isZoomed) {
    originalChartData = null;
    isZoomed = false;
    addEnhancedControls(); // Atualiza botões
  }
  
  document.getElementById('forca-atual').textContent = `--- ${displayUnit}`;
  document.getElementById('forca-maxima').textContent = `--- ${displayUnit}`;
  document.getElementById('forca-minima').textContent = `--- ${displayUnit}`;
  chart.update(chartData);
  showNotification("info", "Gráfico limpo. (Atalho: L)", 3000);
}

// =======================================
// MANTÉM TODAS AS FUNÇÕES ORIGINAIS SEM ALTERAÇÃO
// =======================================

function conectarWorker() {
  if (window.Worker) {
    if (!dataWorker) {
      dataWorker = new Worker('dataWorker.js');
      dataWorker.onmessage = handleWorkerMessage;
      setInterval(() => {
        dataWorker.postMessage({ type: 'solicitarDados' });
      }, 200);
    }
  } else {
    showNotification('error', 'Seu navegador não suporta Web Workers.');
  }
}

function resetConnectionTimeout() {
  clearTimeout(connectionTimeout);
  connectionTimeout = setTimeout(() => {
    updateConnectionStatus(false);
    document.getElementById('balanca-status').textContent = 'Dispositivo não responde.';
  }, 1000);
}

function handleWorkerMessage(event) {
  const { type, payload, status, message } = event.data;
  resetConnectionTimeout();
  switch (type) {
    case 'dadosDisponiveis':
      payload.forEach(updateUIFromData);
      break;
    case 'rps':
      document.getElementById('leituras-por-segundo').textContent = payload;
      break;
    case 'config':
      updateConfigForm(payload);
      break;
    case 'status':
      document.getElementById('balanca-status').textContent = message || status;
      
      // === NOVO: Atualiza indicador visual e toca beeps ===
      if (status === 'connected') {
        updateConnectionStatus(true);
        atualizarIndicadorConexao(true);
        tocarAlertaReconexao();
      } else if (status === 'disconnected' || status === 'error') {
        clearTimeout(connectionTimeout);
        updateConnectionStatus(false);
        atualizarIndicadorConexao(false);
        tocarAlertaDesconexao();
      }
      
      // === NOVO: Verifica problemas de estabilização ===
      verificarStatusEstabilizacao(message);
      
      if (message) {
        const notificationType = (status === 'error' || status === 'disconnected') ? 'erro' : 'info';
        showNotification(notificationType, message);
      }
      break;
    case 'error':
      showNotification("erro", message || "Erro desconhecido no worker");
      break;
    default:
      console.warn("Mensagem desconhecida do worker:", event.data);
  }
}

function iniciarSessao() {
    const nomeSessaoInput = document.getElementById('nome-sessao');
    const nomeSessao = nomeSessaoInput.value.trim();
    if (!nomeSessao) {
        showNotification('error', 'Por favor, insira um nome para a sessão.');
        nomeSessaoInput.focus();
        return;
    }
    clearChart(); 
    document.getElementById("tabela").querySelector("tbody").innerHTML = '';
    isSessionActive = true;
    showNotification('success', `Sessão "${nomeSessao}" iniciada. Gravando dados...`);
    document.getElementById('btn-iniciar-sessao').disabled = true;
    nomeSessaoInput.disabled = true;
    document.getElementById('btn-encerrar-sessao').disabled = false;
}

function encerrarSessao() {
    if (!isSessionActive) return;
    const nomeSessao = document.getElementById('nome-sessao').value.trim();
    const tabela = document.getElementById("tabela").querySelector("tbody");
    if (tabela.rows.length === 0) {
        showNotification('info', 'Nenhum dado foi gravado nesta sessão. Nada foi salvo.');
    } else {
        salvarDadosDaSessao(nomeSessao, tabela);
    }
    isSessionActive = false;
    const nomeSessaoInput = document.getElementById('nome-sessao');
    document.getElementById('btn-iniciar-sessao').disabled = false;
    nomeSessaoInput.disabled = false;
    nomeSessaoInput.value = ''; 
    document.getElementById('btn-encerrar-sessao').disabled = true;
}

function salvarDadosDaSessao(nome, tabela) {
    const dadosTabela = [];
    for (const linha of tabela.rows) {
        dadosTabela.push({
            timestamp: linha.cells[0].innerText,
            tempo_esp: linha.cells[1].innerText,
            newtons: linha.cells[2].innerText,
            grama_forca: linha.cells[3].innerText,
            quilo_forca: linha.cells[4].innerText
        });
    }
    const gravacao = {
        id: Date.now(),
        nome: nome,
        timestamp: new Date().toISOString(),
        dadosTabela: dadosTabela.reverse()
    };
    try {
        let gravacoes = JSON.parse(localStorage.getItem('balancaGravacoes')) || [];
        gravacoes.push(gravacao);
        localStorage.setItem('balancaGravacoes', JSON.stringify(gravacoes));
        showNotification('success', `Sessão "${nome}" salva com sucesso!`);
        carregarGravacoesComImpulso();
    } catch (e) {
        showNotification('error', 'Erro ao salvar. O Local Storage pode estar cheio.');
        console.error("Erro ao salvar no LocalStorage:", e);
    }
}

function updateConfigForm(config) {
  const getValue = (val) => (val !== null && val !== undefined) ? val : '';
   // Formulário de configuração de rede
  document.getElementById("ssid").value = getValue(config.ssid);
  document.getElementById("senha").value = getValue(config.senha);


  // Parâmetros da balança
  document.getElementById("param-conversao").value = getValue(config.conversionFactor);
  document.getElementById("param-gravidade").value = getValue(config.gravity);
  document.getElementById("param-offset").value = getValue(config.tareOffset);
  document.getElementById("param-leituras-estaveis").value = getValue(config.leiturasEstaveis);
  document.getElementById("param-tolerancia").value = getValue(config.toleranciaEstabilidade);
  atualizarToleranciaEmGramas();
  document.getElementById("param-num-amostras").value = getValue(config.numAmostrasMedia);
  document.getElementById("param-timeout").value = getValue(config.timeoutCalibracao);

  // --- Atualiza Status da Rede ---
  // Tradução do status numérico para texto
  const wifiStatusMap = {
    0: "Desconectado",
    1: "Conectando...",
    3: "Conectado",
    4: "Falha na Conexão"
  };

  document.getElementById("status-rede-texto").textContent =
    wifiStatusMap[config.wifi_status] || ("Código: " + getValue(config.wifi_status));

  document.getElementById("ip-rede").textContent = getValue(config.wifi_ip);
  document.getElementById("ap-ativo").textContent = config.ap_active ? "Sim" : "Não";
  document.getElementById("ap-ip").textContent = getValue(config.ap_ip);

}

function updateConnectionStatus(isConnected) {
  const indicator = document.getElementById('ws-indicator');
  indicator.classList.toggle('conectado', isConnected);
  document.getElementById('ws-text').textContent = isConnected ? "Conectado" : "Desconectado";
  if (!isConnected) {
    changeConnectionStatus(false);
    tocarBip();
  }
}
function changeConnectionStatus(connected) {
  const statusIndicator = document.getElementById('connection-status-indicator');
  if (connected) {
    document.body.backgroundColor = '#e0f7e9';
    statusIndicator.textContent = 'Conectado ao ESP32';
    statusIndicator.classList.remove('desconectado');
    statusIndicator.classList.add('conectado');
  } else {
    document.body.backgroundColor = '#e65e5eff';
    statusIndicator.textContent = 'Desconectado do ESP32';
    statusIndicator.classList.remove('conectado');
    statusIndicator.classList.add('desconectado');
  }
}

function updateReadingsPerSecond() {
  if (dataWorker) {
    dataWorker.postMessage({ type: 'getRPS' });
  }
}

function sendCommandToWorker(command, value = null) {
  if (dataWorker) {
    const message = value !== null ? `${command}:${value}` : command;
    dataWorker.postMessage({ type: 'sendCommand', payload: message });
  } else {
    showNotification("error", "Worker não está conectado.");
  }
}

// FUNÇÕES TARA E CALIBRAR: Adiciona notificação de atalho
function tare() {
  sendCommandToWorker("t");
  showNotification('info', 'Comando de Tara enviado. (Atalho: Shift + T)');
}

function calibrar() {
  const massa = parseFloat(document.getElementById("massaCalibracao").value);
  if (!isNaN(massa) && massa > 0) {
    sendCommandToWorker("c", massa);
    showNotification('info', `Comando de calibração com ${massa}g enviado. (Atalho: Shift + C)`);
  } else {
    showNotification("error", "Informe uma massa de calibração válida.");
  }
}

function salvarParametros() {
  const params = {
    conversionFactor: "param-conversao",
    gravity: "param-gravidade",
    tareOffset: "param-offset",
    leiturasEstaveis: "param-leituras-estaveis",
    toleranciaEstabilidade: "param-tolerancia",
    numAmostrasMedia: "param-num-amostras",
    timeoutCalibracao: "param-timeout",
  };

  for (const [key, id] of Object.entries(params)) {
    const value = document.getElementById(id).value;
    if (value !== '') {
      sendCommandToWorker(`set_param`, `${key}:${value}`);
    }
  }
  showNotification('success', 'Parâmetros enviados para salvamento no ESP32.');
}

function formatForce(value, unit) {
  if (unit === 'N') return value.toFixed(4);
  if (unit === 'gf') return value.toFixed(0);
  if (unit === 'kgf') return value.toFixed(3);
  return value.toFixed(3);
}

function convertForce(valueN, unit) {
  const g_force_conversion = 101.9716;
  if (unit === 'gf') return valueN * g_force_conversion;
  if (unit === 'kgf') return valueN * (g_force_conversion / 1000);
  return valueN;
}

function setDisplayUnit(unit) {
  displayUnit = unit;
  document.querySelectorAll('#btn-unit-n, #btn-unit-gf, #btn-unit-kgf').forEach(b => b.classList.remove('ativo'));
  document.getElementById(`btn-unit-${unit.toLowerCase()}`).classList.add('ativo');

  chartData.series[0] = rawDataN.map(forceN => parseFloat(formatForce(convertForce(forceN, unit), unit)));
  chart.update(chartData);

  const currentForceN = rawDataN.length > 0 ? rawDataN[rawDataN.length - 1] : 0;
  const currentDisplayForce = convertForce(currentForceN, displayUnit);
  const maxDisplayForce = convertForce(maxForceInN, displayUnit);
  document.getElementById('forca-atual').textContent = `${formatForce(currentDisplayForce, displayUnit)} ${displayUnit}`;
  document.getElementById('forca-maxima').textContent = `${formatForce(maxDisplayForce, displayUnit)} ${displayUnit}`;
}

function setChartMode(mode) {
  chartMode = mode;
  document.querySelectorAll('#btn-deslizante, #btn-acumulado, #btn-pausado').forEach(b => b.classList.remove('ativo'));
  document.getElementById(`btn-${mode}`).classList.add('ativo');
}

function toggleChartPause() {
  if (chartMode === 'pausado') {
    setChartMode('deslizante');
    showNotification('info', 'Gráfico retomado (Deslizante). (Atalho: P)');
  } else {
    setChartMode('pausado');
    showNotification('info', 'Gráfico pausado. (Atalho: P)');
  }
}

function abrirAba(element, abaID) {
  document.querySelectorAll('.tabcontent').forEach(tab => { tab.style.display = "none"; tab.classList.remove('active'); });
  document.querySelectorAll('.tablink').forEach(link => link.classList.remove('active'));
  const el = document.getElementById(abaID);
  el.style.display = "block";
  el.classList.add('active');
  element.classList.add('active');
}

function showNotification(type, message, duration = 5000) {
  const area = document.getElementById('notification-area');
  if (!area) {
    // Cria área de notificação se não existir
    const notificationArea = document.createElement('div');
    notificationArea.id = 'notification-area';
    notificationArea.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      max-width: 400px;
    `;
    document.body.appendChild(notificationArea);
  }
  
  const notification = document.createElement('div');
  notification.className = `notificacao ${type}`;
  notification.style.cssText = `
    background: white;
    border-left: 4px solid ${getNotificationColor(type)};
    padding: 15px;
    margin-bottom: 10px;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    animation: slideIn 0.3s ease;
  `;
  notification.innerHTML = `<p style="font-weight: bold; margin-bottom: 5px;">${type.charAt(0).toUpperCase() + type.slice(1)}</p><p style="white-space: pre-line;">${message}</p>`;
  
  const finalArea = document.getElementById('notification-area');
  finalArea.prepend(notification);
  
  setTimeout(() => {
    notification.style.transition = 'opacity 0.5s';
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 500);
  }, duration);
}

function getNotificationColor(type) {
  const colors = {
    error: '#e74c3c',
    erro: '#e74c3c',
    success: '#27ae60',
    info: '#3498db',
    warning: '#f39c12',
    aviso: '#f39c12'
  };
  return colors[type] || '#3498db';
}

function salvarRede(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  fetch("/salvarRede", { method: "POST", body: new URLSearchParams(form) })
    .then(r => r.text())
    .then(text => showNotification("success", text))
    .catch(err => showNotification("error", "Falha ao salvar a rede: " + err));
}

function carregarGravacoesComImpulso() {
  const container = document.getElementById('lista-gravacoes');
  if (!container) return;
  
  container.innerHTML = '';
  const gravacoes = JSON.parse(localStorage.getItem('balancaGravacoes')) || [];
  
  if (gravacoes.length === 0) {
    container.innerHTML = '<p style="color: var(--cor-texto-secundario);">Nenhuma gravação encontrada.</p>';
    return;
  }
  
  gravacoes.sort((a, b) => b.id - a.id);
  
  gravacoes.forEach(gravacao => {
    const dataFormatada = new Date(gravacao.timestamp).toLocaleString('pt-BR');
    const card = document.createElement('div');
    card.className = 'card-gravacao';
    card.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      margin-bottom: 10px;
    `;
    
    card.innerHTML = `
      <div>
        <p style="font-weight: 600; margin-bottom: 5px;">${gravacao.nome}</p> 
        <p style="font-size: 0.875rem; color: #7f8c8d;">
          ${dataFormatada} • ${gravacao.dadosTabela.length} leituras
        </p>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button onclick="exportarPDFViaPrint(${gravacao.id})" 
                style="background: #e74c3c; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
          📑 PDF
        </button>
        <button onclick="exportarCSV(${gravacao.id})" 
                style="background: #27ae60; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
          📄 CSV
        </button>
        <button onclick="exportarImagemSessao(${gravacao.id})" 
                style="background: #3498db; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
          🖼️ PNG
        </button>
        <button onclick="visualizarSessao(${gravacao.id})" 
                style="background: #9b59b6; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
          👁️ Ver
        </button>
        <button onclick="deletarGravacao(${gravacao.id})" 
                style="background: #c0392b; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
          🗑️ Del
        </button>
      </div>
    `;
    
    container.appendChild(card);
  });
}

function exportarCSV(id) {
  const gravacoes = JSON.parse(localStorage.getItem('balancaGravacoes')) || [];
  const gravacao = gravacoes.find(g => g.id === id);
  if (!gravacao) return;
  const cabecalho = Object.keys(gravacao.dadosTabela[0]).join(';');
  const linhas = gravacao.dadosTabela.map(linha => Object.values(linha).join(';'));
  const conteudoCSV = `\uFEFF${cabecalho}\n${linhas.join('\n')}`;
  const blob = new Blob([conteudoCSV], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', `gravacao_balanca_${gravacao.nome.replace(/\s/g, "_")}_${id}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function deletarGravacao(id) {
  if (!confirm('Tem certeza que deseja deletar esta gravação?')) return;
  let gravacoes = JSON.parse(localStorage.getItem('balancaGravacoes')) || [];
  const novasGravacoes = gravacoes.filter(g => g.id !== id);
  localStorage.setItem('balancaGravacoes', JSON.stringify(novasGravacoes));
  showNotification('info', 'Gravação deletada.');
  carregarGravacoesComImpulso();
}

function tocarBip() {
  try {
    const contexto = new (window.AudioContext || window.webkitAudioContext)();
    const oscilador = contexto.createOscillator();
    oscilador.type = 'square';
    oscilador.frequency.setValueAtTime(880, contexto.currentTime);
    oscilador.connect(contexto.destination);
    oscilador.start();
    oscilador.stop(contexto.currentTime + 0.2);
  } catch (e) {
    console.log('Audio não disponível:', e);
  }
}

function atualizarToleranciaEmGramas() {
  const toleranciaBruta = parseFloat(document.getElementById("param-tolerancia").value);
  const fatorConversao = parseFloat(document.getElementById("param-conversao").value);
  const toleranciaElement = document.getElementById("tolerancia-em-gramas");
  
  if (!toleranciaElement) return;
  
  if (!isNaN(toleranciaBruta) && !isNaN(fatorConversao) && fatorConversao !== 0) {
    const toleranciaN = toleranciaBruta / fatorConversao;
    const toleranciaGf = toleranciaN;
    toleranciaElement.textContent = `≈ ${toleranciaGf.toFixed(3)} gf`;
  } else {
    toleranciaElement.textContent = '';
  }
}

function toggleAntiNoising() {
  antiNoisingAtivo = !antiNoisingAtivo;
  const btn = document.getElementById('btn-anti-noising');
  if (btn) {
    if (antiNoisingAtivo) {
      if (currentStdDev === 0) {
        btn.textContent = 'Anti-Noising: ON (Calibre!)';
        btn.classList.add('btn-aviso');
        showNotification('warning', 'Anti-noising ativo, mas sem calibração. Vá em Parâmetros → Analisar Ruído');
      } else {
        btn.textContent = `Anti-Noising: ON (${antiNoisingMultiplier}σ)`;
        btn.classList.remove('btn-aviso');
        btn.classList.add('btn-sucesso');
      }
    } else {
      btn.textContent = 'Anti-Noising: OFF';
      btn.classList.remove('btn-aviso', 'btn-sucesso');
    }
  }
}


// 4. ADICIONE ESTAS NOVAS FUNÇÕES ANTES DA ÚLTIMA LINHA DO ARQUIVO:

function applyAntiNoising(forceValue) {
  if (!antiNoisingAtivo || currentStdDev === 0) {
    return forceValue;
  }
  
  const threshold = currentStdDev * antiNoisingMultiplier;
  
  // Se está dentro da faixa de ruído, considera zero
  if (Math.abs(forceValue - noiseMean) <= threshold) {
    return 0;
  }
  
  // Senão, subtrai a média do ruído
  return forceValue - noiseMean;
}

function calculateNoiseStatistics(forceValue) {
  noiseBuffer.push(forceValue);
  
  if (noiseBuffer.length > NOISE_BUFFER_SIZE) {
    noiseBuffer.shift();
  }
  
  if (noiseBuffer.length < 10) return;
  
  // Calcula média
  noiseMean = noiseBuffer.reduce((sum, val) => sum + val, 0) / noiseBuffer.length;
  
  // Calcula variância
  const variance = noiseBuffer.reduce((sum, val) => {
    return sum + Math.pow(val - noiseMean, 2);
  }, 0) / noiseBuffer.length;
  
  // Calcula desvio padrão
  currentStdDev = Math.sqrt(variance);
  
  updateNoiseDisplay();
}

function updateNoiseDisplay() {
  const meanElement = document.getElementById("noise-mean");
  const stdDevElement = document.getElementById("noise-stddev");
  const thresholdElement = document.getElementById("noise-threshold");
  
  if (meanElement) {
    meanElement.textContent = `${(noiseMean * getDisplayUnitFactor(displayUnit)).toFixed(3)} ${displayUnit}`;
  }
  
  if (stdDevElement) {
    stdDevElement.textContent = `${(currentStdDev * getDisplayUnitFactor(displayUnit)).toFixed(3)} ${displayUnit}`;
  }
  
  if (thresholdElement) {
    const threshold = currentStdDev * antiNoisingMultiplier * getDisplayUnitFactor(displayUnit);
    thresholdElement.textContent = `±${threshold.toFixed(3)} ${displayUnit}`;
  }
}

// Start Noise Analysis (Adicionar notificação de atalho e lógica)
function startNoiseAnalysis() {
  if (isStabilityMode) {
    showNotification('info', 'Análise já em andamento');
    return;
  }
  
  isStabilityMode = true;
  noiseBuffer = [];
  currentStdDev = 0;
  noiseMean = 0;
  
  showNotification('info', 'Analisando ruído... Mantenha a balança VAZIA e ESTÁVEL por 10 segundos! (Atalho: Shift+A)', 3000);
  
  setTimeout(() => {
    isStabilityMode = false;
    if (currentStdDev > 0) {
      showNotification('success', `✅ Ruído calibrado! Desvio: ±${(currentStdDev * getDisplayUnitFactor(displayUnit)).toFixed(3)} ${displayUnit}`);
      
      // Atualiza o botão anti-noising
      if (antiNoisingAtivo) {
        toggleAntiNoising();
        toggleAntiNoising(); // Liga novamente para atualizar o texto
      }
    } else {
      showNotification('error', 'Análise falhou. Certifique-se que a balança está estável.');
    }
  }, 10000);
}

function setAntiNoisingMultiplier(multiplier) {
  antiNoisingMultiplier = Math.max(0.5, Math.min(5.0, parseFloat(multiplier)));
  updateNoiseDisplay();
  showNotification('info', `Sensibilidade: ${antiNoisingMultiplier}σ (${getSensitivityDescription()})`, 3000);
}

function getSensitivityDescription() {
  if (antiNoisingMultiplier <= 1.0) return "Muito sensível";
  if (antiNoisingMultiplier <= 2.0) return "Balanceado";
  if (antiNoisingMultiplier <= 3.0) return "Moderado";
  return "Pouco sensível";
}

function resetNoiseAnalysis() {
  noiseBuffer = [];
  currentStdDev = 0;
  noiseMean = 0;
  isStabilityMode = false;
  updateNoiseDisplay();
  showNotification('info', 'Análise de ruído resetada');
}
function addNoiseControlsToUI() {
  const controlesTab = document.getElementById('abaControles');
  if (!controlesTab || document.getElementById('noise-controls-section')) return;
  
  const noiseSection = document.createElement('section');
  noiseSection.id = 'noise-controls-section';
  noiseSection.style.cssText = `
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--cor-borda);
  `;
  
  noiseSection.innerHTML = `
    <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">
      🔇 Controle de Ruído Inteligente
    </h3>
    <p style="font-size: 0.875rem; color: var(--cor-texto-secundario); margin-bottom: 1rem;">
      Sistema baseado em desvio padrão para eliminar ruído sem afetar medições válidas.
    </p>
    
    <div class="grid-container" style="gap: 1rem; margin-bottom: 1rem;">
      <div>
        <label>Ruído Médio</label>
        <div id="noise-mean" style="padding: 0.5rem; background: #f8f9fa; border-radius: 0.375rem; font-family: monospace;">
          --- ${displayUnit}
        </div>
      </div>
      <div>
        <label>Desvio Padrão</label>
        <div id="noise-stddev" style="padding: 0.5rem; background: #f8f9fa; border-radius: 0.375rem; font-family: monospace;">
          --- ${displayUnit}
        </div>
      </div>
      <div>
        <label>Threshold</label>
        <div id="noise-threshold" style="padding: 0.5rem; background: #f8f9fa; border-radius: 0.375rem; font-family: monospace;">
          --- ${displayUnit}
        </div>
      </div>
      <div>
        <label for="noise-multiplier">Sensibilidade (σ)</label>
        <input id="noise-multiplier" type="number" step="0.1" min="0.5" max="5.0" value="2.0" 
               onchange="setAntiNoisingMultiplier(this.value)"
               style="padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; width: 100%;">
        <small style="color: var(--cor-texto-secundario); display: block; margin-top: 0.25rem;">
          1.0=sensível, 2.0=balanceado, 3.0=tolerante
        </small>
      </div>
    </div>
    
    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
      <button onclick="startNoiseAnalysis()" class="btn btn-primario">
        📊 Analisar Ruído (10s)
      </button>
      <button onclick="resetNoiseAnalysis()" class="btn btn-secundario">
        🔄 Reset
      </button>
    </div>
    
    <div style="margin-top: 1rem; padding: 0.75rem; background: #e8f4fd; border-radius: 0.375rem; border-left: 4px solid #3498db;">
      <p style="margin: 0; font-size: 0.875rem;"><strong>💡 Como usar:</strong></p>
      <p style="margin: 0.25rem 0 0 0; font-size: 0.75rem; color: #2c3e50;">
        1. Deixe a balança VAZIA • 2. Clique "Analisar Ruído" (<kbd>Shift+A</kbd>) • 3. Aguarde 10s sem tocar • 4. Ative Anti-Noising no gráfico
      </p>
    </div>
  `;
  
  controlesTab.appendChild(noiseSection);
}
// ============================================
// === NOVAS FUNÇÕES DE ÁUDIO E ALERTAS ===
// ============================================

function inicializarAudioContext() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.warn('Áudio não disponível neste navegador');
  }
}

function toggleAvisosAudio() {
  const checkbox = document.getElementById('audio-avisos');
  avisosAudioAtivados = checkbox ? checkbox.checked : false;
  
  if (avisosAudioAtivados && audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  if (avisosAudioAtivados) {
    tocarBeep(440, 150);
    showNotification('info', '🔊 Avisos sonoros ativados', 2000);
  } else {
    showNotification('info', '🔇 Avisos sonoros desativados', 2000);
  }
}

function tocarBeep(frequencia = 800, duracao = 200, volume = 0.3) {
  if (!avisosAudioAtivados || !audioContext) return;
  
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequencia;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duracao / 1000);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duracao / 1000);
  } catch (e) {
    console.error('Erro ao tocar beep:', e);
  }
}

function tocarAlertaDesconexao() {
  if (!avisosAudioAtivados) return;
  tocarBeep(400, 100);
  setTimeout(() => tocarBeep(300, 100), 150);
}

function tocarAlertaReconexao() {
  if (!avisosAudioAtivados) return;
  tocarBeep(600, 100);
  setTimeout(() => tocarBeep(800, 100), 120);
}

function tocarAlertaEstabilizacao() {
  if (!avisosAudioAtivados) return;
  tocarBeep(500, 150);
  setTimeout(() => tocarBeep(500, 150), 200);
  setTimeout(() => tocarBeep(500, 150), 400);
}

function atualizarIndicadorConexao(conectado) {
  const indicator = document.getElementById('ws-indicator');
  const text = document.getElementById('ws-text');
  const body = document.body;
  
  if (conectado) {
    indicator.classList.add('conectado');
    indicator.title = 'Conectado';
    if (text) text.textContent = 'Conectado';
    body.classList.remove('desconectado');
  } else {
    indicator.classList.remove('conectado');
    indicator.title = 'Desconectado';
    if (text) text.textContent = 'Desconectado';
    body.classList.add('desconectado');
  }
}

function mostrarAlertaEstabilizacao() {
  const alerta = document.getElementById('alerta-estabilizacao');
  if (alerta) {
    alerta.classList.add('ativo');
    tocarAlertaEstabilizacao();
  }
}

function ocultarAlertaEstabilizacao() {
  const alerta = document.getElementById('alerta-estabilizacao');
  if (alerta) {
    alerta.classList.remove('ativo');
  }
}

function verificarStatusEstabilizacao(status) {
  const problemaEstabilizacao = status && (
    status.includes('não estabilizando') || 
    status.includes('timeout') ||
    status.includes('tolerância')
  );
  
  if (problemaEstabilizacao && !ultimoStatusEstabilizacao) {
    contadorFalhasEstabilizacao++;
    
    if (contadorFalhasEstabilizacao >= 3) {
      mostrarAlertaEstabilizacao();
    }
  } else if (!problemaEstabilizacao) {
    contadorFalhasEstabilizacao = 0;
    ocultarAlertaEstabilizacao();
  }
  
  ultimoStatusEstabilizacao = !problemaEstabilizacao;
}

function carregarGravacoesComImpulso() {
  const container = document.getElementById('lista-gravacoes');
  if (!container) return;
  
  container.innerHTML = '';
  const gravacoes = JSON.parse(localStorage.getItem('balancaGravacoes')) || [];
  
  if (gravacoes.length === 0) {
    container.innerHTML = '<p style="color: var(--cor-texto-secundario);">Nenhuma gravação encontrada.</p>';
    return;
  }
  
  gravacoes.sort((a, b) => b.id - a.id);
  
  gravacoes.forEach(gravacao => {
    const dataFormatada = new Date(gravacao.timestamp).toLocaleString('pt-BR');
    const card = document.createElement('div');
    card.className = 'card-gravacao';
    card.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      margin-bottom: 10px;
    `;
    
    card.innerHTML = `
      <div>
        <p style="font-weight: 600; margin-bottom: 5px;">${gravacao.nome}</p> 
        <p style="font-size: 0.875rem; color: #7f8c8d;">
          ${dataFormatada} • ${gravacao.dadosTabela.length} leituras
        </p>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button onclick="exportarPDFViaPrint(${gravacao.id})" 
                style="background: #e74c3c; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
          📑 PDF
        </button>
        <button onclick="exportarCSV(${gravacao.id})" 
                style="background: #27ae60; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
          📄 CSV
        </button>
        <button onclick="exportarImagemSessao(${gravacao.id})" 
                style="background: #3498db; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
          🖼️ PNG
        </button>
        <button onclick="visualizarSessao(${gravacao.id})" 
                style="background: #9b59b6; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
          👁️ Ver
        </button>
        <button onclick="deletarGravacao(${gravacao.id})" 
                style="background: #c0392b; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
          🗑️ Del
        </button>
      </div>
    `;
    
    container.appendChild(card);
  });
}

function visualizarSessao(sessionId) {
  try {
    const gravacoes = JSON.parse(localStorage.getItem('balancaGravacoes')) || [];
    const sessao = gravacoes.find(g => g.id === sessionId);
    
    if (!sessao) {
      showNotification('error', 'Sessão não encontrada');
      return;
    }
    
    clearChart();
    
    chartData.labels = [];
    chartData.series = [[]];
    rawDataN = [];
    
    sessao.dadosTabela.forEach(dado => {
      const tempo = parseFloat(dado.tempo_esp) || 0;
      const newtons = parseFloat(dado.newtons) || 0;
      const displayForce = convertForce(newtons, displayUnit);
      
      chartData.labels.push(tempo.toFixed(1));
      chartData.series[0].push(parseFloat(formatForce(displayForce, displayUnit)));
      rawDataN.push(newtons);
    });
    
    if (rawDataN.length > 0) {
      maxForceInN = Math.max(...rawDataN);
      minForceInN = Math.min(...rawDataN);
      
      const currentDisplayForce = convertForce(rawDataN[rawDataN.length - 1], displayUnit);
      const maxDisplayForce = convertForce(maxForceInN, displayUnit);
      const minDisplayForce = convertForce(minForceInN, displayUnit);
      const avgForce = rawDataN.reduce((a, b) => a + b, 0) / rawDataN.length;
      const avgDisplayForce = convertForce(avgForce, displayUnit);
      
      document.getElementById('forca-atual').textContent = `${formatForce(currentDisplayForce, displayUnit)} ${displayUnit}`;
      document.getElementById('forca-maxima').textContent = `${formatForce(maxDisplayForce, displayUnit)} ${displayUnit}`;
      document.getElementById('forca-minima').textContent = `mín: ${formatForce(minDisplayForce, displayUnit)} ${displayUnit}`;
      document.getElementById('forca-ems').textContent = `${formatForce(avgDisplayForce, displayUnit)} ${displayUnit}`;
    }
    
    chart.update(chartData);
    
    abrirAba(document.getElementById("padrao"), 'abaGrafico');
    
    showNotification('success', `Sessão "${sessao.nome}" carregada!`);
    
  } catch (e) {
    console.error('Erro ao visualizar:', e);
    showNotification('error', 'Erro ao carregar sessão');
  }
}

// Stub para exportarImagemSessao se não existir
if (typeof exportarImagemSessao === 'undefined') {
  window.exportarImagemSessao = function(sessionId) {
    showNotification('info', 'Função de exportação PNG disponível no script_grafico_sessao.js', 3000);
  };
}

// === FIM DAS NOVAS FUNÇÕES ===

// --- NOVO: FUNÇÃO DE ATALHOS DE TECLADO CORRIGIDA ---
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (event) => {
    // Não ativar atalhos se o foco estiver em um campo de input ou textarea
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }

    const key = event.key.toLowerCase();
    
    // ATALHOS COM SHIFT
    if (event.shiftKey) {
        if (key === 't') {
            event.preventDefault(); 
            tare(); // Shift + T para Tara
        } else if (key === 'c') {
            event.preventDefault();
            calibrar(); // Shift + C para Calibração
        } else if (key === 'a') {
            event.preventDefault();
            startNoiseAnalysis(); // Shift + A para Análise de Ruído
        }
    }
    
    // ATALHOS SEM MODIFICADOR (mantidos os existentes L e P)
    else if (!event.ctrlKey && !event.metaKey) {
        if (key === 'l') {
            event.preventDefault();
            clearChart(); // L para Limpar Gráfico
        } else if (key === 'p') {
            event.preventDefault();
            toggleChartPause(); // P para Pausar/Retomar
        }
    }
  });
}

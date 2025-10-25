
// --- Variáveis Globais da UI ---
let chart;
let dataWorker;
const MAX_DATA_POINTS = 100;
let chartMode = 'deslizante';
let displayUnit = 'kgf';
let maxForceInN = -Infinity;
let minForceInN = Infinity;
let rawDataN = []; // Mantido para conversão de unidades
let isSessionActive = false;
let isChartPaused = false;

// --- Variáveis de Filtros e Análise ---
let antiNoisingAtivo = false;
let isStabilityMode = false;
let noiseBuffer = [];
const NOISE_BUFFER_SIZE = 50;
let currentStdDev = 0;
let noiseMean = 0;
let antiNoisingMultiplier = 2.0;

// --- Variáveis para Especificações da Célula ---
let capacidadeMaximaGramas = 5000.0;
let percentualAcuracia = 0.05;
let filtroZonaMortaAtivo = true;
let arredondamentoInteligenteAtivo = true;

// --- Variáveis de Áudio e Alertas ---
let avisosAudioAtivados = false;
let audioContext = null;
let ultimoStatusEstabilizacao = true;
let contadorFalhasEstabilizacao = 0;

// --- Funções de Inicialização ---
window.onload = () => {
  abrirAba(document.getElementById("padrao"), 'abaGrafico');
  initializeApexChart(); // NOVA FUNÇÃO DE GRÁFICO
  setDisplayUnit('kgf');
  setChartMode('deslizante');
  carregarGravacoesComImpulso();
  conectarWorker();
  setInterval(updateReadingsPerSecond, 1000);
  addNoiseControlsToUI();
  inicializarAudioContext();
  setupKeyboardShortcuts();
  setupTheme();
  setupWebSocketUrl();
};

function setupTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const currentTheme = localStorage.getItem('theme') || 'light';

    if (currentTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggle.textContent = '☀️';
    }

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        let theme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
        themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
        localStorage.setItem('theme', theme);
        
        // Atualiza o tema do gráfico ApexCharts
        chart.updateOptions({
            chart: { background: 'transparent' },
            theme: { mode: theme }
        });
    });
}

function setupWebSocketUrl() {
    const savedWsUrl = localStorage.getItem('wsUrl');
    if (savedWsUrl) {
        document.getElementById('ws-url').value = savedWsUrl;
    }
}

// --- Inicialização e Controle do Gráfico (ApexCharts) ---

function initializeApexChart() {
  const currentTheme = localStorage.getItem('theme') || 'light';
  const options = {
    series: [{
      name: 'Força',
      data: []
    }],
    chart: {
      id: 'realtime',
      height: 350,
      type: 'line',
      animations: {
        enabled: true,
        easing: 'linear',
        dynamicAnimation: {
          speed: 400
        }
      },
      toolbar: {
        show: true
      },
      zoom: {
        enabled: true
      },
      background: 'transparent'
    },
    stroke: {
      curve: 'smooth',
      width: 2.5
    },
    xaxis: {
      type: 'numeric',
      tickAmount: 10,
      labels: {
        formatter: (val) => val.toFixed(1) + 's'
      }
    },
    yaxis: {
      labels: {
        formatter: (val) => val.toFixed(3) + ' ' + displayUnit
      }
    },
    dataLabels: {
      enabled: false
    },
    markers: {
      size: 0
    },
    theme: {
      mode: currentTheme
    }
  };

  chart = new ApexCharts(document.querySelector("#grafico"), options);
  chart.render();
}

function clearChart() {
  maxForceInN = -Infinity;
  minForceInN = Infinity;
  rawDataN = [];
  chart.updateSeries([{ data: [] }]);
  showNotification("info", "Gráfico limpo. (Atalho: L)", 3000);
}

function setDisplayUnit(unit) {
    displayUnit = unit;
    document.querySelectorAll('#btn-unit-n, #btn-unit-gf, #btn-unit-kgf').forEach(b => b.classList.remove('ativo'));
    document.getElementById(`btn-unit-${unit.toLowerCase()}`).classList.add('ativo');

    // Re-processa os dados existentes para a nova unidade
    const newData = rawDataN.map(point => {
        return [point[0], convertForce(point[1], displayUnit)];
    });

    chart.updateSeries([{
        data: newData
    }]);

    chart.updateOptions({
        yaxis: {
            labels: {
                formatter: (val) => val.toFixed(3) + ' ' + displayUnit
            }
        }
    });
}

function setChartMode(mode) {
  chartMode = mode;
  document.querySelectorAll('#btn-deslizante, #btn-acumulado, #btn-pausado').forEach(b => b.classList.remove('ativo'));
  document.getElementById(`btn-${mode}`).classList.add('ativo');
  isChartPaused = (mode === 'pausado');
}

function toggleChartPause() {
  if (isChartPaused) {
    setChartMode('deslizante');
    showNotification('info', 'Gráfico retomado (Deslizante). (Atalho: P)');
  } else {
    setChartMode('pausado');
    showNotification('info', 'Gráfico pausado. (Atalho: P)');
  }
}

// --- Comunicação com o Web Worker ---

function conectarWorker() {
  if (window.Worker) {
    if (!dataWorker) {
      dataWorker = new Worker('dataWorker.js');
      dataWorker.onmessage = handleWorkerMessage;
      const savedWsUrl = localStorage.getItem('wsUrl');
      if (savedWsUrl) {
          dataWorker.postMessage({ type: 'set_ws_url', payload: { url: savedWsUrl } });
      }
      setInterval(() => dataWorker.postMessage({ type: 'solicitarDados' }), 200);
    }
  } else {
    showNotification('error', 'Seu navegador não suporta Web Workers.');
  }
}

function handleWorkerMessage(event) {
  const { type, payload, status, message } = event.data;
  switch (type) {
    case 'dadosDisponiveis':
      payload.forEach(updateUIFromData);
      break;
    case 'rps':
      document.getElementById('leituras-por-segundo').textContent = payload;
      break;
    case 'config':
      console.log('Configuração recebida:', payload);
      updateConfigForm(payload);
      break;
    case 'status':
      document.getElementById('balanca-status').textContent = message || status;
      // Apenas atualiza o indicador de conexão principal para status reais de conexão
      if (status === 'connected' || status === 'disconnected') {
        updateConnectionStatus(status === 'connected');
      }
      if (message) {
        const notificationType = (status === 'error' || status === 'disconnected') ? 'error' : 'info';
        showNotification(notificationType, message);
      }
      verificarStatusEstabilizacao(message);
      break;
    case 'error':
      showNotification("error", message || "Erro desconhecido no worker");
      break;
    default:
      console.warn("Mensagem desconhecida do worker:", event.data);
  }
}

function sendCommandToWorker(command, value = null) {
  if (!dataWorker) {
    showNotification("error", "Worker não está conectado.");
    return;
  }
  const message = value !== null ? `${command}:${value}` : command;
  dataWorker.postMessage({ type: 'sendCommand', payload: message });
}

// --- Atualização da UI ---

function updateUIFromData(dado) {
  if (isChartPaused) return;

  let { tempo, forca, ema } = dado;

  const forcaGramas = (forca / 9.80665) * 1000;
  const forcaGramasFiltrada = aplicarFiltrosGramas(forcaGramas);
  forca = (forcaGramasFiltrada / 1000) * 9.80665;
  
  let forcaFiltrada = antiNoisingAtivo ? applyAntiNoising(forca) : forca;

  if (isStabilityMode) {
    calculateNoiseStatistics(forca);
  }

  if (forcaFiltrada > maxForceInN) maxForceInN = forcaFiltrada;
  if (forcaFiltrada < minForceInN) minForceInN = forcaFiltrada;

  const displayForce = convertForce(forcaFiltrada, displayUnit);
  const maxDisplayForce = convertForce(maxForceInN, displayUnit);
  const minDisplayForce = convertForce(minForceInN, displayUnit);
  const emaDisplay = convertForce(ema, displayUnit);

  document.getElementById('forca-atual').textContent = displayForce.toFixed(3);
  document.getElementById('forca-ems').textContent = emaDisplay.toFixed(3);
  document.getElementById('forca-maxima').textContent = maxDisplayForce.toFixed(3);
  document.getElementById('forca-minima').textContent = `mín: ${minDisplayForce.toFixed(3)}`;

  rawDataN.push([tempo, forcaFiltrada]);
  
  if (chartMode === 'deslizante' && rawDataN.length > MAX_DATA_POINTS) {
    rawDataN.shift();
  }
  
  const displayData = rawDataN.map(p => [p[0], convertForce(p[1], displayUnit)]);

  chart.updateSeries([{ data: displayData }]);

  if (isSessionActive) {
    const tbody = document.getElementById("tabela").querySelector("tbody");
    const linha = tbody.insertRow(0);
    const agora = new Date();
    const timestamp = `${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR')}.${String(agora.getMilliseconds()).padStart(3, '0')}`;

    linha.insertCell(0).innerText = timestamp;
    linha.insertCell(1).innerText = tempo.toFixed(1);
    linha.insertCell(2).innerText = forcaFiltrada.toFixed(3);
    linha.insertCell(3).innerText = (forcaFiltrada / 9.80665 * 1000).toFixed(1);
    linha.insertCell(4).innerText = (forcaFiltrada / 9.80665).toFixed(4);

    if (tbody.rows.length > 5000) {
      tbody.deleteRow(tbody.rows.length - 1);
    }
  }
}

function updateConnectionStatus(isConnected) {
  const indicator = document.getElementById('ws-indicator');
  const text = document.getElementById('ws-text');
  document.body.classList.toggle('desconectado', !isConnected);
  indicator.classList.toggle('conectado', isConnected);
  indicator.title = isConnected ? 'Conectado' : 'Desconectado';
  if (text) text.textContent = isConnected ? 'Conectado' : 'Desconectado';
  if(isConnected) tocarAlertaReconexao(); else tocarAlertaDesconexao();
}

function updateReadingsPerSecond() {
  if (dataWorker) {
    dataWorker.postMessage({ type: 'getRPS' });
  }
}

function updateConfigForm(config) {
    const getValue = (val) => (val !== null && val !== undefined) ? val : '';
    document.getElementById("param-conversao").value = getValue(config.conversionFactor);
    document.getElementById("param-gravidade").value = getValue(config.gravity);
    document.getElementById("param-offset").value = getValue(config.tareOffset);
    document.getElementById("param-leituras-estaveis").value = getValue(config.leiturasEstaveis);
    document.getElementById("param-tolerancia").value = getValue(config.toleranciaEstabilidade);
    document.getElementById("param-num-amostras").value = getValue(config.numAmostrasMedia);
    document.getElementById("param-timeout").value = getValue(config.timeoutCalibracao);
    document.getElementById("param-capacidade-maxima").value = getValue(config.capacidadeMaximaGramas);
    document.getElementById("param-acuracia").value = getValue(config.percentualAcuracia);

    capacidadeMaximaGramas = parseFloat(config.capacidadeMaximaGramas) || 5000.0;
    percentualAcuracia = parseFloat(config.percentualAcuracia) || 0.05;

    atualizarToleranciaEmGramas();
    atualizarCapacidadeEmKg();
    atualizarErroAbsoluto();
    atualizarStatusFiltros();
}

// --- Funções de Ação do Usuário ---

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

async function salvarParametros() {
  const params = {
    conversionFactor: "param-conversao", gravity: "param-gravidade",
    tareOffset: "param-offset", leiturasEstaveis: "param-leituras-estaveis",
    toleranciaEstabilidade: "param-tolerancia", numAmostrasMedia: "param-num-amostras",
    timeoutCalibracao: "param-timeout", capacidadeMaximaGramas: "param-capacidade-maxima",
    percentualAcuracia: "param-acuracia",
  };

  showNotification('info', 'Enviando parâmetros para o dispositivo...');

  for (const [key, id] of Object.entries(params)) {
    const valueStr = document.getElementById(id).value.trim();
    if (valueStr !== '') {
      const valueNum = parseFloat(valueStr.replace(',', '.'));
      if (!isNaN(valueNum)) {
        // Envia um comando de cada vez com um pequeno atraso
        await new Promise(resolve => setTimeout(resolve, 100)); 
        sendCommandToWorker(`set_param:${key}:${valueNum}`);
      }
    }
  }

  // Após enviar todos os comandos, espera um pouco e solicita a configuração atualizada
  setTimeout(() => {
    showNotification('success', 'Parâmetros salvos! Atualizando valores...');
    sendCommandToWorker('get_config');
  }, 1000); // Espera 1 segundo
}

function salvarWsUrl() {
  const wsUrl = document.getElementById('ws-url').value;
  localStorage.setItem('wsUrl', wsUrl);
  if (dataWorker) {
    dataWorker.postMessage({ type: 'set_ws_url', payload: { url: wsUrl } });
  }
  showNotification('success', 'URL do WebSocket salva. A conexão será reiniciada.');
}

// --- Funções de Sessão ---

function iniciarSessao() {
    const nomeSessaoInput = document.getElementById('nome-sessao');
    if (!nomeSessaoInput.value.trim()) {
        showNotification('error', 'Por favor, insira um nome para a sessão.');
        nomeSessaoInput.focus();
        return;
    }
    clearChart(); 
    document.getElementById("tabela").querySelector("tbody").innerHTML = '';
    isSessionActive = true;
    showNotification('success', `Sessão "${nomeSessaoInput.value}" iniciada.`);
    document.getElementById('btn-iniciar-sessao').disabled = true;
    nomeSessaoInput.disabled = true;
    document.getElementById('btn-encerrar-sessao').disabled = false;
}

function encerrarSessao() {
    if (!isSessionActive) return;
    const nomeSessao = document.getElementById('nome-sessao').value.trim();
    const tabela = document.getElementById("tabela").querySelector("tbody");
    if (tabela.rows.length > 0) {
        salvarDadosDaSessao(nomeSessao, tabela);
    } else {
        showNotification('info', 'Nenhum dado foi gravado. Nada foi salvo.');
    }
    isSessionActive = false;
    const nomeSessaoInput = document.getElementById('nome-sessao');
    document.getElementById('btn-iniciar-sessao').disabled = false;
    nomeSessaoInput.disabled = false;
    nomeSessaoInput.value = ''; 
    document.getElementById('btn-encerrar-sessao').disabled = true;
}

function salvarDadosDaSessao(nome, tabela) {
    const dadosTabela = Array.from(tabela.rows).map(linha => ({
        timestamp: linha.cells[0].innerText,
        tempo_esp: linha.cells[1].innerText,
        newtons: linha.cells[2].innerText,
        grama_forca: linha.cells[3].innerText,
        quilo_forca: linha.cells[4].innerText
    })).reverse();

    const metadadosMotor = {
        name: document.getElementById('eng-name').value.trim() || nome.replace(/[^a-zA-Z0-9_]/g, '_'),
        diameter: parseFloat(document.getElementById('eng-diameter').value) || 45,
        length: parseFloat(document.getElementById('eng-length').value) || 200,
        delay: parseFloat(document.getElementById('eng-delay').value) || 0,
        propweight: parseFloat(document.getElementById('eng-propweight').value) || 0.1,
        totalweight: parseFloat(document.getElementById('eng-totalweight').value) || 0.25,
        manufacturer: document.getElementById('eng-manufacturer').value.trim() || 'GFIG-IFC'
    };

    const gravacao = {
        id: Date.now(), nome, timestamp: new Date().toISOString(),
        dadosTabela, metadadosMotor
    };

    try {
        let gravacoes = JSON.parse(localStorage.getItem('balancaGravacoes')) || [];
        gravacoes.push(gravacao);
        localStorage.setItem('balancaGravacoes', JSON.stringify(gravacoes));
        showNotification('success', `Sessão "${nome}" salva!`);
        carregarGravacoesComImpulso();
    } catch (e) {
        showNotification('error', 'Erro ao salvar. O Local Storage pode estar cheio.');
    }
}

// --- Funções Auxiliares e de UI ---

function abrirAba(element, abaID) {
  document.querySelectorAll('.tabcontent').forEach(tab => { tab.style.display = "none"; tab.classList.remove('active'); });
  document.querySelectorAll('.tablink').forEach(link => link.classList.remove('active'));
  const el = document.getElementById(abaID);
  if (abaID === 'abaControles') {
    sendCommandToWorker('get_config');
  }
  el.style.display = "block";
  el.classList.add('active');
  element.classList.add('active');
}

function showNotification(type, message, duration = 5000) {
  const area = document.getElementById('notification-area');
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = message;
  area.prepend(notification);
  setTimeout(() => {
    notification.style.transition = 'opacity 0.5s';
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 500);
  }, duration);
}

function convertForce(valueN, unit) {
  const g_force_conversion = 101.9716;
  if (unit === 'gf') return valueN * g_force_conversion;
  if (unit === 'kgf') return valueN * (g_force_conversion / 1000);
  return valueN;
}

function atualizarToleranciaEmGramas() {
  const toleranciaBruta = parseFloat(document.getElementById("param-tolerancia").value);
  const fatorConversao = parseFloat(document.getElementById("param-conversao").value);
  const el = document.getElementById("tolerancia-em-gramas");
  if (el && !isNaN(toleranciaBruta) && !isNaN(fatorConversao) && fatorConversao !== 0) {
    el.textContent = `≈ ${(toleranciaBruta / fatorConversao).toFixed(3)} gf`;
  }
}

function atualizarCapacidadeEmKg() {
  const capacidadeGramas = parseFloat(document.getElementById("param-capacidade-maxima").value);
  const el = document.getElementById("capacidade-em-kg");
  if (el && !isNaN(capacidadeGramas)) {
    el.textContent = `≈ ${(capacidadeGramas / 1000).toFixed(2)} kg`;
  }
}

function atualizarErroAbsoluto() {
  const capacidadeGramas = parseFloat(document.getElementById("param-capacidade-maxima").value);
  const percentAcuracia = parseFloat(document.getElementById("param-acuracia").value);
  const el = document.getElementById("erro-absoluto");
  if (el && !isNaN(capacidadeGramas) && !isNaN(percentAcuracia)) {
    el.textContent = `Erro: ±${((capacidadeGramas * percentAcuracia) / 100).toFixed(2)} g`;
  }
}

// --- Funções de Filtros e Análise de Ruído ---

function aplicarFiltrosGramas(valorGramas) {
  let valor = valorGramas;
  if (filtroZonaMortaAtivo) valor = aplicarZonaMorta(valor);
  if (arredondamentoInteligenteAtivo) valor = aplicarArredondamentoInteligente(valor);
  return valor;
}

function aplicarZonaMorta(valorGramas) {
  const erroAbsoluto = (capacidadeMaximaGramas * percentualAcuracia) / 100;
  return Math.abs(valorGramas) <= erroAbsoluto ? 0 : valorGramas;
}

function aplicarArredondamentoInteligente(valorGramas) {
  const erroAbsoluto = (capacidadeMaximaGramas * percentualAcuracia) / 100;
  let casasDecimais = (erroAbsoluto >= 1) ? 1 : (erroAbsoluto >= 0.1) ? 2 : 3;
  return parseFloat(valorGramas.toFixed(casasDecimais));
}

function atualizarStatusFiltros() {
  const erroAbsoluto = (capacidadeMaximaGramas * percentualAcuracia) / 100;
  const casasDecimais = (erroAbsoluto >= 1) ? 1 : (erroAbsoluto >= 0.1) ? 2 : 3;
  
  const infoZonaMorta = document.getElementById('info-zona-morta');
  if (infoZonaMorta) {
    infoZonaMorta.textContent = filtroZonaMortaAtivo ? `✓ Zona Morta (±${erroAbsoluto.toFixed(2)}g)` : `✗ Zona Morta`;
    infoZonaMorta.style.color = filtroZonaMortaAtivo ? '#27ae60' : '#95a5a6';
  }
  
  const infoArredondamento = document.getElementById('info-arredondamento');
  if (infoArredondamento) {
    infoArredondamento.textContent = arredondamentoInteligenteAtivo ? `✓ Arredondamento (${casasDecimais} casas)` : `✗ Arredondamento`;
    infoArredondamento.style.color = arredondamentoInteligenteAtivo ? '#27ae60' : '#95a5a6';
  }
}

function toggleFiltroZonaMorta() {
  filtroZonaMortaAtivo = !filtroZonaMortaAtivo;
  const btn = document.getElementById('btn-zona-morta');
  btn.textContent = `Zona Morta: ${filtroZonaMortaAtivo ? 'ON' : 'OFF'}`;
  btn.style.background = filtroZonaMortaAtivo ? '#27ae60' : '#95a5a6';
  atualizarStatusFiltros();
}

function toggleArredondamentoInteligente() {
  arredondamentoInteligenteAtivo = !arredondamentoInteligenteAtivo;
  const btn = document.getElementById('btn-arredondamento');
  btn.textContent = `Arredondar: ${arredondamentoInteligenteAtivo ? 'ON' : 'OFF'}`;
  btn.style.background = arredondamentoInteligenteAtivo ? '#27ae60' : '#95a5a6';
  atualizarStatusFiltros();
}

function toggleAntiNoising() {
  antiNoisingAtivo = !antiNoisingAtivo;
  const btn = document.getElementById('btn-anti-noising');
  if (antiNoisingAtivo) {
    btn.textContent = `Anti-Noising: ON`;
    btn.classList.add('btn-sucesso');
  } else {
    btn.textContent = 'Anti-Noising: OFF';
    btn.classList.remove('btn-sucesso');
  }
}

function applyAntiNoising(forceValue) {
  if (currentStdDev === 0) return forceValue;
  const threshold = currentStdDev * antiNoisingMultiplier;
  return Math.abs(forceValue - noiseMean) <= threshold ? 0 : forceValue - noiseMean;
}

function calculateNoiseStatistics(forceValue) {
  noiseBuffer.push(forceValue);
  if (noiseBuffer.length > NOISE_BUFFER_SIZE) noiseBuffer.shift();
  if (noiseBuffer.length < 10) return;
  noiseMean = noiseBuffer.reduce((s, v) => s + v, 0) / noiseBuffer.length;
  const variance = noiseBuffer.reduce((s, v) => s + Math.pow(v - noiseMean, 2), 0) / noiseBuffer.length;
  currentStdDev = Math.sqrt(variance);
  updateNoiseDisplay();
}

function updateNoiseDisplay() {
    // This function is intentionally left blank as the controls are not in the main UI anymore
}

function startNoiseAnalysis() {
  isStabilityMode = true;
  noiseBuffer = [];
  showNotification('info', 'Analisando ruído... Mantenha a balança VAZIA e ESTÁVEL por 5 segundos!', 5000);
  setTimeout(() => {
    isStabilityMode = false;
    showNotification('success', `✅ Ruído calibrado!`);
  }, 5000);
}

function resetNoiseAnalysis() {
  noiseBuffer = []; currentStdDev = 0; noiseMean = 0; isStabilityMode = false;
  showNotification('info', 'Análise de ruído resetada');
}

function setAntiNoisingMultiplier(multiplier) {
  antiNoisingMultiplier = parseFloat(multiplier);
}

function addNoiseControlsToUI() {
    // This function is intentionally left blank as the controls are not in the main UI anymore
}

// --- Funções de Áudio e Alertas ---

function inicializarAudioContext() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { console.warn('Áudio não disponível'); }
}

function toggleAvisosAudio() {
  avisosAudioAtivados = document.getElementById('audio-avisos').checked;
  if (avisosAudioAtivados && audioContext?.state === 'suspended') audioContext.resume();
  showNotification('info', `🔊 Avisos sonoros ${avisosAudioAtivados ? 'ativados' : 'desativados'}`);
}

function tocarBeep(freq = 800, dur = 100, vol = 0.2) {
  if (!avisosAudioAtivados || !audioContext) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + dur / 1000);
  osc.start();
  osc.stop(audioContext.currentTime + dur / 1000);
}

function tocarAlertaDesconexao() { tocarBeep(400, 100); setTimeout(() => tocarBeep(300, 100), 150); }
function tocarAlertaReconexao() { tocarBeep(600, 100); setTimeout(() => tocarBeep(800, 100), 120); }
function tocarAlertaEstabilizacao() { tocarBeep(500, 150); }

function verificarStatusEstabilizacao(status) {
  const problema = status?.includes('não estabilizando');
  if (problema && !ultimoStatusEstabilizacao) {
    contadorFalhasEstabilizacao++;
    if (contadorFalhasEstabilizacao >= 3) document.getElementById('alerta-estabilizacao').classList.add('ativo');
  } else if (!problema) {
    contadorFalhasEstabilizacao = 0;
    document.getElementById('alerta-estabilizacao').classList.remove('ativo');
  }
  ultimoStatusEstabilizacao = !problema;
}

// --- Atalhos de Teclado ---

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (event) => {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
    const key = event.key.toLowerCase();
    if (event.shiftKey) {
        if (key === 't') { event.preventDefault(); tare(); }
        else if (key === 'c') { event.preventDefault(); calibrar(); }
        else if (key === 'a') { event.preventDefault(); startNoiseAnalysis(); }
    } else if (!event.ctrlKey && !event.metaKey) {
        if (key === 'l') { event.preventDefault(); clearChart(); }
        else if (key === 'p') { event.preventDefault(); toggleChartPause(); }
    }
  });
}

let isDataLabelsEnabled = false;

function toggleDataLabels() {
  isDataLabelsEnabled = !isDataLabelsEnabled;
  chart.updateOptions({
    dataLabels: {
      enabled: isDataLabelsEnabled
    }
  });
}

function setInterpolation(curve) {
  chart.updateOptions({
    stroke: {
      curve: curve
    }
  });
}

function toggleFullscreen() {
  const chartEl = document.querySelector("#grafico");
  if (!document.fullscreenElement) {
    chartEl.requestFullscreen().catch(err => {
      alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
    });
  } else {
    document.exitFullscreen();
  }
}

function setYAxisRange(mode) {
  if (mode === 'auto') {
    chart.updateOptions({
      yaxis: {
        min: undefined,
        max: undefined
      }
    });
  } else if (mode === 'fixed') {
    // A capacidadeMaximaGramas é atualizada pela função updateConfigForm
    if (!capacidadeMaximaGramas || capacidadeMaximaGramas <= 0) {
      showNotification('error', 'Capacidade máxima da célula não definida. Verifique os parâmetros.');
      return;
    }

    let maxRange;
    const gravity = 9.80665;
    const maxForceInN = (capacidadeMaximaGramas / 1000) * gravity;
    maxRange = convertForce(maxForceInN, displayUnit);

    chart.updateOptions({
      yaxis: {
        min: 0,
        max: maxRange
      }
    });
  }
}

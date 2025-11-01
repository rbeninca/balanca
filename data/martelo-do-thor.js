// ==========================================
// MARTELO DE THOR - Jogo Fullscreen
// ==========================================

// Estado do Jogo
const marteloState = {
  playerName: '',
  currentAttempt: 1,
  maxAttempts: 3,
  forceMaxPerAttempt: [0, 0, 0], // Força máxima de cada tentativa
  attempts: [], // Histórico completo
  totalMaxForce: 0,
  isGameRunning: false,
  countdownActive: false,
  // Dados para o gráfico - array de arrays, cada um contém os pontos (tempo, força) de uma tentativa
  forceDataPerAttempt: [[], [], []]
};

// Elementos DOM
const elements = {};
let frasesData = null;
let gameSettings = {};

// Áudio
const sounds = {};

// Constantes
const ATTEMPT_DURATION = 10000; // 10 segundos (aumentado de 3)
const COUNTDOWN_DURATION = 3000; // 3 segundos de contagem regressiva


// ==========================================
// INICIALIZAÇÃO
// ==========================================

// Elemento do painel de debug
let debugPanel = null;



document.addEventListener('DOMContentLoaded', () => {
  initializeDOMElements();
  setupEventListeners();
  loadFrases();
  loadSettings();
  showScreen('start');
  startForcePolling(); // Inicia polling de força
  createDebugPanel(); // Criar painel de debug permanente
  console.log('✓ Martelo do Thor carregado');
});

async function loadFrases() {
  try {
    const response = await fetch('frases.json');
    frasesData = await response.json();
    console.log('✓ Frases de deboche carregadas com sucesso!');
  } catch (e) {
    console.error('Erro ao carregar frases.json:', e);
  }
}

function initializeDOMElements() {
  // Preenche o objeto de elementos
  elements.gameContainer = document.getElementById('gameContainer');
  elements.screens = {
    start: document.getElementById('start-screen'),
    game: document.getElementById('game-screen'),
    results: document.getElementById('results-screen'),
    ranking: document.getElementById('ranking-screen'),
    settings: document.getElementById('settings-screen') // Adicionado
  };
  elements.playerNameInput = document.getElementById('playerName');
  elements.startButton = document.getElementById('startButton');
  elements.countdown = document.getElementById('countdown');
  elements.currentPlayer = document.getElementById('currentPlayer');
  elements.forceDisplay = document.getElementById('forceDisplay');
  elements.newtonDisplay = document.getElementById('newtonDisplay');
  elements.progressBar = document.getElementById('progressBar');
  elements.verticalForceBar = document.getElementById('vertical-force-bar');
  elements.forceMarkerCurrent = document.getElementById('force-marker-current');
  elements.forceMarkerMax = document.getElementById('force-marker-max');
  elements.labelForceCurrent = document.getElementById('label-force-current');
  elements.labelForceMax = document.getElementById('label-force-max');
  elements.resultForce = document.getElementById('resultForce');
  elements.motivationalMessage = document.getElementById('motivationalMessage');
  elements.playAgainButton = document.getElementById('playAgainButton');
  elements.showRankingButton = document.getElementById('showRankingButton');
  elements.rankingTableBody = document.querySelector('#rankingTable tbody');
  elements.backToStartButton = document.getElementById('backToStartButton');
  elements.clearRankingButton = document.getElementById('clearRankingButton');
  elements.settingsButton = document.getElementById('settingsButton');
  elements.settingsScreen = document.getElementById('settings-screen');
  elements.maxForceInput = document.getElementById('maxForceInput');
  elements.thresholdFraca = document.getElementById('threshold-fraca');
  elements.thresholdMedia = document.getElementById('threshold-media');
  elements.thresholdAlta = document.getElementById('threshold-alta');
  elements.thresholdMuitoAlta = document.getElementById('threshold-muito_alta');
  elements.thresholdEpica = document.getElementById('threshold-epica');
  elements.saveSettingsButton = document.getElementById('saveSettingsButton');
  elements.dynamicMaxForceCheckbox = document.getElementById('dynamicMaxForceCheckbox');

  // Ranking Markers
  elements.rankingMarkers = {
    marker1: document.getElementById('rank-marker-1'),
    marker2: document.getElementById('rank-marker-2'),
    marker3: document.getElementById('rank-marker-3')
  };
  elements.forceGraphCanvas = document.getElementById('forceGraphCanvas');
  elements.attemptMessage = document.getElementById('attempt-message');
  
  // Modal de Novo Recorde
  elements.modalNovoRecorde = document.getElementById('modal-novo-recorde');
  elements.modalRecordeMensagem = document.getElementById('modal-recorde-mensagem');
  elements.modalRecordeSuaForca = document.getElementById('modal-recorde-sua-forca');
  elements.modalRecordeAnterior = document.getElementById('modal-recorde-anterior');

  // Modal de Sobrecarga
  elements.modalSobrecarga = document.getElementById('modal-alerta-sobrecarga-martelo');
  elements.modalSobrecargaTitulo = document.getElementById('modal-sobrecarga-titulo-martelo');
  elements.modalSobrecargaMensagem = document.getElementById('modal-sobrecarga-mensagem-martelo');
  elements.modalSobrecargaValorAtual = document.getElementById('modal-sobrecarga-valor-atual-martelo');
  elements.modalSobrecargaBarraProgresso = document.getElementById('modal-sobrecarga-barra-progresso-martelo');
  elements.modalSobrecargaPercentual = document.getElementById('modal-sobrecarga-percentual-martelo');
  elements.modalSobrecargaValorLimite = document.getElementById('modal-sobrecarga-valor-limite-martelo');

  // Preenche o objeto de sons
  sounds.countdown = document.getElementById('sound-countdown');
  sounds.go = document.getElementById('sound-go');
  sounds.level1 = document.getElementById('sound-level-1');
  sounds.level2 = document.getElementById('sound-level-2');
  sounds.level3 = document.getElementById('sound-level-3');
  sounds.level4 = document.getElementById('sound-level-4');
  sounds.level5 = document.getElementById('sound-level-5');
  sounds.level6 = document.getElementById('sound-level-6');
  sounds.result = document.getElementById('sound-result');
  sounds.newRecord = new Audio('sounds/new_record.mp3'); // Som para novo recorde
}

function setupEventListeners() {
  elements.startButton.addEventListener('click', startGame);
  elements.playAgainButton.addEventListener('click', resetGame);
  elements.showRankingButton.addEventListener('click', showRankingScreen);
  elements.backToStartButton.addEventListener('click', () => showScreen('start'));
  elements.clearRankingButton.addEventListener('click', clearRanking);
  elements.settingsButton.addEventListener('click', showSettingsScreen);
  elements.saveSettingsButton.addEventListener('click', saveSettings);

  elements.dynamicMaxForceCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      elements.maxForceInput.disabled = true;
      // Recalcula o valor dinâmico e atualiza o input
      const ranking = JSON.parse(localStorage.getItem('martelo_ranking') || '[]');
      let dynamicMax = 300; // Fallback
      if (ranking.length > 0) {
        dynamicMax = Math.ceil(ranking[0].forceKg / 10) * 10;
      }
      elements.maxForceInput.value = dynamicMax;
    } else {
      elements.maxForceInput.disabled = false;
    }
  });
  
  // Adicionar atalho para debug (tecla D)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === 'D') {
      debugForceReading();
    }
  });
}

// ==========================================
// POLLING DE FORÇA
// ==========================================

let currentForceValue = 0;
let forcePollingActive = false;
let forcePollingError = null;

function startForcePolling() {
  // Primeiro, tentar acessar imediatamente para detectar erros
  try {
    if (window.opener && window.opener.sharedState && window.opener.sharedState.forcaAtual !== undefined) {
      console.log('✓ Acesso ao window.opener.sharedState.forcaAtual disponível!');
      forcePollingActive = true;
    } else if (window.opener) {
      console.warn('⚠️ window.opener encontrado mas forcaAtual não está definido');
      forcePollingError = 'forcaAtual não disponível na janela pai';
    } else {
      console.warn('⚠️ window.opener é null - página pode ter sido aberta em fullscreen');
      forcePollingError = 'window.opener indisponível';
    }
  } catch (e) {
    console.error('❌ Erro ao acessar window.opener:', e.message);
    forcePollingError = e.message;
  }

  // Inicia o polling de qualquer forma
  const pollingInterval = setInterval(() => {
    try {
      if (window.opener && window.opener.sharedState) {
        if (typeof window.opener.sharedState.forcaAtual === 'number') {
          currentForceValue = window.opener.sharedState.forcaAtual;
          forcePollingActive = true;
          forcePollingError = null;
        }

        // Verifica o estado do alerta de sobrecarga
        const overloadAlertState = window.opener.sharedState.overloadAlert;
        if (overloadAlertState && overloadAlertState.active) {
          elements.modalSobrecarga.classList.add('ativo');
          updateOverloadModal(overloadAlertState);
        } else {
          elements.modalSobrecarga.classList.remove('ativo');
        }
      }
    } catch (e) {
      // Continua tentando mesmo com erro
      if (!forcePollingError) {
        console.warn('Erro recorrente ao acessar sharedState:', e.message);
        forcePollingError = e.message;
      }
    }
  }, 50);

  // Log do status de polling para debug
  setTimeout(() => {
    console.log(`[POLLING] Status: ${forcePollingActive ? '✓ ATIVO' : '✗ INATIVO'} | Valor: ${currentForceValue} N | Erro: ${forcePollingError || 'nenhum'}`);
  }, 1000);
}

// ==========================================
// TELAS
// ==========================================

function showScreen(screenName) {
  Object.values(elements.screens).forEach(screen => {
    screen.classList.remove('active');
  });
  elements.screens[screenName].classList.add('active');
}

// ==========================================
// INICIAR JOGO
// ==========================================

function startGame() {
  const name = elements.playerNameInput.value.trim();
  
  if (!name) {
    alert('Digite seu nome, Viking! ⚡');
    return;
  }

  marteloState.playerName = name;
  marteloState.currentAttempt = 1;
  marteloState.forceMaxPerAttempt = [0, 0, 0];
  marteloState.totalMaxForce = 0;
  marteloState.forceDataPerAttempt = [[], [], []]; // Limpar dados do gráfico
  
  updateRankingMarkers(); // Atualiza os marcadores do ranking
  showScreen('game');
  startCountdown();
}

// ==========================================
// CONTAGEM REGRESSIVA
// ==========================================

async function startCountdown() {
  marteloState.countdownActive = true;
  elements.countdown.innerHTML = '';
  
  const counts = [3, 2, 1];
  
  for (let i = 0; i < counts.length; i++) {
    const count = counts[i];
    // Efeito cinematográfico com zoom e glow
    elements.countdown.innerHTML = `
      <div class="countdown-number" style="
        animation: countdown-cinema 1s ease-out;
        font-size: 20rem;
        font-weight: 900;
        text-shadow: 0 0 40px ${getForceColor(100)}, 0 0 80px ${getForceColor(100)};
      ">${count}</div>
    `;
    
    if (sounds.countdown) {
      try {
        sounds.countdown.currentTime = 0;
        sounds.countdown.play().catch(e => console.log('Som countdown:', e));
      } catch (e) {}
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // "AGORA!" com efeito espetacular
  elements.countdown.innerHTML = `
    <div class="countdown-go" style="
      animation: countdown-go-cinema 0.8s ease-out;
      font-size: 15rem;
      font-weight: 900;
      background: linear-gradient(45deg, #00d9ff, #ff00e0, #fff300);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-shadow: 0 0 50px rgba(255, 255, 0, 1);
      letter-spacing: 10px;
    ">⚡ AGORA! ⚡</div>
  `;
  
  if (sounds.go) {
    try {
      sounds.go.currentTime = 0;
      sounds.go.play().catch(e => console.log('Som go:', e));
    } catch (e) {}
  }

  await new Promise(resolve => setTimeout(resolve, 1000));
  elements.countdown.innerHTML = '';
  
  marteloState.countdownActive = false;
  startAttempt();
}

// ==========================================
// TENTATIVA
// ==========================================

function startAttempt() {
  marteloState.isGameRunning = true;
  const attemptIndex = marteloState.currentAttempt - 1;
  marteloState.forceMaxPerAttempt[attemptIndex] = 0;
  marteloState.forceDataPerAttempt[attemptIndex] = []; // Limpar dados anteriores

  elements.currentPlayer.innerHTML = `
    <div class="attempt-info">
      <span>${marteloState.playerName}</span>
      <span>Tentativa ${marteloState.currentAttempt}/${marteloState.maxAttempts}</span>
    </div>
  `;

  const startTime = Date.now();

  const interval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const remainingMs = Math.max(0, ATTEMPT_DURATION - elapsed);
    const remainingSec = (remainingMs / 1000).toFixed(1);

    // Atualizar força em tempo real (usar a variável global)
    const forceN = currentForceValue;
    const forceKg = forceN / 9.80665; // Newton para kgf

    // Capturar dados para o gráfico (tempo em segundos e força em kg)
    const timeInSeconds = (elapsed / 1000);
    marteloState.forceDataPerAttempt[attemptIndex].push({
      time: timeInSeconds,
      force: forceKg
    });

    // Atualizar máximo desta tentativa
    if (forceKg > marteloState.forceMaxPerAttempt[attemptIndex]) {
      marteloState.forceMaxPerAttempt[attemptIndex] = forceKg;
      
      if (forceKg > marteloState.totalMaxForce) {
        marteloState.totalMaxForce = forceKg;
      }

      // Efeitos visuais por nível
      triggerLevelEffect(forceKg);
    }

    // Atualizar display com timer
    updateForceDisplay(forceKg, remainingSec);

    // Desenhar gráfico
    drawForceGraph();

    // Verificar se acabou
    if (remainingMs <= 0) {
      clearInterval(interval);
      endAttempt();
    }
  }, 50);
}

let isRecordAnimationPlaying = false;

function updateForceDisplay(forceKg, remainingSec = null) {
  const forceN = forceKg * 9.80665;
  
  // Tamanho muito grande
  elements.forceDisplay.textContent = `${forceKg.toFixed(1)} kg`;
  elements.forceDisplay.style.fontSize = '12rem';
  elements.forceDisplay.style.fontWeight = '900';
  elements.forceDisplay.style.color = getForceColor(forceKg);
  elements.forceDisplay.style.textShadow = `0 0 20px ${getForceColor(forceKg)}, 0 0 40px ${getForceColor(forceKg)}`;
  
  // Mostrar timer se estiver em tentativa
  let newtonText = `(≈ ${forceN.toFixed(1)} N)`;
  if (remainingSec !== null && remainingSec !== undefined) {
    const timerColor = remainingSec <= 2 ? '#ff0000' : '#ffd700';
    newtonText += ` <span style="color: ${timerColor}; font-weight: bold; margin-left: 20px;">⏱️ ${remainingSec}s</span>`;
  }
  
  elements.newtonDisplay.innerHTML = newtonText;
  elements.newtonDisplay.style.fontSize = '2.5rem';
  elements.newtonDisplay.style.fontWeight = 'bold';
  elements.newtonDisplay.style.color = '#aaa';

  // Barra de progresso horizontal
  const percentage = Math.min((forceKg / gameSettings.maxForceDisplay) * 100, 100);
  elements.progressBar.style.width = percentage + '%';
  elements.progressBar.style.background = getForceColor(forceKg);

  // Barra vertical de fundo - mostra a força atual
  const height = Math.min((forceKg / gameSettings.maxForceDisplay) * 100, 100);
  elements.verticalForceBar.style.height = height + '%';
  
  // Usar gradiente com cores mais sutis para background
  if (forceKg < 10) {
    elements.verticalForceBar.style.background = 'linear-gradient(to top, rgba(52, 152, 219, 0.15), rgba(0, 217, 255, 0.05))';
  } else if (forceKg < 30) {
    elements.verticalForceBar.style.background = 'linear-gradient(to top, rgba(46, 204, 113, 0.15), rgba(0, 217, 255, 0.05))';
  } else if (forceKg < 60) {
    elements.verticalForceBar.style.background = 'linear-gradient(to top, rgba(243, 156, 18, 0.15), rgba(255, 102, 0, 0.08))';
  } else if (forceKg < 100) {
    elements.verticalForceBar.style.background = 'linear-gradient(to top, rgba(231, 76, 60, 0.15), rgba(255, 0, 0, 0.10))';
  } else if (forceKg < 200) {
    elements.verticalForceBar.style.background = 'linear-gradient(to top, rgba(155, 89, 182, 0.15), rgba(255, 0, 0, 0.12))';
  } else {
    elements.verticalForceBar.style.background = 'linear-gradient(to top, rgba(255, 20, 147, 0.20), rgba(255, 0, 0, 0.15))';
  }
  
  // Atualizar label de força atual
  if (elements.labelForceCurrent) {
    elements.labelForceCurrent.textContent = `${forceKg.toFixed(1)} kg`;
  }
  
  // Posicionar marcador de força atual
  if (elements.forceMarkerCurrent) {
    elements.forceMarkerCurrent.style.bottom = height + '%';
  }
  
  // Verificar se há novo recorde (força máxima aumentou)
  const forceMaxAnterior = parseFloat(elements.labelForceMax?.textContent?.split(':')[1]?.trim()) || 0;
  
  // Atualizar label e posição de força máxima
  if (elements.labelForceMax) {
    elements.labelForceMax.textContent = `${marteloState.totalMaxForce.toFixed(1)} kg`;
    
    // Efeito de novo recorde
    if (marteloState.totalMaxForce > forceMaxAnterior && !isRecordAnimationPlaying) {
      isRecordAnimationPlaying = true;
      elements.forceMarkerMax.style.animation = 'none';
      // Força um reflow para reiniciar a animação
      void elements.forceMarkerMax.offsetWidth;
      elements.forceMarkerMax.style.animation = 'record-shock 0.6s ease-out';
      setTimeout(() => {
        isRecordAnimationPlaying = false;
        elements.forceMarkerMax.style.animation = ''; // Limpa a animação ao final
      }, 600);
    }
  }
  
  if (elements.forceMarkerMax) {
    const maxPercentage = Math.min((marteloState.totalMaxForce / gameSettings.maxForceDisplay) * 100, 100);
    elements.forceMarkerMax.style.bottom = maxPercentage + '%';
  }
}

function getForceColor(forceKg) {
  if (forceKg < 10) return '#3498db'; // Azul
  if (forceKg < 30) return '#2ecc71'; // Verde
  if (forceKg < 60) return '#f39c12'; // Laranja
  if (forceKg < 100) return '#e74c3c'; // Vermelho
  if (forceKg < 200) return '#9b59b6'; // Roxo
  return '#ff1493'; // Magenta (Lendário)
}

function triggerLevelEffect(forceKg) {
  let level = 0;
  if (forceKg >= 200) {
    level = 6;
  } else if (forceKg >= 100) {
    level = 5;
  } else if (forceKg >= 60) {
    level = 4;
  } else if (forceKg >= 30) {
    level = 3;
  } else if (forceKg >= 10) {
    level = 2;
  } else if (forceKg > 0) {
    level = 1;
  }

  if (level > 0 && sounds[`level${level}`]) {
    try {
      sounds[`level${level}`].currentTime = 0;
      sounds[`level${level}`].play().catch(e => console.log(`Som level ${level}:`, e));
    } catch (e) {}
  }
}

// ==========================================
// GRÁFICO DE FORÇA
// ==========================================

function drawForceGraph() {
  if (!elements.forceGraphCanvas) return;
  
  const canvas = elements.forceGraphCanvas;
  const rect = canvas.parentElement.getBoundingClientRect();
  
  // Configurar canvas - deixar mais espaço para os eixos
  canvas.width = rect.width;
  canvas.height = rect.height;
  
  const ctx = canvas.getContext('2d');
  const paddingLeft = 60;   // Espaço para labels da esquerda
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;  // Espaço para labels do tempo
  
  const graphWidth = canvas.width - paddingLeft - paddingRight;
  const graphHeight = canvas.height - paddingTop - paddingBottom;
  
  // Limpar canvas
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Desenhar grid
  ctx.strokeStyle = 'rgba(0, 217, 255, 0.1)';
  ctx.lineWidth = 1;
  
  // Linhas verticais (tempo)
  for (let i = 0; i <= 10; i++) {
    const x = paddingLeft + (graphWidth / 10) * i;
    ctx.beginPath();
    ctx.moveTo(x, paddingTop);
    ctx.lineTo(x, canvas.height - paddingBottom);
    ctx.stroke();
  }
  
  // Linhas horizontais (força)
  for (let i = 0; i <= 5; i++) {
    const y = canvas.height - paddingBottom - (graphHeight / 5) * i;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(canvas.width - paddingRight, y);
    ctx.stroke();
  }
  
  // Cores para cada tentativa
  const colors = ['#00d9ff', '#ff00e0', '#fff300']; // Ciano, Magenta, Amarelo
  
  // Desenhar cada tentativa
  for (let attemptIndex = 0; attemptIndex < marteloState.currentAttempt; attemptIndex++) {
    const data = marteloState.forceDataPerAttempt[attemptIndex];
    if (!data || data.length === 0) continue;
    
    // Gradiente para a linha
    const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
    gradient.addColorStop(0, colors[attemptIndex]);
    gradient.addColorStop(1, getForceColor(marteloState.forceMaxPerAttempt[attemptIndex]));

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 5; // Aumentado para 5px
    ctx.globalAlpha = 0.9;
    
    // Adicionar glow/brilho à linha
    ctx.shadowColor = colors[attemptIndex];
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    ctx.beginPath();
    
    let maxForce = 0;
    let maxX = 0, maxY = 0;
    
    // Desenhar cada ponto
    for (let i = 0; i < data.length; i++) {
      const point = data[i];
      const timePercent = Math.min(point.time / (ATTEMPT_DURATION / 1000), 1);
      const forcePercent = Math.min(point.force / gameSettings.maxForceDisplay, 1);
      
      const x = paddingLeft + timePercent * graphWidth;
      const y = canvas.height - paddingBottom - forcePercent * graphHeight;
      
      // Encontrar o máximo
      if (point.force > maxForce) {
        maxForce = point.force;
        maxX = x;
        maxY = y;
      }
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.stroke();
    
    // Desenhar ponto de máximo (círculo destacado)
    ctx.shadowBlur = 15;
    ctx.shadowColor = colors[attemptIndex];
    ctx.fillStyle = colors[attemptIndex];
    ctx.beginPath();
    ctx.arc(maxX, maxY, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Círculo externo (anel)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(maxX, maxY, 10, 0, Math.PI * 2);
    ctx.stroke();
    
    // Label do máximo perto do ponto
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 5;
    ctx.fillText(`${maxForce.toFixed(0)}kg`, maxX, maxY - 20);
    
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;
  }
  
  // Desenhar eixos
  ctx.strokeStyle = 'rgba(0, 217, 255, 0.5)';
  ctx.lineWidth = 2;
  
  // Eixo X (tempo)
  ctx.beginPath();
  ctx.moveTo(paddingLeft, canvas.height - paddingBottom);
  ctx.lineTo(canvas.width - paddingRight, canvas.height - paddingBottom);
  ctx.stroke();
  
  // Eixo Y (força)
  ctx.beginPath();
  ctx.moveTo(paddingLeft, paddingTop);
  ctx.lineTo(paddingLeft, canvas.height - paddingBottom);
  ctx.stroke();
  
  // Labels da força (colocar sobre o gráfico no início/fim quando necessário)
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'right';
  
  for (let i = 0; i <= 5; i++) {
    const force = (gameSettings.maxForceDisplay / 5) * i;
    const y = canvas.height - paddingBottom - (graphHeight / 5) * i;
    
    // Label sobre o gráfico (direita do eixo Y)
    ctx.fillStyle = 'rgba(0, 217, 255, 0.9)';
    ctx.fillText(`${force.toFixed(0)}kg`, paddingLeft - 10, y + 4);
  }
  
  // Labels do tempo (colocar sobre o gráfico)
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  
  for (let i = 0; i <= 10; i += 2) {
    const x = paddingLeft + (graphWidth / 10) * i;
    ctx.fillStyle = 'rgba(0, 217, 255, 0.9)';
    ctx.fillText(`${i}s`, x, canvas.height - paddingBottom + 20);
  }
  
  // Legenda
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'left';
  const legendX = canvas.width - 210;
  const legendY = paddingTop + 10;
  
  for (let i = 0; i < marteloState.currentAttempt; i++) {
    ctx.fillStyle = colors[i];
    ctx.fillRect(legendX, legendY + i * 22, 15, 15);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText(`Tentativa ${i + 1}`, legendX + 22, legendY + i * 22 + 12);
  }
}

function endAttempt() {
  marteloState.isGameRunning = false;
  const attemptIndex = marteloState.currentAttempt - 1;
  const forceCurrent = marteloState.forceMaxPerAttempt[attemptIndex];

  // Mostra a mensagem de deboche da tentativa
  const message = getMotivationalMessage(forceCurrent);
  elements.attemptMessage.textContent = message;
  elements.attemptMessage.classList.add('visible');

  // Esconde a mensagem após alguns segundos
  setTimeout(() => {
    elements.attemptMessage.classList.remove('visible');
  }, 4000); // A mensagem fica visível por 4 segundos

  marteloState.attempts.push({
    attempt: marteloState.currentAttempt,
    force: forceCurrent,
    timestamp: new Date().toLocaleString('pt-BR')
  });

  // Próxima tentativa ou resultado
  if (marteloState.currentAttempt < marteloState.maxAttempts) {
    marteloState.currentAttempt++;
    setTimeout(() => startCountdown(), 4500); // Aumenta o tempo para dar tempo de ler a msg
  } else {
    setTimeout(() => showResultsScreen(), 4500);
  }
}

// ==========================================
// RESULTADOS
// ==========================================

function showResultsScreen() {
  showScreen('results');

  const forceKg = marteloState.totalMaxForce;
  const forceN = forceKg * 9.80665;

  elements.resultForce.innerHTML = `
    <div class="result-force-display">
      <div class="force-value">${forceKg.toFixed(1)} kg</div>
      <div class="force-newton">(≈ ${forceN.toFixed(1)} N)</div>
    </div>
  `;

  // Mensagem motivacional
  const message = getMotivationalMessage(forceKg);
  elements.motivationalMessage.textContent = message;

  // Salvar no ranking
  saveToRanking(marteloState.playerName, forceKg, forceN);

  if (sounds.result) {
    try {
      sounds.result.play().catch(e => console.log('Som result:', e));
    } catch (e) {}
  }

  // Exibir ranking automaticamente após 4 segundos
  setTimeout(() => {
    showRankingScreen();
  }, 4000);
}

function getMotivationalMessage(forceKg) {
  if (!frasesData) {
    return "Preparando o deboche...";
  }

  const percentage = (forceKg / gameSettings.maxForceDisplay) * 100;
  let category = null;

  if (percentage <= gameSettings.thresholds.fraca) {
    category = 'fraca';
  } else if (percentage <= gameSettings.thresholds.media) {
    category = 'media';
  } else if (percentage <= gameSettings.thresholds.alta) {
    category = 'alta';
  } else if (percentage <= gameSettings.thresholds.muito_alta) {
    category = 'muito_alta';
  } else {
    category = 'epica';
  }

  const categoryData = frasesData.forcas.find(f => f.nivel === category);
  if (!categoryData || categoryData.frases.length === 0) {
    return "Sua força é tão indescritível que não achei uma frase para ela.";
  }

  const randomFrase = categoryData.frases[Math.floor(Math.random() * categoryData.frases.length)];
  return randomFrase.texto;
}

// ==========================================
// SETTINGS
// ==========================================

function loadSettings() {
  const savedSettings = JSON.parse(localStorage.getItem('martelo_settings'));
  const defaultSettings = {
    maxForceDisplay: 300,
    useDynamicMaxForce: true, // Novo: habilitado por padrão
    thresholds: {
      fraca: 20,
      media: 50,
      alta: 80,
      muito_alta: 95,
      epica: 100
    }
  };

  gameSettings = { ...defaultSettings, ...savedSettings };

  // Se a opção dinâmica estiver ativa, calcula o valor do ranking
  if (gameSettings.useDynamicMaxForce) {
    const ranking = JSON.parse(localStorage.getItem('martelo_ranking') || '[]');
    if (ranking.length > 0) {
      gameSettings.maxForceDisplay = Math.ceil(ranking[0].forceKg / 10) * 10; // Arredonda para cima para a próxima dezena
    } else {
      // Se não houver ranking, usa o valor manual salvo ou o padrão
      gameSettings.maxForceDisplay = savedSettings?.maxForceDisplay || defaultSettings.maxForceDisplay;
    }
    elements.maxForceInput.disabled = true;
  } else {
    elements.maxForceInput.disabled = false;
  }

  // Update input fields
  elements.maxForceInput.value = gameSettings.maxForceDisplay;
  elements.dynamicMaxForceCheckbox.checked = gameSettings.useDynamicMaxForce;
  elements.thresholdFraca.value = gameSettings.thresholds.fraca;
  elements.thresholdMedia.value = gameSettings.thresholds.media;
  elements.thresholdAlta.value = gameSettings.thresholds.alta;
  elements.thresholdMuitoAlta.value = gameSettings.thresholds.muito_alta;
  elements.thresholdEpica.value = gameSettings.thresholds.epica;
}

function saveSettings() {
  gameSettings.useDynamicMaxForce = elements.dynamicMaxForceCheckbox.checked;
  // Salva o valor manual mesmo que o dinâmico esteja ativo
  gameSettings.maxForceDisplay = parseInt(elements.maxForceInput.value) || 300;
  
  gameSettings.thresholds.fraca = parseInt(elements.thresholdFraca.value) || 20;
  gameSettings.thresholds.media = parseInt(elements.thresholdMedia.value) || 50;
  gameSettings.thresholds.alta = parseInt(elements.thresholdAlta.value) || 80;
  gameSettings.thresholds.muito_alta = parseInt(elements.thresholdMuitoAlta.value) || 95;
  gameSettings.thresholds.epica = parseInt(elements.thresholdEpica.value) || 100;

  localStorage.setItem('martelo_settings', JSON.stringify(gameSettings));
  alert("Configurações salvas!");
  // Recarrega as configurações para aplicar a lógica dinâmica se necessário
  loadSettings(); 
  showScreen('start');
}

function showSettingsScreen() {
  loadSettings();
  showScreen('settings');
}

// ==========================================
// RANKING
// ==========================================

function saveToRanking(name, forceKg, forceN) {
  try {
    const ranking = JSON.parse(localStorage.getItem('martelo_ranking') || '[]');
    const oldRecord = ranking.length > 0 ? ranking[0] : null;

    // Verifica se o recorde foi quebrado
    if (oldRecord && forceKg > oldRecord.forceKg) {
      abrirModalNovoRecorde(name, forceKg, oldRecord);
    }

    // Encontra a tentativa com a força máxima
    const bestAttemptIndex = marteloState.forceMaxPerAttempt.indexOf(Math.max(...marteloState.forceMaxPerAttempt));
    const bestAttemptData = marteloState.forceDataPerAttempt[bestAttemptIndex];

    ranking.push({
      name,
      forceKg,
      forceN,
      date: new Date().toLocaleString('pt-BR'),
      curveData: bestAttemptData // Salva a curva da melhor tentativa
    });

    // Ordenar por força decrescente e manter top 50
    ranking.sort((a, b) => b.forceKg - a.forceKg);
    

    localStorage.setItem('martelo_ranking', JSON.stringify(ranking));
  } catch (e) {
    console.error("Erro ao salvar o ranking:", e);
    alert("Ocorreu um erro ao salvar o ranking. Verifique o console para mais detalhes.");
  }
}

function showRankingScreen() {
  showScreen('ranking');
  updateRankingTable();
}

function updateRankingTable() {
  try {
    const ranking = JSON.parse(localStorage.getItem('martelo_ranking') || '[]');
    elements.rankingTableBody.innerHTML = '';

    if (ranking.length === 0) {
      elements.rankingTableBody.innerHTML = '<tr><td colspan="5">Nenhum registro ainda!</td></tr>';
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];

    ranking.forEach((entry, index) => {
      const row = document.createElement('tr');
      const medal = medals[index] || `${index + 1}º`;

      // Create and append cells one by one
      const medalCell = document.createElement('td');
      medalCell.textContent = medal;
      row.appendChild(medalCell);

      const nameCell = document.createElement('td');
      nameCell.textContent = entry.name;
      row.appendChild(nameCell);

      const forceCell = document.createElement('td');
      forceCell.textContent = `${entry.forceKg.toFixed(1)} kg (${entry.forceN.toFixed(0)} N)`;
      row.appendChild(forceCell);

      const curveCell = document.createElement('td');
      const canvas = document.createElement('canvas');
      canvas.width = 150;
      canvas.height = 50;
      curveCell.appendChild(canvas);
      row.appendChild(curveCell);

      const dateCell = document.createElement('td');
      dateCell.textContent = entry.date;
      row.appendChild(dateCell);

      elements.rankingTableBody.appendChild(row);

      if (entry.curveData) {
        drawMiniGraph(canvas, entry.curveData);
      }
    });
  } catch (e) {
    console.error("Erro ao atualizar a tabela de ranking:", e);
    elements.rankingTableBody.innerHTML = '<tr><td colspan="5">Ocorreu um erro ao carregar o ranking.</td></tr>';
  }
}

function clearRanking() {
  if (confirm("Você tem certeza que deseja limpar TODO o ranking? Esta ação não pode ser desfeita.")) {
    localStorage.removeItem('martelo_ranking');
    updateRankingTable();
    console.log('Ranking limpo pelo usuário.');
  }
}

function updateRankingMarkers() {
  const ranking = JSON.parse(localStorage.getItem('martelo_ranking') || '[]');
  const top3 = ranking.slice(0, 3);

  // Esconde todos os marcadores primeiro
  Object.values(elements.rankingMarkers).forEach(marker => {
    if(marker) marker.classList.remove('visible');
  });

  top3.forEach((entry, index) => {
    const marker = elements.rankingMarkers[`marker${index + 1}`];
    if (!marker) return;

    const percentage = (entry.forceKg / gameSettings.maxForceDisplay) * 100;
    const bottomPosition = Math.min(percentage, 100); // Limita a 100%

    marker.style.bottom = `${bottomPosition}%`;
    marker.innerHTML = `<span>${index + 1}º - ${entry.name}: ${entry.forceKg.toFixed(1)} kg</span>`;
    marker.classList.add('visible');
  });
}

function drawMiniGraph(canvas, data) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  if (!data || data.length === 0) return;

  const maxForce = Math.max(...data.map(p => p.force));
  const maxTime = Math.max(...data.map(p => p.time));

  ctx.beginPath();
  ctx.strokeStyle = '#00d9ff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#00d9ff';
  ctx.shadowBlur = 5;

  for (let i = 0; i < data.length; i++) {
    const point = data[i];
    const x = (point.time / maxTime) * width;
    const y = height - (point.force / maxForce) * height;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

// ==========================================
// MODAL NOVO RECORDE
// ==========================================

function abrirModalNovoRecorde(playerName, newForce, oldRecord) {
  const modal = document.getElementById('modal-novo-recorde');
  const mensagem = document.getElementById('modal-recorde-mensagem');
  const suaForca = document.getElementById('modal-recorde-sua-forca');
  const anterior = document.getElementById('modal-recorde-anterior');

  if (!modal || !mensagem || !suaForca || !anterior) {
    console.error("Erro: Um ou mais elementos do modal de novo recorde não foram encontrados.");
    return;
  }

  mensagem.textContent = `Você ultrapassou a marca de ${oldRecord.name}!`;
  suaForca.textContent = `${newForce.toFixed(1)} kg`;
  anterior.textContent = `${oldRecord.forceKg.toFixed(1)} kg`;
  
  modal.style.display = 'flex';
  
  if (sounds.newRecord) {
    sounds.newRecord.play().catch(e => console.log('Som newRecord:', e));
  }
}

function fecharModalNovoRecorde() {
  elements.modalNovoRecorde.style.display = 'none';
}

// ==========================================
// MODAL SOBRECARGA
// ==========================================

function fecharModalSobrecargaMartelo() {
  if (elements.modalSobrecarga) {
    elements.modalSobrecarga.classList.remove('ativo');
  }
}

function updateOverloadModal(alertState) {
  if (!elements.modalSobrecarga) return;

  const { level, percent, forca, capacidade, displayUnit } = alertState;

  const valorAtual = convertForce(Math.abs(forca), displayUnit);
  const valorLimite = convertForce(capacidade, displayUnit);

  elements.modalSobrecargaValorAtual.textContent = `${valorAtual.toFixed(1)} ${displayUnit}`;
  elements.modalSobrecargaValorLimite.textContent = `${valorLimite.toFixed(1)} ${displayUnit}`;
  elements.modalSobrecargaPercentual.textContent = `${percent.toFixed(1)}%`;
  elements.modalSobrecargaBarraProgresso.style.width = `${Math.min(percent, 100)}%`;

  const modalContent = elements.modalSobrecarga.querySelector('.modal-sobrecarga-content');
  modalContent.classList.remove('alerta-80', 'alerta-90', 'alerta-100');

  if (level >= 100) {
    modalContent.classList.add('alerta-100');
    elements.modalSobrecargaTitulo.textContent = '🚨 LIMITE EXCEDIDO! PARE IMEDIATAMENTE! 🚨';
    elements.modalSobrecargaMensagem.innerHTML = `
      ⛔ <strong>LIMITE DA CÉLULA ULTRAPASSADO!</strong><br>
      <strong style="font-size: 1.15rem; color: #7f1d1d;">RISCO CRÍTICO DE DESTRUIÇÃO DO EQUIPAMENTO!</strong>
    `;
  } else if (level >= 90) {
    modalContent.classList.add('alerta-90');
    elements.modalSobrecargaTitulo.textContent = '🚨 PERIGO: MUITO PRÓXIMO DO LIMITE! 🚨';
    elements.modalSobrecargaMensagem.innerHTML = `
      ⚠️ Você está em zona crítica!<br>
      <strong>RISCO IMINENTE DE DANOS PERMANENTES!</strong>
    `;
  } else if (level >= 80) {
    modalContent.classList.add('alerta-80');
    elements.modalSobrecargaTitulo.textContent = '⚠️ ATENÇÃO: APROXIMANDO DO LIMITE! ⚠️';
    elements.modalSobrecargaMensagem.innerHTML = `
      ⚠️ Você está próximo do limite da célula de carga!<br>
      <strong>RISCO DE DANOS PERMANENTES AO EQUIPAMENTO!</strong>
    `;
  }
}

// Função auxiliar para converter força, se necessário
function convertForce(valueN, unit) {
  const g_force_conversion = 101.9716;
  if (unit === 'gf') return valueN * g_force_conversion;
  if (unit === 'kgf') return valueN * (g_force_conversion / 1000);
  return valueN;
}


// ==========================================
// RESET
// ==========================================

function resetGame() {
  elements.playerNameInput.value = '';
  marteloState.playerName = '';
  marteloState.currentAttempt = 1;
  marteloState.forceMaxPerAttempt = [0, 0, 0];
  marteloState.totalMaxForce = 0;
  marteloState.attempts = [];
  marteloState.forceDataPerAttempt = [[], [], []]; // Limpar dados do gráfico
  
  elements.forceDisplay.textContent = '0.0 kg';
  elements.newtonDisplay.textContent = '(≈ 0.0 N)';
  elements.progressBar.style.width = '0%';
  elements.verticalForceBar.style.height = '0%';

  if (elements.forceMarkerCurrent) elements.forceMarkerCurrent.style.bottom = '0%';
  if (elements.forceMarkerMax) elements.forceMarkerMax.style.bottom = '0%';
  if (elements.labelForceCurrent) elements.labelForceCurrent.textContent = '0 kg';
  if (elements.labelForceMax) elements.labelForceMax.textContent = '0 kg';
  
  showScreen('start');
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================

// Iniciar polling de força quando página carrega
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    startForcePolling();
    console.log('✓ Martelo do Thor - Polling de força iniciado');
  });
} else {
  startForcePolling();
  console.log('✓ Martelo do Thor - Polling de força iniciado');
}

// ==========================================
// DEBUG PANEL - PAINEL PERMANENTE
// ==========================================

function createDebugPanel() {
  // Criar painel de debug
  debugPanel = document.createElement('div');
  debugPanel.id = 'debug-panel-martelo';
  debugPanel.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #0a0a0a;
    color: #0f0;
    padding: 12px 16px;
    border-radius: 8px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    z-index: 9999;
    border: 2px solid #0f0;
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.5), inset 0 0 5px rgba(0, 255, 0, 0.2);
    line-height: 1.5;
    user-select: none;
    pointer-events: none;
  `;
  
  document.body.appendChild(debugPanel);
  
  // Atualizar painel a cada 100ms
  setInterval(updateDebugPanel, 100);
}

function updateDebugPanel() {
  if (!debugPanel) return;
  
  const statusIcon = forcePollingActive ? '✓' : '✗';
  const statusColor = forcePollingActive ? '#0f0' : '#f00';
  
  debugPanel.innerHTML = `
    <div style="color: #0f0; font-weight: bold; margin-bottom: 5px;">⚡ FORÇA - DEBUG</div>
    <div style="color: ${statusColor}; margin-bottom: 3px;">${statusIcon} Status: ${forcePollingActive ? 'ATIVO' : 'INATIVO'}</div>
    <div>N: ${currentForceValue.toFixed(2)} N</div>
    <div>kg: ${(currentForceValue / 9.80665).toFixed(3)} kg</div>
    <div style="color: #888; font-size: 11px; margin-top: 3px;">Pressione D para mais</div>
  `;
}

function debugForceReading() {
  console.log('═══════════════════════════════════════');
  console.log('🔍 DEBUG DETALHADO - LEITURA DE FORÇA');
  console.log('═══════════════════════════════════════');
  console.log('Status do Polling:', forcePollingActive ? '✓ ATIVO' : '✗ INATIVO');
  console.log('Valor Atual (N):', currentForceValue.toFixed(2));
  console.log('Valor Atual (kg):', (currentForceValue / 9.80665).toFixed(3));
  console.log('Erro de Polling:', forcePollingError || 'nenhum');
  console.log('window.opener disponível:', !!window.opener);
  if (window.opener) {
    console.log('window.opener.sharedState.forcaAtual:', window.opener.sharedState.forcaAtual);
    console.log('typeof window.opener.sharedState.forcaAtual:', typeof window.opener.sharedState.forcaAtual);
  }
  console.log('Estado do Jogo:', {
    playerName: marteloState.playerName,
    currentAttempt: marteloState.currentAttempt,
    totalMaxForce: marteloState.totalMaxForce,
    isGameRunning: marteloState.isGameRunning
  });
  console.log('═══════════════════════════════════════');
  
  // Mostrar modal com detalhes completos
  const debugModal = document.createElement('div');
  debugModal.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #1a1a1a;
    color: #0f0;
    padding: 20px;
    border-radius: 12px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    z-index: 10000;
    border: 2px solid #0f0;
    box-shadow: 0 0 20px rgba(0, 255, 0, 0.7);
    max-width: 400px;
    line-height: 1.6;
  `;
  debugModal.innerHTML = `
    <div style="margin-bottom: 10px; border-bottom: 1px solid #0f0; padding-bottom: 10px;">
      <strong style="font-size: 16px;">⚡ DEBUG DETALHADO</strong>
    </div>
    <div style="margin-bottom: 15px;">
      <strong>📊 LEITURA DE FORÇA</strong><br>
      Status: <span style="color: ${forcePollingActive ? '#0f0' : '#f00'}; font-weight: bold;">${forcePollingActive ? '✓ ATIVO' : '✗ INATIVO'}</span><br>
      Valor: <span style="color: #ff0;">${currentForceValue.toFixed(2)} N</span><br>
      Valor: <span style="color: #ff0;">${(currentForceValue / 9.80665).toFixed(3)} kg</span><br>
      Erro: ${forcePollingError || '<span style="color: #0f0;">nenhum</span>'}
    </div>
    <div style="margin-bottom: 15px;">
      <strong>🔗 CONEXÃO COM JANELA PAI</strong><br>
      window.opener: <span style="color: ${window.opener ? '#0f0' : '#f00'};">${window.opener ? '✓ Disponível' : '✗ Não disponível'}</span><br>
      ${window.opener ? `sharedState.forcaAtual: <span style="color: #ff0;">${window.opener.sharedState ? window.opener.sharedState.forcaAtual : 'undefined'}</span>` : ''}
    </div>
    <div style="margin-bottom: 15px; border-top: 1px solid #0f0; padding-top: 10px;">
      <strong>🎮 ESTADO DO JOGO</strong><br>
      Jogador: ${marteloState.playerName || '(não iniciado)'}<br>
      Tentativa: ${marteloState.currentAttempt}/3<br>
      Máximo: ${marteloState.totalMaxForce.toFixed(2)} N<br>
      Rodando: ${marteloState.isGameRunning ? '✓ Sim' : '✗ Não'}
    </div>
    <div style="text-align: center; font-size: 11px; color: #888;">
      Pressione D novamente ou clique para fechar
    </div>
  `;
  
  document.body.appendChild(debugModal);
  
  // Remover ao clicar
  debugModal.addEventListener('click', () => debugModal.remove());
  
  // Remover após 10 segundos
  setTimeout(() => {
    if (debugModal.parentNode) debugModal.remove();
  }, 10000);
  
  // Remover ao pressionar D novamente
  const handleKeyPress = (e) => {
    if (e.key === 'd' || e.key === 'D') {
      if (debugModal.parentNode) debugModal.remove();
      document.removeEventListener('keydown', handleKeyPress);
    }
  };
  document.addEventListener('keydown', handleKeyPress);
}

console.log('✓ Martelo do Thor - Script carregado com sucesso!');

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
  countdownActive: false
};

// Elementos DOM
const elements = {
  gameContainer: document.getElementById('gameContainer'),
  screens: {
    start: document.getElementById('start-screen'),
    game: document.getElementById('game-screen'),
    results: document.getElementById('results-screen'),
    ranking: document.getElementById('ranking-screen')
  },
  playerNameInput: document.getElementById('playerName'),
  startButton: document.getElementById('startButton'),
  countdown: document.getElementById('countdown'),
  currentPlayer: document.getElementById('currentPlayer'),
  forceDisplay: document.getElementById('forceDisplay'),
  newtonDisplay: document.getElementById('newtonDisplay'),
  progressBar: document.getElementById('progressBar'),
  verticalForceBar: document.getElementById('vertical-force-bar'),
  forceMarkerCurrent: document.getElementById('force-marker-current'),
  forceMarkerMax: document.getElementById('force-marker-max'),
  labelForceCurrent: document.getElementById('label-force-current'),
  labelForceMax: document.getElementById('label-force-max'),
  resultForce: document.getElementById('resultForce'),
  motivationalMessage: document.getElementById('motivationalMessage'),
  playAgainButton: document.getElementById('playAgainButton'),
  showRankingButton: document.getElementById('showRankingButton'),
  rankingTableBody: document.querySelector('#rankingTable tbody'),
  backToStartButton: document.getElementById('backToStartButton')
};

// Áudio
const sounds = {
  countdown: document.getElementById('sound-countdown'),
  go: document.getElementById('sound-go'),
  level1: document.getElementById('sound-level-1'),
  level2: document.getElementById('sound-level-2'),
  level3: document.getElementById('sound-level-3'),
  level4: document.getElementById('sound-level-4'),
  level5: document.getElementById('sound-level-5'),
  level6: document.getElementById('sound-level-6'),
  result: document.getElementById('sound-result')
};

// Constantes
const ATTEMPT_DURATION = 10000; // 10 segundos (aumentado de 3)
const COUNTDOWN_DURATION = 3000; // 3 segundos de contagem regressiva
const MAX_FORCE_DISPLAY = 300; // kg máximo para a barra

// ==========================================
// INICIALIZAÇÃO
// ==========================================

// Elemento do painel de debug
let debugPanel = null;

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  showScreen('start');
  startForcePolling(); // Inicia polling de força
  createDebugPanel(); // Criar painel de debug permanente
  console.log('✓ Martelo do Thor carregado');
});

function setupEventListeners() {
  elements.startButton.addEventListener('click', startGame);
  elements.playAgainButton.addEventListener('click', resetGame);
  elements.showRankingButton.addEventListener('click', showRankingScreen);
  elements.backToStartButton.addEventListener('click', () => showScreen('start'));
  
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
    if (window.opener && window.opener.forcaAtual !== undefined) {
      console.log('✓ Acesso ao window.opener.forcaAtual disponível!');
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
      if (window.opener && typeof window.opener.forcaAtual === 'number') {
        currentForceValue = window.opener.forcaAtual;
        forcePollingActive = true;
        forcePollingError = null;
      }
    } catch (e) {
      // Continua tentando mesmo com erro
      if (!forcePollingError) {
        console.warn('Erro recorrente ao acessar forcaAtual:', e.message);
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

    // Verificar se acabou
    if (remainingMs <= 0) {
      clearInterval(interval);
      endAttempt();
    }
  }, 50);
}

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
  const percentage = Math.min((forceKg / MAX_FORCE_DISPLAY) * 100, 100);
  elements.progressBar.style.width = percentage + '%';
  elements.progressBar.style.background = getForceColor(forceKg);

  // Barra vertical de fundo - mostra a força atual
  const height = Math.min((forceKg / MAX_FORCE_DISPLAY) * 100, 100);
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
    if (marteloState.totalMaxForce > forceMaxAnterior) {
      elements.forceMarkerMax.style.animation = 'none';
      setTimeout(() => {
        elements.forceMarkerMax.style.animation = 'record-shock 0.6s ease-out';
      }, 10);
    }
  }
  
  if (elements.forceMarkerMax) {
    const maxPercentage = Math.min((marteloState.totalMaxForce / MAX_FORCE_DISPLAY) * 100, 100);
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

function endAttempt() {
  marteloState.isGameRunning = false;
  const attemptIndex = marteloState.currentAttempt - 1;
  const forceCurrent = marteloState.forceMaxPerAttempt[attemptIndex];

  marteloState.attempts.push({
    attempt: marteloState.currentAttempt,
    force: forceCurrent,
    timestamp: new Date().toLocaleString('pt-BR')
  });

  // Próxima tentativa ou resultado
  if (marteloState.currentAttempt < marteloState.maxAttempts) {
    marteloState.currentAttempt++;
    setTimeout(() => startCountdown(), 1500);
  } else {
    showResultsScreen();
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
}

function getMotivationalMessage(forceKg) {
  if (forceKg < 10) return '🤔 Fraquinho, mas corajoso!';
  if (forceKg < 50) return '💪 Está ficando forte!';
  if (forceKg < 100) return '🔥 Excelente! Quase digno do martelo!';
  if (forceKg < 200) return '⚡ Poder de Asgard flui em você!';
  return '👑 ⚡ Digno de empunhar Mjölnir! ⚡';
}

// ==========================================
// RANKING
// ==========================================

function saveToRanking(name, forceKg, forceN) {
  const ranking = JSON.parse(localStorage.getItem('martelo_ranking') || '[]');

  ranking.push({
    name,
    forceKg,
    forceN,
    date: new Date().toLocaleDateString('pt-BR')
  });

  // Ordenar por força decrescente e manter top 50
  ranking.sort((a, b) => b.forceKg - a.forceKg);
  ranking.splice(50);

  localStorage.setItem('martelo_ranking', JSON.stringify(ranking));
}

function showRankingScreen() {
  showScreen('ranking');
  updateRankingTable();
}

function updateRankingTable() {
  const ranking = JSON.parse(localStorage.getItem('martelo_ranking') || '[]');
  elements.rankingTableBody.innerHTML = '';

  if (ranking.length === 0) {
    elements.rankingTableBody.innerHTML = '<tr><td colspan="4">Nenhum registro ainda!</td></tr>';
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];

  ranking.slice(0, 10).forEach((entry, index) => {
    const row = document.createElement('tr');
    const medal = medals[index] || `${index + 1}º`;

    row.innerHTML = `
      <td>${medal}</td>
      <td>${entry.name}</td>
      <td>${entry.forceKg.toFixed(1)} kg (${entry.forceN.toFixed(0)} N)</td>
      <td>${entry.date}</td>
    `;

    elements.rankingTableBody.appendChild(row);
  });
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
  
  elements.forceDisplay.textContent = '0.0 kg';
  elements.newtonDisplay.textContent = '(≈ 0.0 N)';
  elements.progressBar.style.width = '0%';
  elements.verticalForceBar.style.height = '0%';
  
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
    console.log('window.opener.forcaAtual:', window.opener.forcaAtual);
    console.log('typeof window.opener.forcaAtual:', typeof window.opener.forcaAtual);
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
      ${window.opener ? `forcaAtual: <span style="color: #ff0;">${window.opener.forcaAtual || 'undefined'}</span>` : ''}
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

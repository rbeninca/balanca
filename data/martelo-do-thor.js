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
const ATTEMPT_DURATION = 3000; // 3 segundos
const COUNTDOWN_DURATION = 3000; // 3 segundos de contagem regressiva
const MAX_FORCE_DISPLAY = 300; // kg máximo para a barra

// ==========================================
// INICIALIZAÇÃO
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  showScreen('start');
  startForcePolling(); // Inicia polling de força
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
    elements.countdown.innerHTML = `<div class="countdown-number">${count}</div>`;
    
    if (sounds.countdown) {
      try {
        sounds.countdown.currentTime = 0;
        sounds.countdown.play().catch(e => console.log('Som countdown:', e));
      } catch (e) {}
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // "AGORA!"
  elements.countdown.innerHTML = '<div class="countdown-go">⚡ AGORA! ⚡</div>';
  
  if (sounds.go) {
    try {
      sounds.go.currentTime = 0;
      sounds.go.play().catch(e => console.log('Som go:', e));
    } catch (e) {}
  }

  await new Promise(resolve => setTimeout(resolve, 800));
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

    // Atualizar display
    updateForceDisplay(forceKg);

    // Verificar se acabou
    if (remainingMs <= 0) {
      clearInterval(interval);
      endAttempt();
    }
  }, 50);
}

function updateForceDisplay(forceKg) {
  const forceN = forceKg * 9.80665;
  
  elements.forceDisplay.textContent = `${forceKg.toFixed(1)} kg`;
  elements.newtonDisplay.textContent = `(≈ ${forceN.toFixed(1)} N)`;

  // Barra de progresso
  const percentage = Math.min((forceKg / MAX_FORCE_DISPLAY) * 100, 100);
  elements.progressBar.style.width = percentage + '%';
  elements.progressBar.style.background = getForceColor(forceKg);

  // Barra vertical
  const height = Math.min((forceKg / MAX_FORCE_DISPLAY) * 100, 100);
  elements.verticalForceBar.style.height = height + '%';
  elements.verticalForceBar.style.background = getForceColor(forceKg);
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
// DEBUG
// ==========================================

function debugForceReading() {
  console.log('═══════════════════════════════════════');
  console.log('🔍 DEBUG - LEITURA DE FORÇA');
  console.log('═══════════════════════════════════════');
  console.log('Status do Polling:', forcePollingActive ? '✓ ATIVO' : '✗ INATIVO');
  console.log('Valor Atual (N):', currentForceValue);
  console.log('Valor Atual (kg):', (currentForceValue / 9.80665).toFixed(3));
  console.log('Erro de Polling:', forcePollingError || 'nenhum');
  console.log('window.opener disponível:', !!window.opener);
  if (window.opener) {
    console.log('window.opener.forcaAtual:', window.opener.forcaAtual);
  }
  console.log('═══════════════════════════════════════');
  
  // Mostrar alerta visual
  const debugDiv = document.createElement('div');
  debugDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #1a1a1a;
    color: #0f0;
    padding: 15px;
    border-radius: 8px;
    font-family: monospace;
    font-size: 12px;
    z-index: 10000;
    border: 2px solid #0f0;
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
  `;
  debugDiv.innerHTML = `
    <strong>⚡ DEBUG - FORÇA</strong><br>
    Status: ${forcePollingActive ? '✓ ATIVO' : '✗ INATIVO'}<br>
    Valor: ${currentForceValue.toFixed(2)} N<br>
    Valor: ${(currentForceValue / 9.80665).toFixed(3)} kg<br>
    Erro: ${forcePollingError || 'nenhum'}<br>
    <small>(pressione D novamente para fechar)</small>
  `;
  
  document.body.appendChild(debugDiv);
  
  // Remove after 5 seconds or on next D press
  setTimeout(() => debugDiv.remove(), 5000);
  
  // Ou remove ao pressionar D novamente
  const handleKeyPress = (e) => {
    if (e.key === 'd' || e.key === 'D') {
      debugDiv.remove();
      document.removeEventListener('keydown', handleKeyPress);
    }
  };
  document.addEventListener('keydown', handleKeyPress);
}

console.log('✓ Martelo do Thor - Script carregado com sucesso!');

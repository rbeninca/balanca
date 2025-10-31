// ============================================
// MARTELO DO THOR - Jogo de Força
// ============================================

const MARTELO_STORAGE_KEY = 'martelo_do_thor_data';
const MARTELO_MAX_FORCA = 5000; // Newtons (máximo da célula)
const MARTELO_DURACAO_TESTE = 5000; // 5 segundos

let marteloData = {
  jogadores: {}, // { nome: { tentativas: [], melhor: 0, media: 0 } }
  tempoUltimoTeste: 0
};

let marteloEstado = {
  testando: false,
  nomeJogador: '',
  forcaMaximaAtual: 0,
  leiturasContinuas: [],
  unidadeAtual: 'N'
};

// ============================================
// Inicialização
// ============================================

function initMarelo() {
  carregarMarelo();
  atualizarExibicaoMarelo();
  
  // Listener para mudanças de força
  document.addEventListener('forca-atualizada', (e) => {
    if (marteloEstado.testando) {
      atualizarForcaMarelo(e.detail.forcaN);
    }
  });
  
  // Listener para mudanças de unidade
  document.addEventListener('unidade-alterada', (e) => {
    marteloEstado.unidadeAtual = e.detail.unidade;
    atualizarUnidadeMarelo();
  });
  
  // Carregar nome salvo
  const nomeSalvo = localStorage.getItem('martelo_nome_jogador');
  if (nomeSalvo) {
    document.getElementById('martelo-nome-jogador').value = nomeSalvo;
    marteloEstado.nomeJogador = nomeSalvo;
  }
}

// ============================================
// Storage
// ============================================

function carregarMarelo() {
  try {
    const dados = localStorage.getItem(MARTELO_STORAGE_KEY);
    if (dados) {
      marteloData = JSON.parse(dados);
    }
  } catch (e) {
    console.error('Erro ao carregar dados Martelo:', e);
    marteloData = { jogadores: {}, tempoUltimoTeste: 0 };
  }
}

function salvarMarelo() {
  try {
    localStorage.setItem(MARTELO_STORAGE_KEY, JSON.stringify(marteloData));
    
    // Salvar nome do jogador também
    const nomeInput = document.getElementById('martelo-nome-jogador');
    if (nomeInput && nomeInput.value) {
      localStorage.setItem('martelo_nome_jogador', nomeInput.value);
    }
  } catch (e) {
    console.error('Erro ao salvar dados Martelo:', e);
  }
}

function limparMarelo() {
  if (confirm('⚠️ Tem certeza que deseja limpar TODO o ranking e histórico?')) {
    marteloData = { jogadores: {}, tempoUltimoTeste: 0 };
    salvarMarelo();
    atualizarExibicaoMarelo();
    alert('✓ Ranking limpo com sucesso!');
  }
}

// ============================================
// Lógica do Teste
// ============================================

function iniciarTesteMarelo() {
  const nomeInput = document.getElementById('martelo-nome-jogador');
  const nome = nomeInput.value.trim();
  
  if (!nome) {
    alert('⚠️ Digite seu nome primeiro!');
    nomeInput.focus();
    return;
  }
  
  // Validar nome (min 2 caracteres, max 20)
  if (nome.length < 2 || nome.length > 20) {
    alert('⚠️ Nome deve ter entre 2 e 20 caracteres!');
    return;
  }
  
  if (marteloEstado.testando) {
    alert('⏳ Já há um teste em andamento!');
    return;
  }
  
  // Salvar nome para fullscreen
  localStorage.setItem('martelo_nome_jogador', nome);
  marteloEstado.nomeJogador = nome;
  
  // 🎯 ABRIR FULLSCREEN
  abrirMarteloFullscreen();
}

function atualizarForcaMarelo(forcaN) {
  if (!marteloEstado.testando) return;
  
  marteloEstado.leiturasContinuas.push(forcaN);
  
  if (forcaN > marteloEstado.forcaMaximaAtual) {
    marteloEstado.forcaMaximaAtual = forcaN;
  }
  
  // Atualizar display
  const forcaExibicao = converterForça(forcaN, marteloEstado.unidadeAtual);
  document.getElementById('martelo-forca-display').textContent = 
    forcaExibicao.toFixed(1);
  
  // Atualizar barra
  const percentual = (forcaN / MARTELO_MAX_FORCA) * 100;
  const barraFill = document.getElementById('martelo-barra-forca');
  barraFill.style.width = Math.min(percentual, 100) + '%';
  document.getElementById('martelo-barra-percentual').textContent = 
    Math.round(percentual) + '%';
  
  // Efeito visual de vibração se muito alta
  if (percentual > 80) {
    barraFill.style.animation = 'vibrar 0.1s infinite';
  } else {
    barraFill.style.animation = 'none';
  }
}

function finalizarTesteMarelo() {
  marteloEstado.testando = false;
  
  // Reabilitar controles
  document.getElementById('martelo-btn-testar').disabled = false;
  document.getElementById('martelo-nome-jogador').disabled = false;
  
  const forcaMax = marteloEstado.forcaMaximaAtual;
  const nomeBom = marteloEstado.nomeJogador;
  
  // Salvar resultado
  if (!marteloData.jogadores[nomeBom]) {
    marteloData.jogadores[nomeBom] = {
      tentativas: [],
      melhor: 0,
      media: 0
    };
  }
  
  const jogador = marteloData.jogadores[nomeBom];
  jogador.tentativas.push({
    forca: forcaMax,
    data: new Date().toLocaleString('pt-BR'),
    timestamp: Date.now()
  });
  
  // Atualizar estatísticas
  jogador.melhor = Math.max(...jogador.tentativas.map(t => t.forca));
  jogador.media = jogador.tentativas.reduce((a, t) => a + t.forca, 0) / jogador.tentativas.length;
  
  salvarMarelo();
  
  // Exibir resultado
  const forcaExibicao = converterForça(forcaMax, marteloEstado.unidadeAtual);
  const posicao = obterPosicaoRanking(nomeBom);
  
  // Determinar mensagem e efeito
  let mensagem = '';
  let estilo = '';
  
  if (forcaMax < 100) {
    mensagem = '😅 Precisa treinar mais!';
    estilo = 'color: #95a5a6;';
  } else if (forcaMax < 500) {
    mensagem = '💪 Bom esforço!';
    estilo = 'color: #3498db;';
  } else if (forcaMax < 1000) {
    mensagem = '🔥 Muito bom!';
    estilo = 'color: #f39c12;';
  } else if (forcaMax < 2000) {
    mensagem = '⚡ Increível!';
    estilo = 'color: #e74c3c;';
  } else {
    mensagem = '🏆 LENDA VIVA!';
    estilo = 'color: #9b59b6; font-weight: bold;';
  }
  
  // Reproduzir som
  reproduzirSomFim(forcaMax);
  
  // Animar resultado
  const statusEl = document.getElementById('martelo-status-teste');
  statusEl.innerHTML = `
    <div style="${estilo}">
      ${mensagem}<br>
      <strong>${forcaExibicao.toFixed(1)} ${marteloEstado.unidadeAtual}</strong><br>
      <small>Posição no ranking: ${posicao}</small>
    </div>
  `;
  
  // Reset visual
  setTimeout(() => {
    document.getElementById('martelo-forca-display').textContent = '0';
    document.getElementById('martelo-barra-forca').style.width = '0%';
    document.getElementById('martelo-barra-percentual').textContent = '0%';
  }, 3000);
  
  // Atualizar visualizações
  atualizarExibicaoMarelo();
}

// ============================================
// Visualizações (Ranking, Minhas, Stats)
// ============================================

function mostrarAbaMarelo(aba) {
  // Esconder todas
  document.getElementById('martelo-ranking-container').style.display = 'none';
  document.getElementById('martelo-minhas-container').style.display = 'none';
  document.getElementById('martelo-stats-container').style.display = 'none';
  
  // Remover classe ativa
  document.getElementById('btn-aba-ranking').style.background = '';
  document.getElementById('btn-aba-minhas').style.background = '';
  document.getElementById('btn-aba-stats').style.background = '';
  
  // Mostrar selecionada
  if (aba === 'ranking') {
    document.getElementById('martelo-ranking-container').style.display = 'block';
    document.getElementById('btn-aba-ranking').style.background = '#667eea';
    document.getElementById('btn-aba-ranking').style.color = 'white';
    atualizarRankingMarelo();
  } else if (aba === 'minhas-tentativas') {
    document.getElementById('martelo-minhas-container').style.display = 'block';
    document.getElementById('btn-aba-minhas').style.background = '#667eea';
    document.getElementById('btn-aba-minhas').style.color = 'white';
    atualizarMinhasTentativasMarelo();
  } else if (aba === 'stats') {
    document.getElementById('martelo-stats-container').style.display = 'block';
    document.getElementById('btn-aba-stats').style.background = '#667eea';
    document.getElementById('btn-aba-stats').style.color = 'white';
    atualizarEstatisticasMarelo();
  }
}

function atualizarExibicaoMarelo() {
  atualizarRankingMarelo();
  atualizarEstatisticasMarelo();
}

function atualizarRankingMarelo() {
  const ranking = obterRankingGlobal();
  const container = document.getElementById('martelo-ranking-list');
  
  if (ranking.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 1rem; background: rgba(255,255,255,0.1); border-radius: 0.5rem;">
        Nenhum teste ainda. Seja o primeiro! ⚡
      </div>
    `;
    return;
  }
  
  container.innerHTML = ranking.map((item, idx) => {
    const medalha = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
    const forcaExibicao = converterForça(item.forca, 'N');
    const cor = idx === 0 ? '#ffd700' : idx === 1 ? '#c0c0c0' : idx === 2 ? '#cd7f32' : '#ecf0f1';
    
    return `
      <div style="
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.75rem 1rem;
        background: rgba(255,255,255,0.1);
        border-radius: 0.5rem;
        border-left: 4px solid ${cor};
        animation: slideIn 0.3s ease-out forwards;
        animation-delay: ${idx * 0.1}s;
      ">
        <span style="font-size: 1.5rem; min-width: 30px;">${medalha}</span>
        <div style="flex-grow: 1;">
          <strong>${item.nome}</strong>
          <small style="display: block; color: rgba(255,255,255,0.7);">${item.tentativas} tentativa(s)</small>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 1.25rem; font-weight: bold;">${forcaExibicao.toFixed(0)} N</div>
          <small style="color: rgba(255,255,255,0.7);">Melhor marca</small>
        </div>
      </div>
    `;
  }).join('');
}

function atualizarMinhasTentativasMarelo() {
  const nome = marteloEstado.nomeJogador || document.getElementById('martelo-nome-jogador').value.trim();
  const container = document.getElementById('martelo-minhas-list');
  
  if (!nome || !marteloData.jogadores[nome]) {
    container.innerHTML = `
      <div style="text-align: center; padding: 1rem;">
        Você ainda não tem tentativas registradas!
      </div>
    `;
    return;
  }
  
  const tentativas = marteloData.jogadores[nome].tentativas.sort((a, b) => b.forca - a.forca);
  
  container.innerHTML = tentativas.map((tentativa, idx) => {
    const forcaExibicao = converterForça(tentativa.forca, 'N');
    const isMelhor = idx === 0;
    const cor = isMelhor ? '#f39c12' : '#95a5a6';
    
    return `
      <div style="
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.75rem 1rem;
        background: white;
        border-radius: 0.5rem;
        border-left: 4px solid ${cor};
        ${isMelhor ? 'box-shadow: 0 2px 8px rgba(243, 156, 18, 0.3);' : ''}
      ">
        <div style="flex-grow: 1;">
          <strong>${forcaExibicao.toFixed(0)} N</strong>
          <small style="display: block; color: #7f8c8d;">${tentativa.data}</small>
        </div>
        ${isMelhor ? '<span style="background: #f39c12; color: white; padding: 0.25rem 0.75rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: bold;">⭐ MELHOR</span>' : ''}
      </div>
    `;
  }).join('');
}

function atualizarEstatisticasMarelo() {
  const nome = marteloEstado.nomeJogador || document.getElementById('martelo-nome-jogador').value.trim();
  
  if (!nome || !marteloData.jogadores[nome]) {
    document.getElementById('martelo-stats-melhor').textContent = '--- N';
    document.getElementById('martelo-stats-media').textContent = '--- N';
    document.getElementById('martelo-stats-testes').textContent = '0';
    document.getElementById('martelo-stats-posicao').textContent = '---';
    return;
  }
  
  const jogador = marteloData.jogadores[nome];
  const melhorExibicao = converterForça(jogador.melhor, 'N');
  const mediaExibicao = converterForça(jogador.media, 'N');
  const posicao = obterPosicaoRanking(nome);
  
  document.getElementById('martelo-stats-melhor').textContent = melhorExibicao.toFixed(0) + ' N';
  document.getElementById('martelo-stats-media').textContent = mediaExibicao.toFixed(0) + ' N';
  document.getElementById('martelo-stats-testes').textContent = jogador.tentativas.length;
  document.getElementById('martelo-stats-posicao').textContent = posicao;
}

// ============================================
// Utilitários
// ============================================

function obterRankingGlobal() {
  const ranking = Object.entries(marteloData.jogadores)
    .map(([nome, dados]) => ({
      nome,
      forca: dados.melhor,
      tentativas: dados.tentativas.length,
      media: dados.media
    }))
    .sort((a, b) => b.forca - a.forca)
    .slice(0, 10);
  
  return ranking;
}

function obterPosicaoRanking(nome) {
  const ranking = obterRankingGlobal();
  const posicao = ranking.findIndex(r => r.nome === nome);
  return posicao >= 0 ? `${posicao + 1}º lugar` : 'Fora do top 10';
}

function converterForça(forcaN, unidade) {
  if (unidade === 'gf') {
    return forcaN * 101.972; // 1 N = 101.972 gf
  } else if (unidade === 'kgf') {
    return forcaN / 9.80665; // 1 kgf = 9.80665 N
  }
  return forcaN; // N
}

function atualizarUnidadeMarelo() {
  atualizarEstatisticasMarelo();
  const unidade = marteloEstado.unidadeAtual;
  document.getElementById('martelo-unidade').textContent = unidade;
}

// ============================================
// Efeitos Sonoros
// ============================================

function reproduzirSomInicio() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscilador = audioContext.createOscillator();
    const ganho = audioContext.createGain();
    
    oscilador.connect(ganho);
    ganho.connect(audioContext.destination);
    
    oscilador.frequency.value = 800;
    ganho.gain.setValueAtTime(0.3, audioContext.currentTime);
    ganho.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    oscilador.start(audioContext.currentTime);
    oscilador.stop(audioContext.currentTime + 0.2);
  } catch (e) {
    // Ignorar se não suportar
  }
}

function reproduzirSomFim(forca) {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    if (forca > 1000) {
      // Som épico para resultado muito bom
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          osc.connect(gain);
          gain.connect(audioContext.destination);
          
          osc.frequency.value = 600 + (i * 200);
          gain.gain.setValueAtTime(0.2, audioContext.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
          
          osc.start(audioContext.currentTime);
          osc.stop(audioContext.currentTime + 0.3);
        }, i * 150);
      }
    } else {
      // Som normal
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.connect(gain);
      gain.connect(audioContext.destination);
      
      osc.frequency.value = 400;
      gain.gain.setValueAtTime(0.2, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      osc.start(audioContext.currentTime);
      osc.stop(audioContext.currentTime + 0.3);
    }
  } catch (e) {
    // Ignorar se não suportar
  }
}

// ============================================
// CSS Animations
// ============================================

const styleElement = document.createElement('style');
styleElement.textContent = `
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes vibrar {
    0%, 100% {
      transform: scaleX(1);
    }
    50% {
      transform: scaleX(1.02);
    }
  }
  
  @keyframes pulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }
`;
document.head.appendChild(styleElement);

// ============================================
// FULLSCREEN MODE
// ============================================

function abrirMarteloFullscreen() {
  // Abrir nova janela com fullscreen
  const janelaFullscreen = window.open('martelo-fullscreen.html', 'marteloThorFullscreen', 
    'width=1200,height=800,fullscreen=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no');
  
  // Se não conseguir abrir fullscreen, abrirá em nova janela
  if (!janelaFullscreen) {
    alert('⚠️ Pop-up bloqueado! Permita pop-ups para jogar em tela cheia.');
    return;
  }
  
  // Tentar fullscreen (alguns navegadores)
  if (janelaFullscreen.document.documentElement.requestFullscreen) {
    janelaFullscreen.document.documentElement.requestFullscreen().catch(err => {
      console.log('Fullscreen não disponível:', err);
    });
  }
  
  // Listener para mensagens da janela fullscreen
  window.addEventListener('message', (event) => {
    if (event.data.acao === 'voltarMarteloDeThor') {
      atualizarExibicaoMarelo();
    } else if (event.data.acao === 'voltarMarteloSemFechar') {
      atualizarExibicaoMarelo();
    }
  });
}

// ============================================
// Inicializar ao carregar
// ============================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMarelo);
} else {
  initMarelo();
}

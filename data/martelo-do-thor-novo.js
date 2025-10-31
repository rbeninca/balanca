// ============================================
// MARTELO DO THOR - Sistema de Ranking
// ============================================

let marteloEstado = {
  nomeJogador: '',
  forcaMaximaAtual: 0,
  tentativasRestantes: 3,
  testeEmAndamento: false,
  unidadeAtual: 'N'
};

let marteloData = {
  jogadores: {}
};

// Carregar dados do localStorage
function carregarMarelo() {
  const dados = localStorage.getItem('martelo_do_thor_data');
  if (dados) {
    marteloData = JSON.parse(dados);
  }
}

// Salvar dados no localStorage
function salvarMarelo() {
  localStorage.setItem('martelo_do_thor_data', JSON.stringify(marteloData));
}

carregarMarelo();

// ============================================
// INICIAR TESTE MARTELO
// ============================================
function iniciarTesteMarelo() {
  const nomeInput = document.getElementById('martelo-nome-jogador').value.trim();
  
  if (!nomeInput) {
    showNotification('error', 'Digite seu nome para começar!');
    return;
  }

  marteloEstado.nomeJogador = nomeInput;
  marteloEstado.forcaMaximaAtual = 0;
  marteloEstado.testeEmAndamento = true;

  const botao = document.getElementById('martelo-btn-testar');
  const status = document.getElementById('martelo-status-teste');
  
  botao.disabled = true;
  status.textContent = 'Preparando... 3 segundos para começar!';

  // Contagem regressiva de 3 segundos
  let contador = 3;
  const intervaloContagem = setInterval(() => {
    if (contador > 0) {
      status.textContent = `${contador}... APERTE AGORA!`;
      contador--;
    } else {
      clearInterval(intervaloContagem);
      executarTesteMartelo();
    }
  }, 1000);
}

// ============================================
// EXECUTAR TESTE DE 3 SEGUNDOS
// ============================================
function executarTesteMartelo() {
  const status = document.getElementById('martelo-status-teste');
  status.textContent = '⚡ TESTE EM ANDAMENTO... (3s)';

  const tempoInicio = Date.now();
  const duracao = 3000; // 3 segundos

  const intervaloLeitura = setInterval(() => {
    // Ler força do script.js (exposta como variável global)
    if (typeof forcaAtual !== 'undefined') {
      // forcaAtual está em Newtons
      const forcaKg = forcaAtual / 9.80665; // Converter para kgf
      
      // Atualizar display
      atualizarDisplayMarelo(forcaKg, forcaAtual);
      
      // Capturar máximo
      if (forcaKg > marteloEstado.forcaMaximaAtual) {
        marteloEstado.forcaMaximaAtual = forcaKg;
      }
    }

    // Verificar se acabou o tempo
    const tempoDecorrido = Date.now() - tempoInicio;
    if (tempoDecorrido >= duracao) {
      clearInterval(intervaloLeitura);
      marteloEstado.testeEmAndamento = false;
      
      // Encerrar teste
      encerrarTesteMartelo();
    }
  }, 50); // Atualizar a cada 50ms
}

// ============================================
// ATUALIZAR DISPLAY DE FORÇA
// ============================================
function atualizarDisplayMarelo(forcaKg, forcaN) {
  document.getElementById('martelo-forca-display').textContent = forcaKg.toFixed(1);
  document.getElementById('martelo-unidade').textContent = 'kg';

  // Barra de progresso (máximo 250kg)
  const percentual = Math.min((forcaKg / 250) * 100, 100);
  const barraElement = document.getElementById('martelo-barra-forca');
  barraElement.style.width = percentual + '%';
  
  const percentualDisplay = document.getElementById('martelo-barra-percentual');
  percentualDisplay.textContent = Math.round(percentual) + '%';
}

// ============================================
// ENCERRAR TESTE
// ============================================
function encerrarTesteMartelo() {
  const botao = document.getElementById('martelo-btn-testar');
  const status = document.getElementById('martelo-status-teste');

  // Reabilitar botão
  botao.disabled = false;
  marteloEstado.tentativasRestantes--;

  // Registrar resultado
  registrarResultadoMarteloFS(marteloEstado.forcaMaximaAtual);

  // Mostrar mensagem
  const forcaKg = marteloEstado.forcaMaximaAtual;
  let mensagem = '';
  let emoji = '';

  if (forcaKg < 10) {
    mensagem = 'Fraquinho, mas corajoso!';
    emoji = '💪';
  } else if (forcaKg < 50) {
    mensagem = 'Está ficando forte!';
    emoji = '⚡';
  } else if (forcaKg < 100) {
    mensagem = 'Excelente! Quase digno do martelo!';
    emoji = '🔥';
  } else if (forcaKg < 200) {
    mensagem = 'Poder de Asgard flui em você!';
    emoji = '⚔️';
  } else {
    mensagem = '⚡ Digno de empunhar Mjölnir! ⚡';
    emoji = '👑';
  }

  const posicaoMsg = obterPosicaoRankingFS(marteloEstado.nomeJogador);
  status.innerHTML = `${emoji} ${mensagem}<br><small>${forcaKg.toFixed(1)} kg | ${posicaoMsg}</small>`;

  // Atualizar ranking
  atualizarRankingMarelo();
  atualizarMinhasTentativasMarelo();
  atualizarEstatisticasMarelo();
}

// ============================================
// REGISTRAR RESULTADO
// ============================================
function registrarResultadoMarteloFS(forca) {
  try {
    const dados = JSON.parse(localStorage.getItem('martelo_do_thor_data') || '{"jogadores":{}}');

    if (!dados.jogadores[marteloEstado.nomeJogador]) {
      dados.jogadores[marteloEstado.nomeJogador] = { tentativas: [], melhor: 0, media: 0 };
    }

    const tentativa = {
      forca: forca * 9.80665, // Converter para Newtons para armazenar
      data: new Date().toLocaleString('pt-BR'),
      timestamp: Date.now()
    };

    dados.jogadores[marteloEstado.nomeJogador].tentativas.push(tentativa);
    dados.jogadores[marteloEstado.nomeJogador].melhor = Math.max(dados.jogadores[marteloEstado.nomeJogador].melhor, forca * 9.80665);

    const tentativas = dados.jogadores[marteloEstado.nomeJogador].tentativas;
    const soma = tentativas.reduce((acc, t) => acc + t.forca, 0);
    dados.jogadores[marteloEstado.nomeJogador].media = soma / tentativas.length;

    localStorage.setItem('martelo_do_thor_data', JSON.stringify(dados));
    console.log('✓ Resultado registrado para', marteloEstado.nomeJogador, ':', forca.toFixed(1), 'kg');
  } catch (e) {
    console.error('❌ Erro ao registrar:', e);
  }
}

// ============================================
// OBTER POSIÇÃO NO RANKING
// ============================================
function obterPosicaoRankingFS(nome) {
  try {
    const dados = JSON.parse(localStorage.getItem('martelo_do_thor_data') || '{"jogadores":{}}');
    const ranking = Object.entries(dados.jogadores)
      .map(([n, d]) => ({ nome: n, forca: d.melhor }))
      .sort((a, b) => b.forca - a.forca)
      .slice(0, 10);

    const posicao = ranking.findIndex(r => r.nome === nome);
    if (posicao >= 0) {
      const medalhas = ['🥇', '🥈', '🥉'];
      const medalha = medalhas[posicao] || `#${posicao + 1}`;
      return `${medalha} Posição: ${posicao + 1}º no ranking`;
    }
    return '📊 Fora do top 10';
  } catch (e) {
    return '📊 Ranking';
  }
}

// ============================================
// RANKING
// ============================================
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
    const forcaKg = item.forca / 9.80665;
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
          <div style="font-size: 1.25rem; font-weight: bold;">${forcaKg.toFixed(1)} kg</div>
          <small style="color: rgba(255,255,255,0.7);">Melhor marca</small>
        </div>
      </div>
    `;
  }).join('');
}

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

// ============================================
// MINHAS TENTATIVAS
// ============================================
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
    const forcaKg = tentativa.forca / 9.80665;
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
          <strong>${forcaKg.toFixed(1)} kg</strong>
          <small style="display: block; color: #7f8c8d;">${tentativa.data}</small>
        </div>
        ${isMelhor ? '<span style="background: #f39c12; color: white; padding: 0.25rem 0.75rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: bold;">⭐ MELHOR</span>' : ''}
      </div>
    `;
  }).join('');
}

// ============================================
// ESTATÍSTICAS
// ============================================
function atualizarEstatisticasMarelo() {
  const nome = marteloEstado.nomeJogador || document.getElementById('martelo-nome-jogador').value.trim();
  
  if (!nome || !marteloData.jogadores[nome]) {
    document.getElementById('martelo-stats-melhor').textContent = '--- kg';
    document.getElementById('martelo-stats-media').textContent = '--- kg';
    document.getElementById('martelo-stats-testes').textContent = '0';
    document.getElementById('martelo-stats-posicao').textContent = '---';
    return;
  }
  
  const jogador = marteloData.jogadores[nome];
  const melhorKg = jogador.melhor / 9.80665;
  const mediaKg = jogador.media / 9.80665;
  const posicao = obterPosicaoRanking(nome);
  
  document.getElementById('martelo-stats-melhor').textContent = melhorKg.toFixed(1) + ' kg';
  document.getElementById('martelo-stats-media').textContent = mediaKg.toFixed(1) + ' kg';
  document.getElementById('martelo-stats-testes').textContent = jogador.tentativas.length;
  document.getElementById('martelo-stats-posicao').textContent = posicao;
}

function obterPosicaoRanking(nome) {
  const ranking = obterRankingGlobal();
  const posicao = ranking.findIndex(r => r.nome === nome);
  return posicao >= 0 ? `${posicao + 1}º lugar` : 'Fora do top 10';
}

// ============================================
// MOSTRAR ABA MARTELO
// ============================================
function mostrarAbaMarelo(aba) {
  // Esconder tudo
  document.getElementById('martelo-ranking-container').style.display = 'none';
  document.getElementById('martelo-minhas-container').style.display = 'none';
  document.getElementById('martelo-stats-container').style.display = 'none';

  // Remover classe ativo de todos os botões
  document.getElementById('btn-aba-ranking').style.background = '';
  document.getElementById('btn-aba-minhas').style.background = '';
  document.getElementById('btn-aba-stats').style.background = '';

  // Mostrar a aba selecionada
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

// ============================================
// LIMPAR MARTELO
// ============================================
function limparMarelo() {
  if (confirm('⚠️ Tem certeza que deseja limpar TODO o ranking e histórico?')) {
    marteloData = { jogadores: {} };
    salvarMarelo();
    atualizarRankingMarelo();
    atualizarMinhasTentativasMarelo();
    atualizarEstatisticasMarelo();
    alert('✓ Ranking limpo com sucesso!');
  }
}

// ============================================
// INICIALIZAR
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  carregarMarelo();
  atualizarRankingMarelo();
  
  // Recarregar dados a cada mudança de aba
  document.getElementById('btn-aba-ranking').addEventListener('click', () => {
    carregarMarelo();
    atualizarRankingMarelo();
  });
});

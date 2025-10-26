// --- VERSÃO SIMPLES E ROBUSTA PARA EXPORTAÇÃO DE SESSÃO ---

function calcularAreaSobCurva(tempos, forcas, onlyPositive = false) {
  if (tempos.length !== forcas.length || tempos.length < 2) {
    return { areaTotal: 0, areaPositiva: 0, areaNegativa: 0, impulsoTotal: 0, impulsoLiquido: 0,
             impulsoPositivo: 0, tempoIgnicao: 0, tempoBurnout: 0, forcaMaxima: 0, forcaMedia: 0,
             duracaoQueima: 0, forcaMediaPositiva: 0 };
  }

  let areaTotalSigned = 0;
  let areaPositiva = 0;
  let areaNegativa = 0;
  let tempoIgnicao = null;
  let tempoBurnout = null;

  const forcaMaxima = Math.max(...forcas);
  const forcaMediaAmostral = forcas.reduce((a, b) => a + b, 0) / forcas.length;

  // Threshold de ignição (5% de Fmax, mínimo 0.5N)
  const thresholdIgnicao = Math.max(forcaMaxima * 0.05, 0.5);

  for (let i = 0; i < tempos.length - 1; i++) {
    const deltaT = tempos[i + 1] - tempos[i];
    const f1 = onlyPositive ? Math.max(0, forcas[i])     : forcas[i];
    const f2 = onlyPositive ? Math.max(0, forcas[i + 1]) : forcas[i + 1];
    const areaTrap = deltaT * (f1 + f2) / 2;

    areaTotalSigned += areaTrap;
    if (areaTrap >= 0) areaPositiva += areaTrap; else areaNegativa += -areaTrap;

    // ignição: primeira amostra acima do threshold
    if (tempoIgnicao === null && forcas[i] > thresholdIgnicao) tempoIgnicao = tempos[i];
    // burnout: última amostra acima do threshold
    if (forcas[i] > thresholdIgnicao) tempoBurnout = tempos[i];
  }

  const duracaoQueima = (tempoBurnout ?? 0) - (tempoIgnicao ?? 0);
  const impulsoTotalPositivo = areaPositiva;                 // o que se usa para classificar motor
  const impulsoLiquido = areaPositiva - areaNegativa;        // útil para análise dinâmica
  const forcaMediaQueima = duracaoQueima > 0 ? impulsoTotalPositivo / duracaoQueima : 0;
  const forcaMediaPositiva = (() => {
    const positivos = forcas.filter(f => f > 0);
    return positivos.length ? (positivos.reduce((a,b)=>a+b,0) / positivos.length) : 0;
  })();

  return {
    areaTotal: areaPositiva + areaNegativa,
    areaPositiva,
    areaNegativa,
    impulsoTotal: impulsoTotalPositivo, // Em N⋅s — este é o “oficial”
    impulsoLiquido,                     // Novo: pos − neg
    impulsoPositivo: impulsoTotalPositivo,
    tempoIgnicao: tempoIgnicao || 0,
    tempoBurnout: tempoBurnout || 0,
    duracaoQueima,
    forcaMaxima,
    forcaMedia: forcaMediaAmostral,     // média amostral
    forcaMediaPositiva,                 // média amostral somente >0
    forcaMediaQueima                    // média temporal durante queima (impulso/duração)
  };
}


function calcularMetricasPropulsao(impulsoData, massaPropelente = null) {
  // usar o impulsoTotal (positivo) para classificar
  const It = impulsoData.impulsoTotal;
  const { duracaoQueima, forcaMaxima } = impulsoData;

  const classificacaoMotor = classificarMotor(It);
  const impulsoEspecifico = massaPropelente ? It / (massaPropelente * 9.81) : null;
  const razaoImpulsoMedio = duracaoQueima > 0 ? It / duracaoQueima : 0; // = Fmédia durante queima
  const eficienciaQueima = forcaMaxima > 0 ? (razaoImpulsoMedio / forcaMaxima) * 100 : 0;

  return { classificacaoMotor, impulsoEspecifico, razaoImpulsoMedio, eficienciaQueima };
}

function classificarMotor(impulsoNs) {
  const EPS = 1e-6; // tolerância p/ fronteiras
  const classificacoes = [
    { min: 0.00,    max: 0.3125,   classe: 'Micro 1/8A', tipo: 'FM (foguetemodelo)', nivel: 'Micro',       cor: '#8e44ad' },
    { min: 0.3126,  max: 0.625,    classe: '¼A',         tipo: 'FM (foguetemodelo)', nivel: 'Baixa potência', cor: '#9b59b6' },
    { min: 0.626,   max: 1.25,     classe: '½A',         tipo: 'FM (foguetemodelo)', nivel: 'Baixa potência', cor: '#e74c3c' },
    { min: 1.26,    max: 2.50,     classe: 'A',          tipo: 'FM (foguetemodelo)', nivel: 'Baixa potência', cor: '#e67e22' },
    { min: 2.51,    max: 5.00,     classe: 'B',          tipo: 'FM (foguetemodelo)', nivel: 'Baixa potência', cor: '#f39c12' },
    { min: 5.01,    max: 10.00,    classe: 'C',          tipo: 'FM (foguetemodelo)', nivel: 'Baixa potência', cor: '#f1c40f' },
    { min: 10.01,   max: 20.00,    classe: 'D',          tipo: 'FM (foguetemodelo)', nivel: 'Baixa potência', cor: '#2ecc71' },
    { min: 20.01,   max: 40.00,    classe: 'E',          tipo: 'FM (foguetemodelo)', nivel: 'Média potência', cor: '#1abc9c' },
    { min: 40.01,   max: 80.00,    classe: 'F',          tipo: 'FM (foguetemodelo)', nivel: 'Média potência', cor: '#3498db' },
    { min: 80.01,   max: 160.00,   classe: 'G',          tipo: 'FM (foguetemodelo)', nivel: 'Média potência', cor: '#9b59b6' },
    { min: 160.01,  max: 320.00,   classe: 'H',          tipo: 'MFE (experimental)', nivel: 'Nível 1',        cor: '#e74c3c' },
    { min: 320.01,  max: 640.00,   classe: 'I',          tipo: 'MFE (experimental)', nivel: 'Nível 1',        cor: '#e67e22' },
    { min: 640.01,  max: 1280.00,  classe: 'J',          tipo: 'MFE (experimental)', nivel: 'Nível 2',        cor: '#f39c12' },
    { min: 1280.01, max: 2560.00,  classe: 'K',          tipo: 'MFE (experimental)', nivel: 'Nível 2',        cor: '#2ecc71' },
    { min: 2560.01, max: 5120.00,  classe: 'L',          tipo: 'MFE (experimental)', nivel: 'Nível 2',        cor: '#3498db' },
    { min: 5120.01, max: 10240.00, classe: 'M',          tipo: 'MFE (experimental)', nivel: 'Nível 3',        cor: '#9b59b6' },
    { min: 10240.01,max: 20480.00, classe: 'N',          tipo: 'MFE (experimental)', nivel: 'Nível 3',        cor: '#e74c3c' },
    { min: 20480.01,max: 40960.00, classe: 'O',          tipo: 'MFE (experimental)', nivel: 'Nível 3',        cor: '#c0392b' },
  ];

  const c = classificacoes.find(c =>
    impulsoNs >= (c.min - EPS) && impulsoNs <= (c.max + EPS)
  );

  if (!c) return { classe: 'Indefinido', tipo: '—', nivel: '—', cor: '#95a5a6', faixa: 'N/A' };

  return { 
    classe: c.classe, 
    tipo: c.tipo, 
    nivel: c.nivel,
    cor: c.cor, 
    faixa: `${c.min.toFixed(2)} a ${c.max.toFixed(2)} N⋅s`
  };
}



function exportarImagemSessao(sessionId) {
  try {
    const gravacoes = JSON.parse(localStorage.getItem('balancaGravacoes')) || [];
    const sessao = gravacoes.find(g => g.id === sessionId);
    
    if (!sessao || !sessao.dadosTabela || sessao.dadosTabela.length === 0) {
      showNotification('error', 'Sessão não encontrada ou sem dados');
      return;
    }
    
    showNotification('info', `Gerando análise de propulsão de "${sessao.nome}"...`, 2000);
    
    // Processa dados COM cálculos de impulso
    const dados = processarDadosSimples(sessao.dadosTabela);
    
    // Gera relatório com análise de impulso
    criarRelatorioComImpulso(sessao, dados);
    
  } catch (e) {
    console.error('Erro:', e);
    showNotification('error', 'Erro ao gerar relatório: ' + e.message);
  }
}

function processarDadosSimples(dadosTabela) {
  const tempos = [];
  const newtons = [];
  const kgf = [];
  
  dadosTabela.forEach(linha => {
    tempos.push(parseFloat(linha.tempo_esp) || 0);
    newtons.push(parseFloat(linha.newtons) || 0);
    kgf.push(parseFloat(linha.quilo_forca) || 0);
  });
  
  // Estatísticas básicas
  const calcStats = (arr) => {
    if (arr.length === 0) return null;
    const soma = arr.reduce((a, b) => a + b, 0);
    const media = soma / arr.length;
    const max = Math.max(...arr);
    const min = Math.min(...arr);
    const ordenado = [...arr].sort((a, b) => a - b);
    const mediana = arr.length % 2 === 0 
      ? (ordenado[Math.floor(arr.length/2) - 1] + ordenado[Math.floor(arr.length/2)]) / 2
      : ordenado[Math.floor(arr.length/2)];
    
    const variancia = arr.reduce((acc, val) => acc + Math.pow(val - media, 2), 0) / arr.length;
    const desvio = Math.sqrt(variancia);
    const cv = media !== 0 ? (desvio / Math.abs(media)) * 100 : 0;
    
    return { media, max, min, mediana, desvio, cv, amplitude: max - min };
  };


 
  // NOVO: Cálculo da área sob a curva (IMPULSO)
  const impulsoData = calcularAreaSobCurva(tempos, newtons, false);
  const metricasPropulsao = calcularMetricasPropulsao(impulsoData);
  
  return {
    tempos,
    newtons,
    kgf,
    stats: calcStats(kgf),
    duracao: tempos.length > 0 ? Math.max(...tempos) - Math.min(...tempos) : 0,
    pontos: tempos.length,
    // NOVOS DADOS DE IMPULSO:
    impulso: impulsoData,
    propulsao: metricasPropulsao
  };
}
function criarRelatorioComImpulso(sessao, dados) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Dimensões maiores para acomodar informações de impulso
  const w = 1600;
  const h = 1200;
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
    laranja: '#e67e22'
  };
  
  // 1. FUNDO
  ctx.fillStyle = cor.fundo;
  ctx.fillRect(0, 0, w, h);
  
  // 2. CABEÇALHO COM IMPULSO
  ctx.fillStyle = cor.titulo;
  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('🚀 ANÁLISE DE PROPULSÃO', w/2, 50);
  
  ctx.fillStyle = cor.azul;
  ctx.font = 'bold 24px Arial';
  ctx.fillText(`"${sessao.nome}"`, w/2, 90);
  
  const dataSessao = new Date(sessao.timestamp).toLocaleString('pt-BR');
  ctx.fillStyle = cor.subtitulo;
  ctx.font = '16px Arial';
  ctx.fillText(`Teste realizado em: ${dataSessao}`, w/2, 120);
  
  // DESTAQUE DO IMPULSO
  ctx.fillStyle = cor.verde;
  ctx.font = 'bold 20px Arial';
  const impulsoTotal = dados.impulso.impulsoTotal;
  const classificacao = dados.propulsao.classificacaoMotor;
  ctx.fillText(`💥 Impulso Total: ${impulsoTotal.toFixed(2)} N⋅s | Motor Classe ${classificacao.classe}`, w/2, 155);
  
  // Linha
  ctx.strokeStyle = cor.cinza;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w*0.1, 180);
  ctx.lineTo(w*0.9, 180);
  ctx.stroke();
  
  // 3. GRÁFICO COM ÁREA PREENCHIDA
  if (dados.kgf.length > 0) {
    desenharGraficoComArea(ctx, dados, cor, w, h);
  }
  
  // 4. ESTATÍSTICAS + IMPULSO
  if (dados.stats) {
    desenharEstatisticasCompletas(ctx, dados, cor, w, h);
  }
  
  // 5. TABELA DE MÉTRICAS
  desenharTabelaImpulso(ctx, dados, cor, w, h);
  
  // 6. RODAPÉ
  ctx.fillStyle = cor.subtitulo;
  ctx.font = '12px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Sistema de Análise de Propulsão - GFIG', 50, h-20);
  ctx.textAlign = 'right';
  ctx.fillText(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, w-50, h-20);
  
  // 7. DOWNLOAD
  baixarRelatorio(canvas, sessao.nome + '_analise_propulsao');
}


function desenharGraficoComArea(ctx, dados, cor, w, h) {
  // Área do gráfico
  const gx = 100;
  const gy = 220;
  const gw = w - 200;
  const gh = 400;
  
  // Título do gráfico
  ctx.fillStyle = cor.titulo;
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('📈 CURVA DE FORÇA vs TEMPO (Área Sombreada = Impulso Total)', gx + gw/2, gy - 20);
  
  // Fundo
  ctx.fillStyle = cor.fundo2;
  ctx.fillRect(gx, gy, gw, gh);
  
  // Borda
  ctx.strokeStyle = cor.cinza;
  ctx.lineWidth = 2;
  ctx.strokeRect(gx, gy, gw, gh);
  
  const valores = dados.newtons; // Usa Newtons diretamente
  const tempos = dados.tempos;
  
  if (valores.length === 0) return;
  
  // Limites
  const maxVal = Math.max(...valores);
  const minVal = Math.min(...valores, 0);
  const range = maxVal - minVal || 0.001;
  const padding = range * 0.1;
  
  const yMin = minVal - padding;
  const yMax = maxVal + padding;
  const yRange = yMax - yMin;
  
  // Grid horizontal
  ctx.strokeStyle = '#ecf0f1';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  
  for (let i = 0; i <= 6; i++) {
    const y = gy + (gh/6) * i;
    const valor = yMax - (yRange/6) * i;
    
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx + gw, y);
    ctx.stroke();
    
    // Label
    ctx.fillStyle = cor.cinza;
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(valor.toFixed(1) + 'N', gx - 10, y + 4);
  }
  
  ctx.setLineDash([]);
  
  // PREENCHIMENTO DA ÁREA (IMPULSO) - APENAS VALORES POSITIVOS
  if (valores.length > 1) {
    ctx.fillStyle = 'rgba(52, 152, 219, 0.3)'; // Azul transparente
    ctx.beginPath();
    
    // Encontra a linha do zero
    const zeroY = gy + gh - ((0 - yMin) / yRange) * gh;
    
    // Começa na linha do zero
    ctx.moveTo(gx, zeroY);
    
    // Segue a curva apenas para valores positivos
    for (let i = 0; i < valores.length; i++) {
      const x = gx + (gw / (valores.length - 1)) * i;
      const valorPositivo = Math.max(0, valores[i]); // Só valores positivos
      const y = gy + gh - ((valorPositivo - yMin) / yRange) * gh;
      ctx.lineTo(x, y);
    }
    
    // Volta para o zero no final
    ctx.lineTo(gx + gw, zeroY);
    ctx.closePath();
    ctx.fill();
  }
  
  // Linha dos dados
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
  
  // Linha do zero
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
  
  // Ponto de força máxima
  ctx.fillStyle = cor.vermelho;
  const maxIndex = valores.indexOf(Math.max(...valores));
  if (maxIndex >= 0) {
    const x = gx + (gw / (valores.length - 1)) * maxIndex;
    const y = gy + gh - ((valores[maxIndex] - yMin) / yRange) * gh;
    
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.fill();
    
    // Label
    ctx.fillStyle = cor.vermelho;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Fmax: ${valores[maxIndex].toFixed(1)}N`, x, y - 20);
  }
  
  // Labels dos eixos
  ctx.fillStyle = cor.titulo;
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  
  // Eixo Y
  ctx.save();
  ctx.translate(40, gy + gh/2);
  ctx.rotate(-Math.PI/2);
  ctx.fillText('Força (N)', 0, 0);
  ctx.restore();
  
  // Eixo X
  ctx.fillText('Tempo (s)', gx + gw/2, gy + gh + 50);
  
  // Legenda
  const legX = gx + gw - 180;
  const legY = gy + 30;
  
  ctx.fillStyle = 'rgba(52, 152, 219, 0.3)';
  ctx.fillRect(legX, legY, 25, 20);
  ctx.strokeStyle = cor.azul;
  ctx.lineWidth = 2;
  ctx.strokeRect(legX, legY, 25, 20);
  
  ctx.fillStyle = cor.titulo;
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Área = Impulso', legX + 35, legY + 15);
  
  // Valor do impulso na legenda
  ctx.font = '12px Arial';
  ctx.fillStyle = cor.verde;
  ctx.fillText(`${dados.impulso.impulsoTotal.toFixed(2)} N⋅s`, legX + 35, legY + 30);
}

function desenharEstatisticasCompletas(ctx, dados, cor, w, h) {
  const sy = 650;
  
  // Título
  ctx.fillStyle = cor.titulo;
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('📊 ANÁLISE ESTATÍSTICA COMPLETA', 100, sy);
  
  // Caixa principal
  const bx = 100;
  const by = sy + 30;
  const bw = w - 200;
  const bh = 200;
  
  ctx.fillStyle = cor.fundo2;
  ctx.fillRect(bx, by, bw, bh);
  
  ctx.strokeStyle = cor.azul;
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, bw, bh);
  
  // Coluna 1: Estatísticas básicas
  ctx.fillStyle = cor.titulo;
  ctx.font = 'bold 16px Arial';
  ctx.fillText('📈 ESTATÍSTICAS BÁSICAS', bx + 20, by + 30);
  
  ctx.font = '13px Arial';
  const stats = dados.stats;
  const estatisticasBasicas = [
    `Média: ${(stats.media * 9.81).toFixed(2)} N`,
    `Máximo: ${(stats.max * 9.81).toFixed(2)} N`,
    `Mínimo: ${(stats.min * 9.81).toFixed(2)} N`,
    `Desvio: ${(stats.desvio * 9.81).toFixed(3)} N`,
    `CV: ${stats.cv.toFixed(1)}%`
  ];
  
  estatisticasBasicas.forEach((texto, i) => {
    ctx.fillText(texto, bx + 20, by + 55 + i * 20);
  });
  
  // Coluna 2: Dados de impulso
  ctx.font = 'bold 16px Arial';
  ctx.fillStyle = cor.verde;
  ctx.fillText('🚀 ANÁLISE DE IMPULSO', bx + bw/2 + 20, by + 30);
  
  ctx.font = '13px Arial';
  ctx.fillStyle = cor.titulo;
  
  const impulso = dados.impulso;
  const dadosImpulso = [
    `Impulso Total: ${impulso.impulsoTotal.toFixed(3)} N⋅s`,
    `Impulso Positivo: ${impulso.impulsoPositivo.toFixed(3)} N⋅s`,
    `Duração Queima: ${impulso.duracaoQueima.toFixed(2)} s`,
    `Tempo Ignição: ${impulso.tempoIgnicao.toFixed(2)} s`,
    `Tempo Burnout: ${impulso.tempoBurnout.toFixed(2)} s`
  ];
  
  dadosImpulso.forEach((texto, i) => {
    ctx.fillText(texto, bx + bw/2 + 20, by + 55 + i * 20);
  });
  
  // Caixa de classificação do motor
  const classY = by + 160;
  const classificacao = dados.propulsao.classificacaoMotor;
  
  ctx.fillStyle = classificacao.cor;
  ctx.fillRect(bx + 20, classY, 40, 30);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(classificacao.classe, bx + 40, classY + 22);
  
  ctx.fillStyle = cor.titulo;
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`Motor Classe ${classificacao.classe}`, bx + 70, classY + 15);
  ctx.font = '12px Arial';
  ctx.fillText(classificacao.faixa, bx + 70, classY + 28);
}

function desenharTabelaImpulso(ctx, dados, cor, w, h) {
  const ty = 880;
  
  ctx.fillStyle = cor.titulo;
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('📋 MÉTRICAS DE PROPULSÃO DETALHADAS', 100, ty);
  
  // Tabela
  const tx = 100;
  const tby = ty + 30;
  const tw = w - 200;
  const th = 180;
  
  // Fundo
  ctx.fillStyle = cor.fundo2;
  ctx.fillRect(tx, tby, tw, th);
  
  // Borda
  ctx.strokeStyle = cor.azul;
  ctx.lineWidth = 2;
  ctx.strokeRect(tx, tby, tw, th);
  
  // Cabeçalhos
  ctx.fillStyle = cor.azul;
  ctx.font = 'bold 14px Arial';
  ctx.fillText('PARÂMETRO', tx + 20, tby + 25);
  ctx.fillText('VALOR', tx + 250, tby + 25);
  ctx.fillText('PARÂMETRO', tx + 450, tby + 25);
  ctx.fillText('VALOR', tx + 680, tby + 25);
  
  // Linha separadora
  ctx.strokeStyle = cor.cinza;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tx + 20, tby + 35);
  ctx.lineTo(tx + tw - 20, tby + 35);
  ctx.stroke();
  
  ctx.font = '13px Arial';
  ctx.fillStyle = cor.titulo;
  
  const impulso = dados.impulso;
  const propulsao = dados.propulsao;
  
  const metricas = [
    ['Impulso Total:', `${impulso.impulsoTotal.toFixed(3)} N⋅s`, 'Força Máxima:', `${impulso.forcaMaxima.toFixed(2)} N`],
    ['Impulso Positivo:', `${impulso.impulsoPositivo.toFixed(3)} N⋅s`, 'Força Média:', `${impulso.forcaMedia.toFixed(2)} N`],
    ['Impulso Negativo:', `${impulso.areaNegativa.toFixed(3)} N⋅s`, 'Força Média (>0):', `${impulso.forcaMediaPositiva.toFixed(2)} N`],
    ['Duração Total:', `${dados.duracao.toFixed(2)} s`, 'Duração Queima:', `${impulso.duracaoQueima.toFixed(2)} s`],
    ['Tempo Ignição:', `${impulso.tempoIgnicao.toFixed(2)} s`, 'Tempo Burnout:', `${impulso.tempoBurnout.toFixed(2)} s`],
    ['Classificação NAR:', propulsao.classificacaoMotor.classe, 'Eficiência Queima:', `${propulsao.eficienciaQueima.toFixed(1)}%`]
  ];
  
  metricas.forEach((linha, i) => {
    const y = tby + 55 + i * 20;
    ctx.fillStyle = cor.titulo;
    ctx.fillText(linha[0], tx + 20, y);
    ctx.fillStyle = cor.azul;
    ctx.fillText(linha[1], tx + 250, y);
    ctx.fillStyle = cor.titulo;
    ctx.fillText(linha[2], tx + 450, y);
    ctx.fillStyle = cor.verde;
    ctx.fillText(linha[3], tx + 680, y);
  });
}


//ver se remover
function criarRelatorioSimples(sessao, dados) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Configurações
  const w = 1400;
  const h = 1000;
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
    fundo2: '#f8f9fa'
  };
  
  // 1. FUNDO
  ctx.fillStyle = cor.fundo;
  ctx.fillRect(0, 0, w, h);
  
  // 2. CABEÇALHO
  ctx.fillStyle = cor.titulo;
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('📊 RELATÓRIO DA SESSÃO', w/2, 50);
  
  ctx.fillStyle = cor.azul;
  ctx.font = 'bold 22px Arial';
  ctx.fillText(`"${sessao.nome}"`, w/2, 85);
  
  const dataSessao = new Date(sessao.timestamp).toLocaleString('pt-BR');
  ctx.fillStyle = cor.subtitulo;
  ctx.font = '16px Arial';
  ctx.fillText(`Gravada em: ${dataSessao}`, w/2, 115);
  
  // Info básica
  ctx.font = 'bold 14px Arial';
  ctx.fillText(`${dados.pontos} pontos • ${dados.duracao.toFixed(1)}s de duração`, w/2, 140);
  
  // Linha
  ctx.strokeStyle = cor.cinza;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w*0.2, 160);
  ctx.lineTo(w*0.8, 160);
  ctx.stroke();
  
  // 3. GRÁFICO
  if (dados.kgf.length > 0) {
    desenharGraficoSimples(ctx, dados, cor, w, h);
  }
  
  // 4. ESTATÍSTICAS
  if (dados.stats) {
    desenharEstatisticasSimples(ctx, dados.stats, cor, w, h);
  }
  
  // 5. RODAPÉ
  ctx.fillStyle = cor.subtitulo;
  ctx.font = '12px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Sistema de Balança Digital', 50, h-20);
  ctx.textAlign = 'right';
  ctx.fillText(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, w-50, h-20);
  
  // 6. DOWNLOAD
  baixarRelatorio(canvas, sessao.nome);
}

function desenharGraficoSimples(ctx, dados, cor, w, h) {
  // Área do gráfico
  const gx = 100;
  const gy = 200;
  const gw = w - 200;
  const gh = 350;
  
  // Fundo
  ctx.fillStyle = cor.fundo2;
  ctx.fillRect(gx, gy, gw, gh);
  
  // Borda
  ctx.strokeStyle = cor.cinza;
  ctx.lineWidth = 2;
  ctx.strokeRect(gx, gy, gw, gh);
  
  const valores = dados.kgf;
  const tempos = dados.tempos;
  
  if (valores.length === 0) return;
  
  // Limites
  const maxVal = Math.max(...valores);
  const minVal = Math.min(...valores);
  const range = maxVal - minVal || 0.001;
  const padding = range * 0.1;
  
  const yMin = minVal - padding;
  const yMax = maxVal + padding;
  const yRange = yMax - yMin;
  
  // Grid horizontal
  ctx.strokeStyle = '#ecf0f1';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  
  for (let i = 0; i <= 5; i++) {
    const y = gy + (gh/5) * i;
    const valor = yMax - (yRange/5) * i;
    
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx + gw, y);
    ctx.stroke();
    
    // Label
    ctx.fillStyle = cor.cinza;
    ctx.font = '11px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(valor.toFixed(3), gx - 10, y + 3);
  }
  
  ctx.setLineDash([]);
  
  // Linha dos dados
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
  
  // Pontos
  ctx.fillStyle = cor.azul;
  for (let i = 0; i < valores.length; i++) {
    const x = gx + (gw / Math.max(1, valores.length - 1)) * i;
    const y = gy + gh - ((valores[i] - yMin) / yRange) * gh;
    
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, 2 * Math.PI);
    ctx.fill();
  }
  
  // Labels dos eixos
  ctx.fillStyle = cor.titulo;
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  
  // Eixo Y (sem rotação para simplicidade)
  ctx.textAlign = 'center';
  ctx.fillText('Força (kgf)', 50, gy + gh/2);
  
  // Eixo X
  ctx.fillText('Tempo (s)', gx + gw/2, gy + gh + 40);
  
  // Labels do tempo (alguns pontos)
  ctx.fillStyle = cor.cinza;
  ctx.font = '10px Arial';
  const step = Math.max(1, Math.floor(valores.length / 8));
  for (let i = 0; i < valores.length; i += step) {
    const x = gx + (gw / Math.max(1, valores.length - 1)) * i;
    ctx.fillText(tempos[i].toFixed(1), x, gy + gh + 15);
  }
}

function desenharEstatisticasSimples(ctx, stats, cor, w, h) {
  const sy = 600;
  
  // Título
  ctx.fillStyle = cor.titulo;
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('📈 ESTATÍSTICAS', 100, sy);
  
  // Caixa
  const bx = 100;
  const by = sy + 20;
  const bw = w - 200;
  const bh = 120;
  
  ctx.fillStyle = cor.fundo2;
  ctx.fillRect(bx, by, bw, bh);
  
  ctx.strokeStyle = cor.azul;
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, bw, bh);
  
  // Estatísticas em colunas
  ctx.fillStyle = cor.titulo;
  ctx.font = '14px Arial';
  
  const estatisticas = [
    [`Média: ${stats.media.toFixed(4)} kgf`, `Máximo: ${stats.max.toFixed(4)} kgf`],
    [`Mínimo: ${stats.min.toFixed(4)} kgf`, `Mediana: ${stats.mediana.toFixed(4)} kgf`],
    [`Desvio Padrão: ${stats.desvio.toFixed(4)} kgf`, `Coef. Variação: ${stats.cv.toFixed(1)}%`],
    [`Amplitude: ${stats.amplitude.toFixed(4)} kgf`, `Qualidade: ${getQualidadeSinal(stats.cv)}`]
  ];
  
  estatisticas.forEach((linha, i) => {
    ctx.fillText(linha[0], bx + 20, by + 25 + i * 20);
    ctx.fillText(linha[1], bx + bw/2 + 20, by + 25 + i * 20);
  });
}

function getQualidadeSinal(cv) {
  if (cv < 5) return 'Excelente';
  if (cv < 15) return 'Boa';
  if (cv < 30) return 'Regular';
  return 'Ruidosa';
}

function baixarRelatorio(canvas, nomeSessao) {
  try {
    canvas.toBlob(function(blob) {
      if (!blob) {
        showNotification('error', 'Erro ao criar arquivo');
        return;
      }
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      // Nome sanitizado
      const nome = nomeSessao.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
      link.download = `relatorio_${nome}_${Date.now()}.png`;
      link.href = url;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showNotification('success', `Relatório de "${nomeSessao}" exportado!`);
      
    }, 'image/png', 1.0);
    
  } catch (e) {
    console.error('Erro no download:', e);
    showNotification('error', 'Erro ao baixar: ' + e.message);
  }
}

// VERSÃO ALTERNATIVA AINDA MAIS SIMPLES
function exportarResumoSessao(sessionId) {
  try {
    const gravacoes = JSON.parse(localStorage.getItem('balancaGravacoes')) || [];
    const sessao = gravacoes.find(g => g.id === sessionId);
    
    if (!sessao) {
      showNotification('error', 'Sessão não encontrada');
      return;
    }
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = 800;
    canvas.height = 600;
    
    // Fundo branco
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 800, 600);
    
    // Título
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Relatório da Sessão', 400, 50);
    
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#3498db';
    ctx.fillText(sessao.nome, 400, 80);
    
    // Data
    ctx.font = '14px Arial';
    ctx.fillStyle = '#7f8c8d';
    const data = new Date(sessao.timestamp).toLocaleString('pt-BR');
    ctx.fillText(`Gravada em: ${data}`, 400, 110);
    
    // Info básica
    ctx.font = '16px Arial';
    ctx.fillStyle = '#2c3e50';
    ctx.textAlign = 'left';
    
    const info = [
      `Total de pontos: ${sessao.dadosTabela.length}`,
      `Primeira leitura: ${sessao.dadosTabela[0]?.tempo_esp || '0'}s`,
      `Última leitura: ${sessao.dadosTabela[sessao.dadosTabela.length-1]?.tempo_esp || '0'}s`,
      `Maior força: ${Math.max(...sessao.dadosTabela.map(d => parseFloat(d.quilo_forca) || 0)).toFixed(3)} kgf`,
      `Menor força: ${Math.min(...sessao.dadosTabela.map(d => parseFloat(d.quilo_forca) || 0)).toFixed(3)} kgf`
    ];
    
    info.forEach((linha, i) => {
      ctx.fillText(linha, 50, 180 + i * 30);
    });
    
    // Download
    baixarRelatorio(canvas, sessao.nome + '_resumo');
    
  } catch (e) {
    console.error('Erro:', e);
    showNotification('error', 'Erro: ' + e.message);
  }
}

// ATUALIZA A FUNÇÃO DE CARREGAR GRAVAÇÕES COM BOTÕES CORRETOS
async function carregarGravacoesComImpulso() { // Make it async
  const container = document.getElementById('lista-gravacoes');
  if (!container) return;

  container.innerHTML = ''; // Clear existing list

  let localGravacoes = JSON.parse(localStorage.getItem('balancaGravacoes')) || [];
  let mysqlGravacoes = [];

  // Fetch sessions from MySQL if connected
  if (isMysqlConnected) {
      showNotification('info', 'Buscando gravações do MySQL...');
      mysqlGravacoes = await fetchSessionsFromMysqlViaWorker(); // NEW: Await MySQL sessions
  }

  // Create a map for quick lookup of local sessions by ID
  const localMap = new Map(localGravacoes.map(s => [s.id, s]));

  // Merge sessions: prioritize MySQL data, mark local-only
  const combinedSessions = [];
  const processedIds = new Set();

  // Add MySQL sessions first
  mysqlGravacoes.forEach(mysqlSessao => {
      combinedSessions.push(mysqlSessao);
      processedIds.add(mysqlSessao.id);
  });

  // Add local sessions that are not in MySQL
  localGravacoes.forEach(localSessao => {
      if (!processedIds.has(localSessao.id)) {
          combinedSessions.push(localSessao);
      }
  });

  // Sort combined sessions (newest first)
  combinedSessions.sort((a, b) => b.id - a.id);

  // Render the combined list
  renderCombinedSessions(combinedSessions); // This function is in script.js
  showNotification('info', `Carregadas ${combinedSessions.length} gravações (local e MySQL).`);
}

// NEW: Helper function to create the HTML for a session card
function criarElementoGravacaoHTML(gravacao, dados) {
    const dataFormatada = new Date(gravacao.timestamp).toLocaleString('pt-BR');
    const classe = dados.propulsao.classificacaoMotor.classe;
    const impulsoData = dados.impulso;

    const card = document.createElement('div');
    card.className = 'card-gravacao';
    card.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--cor-fundo-card);
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      margin-bottom: 10px;
      border-left: 5px solid ${dados.propulsao.classificacaoMotor.cor || 'var(--cor-primaria)'};
    `;

    let storageIcons = '';
    storageIcons += '<span title="Salvo Localmente" style="margin-left: 5px; color: #3498db;">&#x1F4C7;</span>'; // Blue folder for Local Storage

    if (gravacao.savedToMysql) {
        storageIcons += '<span title="Salvo no MySQL" style="margin-left: 5px; color: #27ae60;">&#x1F4BE;</span>'; // Green floppy disk for MySQL
    }

    let persistButton = '';
    if (!gravacao.savedToMysql) {
        persistButton = `<button class="btn btn-sucesso btn-small" onclick="persistToMysql(${gravacao.id})">💾 Salvar no MySQL</button>`;
    }

   card.innerHTML = `
      <div>
          <p style="font-weight: 600; margin-bottom: 5px;">${gravacao.nome} <span style="font-size: 0.75rem; background: ${dados.propulsao.classificacaoMotor.cor || 'var(--cor-primaria)'}; color: white; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">CLASSE ${classe}</span></p>
          <p style="font-size: 0.875rem; color: var(--cor-texto-secundario);">
              ${dataFormatada} • Impulso Total: ${impulsoData.impulsoTotal.toFixed(2)} N⋅s
              ${storageIcons}
          </p>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button onclick="visualizarSessao(${gravacao.id})" title="Carregar para Análise/Gráfico" class="btn btn-info">👁️ Ver</button>
          <button onclick="exportarImagemSessao(${gravacao.id})" title="Exportar Gráfico em PNG" class="btn btn-primario">🖼️ PNG</button>
          <button onclick="exportarPDFViaPrint(${gravacao.id})" title="Exportar Relatório PDF" class="btn btn-secundario">📑 PDF</button>
          <button onclick="exportarCSV(${gravacao.id})" title="Exportar Dados em CSV" class="btn btn-sucesso">📄 CSV</button>
          <button onclick="exportarMotorENG(${gravacao.id})" title="Exportar Curva de Empuxo para OpenRocket/RASAero" class="btn btn-aviso">🚀 ENG</button>
          ${persistButton}
          <button onclick="deletarGravacao(${gravacao.id})" title="Deletar Sessão" class="btn btn-perigo">🗑️ Del</button>
      </div>
    `;
    return card;
}

// NEW: Function to render the combined list of sessions
function renderCombinedSessions(sessions) {
    const container = document.getElementById('lista-gravacoes');
    if (!container) return;

    container.innerHTML = ''; // Clear existing list

    if (sessions.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--cor-texto-secundario);">Nenhuma gravação salva localmente ou no MySQL.</p>';
        return;
    }

    sessions.forEach(gravacao => {
        const dados = processarDadosSimples(gravacao.dadosTabela);
        const card = criarElementoGravacaoHTML(gravacao, dados);
        container.appendChild(card);
    });
}

// FUNÇÃO PARA VISUALIZAR SESSÃO (mantém a mesma do artifact anterior)
function visualizarSessao(sessionId) {
  try {
    const gravacoes = JSON.parse(localStorage.getItem('balancaGravacoes')) || [];
    const sessao = gravacoes.find(g => g.id === sessionId);
    
    if (!sessao) {
      showNotification('error', 'Sessão não encontrada');
      return;
    }
    
    clearChart();
    
    const seriesData = [];
    rawDataN = []; // Limpa os dados brutos

    sessao.dadosTabela.forEach(dado => {
      const tempo = parseFloat(dado.tempo_esp) || 0;
      const newtons = parseFloat(dado.newtons) || 0;
      
      seriesData.push([tempo, convertForce(newtons, displayUnit)]);
      rawDataN.push([tempo, newtons]);
    });
    
    chart.updateSeries([{ data: seriesData }]);

    if (rawDataN.length > 0) {
        maxForceInN = Math.max(...rawDataN.map(p => p[1]));
        minForceInN = Math.min(...rawDataN.map(p => p[1]));
    }

    abrirAba(document.getElementById("padrao"), 'abaGrafico');
    setChartMode('pausado'); // Pausa o gráfico ao carregar uma sessão
    showNotification('success', `Sessão "${sessao.nome}" carregada! Gráfico pausado.`);
    
  } catch (e) {
    console.error('Erro ao visualizar:', e);
    showNotification('error', 'Erro ao carregar sessão');
  }
}

function mostrarImpulsoAtual() {
  if (chartData.series[0].length < 2) {
    showNotification('info', 'Dados insuficientes para calcular impulso');
    return;
  }
  
  // Converte dados atuais para cálculo
  const tempos = chartData.labels.map(label => parseFloat(label));
  const forcas = rawDataN; // Já está em Newtons
  
  const impulsoData = calcularAreaSobCurva(tempos, forcas, false);
  const metricasPropulsao = calcularMetricasPropulsao(impulsoData);
  
  const infoImpulso = `
🚀 IMPULSO EM TEMPO REAL:

📊 Impulso Atual: ${impulsoData.impulsoTotal.toFixed(3)} N⋅s
⚡ Força Máxima: ${impulsoData.forcaMaxima.toFixed(2)} N
📈 Força Média: ${impulsoData.forcaMedia.toFixed(2)} N
⏱️ Duração: ${impulsoData.duracaoQueima.toFixed(1)} s
🏷️ Classificação: Motor ${metricasPropulsao.classificacaoMotor.classe}
  `;
  
  showNotification('info', infoImpulso, 8000);
}


function testarCalculoImpulso() {
  // Dados de exemplo de um motor C6-3
  const temposExemplo = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0];
  const forcasExemplo = [0, 5, 12, 15, 14, 12, 8, 5, 2, 1, 0]; // Newtons
  
  const resultado = calcularAreaSobCurva(temposExemplo, forcasExemplo, false);
  const classificacao = calcularMetricasPropulsao(resultado);
  
  console.log("=== TESTE DO CÁLCULO DE IMPULSO ===");
  console.log("Impulso Total:", resultado.impulsoTotal.toFixed(3), "N⋅s");
  console.log("Força Máxima:", resultado.forcaMaxima.toFixed(1), "N");
  console.log("Duração:", resultado.duracaoQueima.toFixed(1), "s");
  console.log("Classificação:", classificacao.classificacaoMotor.classe);
  
  // Para um motor C típico, esperamos:
  // - Impulso entre 10-20 N⋅s
  // - Classificação "C"
  // - Duração ~1-2 segundos
  
  if (resultado.impulsoTotal >= 10 && resultado.impulsoTotal <= 20) {
    console.log("✅ Teste passou - Impulso na faixa esperada");
  } else {
    console.log("❌ Teste falhou - Impulso fora da faixa");
  }
}

// ============================================
// === FUNÇÕES DE IMPORTAÇÃO DE DADOS EXTERNOS ===
// ============================================

/**
 * Inicia o processo de importação de um arquivo de texto.
 */
function importarGravacaoExterna() {
    const fileInput = document.getElementById('importar-arquivo-motor');
    const nomeInput = document.getElementById('nome-importacao');
    const file = fileInput.files[0];
    const nomeSessao = nomeInput.value.trim();

    if (!file) {
        showNotification('error', 'Selecione um arquivo de teste estático (.txt ou .log).');
        return;
    }

    if (!nomeSessao) {
        showNotification('error', 'Dê um nome para a sessão importada.');
        nomeInput.focus();
        return;
    }
    
    showNotification('info', `Lendo arquivo "${file.name}"...`, 3000);

    const reader = new FileReader();

    reader.onload = function(e) {
        const fileContent = e.target.result;
        try {
            const dadosProcessados = processarDadosExternos(fileContent);
            salvarDadosImportados(nomeSessao, dadosProcessados);
            
            // Limpa o input após o sucesso
            fileInput.value = '';
            nomeInput.value = '';

        } catch (error) {
            showNotification('error', 'Erro ao processar arquivo: ' + error.message);
            console.error('Erro ao processar dados externos:', error);
        }
    };

    reader.onerror = function() {
        showNotification('error', 'Erro ao ler o arquivo.');
    };

    reader.readAsText(file);
}

/**
 * Faz o parse do conteúdo do arquivo de texto para extrair tempo e força.
 * @param {string} content - Conteúdo textual do arquivo.
 * @returns {Array<object>} Array de objetos de dados da sessão.
 */
function processarDadosExternos(content) {
    const lines = content.split('\n');
    const dadosLidos = [];
    const gravity = 9.80665; // Assumindo gravidade padrão

    // Regex para identificar linhas com dois números (tempo e força)
    // Suporta notação científica (E+xx, E-xx) e pontos.
    const dataRegex = /^\s*(\d+\.\d+e?[+-]?\d*)\s+(\d+\.\d+e?[+-]?\d*)\s*$/i;

    let linhaInicial = 0;
    let dadosEncontrados = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Pula comentários ou linhas vazias no início
        if (line.startsWith('#') || line.startsWith('//') || line.length === 0) {
            continue;
        }

        // Verifica o cabeçalho e marca o início real dos dados
        if (line.toLowerCase().includes('t [s]') && line.toLowerCase().includes('f [n]')) {
            linhaInicial = i + 1; // Próxima linha é a primeira linha de dados
            continue; 
        }

        // Tenta fazer o match com a regex para extrair os valores
        const match = line.match(dataRegex);

        if (match) {
            const tempo = parseFloat(match[1]);
            const newtons = parseFloat(match[2]);

            if (!isNaN(tempo) && !isNaN(newtons)) {
                dadosEncontrados = true;
                const massaKg = gravity > 0 ? newtons / gravity : 0;
                const g_force_conversion = 101.9716; // N para gf

                dadosLidos.push({
                    timestamp: new Date().toISOString(), // Usar a data atual ou inferir, mas melhor usar atual.
                    tempo_esp: tempo.toFixed(6),
                    newtons: newtons.toFixed(6),
                    grama_forca: (newtons * g_force_conversion).toFixed(6),
                    quilo_forca: (newtons * (g_force_conversion / 1000)).toFixed(6)
                });
            }
        } else if (dadosEncontrados) {
            // Se já encontramos dados e a linha atual não é um dado, paramos.
            break;
        }
    }

    if (dadosLidos.length === 0) {
        throw new Error('Não foi possível extrair dados válidos de Tempo [s] e Força [N] do arquivo.');
    }
    
    return dadosLidos;
}

/**
 * Salva os dados processados no localStorage.
 */
function salvarDadosImportados(nomeSessao, dadosTabela) {
    const gravacao = {
        id: Date.now(),
        nome: nomeSessao,
        timestamp: new Date().toISOString(),
        dadosTabela: dadosTabela
    };

    try {
        let gravacoes = JSON.parse(localStorage.getItem('balancaGravacoes')) || [];
        gravacoes.push(gravacao);
        localStorage.setItem('balancaGravacoes', JSON.stringify(gravacoes));
        showNotification('success', `Sessão "${nomeSessao}" importada e salva com sucesso!`);
        
        // Recarrega a lista para mostrar a nova gravação
        carregarGravacoesComImpulso(); 
        
    } catch (e) {
        showNotification('error', 'Erro ao salvar. O Local Storage pode estar cheio.');
        console.error("Erro ao salvar no LocalStorage:", e);
    }
}


// ============================================
// === EXPORTAÇÃO DE ARQUIVO .ENG (openRocket) ===
// ============================================

/**
 * Exporta os dados da sessão no formato de arquivo .eng, compatível com simuladores.
 * @param {number} sessionId - ID da sessão a ser exportada.
 */
// Localizado em script_grafico_sessao.js

function exportarMotorENG(sessionId) {
    try {
        const gravacoes = JSON.parse(localStorage.getItem('balancaGravacoes')) || [];
        const sessao = gravacoes.find(g => g.id === sessionId);
        
        if (!sessao || !sessao.dadosTabela || sessao.dadosTabela.length === 0) {
            showNotification('error', 'Sessão não encontrada ou sem dados');
            return;
        }

        // 1. Prioriza os metadados SALVOS na sessão
        const meta = sessao.metadadosMotor || {};

        // Define valores finais, usando a UI como fallback se a sessão for antiga ou estiver incompleta
        const nome = meta.name || document.getElementById('eng-name').value.trim() || sessao.nome.replace(/[^a-zA-Z0-9_]/g, '_');
        const diametro = meta.diameter || parseFloat(document.getElementById('eng-diameter').value) || 45; // mm
        const comprimento = meta.length || parseFloat(document.getElementById('eng-length').value) || 200; // mm
        const delay = meta.delay || parseFloat(document.getElementById('eng-delay').value) || 0; // s
        const propWeight = meta.propweight || parseFloat(document.getElementById('eng-propweight').value) || 0.1; // kg
        const totalWeight = meta.totalweight || parseFloat(document.getElementById('eng-totalweight').value) || 0.25; // kg
        const fabricante = meta.manufacturer || document.getElementById('eng-manufacturer').value.trim() || 'GFIG-IFC';


        if (!nome || isNaN(diametro) || isNaN(comprimento) || isNaN(propWeight) || isNaN(totalWeight)) {
            showNotification('error', 'Os Metadados do Motor estão incompletos. Por favor, preencha os campos na aba Gravações e salve a sessão novamente ou edite o motor.');
            return;
        }

        // 2. Constrói o cabeçalho no formato openRocket/RASAero
        const cabecalho = 
`
; Arquivo de Curva de Empuxo (.eng) gerado pelo GFIG (Balança Wi-Fi)
; Sessão de Teste: ${sessao.nome}
; Data de Gravação: ${new Date(sessao.timestamp).toLocaleString('pt-BR')}
;
; Parâmetros do Motor (Requeridos pelo openRocket):
; name diameter length delay propweight totalweight manufacturer
${nome} ${diametro.toFixed(1)} ${comprimento.toFixed(0)} ${delay.toFixed(1)} ${propWeight.toFixed(5)} ${totalWeight.toFixed(5)} ${fabricante}
;
; Dados no formato: Tempo [s] Empuxo [N]
`;

        // 3. Converte dados para o formato Time [s] Force [N]
        let dadosENG = '';
        
        // Remove os dados com força negativa para o arquivo .eng (openRocket/RASAero ignoram a maior parte do negativo)
        // E remove também a última leitura (tempo burnout) para fechar o motor corretamente no 0 N.
        const pontosFinais = sessao.dadosTabela.length - 1;

        for (let i = 0; i < pontosFinais; i++) {
            const dado = sessao.dadosTabela[i];
            const tempo = parseFloat(dado.tempo_esp) || 0;
            const newtons = parseFloat(dado.newtons) || 0;

            // Arredonda para 3 casas decimais
            dadosENG += ` ${tempo}	${Math.max(0, newtons)}
`;
        }
        
        // Adiciona o ponto final de burnout (tempo da última amostra com 0 N)
        const ultimoDado = sessao.dadosTabela[pontosFinais];
        if (ultimoDado) {
            dadosENG += ` ${parseFloat(ultimoDado.tempo_esp).toFixed(3)}\t0.000\n`;
        }

        const conteudoENG = cabecalho + dadosENG;

        // 4. Cria e baixa o arquivo
        const blob = new Blob([conteudoENG], { type: 'text/plain;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', `${nome}.eng`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showNotification('success', `Arquivo ${nome}.eng exportado com sucesso!`);

    } catch (e) {
        console.error('Erro ao exportar .ENG:', e);
        showNotification('error', 'Erro ao exportar motor .ENG: ' + e.message);
    }
}
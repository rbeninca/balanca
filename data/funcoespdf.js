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
    // Assumimos que calcularAreaSobCurva retorna o Impulso Total (área sob a curva)
    const impulsoData = calcularAreaSobCurva(dados.tempos, dados.newtons, false);
    // Assumimos que calcularMetricasPropulsao lida com a classificação NAR/TRA
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
 * Gera as linhas da tabela completa de classificações com destaque no motor testado
 */
function gerarLinhasClassificacaoCompleta(impulsoTestado, classeTestada) {
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

  let linhas = '';
  classificacoes.forEach((c) => {
    const isMotorTestado = c.classe === classeTestada;
    const impulsoAtual = isMotorTestado ? impulsoTestado : null;

    // Estilo da linha: destaque forte para o motor testado
    let rowStyle = '';
    let markerHTML = '';

    if (isMotorTestado) {
      rowStyle = `background: linear-gradient(90deg, ${c.cor}40 0%, ${c.cor}20 100%);
                  border-left: 6px solid ${c.cor};
                  border-right: 6px solid ${c.cor};
                  font-weight: bold;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.15);`;
      markerHTML = '<span style="font-size: 16px; margin-right: 5px;">🎯</span>';
    }

    linhas += `
      <tr style="${rowStyle}">
        <td style="text-align: center; padding: 10px;">
          <div style="display: flex; align-items: center; justify-content: center;">
            ${markerHTML}
            <span style="font-size: ${isMotorTestado ? '14px' : '11px'};">${c.classe}</span>
          </div>
          ${isMotorTestado ? `<div style="font-size: 9px; color: #666; margin-top: 3px;">(Seu motor)</div>` : ''}
        </td>
        <td style="text-align: center; padding: 10px;">
          ${c.min.toFixed(4)}
          ${isMotorTestado && impulsoAtual < (c.min + c.max) / 2 ? '<br><span style="color: #e67e22; font-size: 18px;">▼</span>' : ''}
        </td>
        <td style="text-align: center; padding: 10px;">
          ${c.max.toFixed(4)}
          ${isMotorTestado && impulsoAtual >= (c.min + c.max) / 2 ? '<br><span style="color: #e67e22; font-size: 18px;">▼</span>' : ''}
        </td>
        <td style="text-align: center; padding: 10px;">${c.tipo}</td>
        <td style="text-align: center; padding: 10px;">${c.nivel}</td>
        <td style="text-align: center; padding: 10px;">
          <div style="width: 100%; height: 25px; background: ${c.cor}; border-radius: 4px; border: 1px solid #ccc;"></div>
        </td>
      </tr>
    `;
  });

  return linhas;
}

/**
 * Gera uma barra visual mostrando graficamente onde o motor se enquadra
 */
function gerarBarraVisualClassificacao(impulsoTestado, classificacao) {
  const classificacoes = [
    { min: 0.00,    max: 0.3125,   classe: 'Micro 1/8A', cor: '#8e44ad' },
    { min: 0.3126,  max: 0.625,    classe: '¼A',         cor: '#9b59b6' },
    { min: 0.626,   max: 1.25,     classe: '½A',         cor: '#e74c3c' },
    { min: 1.26,    max: 2.50,     classe: 'A',          cor: '#e67e22' },
    { min: 2.51,    max: 5.00,     classe: 'B',          cor: '#f39c12' },
    { min: 5.01,    max: 10.00,    classe: 'C',          cor: '#f1c40f' },
    { min: 10.01,   max: 20.00,    classe: 'D',          cor: '#2ecc71' },
    { min: 20.01,   max: 40.00,    classe: 'E',          cor: '#1abc9c' },
    { min: 40.01,   max: 80.00,    classe: 'F',          cor: '#3498db' },
    { min: 80.01,   max: 160.00,   classe: 'G',          cor: '#9b59b6' },
    { min: 160.01,  max: 320.00,   classe: 'H',          cor: '#e74c3c' },
    { min: 320.01,  max: 640.00,   classe: 'I',          cor: '#e67e22' },
    { min: 640.01,  max: 1280.00,  classe: 'J',          cor: '#f39c12' },
    { min: 1280.01, max: 2560.00,  classe: 'K',          cor: '#2ecc71' },
    { min: 2560.01, max: 5120.00,  classe: 'L',          cor: '#3498db' },
    { min: 5120.01, max: 10240.00, classe: 'M',          cor: '#9b59b6' },
    { min: 10240.01,max: 20480.00, classe: 'N',          cor: '#e74c3c' },
    { min: 20480.01,max: 40960.00, classe: 'O',          cor: '#c0392b' },
  ];

  // Encontra o índice da classe testada
  const indiceTestado = classificacoes.findIndex(c => c.classe === classificacao.classe);

  // Gera as barras
  let barrasHTML = '<div style="display: flex; gap: 2px; align-items: flex-end; height: 120px;">';

  classificacoes.forEach((c, index) => {
    const isMotorTestado = index === indiceTestado;
    const altura = isMotorTestado ? '100%' : '60%';
    const largura = `${100 / classificacoes.length}%`;

    barrasHTML += `
      <div style="
        width: ${largura};
        height: ${altura};
        background: ${c.cor};
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        align-items: center;
        border-radius: 4px 4px 0 0;
        position: relative;
        transition: all 0.3s ease;
        ${isMotorTestado ? 'box-shadow: 0 -4px 12px rgba(0,0,0,0.3); border: 3px solid #2c3e50;' : 'opacity: 0.6;'}
      ">
        ${isMotorTestado ? `
          <div style="
            position: absolute;
            top: -35px;
            font-size: 24px;
            animation: bounce 1s infinite;
          ">🎯</div>
        ` : ''}
        <div style="
          writing-mode: vertical-rl;
          text-orientation: mixed;
          padding: 5px;
          font-size: ${isMotorTestado ? '11px' : '8px'};
          font-weight: ${isMotorTestado ? 'bold' : 'normal'};
          color: white;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        ">${c.classe}</div>
      </div>
    `;
  });

  barrasHTML += '</div>';

  // Adiciona legenda
  barrasHTML += `
    <div style="margin-top: 15px; text-align: center; font-size: 12px; color: #2c3e50;">
      <strong>Impulso medido:</strong> ${impulsoTestado.toFixed(2)} N⋅s &nbsp;|&nbsp;
      <strong>Classe:</strong> ${classificacao.classe} &nbsp;|&nbsp;
      <strong>Faixa:</strong> ${classificacao.faixa}
    </div>
    <div style="margin-top: 8px; text-align: center; font-size: 11px; color: #7f8c8d;">
      Cada barra representa uma classe de motor. A barra destacada indica a classe do seu motor testado.
    </div>
  `;

  return barrasHTML;
}

/**
 * Gera HTML completo do relatório com gráfico embutido e todos os dados
 */
function gerarHTMLRelatorioCompleto(sessao, dados, impulsoData, metricasPropulsao, imagemGrafico) {
  const dataSessao = new Date(sessao.timestamp).toLocaleString('pt-BR');
  const classificacao = metricasPropulsao.classificacaoMotor;
  
  // Tenta obter massa do propelente dos metadados do motor ou campo customizado
  let massaPropelente = null;
  let impulsoEspecifico = null;
  
  // Procura por massa em diferentes lugares nos metadados
  if (sessao.metadadosMotor) {
    if (sessao.metadadosMotor.massaPropelente) {
      massaPropelente = parseFloat(sessao.metadadosMotor.massaPropelente);
    } else if (sessao.metadadosMotor.propweight) {
      massaPropelente = parseFloat(sessao.metadadosMotor.propweight) / 1000; // Converte de gramas para kg
    }
  }
  
  // Se encontrou massa, calcula impulso específico
  if (massaPropelente && massaPropelente > 0) {
    impulsoEspecifico = impulsoData.impulsoTotal / (massaPropelente * 9.81);
  }
  
  // 1. Encontra a força máxima para normalização (usada no gradiente da tabela)
  const newtonsValues = sessao.dadosTabela.map(dado => parseFloat(dado.newtons) || 0);
  const maxNewtons = Math.max(...newtonsValues) || 1;
  
  // Gera linhas da tabela com TODOS os dados
  let linhasTabela = '';
  sessao.dadosTabela.forEach((dado, index) => {
    const tempo = parseFloat(dado.tempo_esp) || 0;
    const newtons = parseFloat(dado.newtons) || 0;
    const gramaForca = parseFloat(dado.grama_forca) || 0;
    const quiloForca = parseFloat(dado.quilo_forca) || 0;
    
    // 2. Normaliza o valor de Força N em relação ao máximo
    const normalizedForce = Math.max(0, newtons) / maxNewtons; 
    
    // 3. Cria o estilo de fundo com opacidade crescente (laranja suave)
    let rowStyle = '';
    if (newtons > 0.05) { // Aplica destaque apenas para empuxo significativo
        const maxOpacity = 0.5; 
        // Opacidade mínima 0.1 para forçar o gradiente a ser visível, máxima 0.5 para não ofuscar o texto
        const opacity = Math.min(maxOpacity, Math.max(0.1, normalizedForce * 0.5)); 
        
        // Cor de destaque (laranja muito suave - 255, 165, 0)
        rowStyle = `background: rgba(255, 165, 0, ${opacity.toFixed(2)}) !important;`; 
    }

    linhasTabela += `
      <tr style="${rowStyle}">
        <td>${index + 1}</td>
        <td>${tempo.toFixed(6)}</td>
        <td>${newtons.toFixed(6)}</td>
        <td>${gramaForca.toFixed(6)}</td>
        <td>${quiloForca.toFixed(6)}</td>
      </tr>
    `;
  });
  
  // Cria string de informação sobre Impulso Específico
  let infoIsp = '<strong>* Impulso Específico (Isp):</strong> Requer a massa do propelente queimado. ';
  let cardIsp = `<div class="metrica-card">
        <h3>Impulso Específico (Isp)</h3>
        <div class="valor">N/A</div>
        <div class="unidade">s</div>
      </div>`;
  
  if (impulsoEspecifico !== null) {
    cardIsp = `<div class="metrica-card">
        <h3>Impulso Específico (Isp)</h3>
        <div class="valor">${impulsoEspecifico.toFixed(2)}</div>
        <div class="unidade">segundos</div>
      </div>`;
    infoIsp = `<strong>✓ Impulso Específico (Isp):</strong> Calculado usando massa de propelente = ${massaPropelente.toFixed(3)} kg. `;
  }
  
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
    
    /* Regras de cor de fundo alternadas */
    tr:nth-child(even) {
      background: #f8f9fa;
    }
    
    /* A cor inline do gradiente vai sobrescrever estas regras */
    tr:hover {
      background: #e9ecef !important; /* Mantém o hover */
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
      ${cardIsp}
      <div class="metrica-card">
        <h3>Impulso Líquido</h3>
        <div class="valor">${impulsoData.impulsoLiquido.toFixed(2)}</div>
        <div class="unidade">N⋅s</div>
      </div>
    </div>
    <div class="info-box">
      ${infoIsp}Para calcular, insira a massa do propelente queimado nos metadados do motor.
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
  
  <!-- EXPLICAÇÃO TÉCNICA (NOVA SEÇÃO) -->
  <div class="page-break"></div>
  <div class="secao">
    <h2>📚 Fundamentação Teórica e Metodologia de Cálculo</h2>
    
    <h3 style="margin-top: 1.5rem; color: #2c3e50;">1. Integração Numérica - Método dos Trapézios</h3>
    <div class="info-box" style="background: #f8f9fa; border-left: 4px solid #3498db;">
      <p><strong>Referência:</strong> MARCHI, C. H. et al. "Verificação de Soluções Numéricas". UFPR, 2015.</p>
      <p>O <strong>Impulso Total</strong> é calculado pela integração numérica da curva força-tempo usando o <strong>Método dos Trapézios Composto</strong>:</p>
      <p style="text-align: center; font-family: 'Courier New', monospace; background: white; padding: 0.5rem; border-radius: 4px;">
        I = ∫<sub>t₀</sub><sup>tₙ</sup> F(t) dt ≈ Σ<sub>i=1</sub><sup>n-1</sup> [(F<sub>i</sub> + F<sub>i+1</sub>)/2] × Δt<sub>i</sub>
      </p>
      <p><strong>Erro de Truncamento:</strong> O(h²), onde h = Δt é o espaçamento entre pontos.</p>
      <p><strong>Justificativa:</strong> Com taxa de amostragem típica de 80-100 Hz, o erro de discretização é desprezível comparado à incerteza de medição da célula de carga (±0.05% F.S.).</p>
    </div>

    <h3 style="margin-top: 1.5rem; color: #2c3e50;">2. Detecção de Eventos Críticos</h3>
    <div class="info-box" style="background: #f8f9fa; border-left: 4px solid #e67e22;">
      <p><strong>2.1 Threshold Adaptativo (Anti-Noising)</strong></p>
      <p>A detecção de ignição e burnout utiliza um limiar dinâmico baseado em análise estatística do ruído de fundo:</p>
      <p style="text-align: center; font-family: 'Courier New', monospace; background: white; padding: 0.5rem; border-radius: 4px;">
        F<sub>threshold</sub> = F<sub>média_ruído</sub> + k × σ<sub>ruído</sub>
      </p>
      <p>onde <strong>k</strong> é o multiplicador configurável (padrão: 2.0σ) e <strong>σ</strong> é o desvio padrão amostral.</p>
      
      <p><strong>2.2 Desvio Padrão Amostral</strong></p>
      <p><strong>Referência:</strong> MARCHI, C. H. "Análise de Incertezas em Medições". Cap. 3, UFPR.</p>
      <p style="text-align: center; font-family: 'Courier New', monospace; background: white; padding: 0.5rem; border-radius: 4px;">
        σ = √[Σ(x<sub>i</sub> - x̄)² / (n-1)]
      </p>
      <p><strong>Ignição:</strong> Detectada quando F(t) > F<sub>threshold</sub> por tempo mínimo configurável.</p>
      <p><strong>Burnout:</strong> Detectado quando F(t) < F<sub>threshold</sub> após a ignição ter ocorrido.</p>
    </div>

    <h3 style="margin-top: 1.5rem; color: #2c3e50;">3. Métricas Estatísticas</h3>
    <table style="font-size: 10px; width: 100%;">
      <tr>
        <th style="width: 25%;">Métrica</th>
        <th style="width: 35%;">Fórmula Matemática</th>
        <th style="width: 40%;">Interpretação Física</th>
      </tr>
      <tr>
        <td><strong>Impulso Total</strong></td>
        <td>I = ∫ F(t) dt [N⋅s]</td>
        <td>Quantidade total de movimento transferida pelo motor. Área sob a curva força-tempo.</td>
      </tr>
      <tr>
        <td><strong>Força Máxima</strong></td>
        <td>F<sub>max</sub> = max{F(t)} [N]</td>
        <td>Pico de empuxo. Crítico para dimensionamento estrutural do foguete.</td>
      </tr>
      <tr>
        <td><strong>Força Média (Queima)</strong></td>
        <td>F̄<sub>queima</sub> = I / Δt<sub>queima</sub> [N]</td>
        <td>Empuxo constante equivalente durante a fase de propulsão efetiva.</td>
      </tr>
      <tr>
        <td><strong>Força Média (Amostral)</strong></td>
        <td>F̄ = (1/n) Σ F<sub>i</sub> [N]</td>
        <td>Média aritmética de todas as leituras, incluindo valores negativos (arrasto).</td>
      </tr>
      <tr>
        <td><strong>Impulso Líquido</strong></td>
        <td>I<sub>líq</sub> = I<sub>pos</sub> - |I<sub>neg</sub>| [N⋅s]</td>
        <td>Impulso útil para propulsão, descontando arrasto e forças resistivas.</td>
      </tr>
      <tr>
        <td><strong>Impulso Específico</strong></td>
        <td>I<sub>sp</sub> = I / (m<sub>prop</sub> × g₀) [s]</td>
        <td>Eficiência do propelente. Tempo que 1kg de propelente fornece 1kgf de empuxo.</td>
      </tr>
    </table>

    <h3 style="margin-top: 1.5rem; color: #2c3e50;">4. Incertezas de Medição</h3>
    <div class="info-box" style="background: #fff3cd; border-left: 4px solid #f39c12;">
      <p><strong>Referência:</strong> MARCHI, C. H. "Propagação de Incertezas". UFPR, 2015.</p>
      <p><strong>Incerteza Tipo A (Estatística):</strong> Obtida pelo desvio padrão das medições repetidas.</p>
      <p><strong>Incerteza Tipo B (Sistemática):</strong> Especificação do fabricante da célula de carga (típico: ±0.05% F.S.).</p>
      <p><strong>Incerteza Combinada do Impulso:</strong></p>
      <p style="text-align: center; font-family: 'Courier New', monospace; background: white; padding: 0.5rem; border-radius: 4px;">
        u<sub>c</sub>(I) = √[(∂I/∂F)² u²(F) + (∂I/∂t)² u²(t)]
      </p>
      <p>Para taxa de amostragem constante e alta (>80 Hz), a incerteza temporal é desprezível, dominando a incerteza na medição de força.</p>
    </div>

    <h3 style="margin-top: 1.5rem; color: #2c3e50;">5. Classificação NAR/TRA</h3>
    <div class="info-box" style="background: #f8f9fa; border-left: 4px solid #27ae60;">
      <p><strong>Referências Normativas:</strong></p>
      <ul style="margin: 0.5rem 0;">
        <li><strong>NFPA 1122</strong> - Code for Model Rocketry</li>
        <li><strong>NFPA 1127</strong> - Code for High Power Rocketry</li>
        <li><strong>NAR/TRA Standards</strong> - Motor Classification System</li>
      </ul>
      <p>A classificação por letras (A, B, C, ..., O) segue progressão logarítmica base 2:</p>
      <p style="text-align: center; font-family: 'Courier New', monospace; background: white; padding: 0.5rem; border-radius: 4px;">
        Classe N: 2<sup>N-1</sup> < I<sub>total</sub> ≤ 2<sup>N</sup> [N⋅s]
      </p>
      <p>Exemplo: Classe D → 5 < I ≤ 10 N⋅s</p>
    </div>

    <h3 style="margin-top: 1.5rem; color: #2c3e50;">6. Limitações e Observações</h3>
    <div class="info-box" style="background: #f8d7da; border-left: 4px solid #e74c3c;">
      <ul style="margin: 0.5rem 0;">
        <li>O método dos trapézios assume variação linear entre pontos. Curvas com alta não-linearidade requerem maior taxa de amostragem.</li>
        <li>A detecção de ignição/burnout depende da correta calibração do threshold de ruído.</li>
        <li>O cálculo de I<sub>sp</sub> requer pesagem precisa do propelente antes e depois do teste.</li>
        <li>Vibrações externas e oscilações mecânicas podem introduzir ruído que afeta a precisão.</li>
        <li>A tara deve ser verificada antes de cada teste para eliminar offset sistemático.</li>
      </ul>
    </div>

    <h3 style="margin-top: 1.5rem; color: #2c3e50;">7. Referências Bibliográficas</h3>
    <div style="font-size: 10px; line-height: 1.6; background: #f8f9fa; padding: 1rem; border-radius: 4px;">
      <p><strong>[1]</strong> MARCHI, Carlos Henrique. <em>"Verificação de Soluções Numéricas"</em>. Departamento de Engenharia Mecânica, UFPR, 2015.</p>
      <p><strong>[2]</strong> MARCHI, Carlos Henrique. <em>"Análise de Incertezas em Medições"</em>. Notas de aula, UFPR.</p>
      <p><strong>[3]</strong> NFPA 1122: <em>Code for Model Rocketry</em>. National Fire Protection Association, 2018.</p>
      <p><strong>[4]</strong> NFPA 1127: <em>Code for High Power Rocketry</em>. National Fire Protection Association, 2018.</p>
      <p><strong>[5]</strong> NAR Standards and Testing Committee. <em>"Model Rocket Motor Classification"</em>.</p>
      <p><strong>[6]</strong> SUTTON, George P.; BIBLARZ, Oscar. <em>"Rocket Propulsion Elements"</em>. 9th Edition, Wiley, 2017.</p>
      <p><strong>[7]</strong> JCGM 100:2008. <em>"Evaluation of measurement data - Guide to the expression of uncertainty in measurement"</em> (GUM).</p>
    </div>
  </div>
  <!-- FIM EXPLICAÇÃO TÉCNICA -->

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

  <!-- CLASSIFICAÇÃO DO MOTOR -->
  <div class="page-break"></div>
  <div class="secao">
    <h2>📊 Classificação do Motor (NAR/TRA)</h2>
    <table style="font-size: 12px;">
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
      <tr>
        <td><strong>Impulso Total:</strong></td>
        <td>${impulsoData.impulsoTotal.toFixed(2)} N⋅s</td>
        <td><strong>Status:</strong></td>
        <td>✓ Dentro dos limites NAR/TRA</td>
      </tr>
    </table>
    <div class="info-box" style="margin-top: 1rem;">
      <strong>Informações de Classificação:</strong><br>
      A classificação NAR/TRA segue os padrões estabelecidos pela National Association for Rocketry (NAR) e pela Tripoli Rocketry Association (TRA).
      Os motores são classificados por letras (A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P) baseado no impulso total em Newton-segundos.
      Cada classe tem aproximadamente o dobro do impulso da classe anterior.
    </div>
  </div>

  <!-- TABELA COMPLETA DE CLASSIFICAÇÕES COM DESTAQUE -->
  <div class="page-break"></div>
  <div class="secao">
    <h2>📋 Tabela Completa de Classificações NAR/TRA</h2>
    <div class="info-box" style="margin-bottom: 15px;">
      <strong>🎯 Motor Testado:</strong> A linha em destaque abaixo indica onde seu motor se enquadra na tabela de classificações.
      O impulso medido (${impulsoData.impulsoTotal.toFixed(2)} N⋅s) está dentro da faixa da classe <strong>${classificacao.classe}</strong>.
    </div>

    <!-- Representação Gráfica Visual -->
    <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
      <h3 style="margin-top: 0; font-size: 14px; color: #2c3e50;">Posição Visual do Motor Testado:</h3>
      ${gerarBarraVisualClassificacao(impulsoData.impulsoTotal, classificacao)}
    </div>

    <table style="font-size: 10px; width: 100%;">
      <thead>
        <tr>
          <th style="width: 12%; text-align: center;">Classe</th>
          <th style="width: 18%; text-align: center;">Impulso Mínimo (N⋅s)</th>
          <th style="width: 18%; text-align: center;">Impulso Máximo (N⋅s)</th>
          <th style="width: 22%; text-align: center;">Tipo</th>
          <th style="width: 20%; text-align: center;">Nível</th>
          <th style="width: 10%; text-align: center;">Cor</th>
        </tr>
      </thead>
      <tbody>
        ${gerarLinhasClassificacaoCompleta(impulsoData.impulsoTotal, classificacao.classe)}
      </tbody>
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

/**
 * Simulador de WebSocket para a balança ESP8266
 *
 * Objetivo: emular o servidor WS (porta 81) que o firmware envia, para
 * permitir testar clientes web sem precisar ligar a placa.
 *
 * - Envia uma mensagem "config" ao conectar (igual ao onWebSocketEvent do ESP)
 * - Gera leituras periódicas (bufferadas) e transmite a cada ~300 ms como um
 *   array JSON, exatamente como o firmware faz
 * - Aceita comandos de texto:
 *     "t"                      -> tara simulada
 *     "c:<massa_g>"           -> calibração simulada
 *     "set_param:<k>:<v>"     -> atualiza parâmetro em runtime
 * - Também expõe um /status HTTP opcional (porta 8080 por padrão)
 *
 * Como usar:
 *   1) npm i ws express
 *   2) node server.js
 *   3) Conecte seu cliente a ws://localhost:8081 (ou a porta definida em WS_PORT)
 *      Obs.: se você REALMENTE quiser usar as portas 80/81, rode como root
 *            (não recomendado) ou faça port-forward com sua ferramenta favorita.
 */

const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

// ===============================
// PORTAS E CONFIGURAÇÕES GERAIS
// ===============================
const HTTP_PORT = Number(process.env.HTTP_PORT || 8080); // status HTTP opcional
const WS_PORT = Number(process.env.WS_PORT || 8081);     // WebSocket principal

// ===============================
// ESTADO E CONFIG DA "BALANÇA"
// ===============================
const state = {
  // espelha o struct Config do firmware
  config: {
    magic_number: 123456789,
    staSSID: 'BenincaGaspar',
    staPassword: 'aabbccddee',
    conversionFactor: 21000.0, // conversão raw->gramas
    gravity: 9.80665,
    leiturasEstaveis: 10,
    toleranciaEstabilidade: 100.0,
    numAmostrasMedia: 3,
    timeoutCalibracao: 20000,
    tareOffset: 0,
  },
  // outros estados
  apActive: true,
  wifiConnected: false,
  wifiStatus: 0, // WL_IDLE_STATUS equivalente
  wifiIP: '0.0.0.0',
  apIP: '192.168.4.1',
  websocketClients: 0,
  balancaStatus: 'Pronta',
  systemOperational: true,
  startTs: Date.now(),
  // Simulação de peso
  baseWeight_g: 0, // tarado
  noise_g: 7,      // ruído (desvio padrão aproximado)
  drift_g: 0,      // drift lento
  // Sinal lento para parecer medição real (variação ao longo de ~10 s)
  signalMean_g: 500,   // média do peso simulado (g)
  signalAmp_g: 200,    // amplitude da oscilação (g)
  signalPeriod_s: 10,  // período do sinal lento (s)
};

// Buffer interno (como o bufferDoc no ESP)
const NUM_READINGS_IN_BUFFER = 32;
let readingsBuffer = [];
let lastBroadcast = 0;

// Helpers de tempo
const nowMs = () => Date.now();
const uptimeMs = () => nowMs() - state.startTs;

// Geração de uma única leitura simulada em gramas
function simulateReading_g() {
  const t = uptimeMs() / 1000; // segundos

  // Sinal lento (senoidal) para variar ao longo de ~10 s
  const slow = state.signalMean_g + state.signalAmp_g * Math.sin((2 * Math.PI * t) / state.signalPeriod_s);

  // Ruído gaussiano aproximado (soma de uniformes)
  const u = Math.random() + Math.random() + Math.random() + Math.random() + Math.random() + Math.random();
  const noise = (u - 3) * state.noise_g; // centrado em 0

  // Drift muito lento e aleatório
  if (Math.random() < 0.005) {
    state.drift_g += (Math.random() - 0.5) * 0.5; // +/- 0.25 g
  }

  const g = slow + state.drift_g + noise;
  return g;
}



// Empacota a leitura no formato que o firmware envia (força em Newtons)
function pushReadingToBuffer() {
  const peso_g = simulateReading_g();
  const forcaN = (peso_g / 1000.0) * state.config.gravity;
  readingsBuffer.push({
    type: 'data',
    tempo: uptimeMs() / 1000.0,
    forca: Number(forcaN.toFixed(5)),
    status: state.balancaStatus,
  });
  if (readingsBuffer.length > NUM_READINGS_IN_BUFFER) {
    readingsBuffer.shift();
  }
}

// Serialização do array como o ESP manda (um array JSON puro)
function serializeBuffer() {
  return JSON.stringify(readingsBuffer);
}

// Envia status ("status" do firmware)
function makeStatusMsg(type, message) {
  return JSON.stringify({ type: 'status', status: type, message });
}

// Mensagem "config" na conexão (igual ao onWebSocketEvent do ESP)
function makeConfigMsg() {
  const c = state.config;
  return JSON.stringify({
    type: 'config',
    conversionFactor: c.conversionFactor,
    gravity: c.gravity,
    leiturasEstaveis: c.leiturasEstaveis,
    toleranciaEstabilidade: c.toleranciaEstabilidade,
    numAmostrasMedia: c.numAmostrasMedia,
    timeoutCalibracao: c.timeoutCalibracao,
    tareOffset: c.tareOffset,
    ssid: c.staSSID,
    senha: c.staPassword,
    wifi_status: state.wifiStatus,
    wifi_ip: state.wifiIP,
    ap_active: state.apActive,
    ap_ip: state.apIP,
  });
}

// ===============================
// SERVIDOR HTTP (opcional)
// ===============================
const app = express();
app.use(express.json());

app.get('/status', (_req, res) => {
  res.json({
    heap: 200000, // dummy
    fragmentation: 10,
    uptime: uptimeMs(),
    wifi_status: state.wifiStatus,
    wifi_ssid: state.config.staSSID,
    wifi_ip: state.wifiIP,
    ap_active: state.apActive,
    ap_ip: state.apIP,
    ap_clients: state.websocketClients, // aproximando
    websocket_clients: state.websocketClients,
    system_operational: state.systemOperational,
    connection_status: `AP: ${state.apActive ? 'ON' : 'OFF'} | WiFi: ${state.wifiConnected ? 'ON' : 'OFF'}`,
  });
});

// Emula /salvarRede (só atualiza estado local)
app.post('/salvarRede', (req, res) => {
  const { ssid, senha } = req.body || {};
  if (!ssid) return res.status(400).send('Parâmetros obrigatórios: ssid, senha');
  state.config.staSSID = String(ssid).slice(0, 31);
  state.config.staPassword = String(senha || '').slice(0, 31);
  // Simula tentativa de conexão
  state.wifiStatus = 3; // WL_CONNECTED (simulado)
  state.wifiConnected = true;
  state.wifiIP = '192.168.1.123';
  res.type('text/plain').send('Rede salva. Tentando conectar...');
});

const httpServer = http.createServer(app);
httpServer.listen(HTTP_PORT, () => {
  console.log(`HTTP status em http://localhost:${HTTP_PORT}`);
});

// ===============================
// SERVIDOR WEBSOCKET
// ===============================
const wss = new WebSocketServer({ port: WS_PORT });

// Log periódico para depuração
setInterval(() => {
  if (wss.clients) {
    console.log(`[DBG] clients=${wss.clients.size} buffer=${readingsBuffer.length}`);
  }
}, 1000);
console.log(`WebSocket na porta ws://localhost:${WS_PORT}`);

wss.on('connection', (ws, req) => {
  state.websocketClients = wss.clients.size;
  const ip = req.socket.remoteAddress;
  console.log(`[WS] Cliente conectado: ${ip}. Clientes: ${state.websocketClients}`);

  // Envia a "config" na conexão
  ws.send(makeConfigMsg());

  // \-\- WARMUP: gera e envia um primeiro pacote imediatamente \-\-
  // Assim o cliente já "vê" dados logo após conectar
  for (let i = 0; i < 24; i++) pushReadingToBuffer();
  if (readingsBuffer.length > 0) {
    try { ws.send(serializeBuffer()); } catch {}
    readingsBuffer = [];
    lastBroadcast = nowMs();
  }

  ws.on('message', (data) => {
    if (typeof data !== 'string') data = data.toString('utf-8');
    const msg = data.trim();

    // Comando "t" (tara)
    if (msg === 't') {
      state.balancaStatus = 'Tara OK';
      state.baseWeight_g = 0; // zera
      ws.send(makeStatusMsg('success', 'Tara OK'));
      return;
    }

    // Comando "c:<massa_g>"
    if (msg.startsWith('c:')) {
      const massa_g = Number(msg.slice(2));
      if (Number.isFinite(massa_g) && massa_g > 0 && massa_g < 100000) {
        // Ajusta o fator para "casar" a leitura média com a massa fornecida
        // Na simulação, alteramos o ruído e a base para aproximar esse alvo
        state.baseWeight_g = massa_g;
        state.config.conversionFactor = Math.max(1, 21000 * (massa_g / 1000));
        state.balancaStatus = 'Calibracao OK';
        ws.send(makeStatusMsg('success', 'Calibracao OK'));
      } else {
        ws.send(makeStatusMsg('error', 'Massa invalida'));
      }
      return;
    }

    // Comando "set_param:<k>:<v>"
    if (msg.startsWith('set_param:')) {
      const parts = msg.split(':');
      if (parts.length >= 3) {
        const paramName = parts[1];
        const paramValue = parts.slice(2).join(':'); // suporta ":" no valor
        let changed = false;

        const c = state.config;
        switch (paramName) {
          case 'conversionFactor':
            c.conversionFactor = Number(paramValue);
            changed = Number.isFinite(c.conversionFactor);
            break;
          case 'gravity':
            c.gravity = Number(paramValue);
            changed = Number.isFinite(c.gravity);
            break;
          case 'leiturasEstaveis':
            c.leiturasEstaveis = Math.max(1, Math.min(50, Number(paramValue)));
            changed = Number.isFinite(c.leiturasEstaveis);
            break;
          case 'toleranciaEstabilidade':
            c.toleranciaEstabilidade = Number(paramValue);
            changed = Number.isFinite(c.toleranciaEstabilidade);
            break;
          case 'numAmostrasMedia':
            c.numAmostrasMedia = Math.max(1, Math.min(20, Number(paramValue)));
            changed = Number.isFinite(c.numAmostrasMedia);
            break;
          case 'timeoutCalibracao':
            c.timeoutCalibracao = Number(paramValue);
            changed = Number.isFinite(c.timeoutCalibracao);
            break;
          case 'tareOffset':
            c.tareOffset = Number(paramValue);
            changed = Number.isFinite(c.tareOffset);
            break;
          case 'signalMean':
          case 'signalMean_g':
            state.signalMean_g = Number(paramValue);
            changed = Number.isFinite(state.signalMean_g);
            break;
          case 'signalAmp':
          case 'signalAmp_g':
            state.signalAmp_g = Number(paramValue);
            changed = Number.isFinite(state.signalAmp_g);
            break;
          case 'signalPeriod':
          case 'signalPeriod_s':
            state.signalPeriod_s = Math.max(0.2, Number(paramValue)); // evita período muito pequeno
            changed = Number.isFinite(state.signalPeriod_s);
            break;
          default:
            ws.send(makeStatusMsg('error', `Parâmetro desconhecido: ${paramName}`));
            return;
        }

        if (changed) {
          ws.send(makeStatusMsg('success', `Parâmetro '${paramName}' atualizado!`));
        } else {
          ws.send(makeStatusMsg('error', `Valor inválido para '${paramName}'`));
        }
      }
      return;
    }

    // Ignora comandos grandes
    if (msg.length > 100) {
      ws.send(makeStatusMsg('error', 'Comando muito grande'));
    }
  });

  ws.on('close', () => {
    state.websocketClients = wss.clients.size;
    console.log(`[WS] Cliente desconectado. Clientes: ${state.websocketClients}`);
  });
});

// ===============================
// LOOP DE SIMULAÇÃO
// ===============================
// Frequência de amostragem alvo ≈ 80 Hz (12 ms)
const SAMPLE_INTERVAL_MS = 12;
let lastSampleTs = nowMs();

setInterval(() => {
  // Garante amostragem mínima quando houver pelo menos 1 cliente
  if (state.websocketClients < 1) return;
  const now = nowMs();
  // Gera 1 amostra por tick se houver clientes
  if (state.websocketClients > 0 && now - lastSampleTs >= SAMPLE_INTERVAL_MS) {
    pushReadingToBuffer();
    lastSampleTs = now;
  }

  // Broadcast a cada ~300 ms
  const dt = now - lastBroadcast;
  if (state.websocketClients > 0 && dt >= 300 && readingsBuffer.length > 0) {
    const payload = serializeBuffer();
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(payload);
      }
    }
    readingsBuffer = []; // limpa após envio (como no firmware)
    lastBroadcast = now;
  }
}, 5);

// ===============================
// LOG EXTRA
// ===============================
process.on('SIGINT', () => {
  console.log('\nEncerrando simulador...');
  process.exit(0);
});

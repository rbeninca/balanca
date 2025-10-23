// --- Variáveis Globais do Worker ---
console.log("🚀 dataWorker.js carregado com sucesso!");
let socket;
let dataBuffer = []; 
let gravity = 9.80665; 
let emaAlpha = 0.2; 
let emaValue = 0;
let emaInitialized = false;
let maxForce = -Infinity;

// --- Variáveis para cálculo de Leituras por Segundo (RPS) ---
let lastTempoMCU = null;
let totalLeiturasMCU = 0;
let rpsCalculadoMCU = 0;

/**
 * Conecta ao servidor WebSocket do Host (Raspberry Pi/PC).
 */
function connectWebSocket() {
    // Evita criar múltiplas conexões se uma já estiver ativa ou tentando conectar.
    if (socket && socket.readyState !== WebSocket.CLOSED) {
        console.log(`[Worker] Socket já existe. Estado: ${socket.readyState}`);
        return;
    }
    
    // CRÍTICO: Constrói a URL usando o HOST onde a página foi carregada (Raspberry Pi/PC)
    let host = location.hostname;
    let port = 81; 

    if (location.port === '5500' || host === 'localhost' || host === '127.0.0.1') {
        host = 'localhost'; // Use 'localhost' ou o IP fixo da sua Raspberry Pi
    }

    const wsURL = `ws://${host}:${port}`;
    console.log(`[Worker] 🔄 Tentando conectar WebSocket: ${wsURL}`);
    
    try {
        socket = new WebSocket(wsURL);
    } catch (e) {
        console.error("[Worker] ❌ Erro ao criar WebSocket:", e);
        self.postMessage({ type: 'status', status: 'error', message: 'Erro ao criar WebSocket: ' + e.message });
        return;
    }

    socket.onopen = () => {
        console.log(`[Worker] ✅ WebSocket CONECTADO! Estado: ${socket.readyState}`);
        self.postMessage({ type: 'status', status: 'connected', message: 'Conectado ao Gateway Serial (Host)' });
    };

    socket.onclose = (event) => {
        console.log(`[Worker] ⚠️ WebSocket FECHADO. Code: ${event.code}, Reason: ${event.reason}, Clean: ${event.wasClean}`);
        self.postMessage({ type: 'status', status: 'disconnected', message: `Desconectado (${event.code}). Tentando reconectar...` });
        socket = null; 
    };

    socket.onerror = (error) => {
        console.error("[Worker] ❌ Erro WebSocket:", error);
        self.postMessage({ type: 'status', status: 'error', message: 'Erro na conexão WebSocket com o Host.' });
        socket = null; 
    };

    /**
     * Manipulador de mensagens recebidas do WebSocket.
     */
    socket.onmessage = (event) => {
      //  console.log(`[Worker] 📨 Mensagem recebida do WebSocket. Tipo: ${typeof event.data}, Tamanho: ${event.data.length}`);
        
        // Assume que as mensagens do Host são JSON Array (dados) ou JSON Objeto (status/config).
        if (typeof event.data === 'string' && (event.data.startsWith('[') || event.data.startsWith('{'))) {
            try {
                const data = JSON.parse(event.data);
                
                if (Array.isArray(data)) {
                   // console.log(`[Worker] 📊 Array de dados recebido! ${data.length} leituras`);
                    data.forEach(reading => {
                      processDataPoint(reading);
                    });
                }   
                else if (typeof data === 'object' && data.type) {
                    //console.log(`[Worker] 📋 Objeto recebido. Tipo: ${data.type}`);
                switch (data.type) {
                    
                    // --- ADICIONE ESTAS 3 LINHAS ---
                    case "data":
                        processDataPoint(data);
                        break;
                    // ---------------------------------

                    case "config":
                        if (data.gravity) {
                            gravity = parseFloat(data.gravity);
                        }
                        console.log("[UI] CONFIGURAÇÃO RECEBIDA:", data);
                        self.postMessage({ type: 'config', payload: data });
                        
                        break;

                        case "success":
                        case "error":
                        case "info": 
                            // Retransmite a mensagem de status/erro do ESP8266
                            self.postMessage({ type: 'status', status: data.type, message: data.message });
                            break;
                    }
                }
            } catch (e) {
                console.error("[Worker] ❌ JSON malformado do Host:", e);
                console.error("[Worker] Dados recebidos:", event.data.substring(0, 200));
                self.postMessage({ type: 'status', status: 'error', message: 'JSON malformado do Host: ' + event.data.substring(0, 50) + '...' });
            }
        } else {
            console.warn("[Worker] ⚠️ Mensagem não JSON recebida:", event.data.substring(0, 100));
            self.postMessage({ type: 'status', status: 'info', message: event.data });
        }
    };
}

/**
 * Processa um ÚNICO ponto de dado recebido do ESP32.
 */
function processDataPoint(data) {
    if (data.type !== 'data') {
        console.log(`[Worker] ⚠️ Ignorando ponto que não é 'data'. Tipo: ${data.type}`);
        return;
    }

    const forceN = data.forca;
    //console.log(`[Worker] ⚡ Processando ponto: tempo=${data.tempo}s, força=${forceN}N`);
    
    if (forceN > maxForce) {
        maxForce = forceN;
    }

    const ema = getEmaValue(forceN);
    const massaKg = gravity > 0 ? forceN / gravity : 0;

    dataBuffer.push({
        tempo: data.tempo,
        forca: forceN,
        ema: ema,
        maxForce: maxForce,
        massaKg: massaKg
    });

    //console.log(`[Worker] 📦 Buffer agora tem ${dataBuffer.length} pontos`);
 
    // --- RPS USANDO TEMPO DO MICROCONTROLADOR ---
    if (lastTempoMCU !== null) {
        const deltaTempo = data.tempo - lastTempoMCU; 
        if (deltaTempo > 0) {
            const rpsInstantaneo = 1 / deltaTempo; 
            rpsCalculadoMCU = (rpsCalculadoMCU * totalLeiturasMCU + rpsInstantaneo) / (totalLeiturasMCU + 1);
            totalLeiturasMCU++;
        }
    }
    lastTempoMCU = data.tempo;
}

/**
 * Calcula a Média Móvel Exponencial (EMA).
 */
function getEmaValue(newValue) {
    if (!emaInitialized) {
        emaValue = newValue;
        emaInitialized = true;
    } else {
        emaValue = (emaAlpha * newValue) + ((1 - emaAlpha) * emaValue);
    }
    return emaValue;
}

/**
 * Manipulador de mensagens vindas da thread principal (UI, script.js).
 */
self.onmessage = (e) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'solicitarDados':
            if (dataBuffer.length > 0) {
              //  console.log(`[Worker] 📤 Enviando ${dataBuffer.length} pontos para a UI`);
                self.postMessage({ type: 'dadosDisponiveis', payload: dataBuffer });
                dataBuffer = []; 
            } else {
              //  console.log(`[Worker] 📭 Buffer vazio, nada para enviar`);
            }
            break;

          case 'getRPS':
            self.postMessage({ type: 'rps', payload: rpsCalculadoMCU.toFixed(1) });
            break;

        case 'sendCommand':
            if (socket && socket.readyState === WebSocket.OPEN) {
                const commandObject = {};

                // Comando de Tara
                if (payload === 't') {
                    commandObject.cmd = 't';
                }
                
                // Comando de Calibração: c:1000 -> {cmd: 'c', massa_g: 1000}
                else if (payload.startsWith('c:')) {
                    const mass = parseFloat(payload.substring(2));
                    commandObject.cmd = 'c';
                    commandObject.massa_g = mass;
                }
                else if (payload === 'get_config') {
                    // Este comando apenas pede a configuração atual
                    commandObject.cmd = 'get_config';
                }
                
                // Comando Set Param: set_param:gravity:9.81 -> {cmd: 'set', param: 'gravity', value: 9.81}
                else if (payload.startsWith('set_param:')) {
                    const parts = payload.substring(10).split(':');
                    if (parts.length === 2) {
                        commandObject.cmd = 'set';
                        commandObject.param = parts[0];
                        commandObject.value = parseFloat(parts[1]); 
                    }
                }
                
                // Envia a string JSON para o Host, que envia para a Serial do ESP
                if (commandObject.cmd) {
                   socket.send(JSON.stringify(commandObject)); 
                }
            }
            break;
    }
};


/**
 * Inicia o Gerenciador de Conexão.
 * Este loop verifica o estado da conexão a cada 5 segundos e tenta conectar se necessário.
 */
setInterval(() => {
    if (socket == null || socket.readyState === WebSocket.CLOSED) {
        console.log("Tentando reconectar ao WebSocket do Host...");
        connectWebSocket();
    }
}, 5000);
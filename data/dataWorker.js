// --- Variáveis Globais do Worker ---
console.log("🚀 dataWorker.js carregado com sucesso!");
let socket;
let dataBuffer = [];
let gravity = 9.80665;
let emaAlpha = 0.2;
let emaValue = 0;
let emaInitialized = false;
let maxForce = -Infinity;
let wsURL = ''; // NOVO: Variável para armazenar a URL do WebSocket

// NOVO: Buffer para mensagens parciais do WebSocket
let messageBuffer = "";

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

    let finalWsURL = wsURL; // Use the wsURL from the main thread

    // If wsURL is empty, try to construct it from location
    if (!finalWsURL) {
        console.log("[Worker] wsURL is empty. Constructing from location.");
        let host = location.hostname;
        let port = 81;

        // Special handling for development servers or direct IP access
        if (location.port === '5500' || host === 'localhost' || host === '127.0.0.1') {
            host = 'localhost';
        }
        finalWsURL = `ws://${host}:${port}`;
        console.log(`[Worker] Constructed default WebSocket URL: ${finalWsURL}`);
    } else {
        // Ensure the URL has a protocol and port if missing
        let givenUrl = finalWsURL.trim();

        if (!givenUrl.startsWith('ws://') && !givenUrl.startsWith('wss://')) {
            givenUrl = `ws://${givenUrl}`;
        }

        const lastColon = givenUrl.lastIndexOf(':');
        const lastBracket = givenUrl.lastIndexOf(']');

        const hasPort = lastColon > lastBracket;

        if (!hasPort) {
            givenUrl += ':81';
        }
        finalWsURL = givenUrl;
        console.log(`[Worker] Using provided WebSocket URL: ${finalWsURL}`);
    }
    
    console.log(`[Worker] 🔄 Attempting to connect WebSocket to: ${finalWsURL}`);

    try {
        socket = new WebSocket(finalWsURL);
    } catch (e) {
        console.error("[Worker] ❌ Erro ao criar WebSocket:", e);
        self.postMessage({ type: 'status', status: 'error', message: 'URL de WebSocket inválida: ' + e.message });
        return;
    }

    socket.onopen = () => {
        console.log(`[Worker] ✅ WebSocket CONECTADO! Estado: ${socket.readyState}, URL: ${socket.url}`);
        self.postMessage({ type: 'status', status: 'connected', message: 'Conectado ao Gateway Serial (Host)' });
    };

    socket.onclose = (event) => {
        console.log(`[Worker] ⚠️ WebSocket FECHADO. Code: ${event.code}, Reason: ${event.reason}, Clean: ${event.wasClean}. Estado: ${socket ? socket.readyState : 'null'}, URL: ${socket ? socket.url : 'null'}`); // Add null check
        self.postMessage({ type: 'status', status: 'disconnected', message: `Desconectado (${event.code}). Tentando reconectar...` });
        socket = null;
    };

    socket.onerror = (error) => {
        console.error("[Worker] ❌ Erro WebSocket:", error);
        // Adiciona mais detalhes do socket ao log de erro
        if (socket) {
            console.error(`[Worker] Estado do Socket: ${socket.readyState}, URL: ${socket.url}`);
        }
        self.postMessage({ type: 'status', status: 'error', message: 'Erro na conexão WebSocket com o Host.' });
        socket = null;
    };

    socket.onmessage = (event) => {
        messageBuffer += event.data;
        let jsonStartIndex = 0;
        while (jsonStartIndex < messageBuffer.length) {
            let startChar = messageBuffer[jsonStartIndex];
            if (startChar !== '{' && startChar !== '[') {
                jsonStartIndex++;
                continue;
            }
            let braceCount = 0;
            let inString = false;
            let escapeNext = false;
            let jsonEndIndex = -1;
            for (let i = jsonStartIndex; i < messageBuffer.length; i++) {
                const char = messageBuffer[i];
                if (char === '"' && !escapeNext) {
                    inString = !inString;
                }
                if (char === '\\' && inString) {
                    escapeNext = !escapeNext;
                } else {
                    escapeNext = false;
                }
                if (!inString) {
                    if (char === '{' || char === '[') {
                        braceCount++;
                    } else if (char === '}' || char === ']') {
                        braceCount--;
                        if (braceCount === 0) {
                            jsonEndIndex = i;
                            break;
                        }
                    }
                }
            }
            if (jsonEndIndex !== -1) {
                const jsonString = messageBuffer.substring(jsonStartIndex, jsonEndIndex + 1);
                try {
                    const data = JSON.parse(jsonString);
                    processWebSocketMessage(data);
                } catch (e) {
                    console.error("[Worker] ❌ JSON inválido:", e);
                    console.error("[Worker] String problemática:", jsonString.substring(0, 100));
                }
                jsonStartIndex = jsonEndIndex + 1;
            } else {
                break;
            }
        }
        messageBuffer = messageBuffer.substring(jsonStartIndex);
        if (messageBuffer.length > 10000) {
            console.warn("[Worker] ⚠️ Buffer muito grande, limpando...");
            messageBuffer = "";
        }
    };
}

/**
 * Processa uma mensagem WebSocket completa (JSON já parseado)
 */
function processWebSocketMessage(data) {
    // NEW: Extract mysql_connected status and send to main thread
    if (data.mysql_connected !== undefined) {
        self.postMessage({ type: 'mysql_status_update', payload: data.mysql_connected });
    }

    if (Array.isArray(data)) {
        // Array de leituras
        data.forEach(reading => {
            processDataPoint(reading);
        });
    }
    else if (typeof data === 'object' && data.type) {
        switch (data.type) {
            case "data":
                processDataPoint(data);
                break;

            case "config":
                if (data.gravity) {
                    gravity = parseFloat(data.gravity);
                }
                console.log("[Worker] CONFIGURAÇÃO RECEBIDA:", data);
                self.postMessage({ type: 'config', payload: data });
                break;

            case "status":
                // Retransmite a mensagem de status/erro do ESP8266
                self.postMessage({ type: 'status', status: data.type, message: data.message });
                break;

            case "mysql_save_success": // NEW: Handle MySQL save success
                self.postMessage({ type: 'mysql_save_success', payload: { message: data.message, sessionId: data.sessionId } });
                break;

            case "mysql_save_error": // NEW: Handle MySQL save error
                self.postMessage({ type: 'mysql_save_error', payload: { message: data.message, sessionId: data.sessionId } });
                break;
        }
    }
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
        case 'set_ws_url':
            if (payload && payload.url) {
                wsURL = payload.url;
                console.log(`[Worker] URL do WebSocket definida para: ${wsURL}`);
                // Força a reconexão se o socket já existir e estiver fechado
                if (socket && socket.readyState === WebSocket.CLOSED) {
                    connectWebSocket();
                }
            }
            break;

        case 'solicitarDados':
            if (dataBuffer.length > 0) {
                //  console.log(`[Worker] 📤 Enviando ${dataBuffer.length} pontos para a UI`);
                self.postMessage({ type: 'dadosDisponiveis', payload: dataBuffer });
                dataBuffer = [];
            } else {
                //  console.log(`[Worker] 🔭 Buffer vazio, nada para enviar`);
            }
            break;

        case 'getRPS':
            self.postMessage({ type: 'rps', payload: rpsCalculadoMCU.toFixed(1) });
            break;
            
        case 'sendCommand':
            if (!socket || socket.readyState !== WebSocket.OPEN) {
                console.error("[Worker] ❌ WebSocket não está conectado! Estado:", socket ? socket.readyState : 'null');
                self.postMessage({
                    type: 'status',
                    status: 'error',
                    message: 'Erro: WebSocket não conectado. Não foi possível enviar o comando.'
                });
                return;
            }

            console.log(`[Worker] 📤 Comando recebido da UI:`, payload);

            const commandToSend = {}; // This will be the object sent to server.py

            if (payload.cmd === 'save_session_to_mysql') {
                commandToSend.cmd = 'save_session_to_mysql';
                commandToSend.payload = payload.sessionData;
                console.log('[Worker] ✅ Comando SAVE_SESSION_TO_MYSQL identificado');
            }
            else if (payload.cmd === 't') {
                commandToSend.cmd = 't';
                console.log('[Worker] ✅ Comando de TARA identificado');
            }
            else if (payload.cmd === 'get_config') {
                commandToSend.cmd = 'get_config';
                console.log('[Worker] ✅ Comando GET_CONFIG identificado');
            }
            else if (payload.cmd === 'c') { // Calibrate
                const mass = parseFloat(payload.value);
                if (isNaN(mass) || mass <= 0) {
                    console.error("[Worker] ❌ Comando 'c' inválido. Massa não numérica ou <= 0.");
                    self.postMessage({ type: 'status', status: 'error', message: 'Massa de calibração inválida.' });
                    return;
                }
                commandToSend.cmd = 'c';
                commandToSend.massa_g = mass;
                console.log(`[Worker] ✅ Comando de CALIBRAÇÃO identificado com massa: ${mass}g`);
            }
            else if (payload.cmd === 'set') { // Set parameter
                const param = payload.value.param;
                const paramValue = payload.value.value;

                if (!param || isNaN(paramValue)) {
                    console.error(`[Worker] ❌ Comando 'set' inválido. Parâmetro ou valor inválido.`);
                    self.postMessage({
                        type: 'status',
                        status: 'error',
                        message: 'Formato de comando inválido para set_param.'
                    });
                    return;
                }
                commandToSend.cmd = 'set';
                commandToSend.param = param;
                commandToSend.value = paramValue;
                console.log(`[Worker] ✅ Comando SET_PARAM montado:`, commandToSend);
            }
            else if (payload.cmd === 'fetch_sessions_from_mysql') { // NEW: Handle fetch sessions command
                commandToSend.cmd = 'fetch_sessions_from_mysql';
                console.log('[Worker] ✅ Comando FETCH_SESSIONS_FROM_MYSQL identificado');
            }
            else {
                console.warn(`[Worker] ⚠️ Comando desconhecido da UI:`, payload);
                self.postMessage({
                    type: 'status',
                    status: 'error',
                    message: `Comando desconhecido: ${payload.cmd}`
                });
                return;
            }

            if (commandToSend.cmd) {
                const jsonCommand = JSON.stringify(commandToSend);
                console.log(`[Worker] 🚀 Enviando para WebSocket: ${jsonCommand}`);

                try {
                    socket.send(jsonCommand);
                    console.log(`[Worker] ✅ Comando enviado com sucesso`);

                    self.postMessage({
                        type: 'status',
                        status: 'info',
                        message: `Comando "${commandToSend.cmd}" enviado ao ESP32`
                    });
                } catch (error) {
                    console.error(`[Worker] ❌ Erro ao enviar comando:`, error);
                    self.postMessage({
                        type: 'status',
                        status: 'error',
                        message: `Erro ao enviar comando: ${error.message}`
                    });
                }
            } else {
                console.error(`[Worker] ❌ commandToSend.cmd não foi definido!`);
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
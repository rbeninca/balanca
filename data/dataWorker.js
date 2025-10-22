// --- Variáveis Globais do Worker ---
let socket;
let dataBuffer = []; // Buffer para acumular dados antes de enviar para a UI
let gravity = 9.80665; // Valor padrão, será atualizado pela config do ESP
let emaAlpha = 0.2; // Fator de suavização para Média Móvel Exponencial (EMA)
let emaValue = 0;
let emaInitialized = false;
let maxForce = -Infinity;

// --- Variáveis para cálculo de Leituras por Segundo (RPS) ---
let lastTempoMCU = null;
let totalLeiturasMCU = 0;
let rpsCalculadoMCU = 0;

/**
 * Conecta ao servidor WebSocket do ESP8266.
 */
function connectWebSocket() {
    // Evita criar múltiplas conexões se uma já estiver ativa ou tentando conectar.
    if (socket && socket.readyState !== WebSocket.CLOSED) {
        return;
    }
    
    
    // O endereço IP deve ser o do seu ESP8266.
    const port =location.port;
    if (port==5500){
        var url="localhost";
    }else{
        var url=location.hostname;
    }
    //const wsURL = `ws://192.168.1.2:81`;
    const wsURL = `ws://`+url+`:81`;
    socket = new WebSocket(wsURL);

    socket.onopen = () => {
        self.postMessage({ type: 'status', status: 'connected', message: 'Conectado ao dispositivo' });
    };

    socket.onclose = () => {
        self.postMessage({ type: 'status', status: 'disconnected', message: 'Desconectado. Tentando reconectar...' });
        socket = null; // Limpa a referência para forçar a reconexão.
    };

    socket.onerror = (error) => {
        self.postMessage({ type: 'status', status: 'error', message: 'Erro na conexão WebSocket.' });
        console.error("WebSocket Error:", error);
        socket = null; // Limpa a referência para forçar a reconexão.
    };

    /**
     * Manipulador de mensagens recebidas do WebSocket.
     * Esta é a função principal que processa os dados da balança.
     */
    socket.onmessage = (event) => {
        // A string de dados pode começar com '[' (array de dados) ou '{' (objeto de status/config).
        if (typeof event.data === 'string' && (event.data.startsWith('[') || event.data.startsWith('{'))) {
            try {
                const data = JSON.parse(event.data);
                
                // 1. VERIFICA SE A MENSAGEM É UM LOTE DE DADOS (ARRAY)
                if (Array.isArray(data)) {
                    // Se for um array, processamos cada item como um ponto de dado individual.
                    data.forEach(reading => {
                      processDataPoint(reading);
                    });
                }   
                // 2. SE NÃO FOR UM ARRAY, VERIFICA SE É UMA MENSAGEM ÚNICA (OBJETO)
                else if (typeof data === 'object' && data.type) {
                    switch (data.type) {
                        case "config":
                            if (data.gravity) {
                                gravity = parseFloat(data.gravity);
                            }
                            // Retransmite a configuração para a UI principal.
                            self.postMessage({ type: 'config', payload: data });
                            break;

                        case "status":
                            // Retransmite a mensagem de status para a UI principal.
                            self.postMessage({ type: 'status', status: data.status, message: data.message });
                            break;
                    }
                }
            } catch (e) {
                //console.warn("Worker: JSON malformado ou tipo de dado inesperado.", event.data);
                self.postMessage({ type: 'status', status: 'info', message: event.data });
            }
        } else {
            // Trata mensagens que não são JSON (texto puro).
            self.postMessage({ type: 'status', status: 'info', message: event.data });
        }
    };
}

/**
 * Processa um ÚNICO ponto de dado recebido do ESP32.
 * Esta função é chamada para cada item dentro do lote (array) recebido.
 * @param {object} data - O objeto de dados com {type, tempo, forca, status}.
 */
function processDataPoint(data) {
    // Garante que estamos processando apenas mensagens do tipo 'data'.
    if (data.type !== 'data') return;

    const forceN = data.forca;
    
    // Atualiza a força máxima.
    if (forceN > maxForce) {
        maxForce = forceN;
    }

    // Calcula a Média Móvel Exponencial (EMA).
    const ema = getEmaValue(forceN);
    // Calcula a massa em kg.
    const massaKg = gravity > 0 ? forceN / gravity : 0;

    // Adiciona o dado processado ao buffer, que será enviado para a UI.
    dataBuffer.push({
        tempo: data.tempo,
        forca: forceN,
        ema: ema,
        maxForce: maxForce,
        massaKg: massaKg
    });

 
    // --- RPS USANDO TEMPO DO MICROCONTROLADOR ---
    if (lastTempoMCU !== null) {
        const deltaTempo = data.tempo - lastTempoMCU; // segundos vindos do MCU
        if (deltaTempo > 0) {
            const rpsInstantaneo = 1 / deltaTempo; // leituras por segundo
            rpsCalculadoMCU = (rpsCalculadoMCU * totalLeiturasMCU + rpsInstantaneo) / (totalLeiturasMCU + 1);
            totalLeiturasMCU++;
        }
    }
    lastTempoMCU = data.tempo;
}

/**
 * Calcula a Média Móvel Exponencial (EMA).
 * @param {number} newValue - O novo valor de força.
 * @returns {number} O valor EMA calculado.
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
        // A UI está pedindo os dados acumulados para desenhar o gráfico.
        case 'solicitarDados':
            if (dataBuffer.length > 0) {
                self.postMessage({ type: 'dadosDisponiveis', payload: dataBuffer });
                dataBuffer = []; // Limpa o buffer após o envio.
            }
            break;

        // A UI está pedindo a taxa de leituras por segundo.
          case 'getRPS':
            self.postMessage({ type: 'rps', payload: rpsCalculadoMCU.toFixed(1) });
            break;

        // A UI está enviando um comando para o ESP32 (ex: 't' para tarar).
        case 'sendCommand':
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(payload);
            }
            break;
    }
};


/**
 * Inicia o Gerenciador de Conexão.
 * Este loop verifica o estado da conexão a cada 2 segundos e tenta conectar se necessário.
 */
setInterval(() => {
    if (socket == null || socket.readyState === WebSocket.CLOSED) {
        console.log("Tentando reconectar ao WebSocket...");
        connectWebSocket();
    }
}, 5000);
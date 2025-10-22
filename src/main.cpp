#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <HX711.h>
#include <EEPROM.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <WebSocketsServer.h>
#include <FS.h> // Incluído para compatibilidade com SPIFFS (Substitui LittleFS.h)
#include <ArduinoJson.h>
#include <Ticker.h>
#include <ESP8266mDNS.h> // Incluído para mDNS

// --- CONFIGURAÇÃO CORRETA DO DISPLAY ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C
#define OLED_SDA 14 // GPIO14 -> D5 na placa
#define OLED_SCL 12 // GPIO12 -> D6 na placa
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// --- CONFIGURAÇÃO DO BUFFER ---
const int NUM_READINGS_IN_BUFFER = 20;
StaticJsonDocument<JSON_ARRAY_SIZE(NUM_READINGS_IN_BUFFER) + NUM_READINGS_IN_BUFFER * (JSON_OBJECT_SIZE(4)+10)> bufferDoc;
unsigned long lastBroadcastTime = 0;
char jsonOutputBuffer[2500];

// --- ESTRUTURA DE CONFIGURAÇÃO ---
struct Config {
  unsigned long magic_number = 123456789;
  char staSSID[32] = "BenincaGaspar";
  char staPassword[32] = "aabbccddee";
  float conversionFactor = 21000.0;
  float gravity = 9.80665;
  int leiturasEstaveis = 10;
  float toleranciaEstabilidade = 100.0;
  int numAmostrasMedia = 3;
  unsigned long timeoutCalibracao = 20000;
  long tareOffset = 0;
};
Config config;

// --- PINOS DO SENSOR DE PESO ---
const uint8_t pinData = D7;
const uint8_t pinClock = D8;

// --- OBJETOS E VARIÁVEIS GLOBAIS ---
HX711 loadcell;
ESP8266WebServer server(80);
WebSocketsServer webSocket(81);
Ticker networkWatchdog;
Ticker memoryWatchdog;
Ticker wifiReconnectTicker;

String balancaStatus = "Iniciando...";
float pesoAtual_g = 0.0;
unsigned long lastReadTime = 0;
unsigned long lastDisplayUpdateTime = 0;
unsigned long lastNetworkActivity = 0;
bool wifiConnected = false;
bool apActive = false;
bool systemOperational = true; // SEMPRE VERDADEIRO - sistema nunca para
const char* mDnsHostname = "gfig"; 
bool mDnsActive = true;

// --- CONTROLE DE REDE MAIS INTELIGENTE ---
unsigned long wifiReconnectAttempts = 0;
const unsigned long MAX_WIFI_RECONNECT_ATTEMPTS = 3;
const unsigned long WIFI_RECONNECT_INTERVAL = 30000; // Tenta reconectar a cada 30s
const unsigned long WIFI_CONNECTION_TIMEOUT = 10000; // Timeout de 10s para conectar
const unsigned long CLIENT_TIMEOUT = 30000;
const unsigned long MAX_HEAP_FRAGMENTATION = 50;

// --- ESTADOS DE CONEXÃO ---
enum BalancaWiFiState {
  BALANCA_WIFI_DISCONNECTED,
  BALANCA_WIFI_CONNECTING,
  BALANCA_WIFI_CONNECTED,
  BALANCA_WIFI_FAILED
};
BalancaWiFiState currentWiFiState = BALANCA_WIFI_DISCONNECTED;
unsigned long lastWiFiAttempt = 0;

// --- CONTROLE DE CLIENTES WEBSOCKET ---
unsigned long lastClientActivity[10] = {0};

// --- PROTÓTIPOS DE FUNÇÕES ---
void atualizarDisplay(String status, float peso_em_gramas);
void saveConfig();
void loadConfig();
void broadcastStatus(const char *type, const String &message);
bool aguardarEstabilidade(const String &proposito);
void handleFileRequest();
void onWebSocketEvent(uint8_t client_num, WStype_t type, uint8_t *payload, size_t length);
void verificarClientesWebSocket();
void networkWatchdogCallback();
void memoryWatchdogCallback();
void wifiReconnectCallback();
void limpezaProfundaMemoria();
void initializeAP();
void initializeServices();
void attemptWiFiConnection();
void handleWiFiStates();
String getConnectionStatus();
void startMDNS();


// =======================================================
// SETUP
// =======================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n\nBalança GFIG ESP8266 - Versão Sempre Ativa");

  // Inicialização do display
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("Falha ao iniciar display SSD1306."));
  }
  atualizarDisplay("Iniciando...", 0);

  // Inicialização da EEPROM e SPIFFS
  EEPROM.begin(sizeof(Config));
  // REVERTIDO PARA SPIFFS.begin()
  if (!SPIFFS.begin()) {
    Serial.println("SPIFFS falhou, continuando sem arquivos");
  }
  loadConfig();

  // Inicialização do HX711
  Serial.println("Iniciando HX711...");
  loadcell.begin(pinData, pinClock);
  loadcell.set_scale(config.conversionFactor);
  loadcell.set_offset(config.tareOffset);

  // Tara inicial apenas se necessário
  if (config.tareOffset == 0) {
    atualizarDisplay("Tarando...", 0);
    if (aguardarEstabilidade("Tara Inicial")) {
      loadcell.tare(config.numAmostrasMedia);
      config.tareOffset = loadcell.get_offset();
      saveConfig();
    }
  }

  // === CONFIGURAÇÃO DE REDE SEMPRE ATIVA ===
  
  // Desabilita WiFi inicialmente para configuração limpa
  WiFi.mode(WIFI_OFF);
  delay(100);
  
  // Sempre inicializa o AP primeiro (PRIORIDADE MÁXIMA)
  initializeAP();
  
  // Inicializa todos os serviços (servidor web e websocket)
  initializeServices();
  
  // Inicializa o buffer JSON
  bufferDoc.to<JsonArray>();
  lastBroadcastTime = millis();
  lastNetworkActivity = millis();

  // Configuração dos watchdogs
  networkWatchdog.attach(30, networkWatchdogCallback);
  memoryWatchdog.attach(10, memoryWatchdogCallback);
  wifiReconnectTicker.attach(5, wifiReconnectCallback); // Verifica WiFi a cada 5s

  // Tenta conectar ao WiFi configurado (sem bloquear)
  if (strlen(config.staSSID) > 0) {
    attemptWiFiConnection();
  }

  // INICIA MDNS NO SETUP
  startMDNS();

  // Sistema sempre fica operacional
  systemOperational = true;
  balancaStatus = "Pronta";
  atualizarDisplay(balancaStatus, pesoAtual_g);
  
  Serial.println("=== SISTEMA OPERACIONAL ===");
  Serial.print("AP IP: ");
  Serial.println(WiFi.softAPIP());
  Serial.print("Nome de Host mDNS: ");
  Serial.print(mDnsHostname);
  Serial.println(".local");
  Serial.println("Serviços ativos independente da conexão WiFi");
}

// =======================================================
// LOOP PRINCIPAL - SEMPRE OPERACIONAL
// =======================================================
void loop() {
  // Alimenta o watchdog do sistema
  ESP.wdtFeed();
  
  // === SERVIÇOS SEMPRE ATIVOS ===
  webSocket.loop();
  server.handleClient();
  
  // Gerencia estados do WiFi (sem bloquear)
  handleWiFiStates();

  // MDNS PRECISA SER EXECUTADO NO LOOP PARA MANTER-SE ATIVO
  if (mDnsActive) {
    MDNS.update();
  }
  
  yield();

  // === COLETOR DE DADOS - SEMPRE ATIVO ===
  if (millis() - lastReadTime >= 15) {
    lastReadTime = millis();

    // Pula leituras apenas durante processos especiais
    if (balancaStatus.indexOf("Tarar") != -1 || balancaStatus.indexOf("Calibrar") != -1) {
      return;
    }

    if (loadcell.is_ready()) {
      balancaStatus = "Pesando";
      pesoAtual_g = loadcell.get_units(config.numAmostrasMedia);
      if (config.conversionFactor < 0) {
        pesoAtual_g *= 1;
      }

      // Adiciona ao buffer SEMPRE que há clientes conectados
      if (webSocket.connectedClients() > 0) {
        JsonArray readingsArray = bufferDoc.as<JsonArray>();
        
        // Limita o tamanho do buffer
        while (readingsArray.size() >= NUM_READINGS_IN_BUFFER) {
          readingsArray.remove(0);
        }
        
        JsonObject readingObj = readingsArray.createNestedObject();
        readingObj["type"] = "data";
        readingObj["tempo"] = millis() / 1000.0;
        readingObj["forca"] = (pesoAtual_g / 1000.0) * config.gravity;
        readingObj["status"] = balancaStatus;
        
        lastNetworkActivity = millis();
      }
    }
  }

  // === ENVIADOR DE DADOS - SEMPRE ATIVO ===
  if (millis() - lastBroadcastTime >= 300) {
    lastBroadcastTime = millis();

    if (webSocket.connectedClients() > 0) {
      JsonArray readingsArray = bufferDoc.as<JsonArray>();
      
      if (readingsArray.size() > 0) {
        size_t jsonSize = measureJson(bufferDoc);
        if (jsonSize < sizeof(jsonOutputBuffer) - 50) {
          jsonSize = serializeJson(bufferDoc, jsonOutputBuffer, sizeof(jsonOutputBuffer));
          
          if (jsonSize > 0) {
            bool success = webSocket.broadcastTXT(jsonOutputBuffer, jsonSize);
            if (success) {
              lastNetworkActivity = millis();
            }
          }
        }
        
        // Sempre limpa o buffer após tentativa de envio
        bufferDoc.clear();
        bufferDoc.to<JsonArray>();
        memset(jsonOutputBuffer, 0, sizeof(jsonOutputBuffer));
      }
    }
  }

  // === ATUALIZAÇÃO DE DISPLAY ===
  if (millis() - lastDisplayUpdateTime >= 1000) {
    lastDisplayUpdateTime = millis();
    atualizarDisplay(balancaStatus, pesoAtual_g);
  }
}

// =======================================================
// FUNÇÕES DE REDE SEMPRE ATIVA
// =======================================================

void initializeAP() {
  Serial.println("Inicializando AP...");
  atualizarDisplay("Iniciando AP...", 0);
  
  // Configura modo AP+STA para permitir ambos
  WiFi.mode(WIFI_AP_STA);
  
  // Configura o AP com IP fixo
  IPAddress apIP(192, 168, 4, 1);
  IPAddress subnet(255, 255, 255, 0);
  WiFi.softAPConfig(apIP, apIP, subnet);
  
  // Inicia o AP
  bool apStarted = WiFi.softAP("balancaGFIG", "aabbccddee", 1, 0, 4);
  
  if (apStarted) {
    apActive = true;
    Serial.println("AP iniciado com sucesso!");
    Serial.print("AP IP: ");
    Serial.println(WiFi.softAPIP());
  } else {
    Serial.println("ERRO: Falha ao iniciar AP!");
    // Tenta novamente
    delay(1000);
    WiFi.softAP("balancaGFIG", "aabbccddee");
    apActive = true; // Assume que funcionou
  }
}

// NOVA FUNÇÃO PARA INICIAR MDNS
void startMDNS() {
  if (MDNS.begin(mDnsHostname)) {
    Serial.printf("mDNS iniciado. Nome de host: %s.local\n", mDnsHostname);
    // Adiciona o serviço HTTP (web server)
    MDNS.addService("http", "tcp", 80);
    // Adiciona o serviço WebSocket
    MDNS.addService("ws", "tcp", 81);
    mDnsActive = true;
  } else {
    Serial.println("Erro ao iniciar mDNS");
    mDnsActive = false;
  }
}


void initializeServices() {
  Serial.println("Inicializando serviços web...");
  
  // Configuração do servidor web
  server.on("/salvarRede", HTTP_POST, []() {
    Serial.println("Salvando nova rede...");
    if (server.hasArg("ssid") && server.hasArg("senha")) {
      String newSSID = server.arg("ssid");
      String newPassword = server.arg("senha");
      
      if (newSSID.length() > 0 && newSSID.length() < 32) {
        strncpy(config.staSSID, newSSID.c_str(), sizeof(config.staSSID) - 1);
        strncpy(config.staPassword, newPassword.c_str(), sizeof(config.staPassword) - 1);
        config.staSSID[sizeof(config.staSSID) - 1] = '\0';
        config.staPassword[sizeof(config.staPassword) - 1] = '\0';
        saveConfig();
        
        server.send(200, "text/plain", "Rede salva. Tentando conectar...");
        
        // Tenta conectar à nova rede
        attemptWiFiConnection();
      } else {
        server.send(400, "text/plain", "SSID inválido");
      }
    } else {
      server.send(400, "text/plain", "Parâmetros obrigatórios: ssid, senha");
    }
  });
  
  server.on("/status", HTTP_GET, []() {
    StaticJsonDocument<512> doc;
    doc["heap"] = ESP.getFreeHeap();
    doc["fragmentation"] = ESP.getHeapFragmentation();
    doc["uptime"] = millis();
    doc["wifi_status"] = WiFi.status();
    doc["wifi_ssid"] = WiFi.SSID();
    doc["wifi_ip"] = WiFi.localIP().toString();
    doc["ap_active"] = apActive;
    doc["ap_ip"] = WiFi.softAPIP().toString();
    doc["ap_clients"] = WiFi.softAPgetStationNum();
    doc["websocket_clients"] = webSocket.connectedClients();
    doc["system_operational"] = systemOperational;
    doc["connection_status"] = getConnectionStatus();
    doc["mdns_hostname"] = mDnsHostname; // Adiciona nome de host mDNS
    
    
    String output;
    serializeJson(doc, output);
    server.send(200, "application/json", output);
  });

  server.on("/restart", HTTP_POST, []() {
    server.send(200, "text/plain", "Reiniciando...");
    delay(1000);
    ESP.restart();
  });
  
  server.onNotFound(handleFileRequest);
  server.begin();
  Serial.println("Servidor web iniciado");

  // Configuração do WebSocket
  webSocket.onEvent(onWebSocketEvent);
  webSocket.begin();
  webSocket.enableHeartbeat(15000, 3000, 2);
  Serial.println("WebSocket iniciado");
}

void attemptWiFiConnection() {
  if (strlen(config.staSSID) == 0) {
    Serial.println("Nenhuma rede configurada para conectar");
    return;
  }
  
  if (currentWiFiState == BALANCA_WIFI_CONNECTING) {
    Serial.println("Já tentando conectar...");
    return;
  }
  
  Serial.printf("Tentando conectar a: %s\n", config.staSSID);
  currentWiFiState = BALANCA_WIFI_CONNECTING;
  lastWiFiAttempt = millis();
  
  // Não desconecta o AP
  WiFi.begin(config.staSSID, config.staPassword);
  
  wifiReconnectAttempts++;
}

void handleWiFiStates() {
  unsigned long currentTime = millis();
  
  switch (currentWiFiState) {
    case BALANCA_WIFI_CONNECTING:
      // Verifica se conectou
      if (WiFi.status() == WL_CONNECTED) {
        currentWiFiState = BALANCA_WIFI_CONNECTED;
        wifiConnected = true;
        wifiReconnectAttempts = 0;
        Serial.println("WiFi conectado!");
        Serial.print("IP: ");
        Serial.println(WiFi.localIP());
        broadcastStatus("success", "WiFi conectado");
        
        // Se conectou ao WiFi, reinicia o mDNS para a nova interface
        if (mDnsActive) {
          MDNS.end();
        }
        startMDNS();
      }
      // Verifica timeout
      else if (currentTime - lastWiFiAttempt > WIFI_CONNECTION_TIMEOUT) {
        currentWiFiState = BALANCA_WIFI_FAILED;
        Serial.println("Timeout na conexão WiFi");
        broadcastStatus("warning", "WiFi timeout");
      }
      break;
      
    case BALANCA_WIFI_CONNECTED:
      // Verifica se desconectou
      if (WiFi.status() != WL_CONNECTED) {
        currentWiFiState = BALANCA_WIFI_DISCONNECTED;
        wifiConnected = false;
        Serial.println("WiFi desconectado");
        broadcastStatus("warning", "WiFi desconectado");
        
        // Se desconectou, o mDNS continua ativo na interface AP
      }
      break;
      
    case BALANCA_WIFI_FAILED:
    case BALANCA_WIFI_DISCONNECTED:
      // Não faz nada aqui - o ticker vai tentar reconectar
      break;
  }
}

void wifiReconnectCallback() {
  // Só tenta reconectar se não está conectado e tem rede configurada
  if (currentWiFiState != BALANCA_WIFI_CONNECTED && 
      currentWiFiState != BALANCA_WIFI_CONNECTING &&
      strlen(config.staSSID) > 0) {
    
    // Limita tentativas
    if (wifiReconnectAttempts < MAX_WIFI_RECONNECT_ATTEMPTS) {
      Serial.println("Tentando reconectar WiFi...");
      attemptWiFiConnection();
    } else {
      // Reseta contador periodicamente
      if (millis() - lastWiFiAttempt > 300000) { // 5 minutos
        wifiReconnectAttempts = 0;
        Serial.println("Resetando contador de tentativas WiFi");
      }
    }
  }
  
  // Verifica se AP ainda está ativo
  if (!apActive) {
    Serial.println("AP inativo, reiniciando...");
    initializeAP();
    // Reinicia mDNS (em caso de falha completa de rede)
    if (mDnsActive) {
      MDNS.end();
    }
    startMDNS();
  }
}

String getConnectionStatus() {
  String status = "AP: ";
  status += apActive ? "ON" : "OFF";
  status += " | WiFi: ";
  
  switch (currentWiFiState) {
    case BALANCA_WIFI_DISCONNECTED:
      status += "OFF";
      break;
    case BALANCA_WIFI_CONNECTING:
      status += "CONNECTING";
      break;
    case BALANCA_WIFI_CONNECTED:
      status += "ON";
      break;
    case BALANCA_WIFI_FAILED:
      status += "FAILED";
      break;
  }
  
  return status;
}

// =======================================================
// FUNÇÕES DE MONITORAMENTO
// =======================================================

void networkWatchdogCallback() {
  // Verifica se AP está ativo
  if (!apActive) {
    Serial.println("[WATCHDOG] AP inativo, reiniciando...");
    initializeAP();
    // Reinicia mDNS
    if (mDnsActive) {
      MDNS.end();
    }
    startMDNS();
  }
  
  // Verifica memória
  if (ESP.getFreeHeap() < 3000) {
    Serial.println("[WATCHDOG] Memória baixa, limpando...");
    limpezaProfundaMemoria();
  }
}

void memoryWatchdogCallback() {
  uint32_t freeHeap = ESP.getFreeHeap();
  uint8_t fragmentation = ESP.getHeapFragmentation();
  
  if (freeHeap < 3000 || fragmentation > MAX_HEAP_FRAGMENTATION) {
    Serial.printf("[WATCHDOG] Memória crítica: %u bytes, %u%% fragmentada\n", freeHeap, fragmentation);
    limpezaProfundaMemoria();
  }
}

void limpezaProfundaMemoria() {
  // Limpa todos os buffers
  bufferDoc.clear();
  bufferDoc.to<JsonArray>();
  memset(jsonOutputBuffer, 0, sizeof(jsonOutputBuffer));
  
  // Força limpeza de strings
  balancaStatus.trim();
  if (balancaStatus.length() > 20) {
    balancaStatus = "Pronta";
  }
  
  // Limpa clientes WebSocket inativos
  verificarClientesWebSocket();
  
  delay(10);
  yield();
  ESP.wdtFeed();
  
  Serial.printf("[CLEANUP] Heap após limpeza: %u bytes\n", ESP.getFreeHeap());
}

void verificarClientesWebSocket() {
  uint8_t clientCount = webSocket.connectedClients();
  unsigned long currentTime = millis();
  
  for (uint8_t i = 0; i < clientCount; i++) {
    if (currentTime - lastClientActivity[i] > CLIENT_TIMEOUT) {
      Serial.printf("[WebSocket] Cliente %u inativo, desconectando\n", i);
      webSocket.disconnect(i);
    }
  }
}

// =======================================================
// FUNÇÕES BÁSICAS (MANTIDAS)
// =======================================================

void atualizarDisplay(String status, float peso_em_gramas) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

 // Peso logo na primeira linha
display.setTextSize(2);
display.setCursor(0, 0);  // agora começa no topo do display
display.print(peso_em_gramas / 1000.0, 3);
display.println(" kg");

display.setTextSize(1);

// Linha 2 (logo abaixo do peso) - AP IP
display.setCursor(0, 20);  // ajusta de acordo com altura do texto do peso
display.print("AP: ");
display.print(WiFi.softAPIP());

// Linha 3 - WiFi Nome ou mDNS Hostname
display.setCursor(0, 30);
if (wifiConnected) {
  String ssid = WiFi.SSID();
  if (ssid.length() > 19) ssid = ssid.substring(0,19);
  display.print("W:");
  display.print(ssid);
} else {
  // Mostra o nome de host para facilitar o acesso mesmo sem WiFi
  display.print("Host: ");
  display.print(mDnsHostname);
}

// Linha 4 - WiFi IP
display.setCursor(0, 40);
if (wifiConnected) {
  display.print("IP: ");
  display.print(WiFi.localIP());
} else {
  display.print("IP: ---");
}

// Linha 5 - Clientes
display.setCursor(0, 50);
display.print("AP:");
display.print(WiFi.softAPgetStationNum());
display.print("  W:");
display.print(webSocket.connectedClients());

display.display();
}


void saveConfig() {
  EEPROM.put(0, config);
  if (EEPROM.commit()) {
    Serial.println("Config salva OK");
  } else {
    Serial.println("Erro ao salvar config");
  }
}

void loadConfig() {
  Config tempConfig;
  EEPROM.get(0, tempConfig);
  if (tempConfig.magic_number == 123456789) {
    config = tempConfig;
    Serial.println("Config carregada da EEPROM");
  } else {
    Serial.println("Config inválida, usando padrões");
    config = Config();
    saveConfig();
  }
}

void broadcastStatus(const char *type, const String &message) {
  balancaStatus = message;
  
  if (webSocket.connectedClients() > 0) {
    StaticJsonDocument<256> doc;
    doc["type"] = "status";
    doc["status"] = type;
    doc["message"] = message;
    
    String output;
    serializeJson(doc, output);
    
    if (output.length() < 240) {
      webSocket.broadcastTXT(output);
      lastNetworkActivity = millis();
    }
  }
}

bool aguardarEstabilidade(const String &proposito) {
  const unsigned long timeout_ms = config.timeoutCalibracao;
  delay(12);
  unsigned long inicio = millis();
  int leiturasEstaveis = 0;
  long leituraAnterior = 0;
  
  if (!loadcell.is_ready()) {
    broadcastStatus("error", "Celula nao pronta");
    return false;
  }

  leituraAnterior = loadcell.read_average(config.numAmostrasMedia);

  while (leiturasEstaveis < config.leiturasEstaveis) {
    if (millis() - inicio > timeout_ms) {
      broadcastStatus("error", "Timeout estabilidade");
      balancaStatus = "Pronta";
      return false;
    }

    // Continua processando serviços
    ESP.wdtFeed();
    webSocket.loop();
    server.handleClient();
    // Processa MDNS durante espera
    if (mDnsActive) {
      MDNS.update();
    }
    yield();

    if (loadcell.is_ready()) {
      long leituraAtual = loadcell.read_average(config.numAmostrasMedia);
      
      String progresso = proposito + " " + String(leiturasEstaveis + 1) + "/" + String(config.leiturasEstaveis);
      broadcastStatus("info", progresso);

      if (abs(leituraAtual - leituraAnterior) < config.toleranciaEstabilidade) {
        leiturasEstaveis++;
      } else {
        leiturasEstaveis = 0;
      }

      leituraAnterior = leituraAtual;
    }

    delay(30);
  }

  broadcastStatus("success", "Estabilizado OK");
  return true;
}

// =======================================================
// DEFINIÇÃO DAS FUNÇÕES
// =======================================================

void handleFileRequest() {
  String path = server.uri();
  if (path.endsWith("/")) path += "main.html";
  
  String contentType = "text/plain";
  if (path.endsWith(".html")) contentType = "text/html";
  else if (path.endsWith(".css")) contentType = "text/css";
  else if (path.endsWith(".js")) contentType = "application/javascript";
  else if (path.endsWith(".ico")) contentType = "image/x-icon";
  else if (path.endsWith(".jpg")) contentType = "image/jpeg";
  else if (path.endsWith(".png")) contentType = "image/png";
  else if (path.endsWith(".json")) contentType = "application/json";
  else if (path.endsWith(".txt")) contentType = "text/plain";

   // REVERTIDO PARA SPIFFS.exists() e SPIFFS.open()
   if (SPIFFS.exists(path)) { 
    File file = SPIFFS.open(path, "r");

    // Cabeçalho extra para cache no navegador
    server.sendHeader("Cache-Control", "max-age=86400"); // 1 dia
    size_t sent = server.streamFile(file, contentType);
    file.close();

    if (sent > 0) {
      lastNetworkActivity = millis();
      Serial.printf("[Web] Arquivo %s enviado (%u bytes)\n", path.c_str(), (unsigned)sent);
    } else {
      Serial.printf("[Web] Falha ao enviar arquivo %s\n", path.c_str());
    }
  } else {
    server.send(404, "text/plain", "404: Not Found");
    Serial.printf("[Web] Arquivo não encontrado: %s\n", path.c_str());
  }
  
}
void onWebSocketEvent(uint8_t client_num, WStype_t type, uint8_t *payload, size_t length) {
  lastClientActivity[client_num] = millis();
  lastNetworkActivity = millis();
  
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.printf("[%u] Desconectado\n", client_num);
      lastClientActivity[client_num] = 0;
      break;
      
    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(client_num);
      Serial.printf("[%u] Conectado: %s\n", client_num, ip.toString().c_str());
      
      // Envia configuração
      StaticJsonDocument<512> doc;
      doc["type"] = "config";
      doc["conversionFactor"] = config.conversionFactor;
      doc["gravity"] = config.gravity;
      doc["leiturasEstaveis"] = config.leiturasEstaveis;
      doc["toleranciaEstabilidade"] = config.toleranciaEstabilidade;
      doc["numAmostrasMedia"] = config.numAmostrasMedia;
      doc["timeoutCalibracao"] = config.timeoutCalibracao;
      doc["tareOffset"] = config.tareOffset;
      doc["ssid"] = config.staSSID;   // SSID atual 
      doc["senha"] = config.staPassword; // Senha atual
      doc["wifi_status"] = WiFi.status();
      doc["wifi_ip"] = WiFi.localIP().toString();
      doc["ap_active"] = apActive;
      doc["ap_ip"] = WiFi.softAPIP().toString();
      doc["mdns_hostname"] = mDnsHostname; // Envia o nome de host mDNS
      
      String output;
      serializeJson(doc, output);
      webSocket.sendTXT(client_num, output);
      break;
    }
    
    case WStype_PONG:
      Serial.printf("[%u] PONG OK\n", client_num);
      break;
      
    case WStype_TEXT: {
      if (length > 100) {
        Serial.println("Comando muito grande ignorado");
        return;
      }
      
      String msg = String((char *)payload);
      msg.trim();

      if (msg == "t") {
        if (aguardarEstabilidade("Tarar")) {
          loadcell.tare(config.numAmostrasMedia);
          config.tareOffset = loadcell.get_offset();
          saveConfig();
          broadcastStatus("success", "Tara OK");
        } else {
          broadcastStatus("error", "Falha tara");
        }
      }
      else if (msg.startsWith("c:")) {
        float massa_g = msg.substring(2).toFloat();
        if (massa_g > 0 && massa_g < 100000) {
          if (aguardarEstabilidade("Calibrar")) {
            long leituraRaw = loadcell.read_average(config.numAmostrasMedia);
            long offset = loadcell.get_offset();
            config.conversionFactor = (float)(leituraRaw - offset) / massa_g;
            loadcell.set_scale(config.conversionFactor);
            saveConfig();
            broadcastStatus("success", "Calibracao OK");
          } else {
            broadcastStatus("error", "Falha calibracao");
          }
        } else {
          broadcastStatus("error", "Massa invalida");
        }
      }
      else if (msg.startsWith("set_param:")) {
        int firstColon = msg.indexOf(':');
        int secondColon = msg.indexOf(':', firstColon + 1);
        if (firstColon != -1 && secondColon != -1) {
          String paramName = msg.substring(firstColon + 1, secondColon);
          String paramValue = msg.substring(secondColon + 1);
          bool changed = false;

          if (paramName == "conversionFactor") {
            config.conversionFactor = paramValue.toFloat();
            loadcell.set_scale(config.conversionFactor);
            changed = true;
          }
          else if (paramName == "gravity") {
            config.gravity = paramValue.toFloat();
            changed = true;
          }
          else if (paramName == "leiturasEstaveis") {
            config.leiturasEstaveis = constrain(paramValue.toInt(), 1, 50);
            changed = true;
          }
          else if (paramName == "toleranciaEstabilidade") {
            config.toleranciaEstabilidade = paramValue.toFloat();
            changed = true;
          }
          else if (paramName == "numAmostrasMedia") {
            config.numAmostrasMedia = constrain(paramValue.toInt(), 1, 20);
            changed = true;
          }
          else if (paramName == "timeoutCalibracao") {
            config.timeoutCalibracao = paramValue.toInt();
            changed = true;
          }
          else if (paramName == "tareOffset") {
            config.tareOffset = paramValue.toInt();
            loadcell.set_offset(config.tareOffset);
            changed = true;
          }

          if (changed) {
            saveConfig();
            broadcastStatus("success", "Parâmetro '" + paramName + "' atualizado!");
          } else {
            broadcastStatus("error", "Parâmetro desconhecido: " + paramName);
          }
        }
      }
      
      break;
    }
  }
}
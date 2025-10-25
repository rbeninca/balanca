#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <HX711.h>
#include <EEPROM.h>
#include <ArduinoJson.h>
#include <string.h>

// ============================================================================
// PROTOCOLO BINÁRIO COMPLETO - Balança GFIG
// ============================================================================

// ======== CONSTANTES DO PROTOCOLO ========
static const uint16_t MAGIC_BIN_PROTO = 0xA1B2;
static const uint8_t  PROTO_VERSION   = 0x01;

// Tipos de Pacotes (ESP→Host)
static const uint8_t TYPE_DATA   = 0x01;  // Leitura de força
static const uint8_t TYPE_CONFIG = 0x02;  // Configurações
static const uint8_t TYPE_STATUS = 0x03;  // Status/Info/Erro

// Tipos de Comandos (Host→ESP)
static const uint8_t CMD_TARA       = 0x10;  // Comando de tara
static const uint8_t CMD_CALIBRATE  = 0x11;  // Comando de calibração
static const uint8_t CMD_GET_CONFIG = 0x12;  // Solicitar configurações
static const uint8_t CMD_SET_PARAM  = 0x13;  // Definir parâmetro

// Códigos de Status
static const uint8_t STATUS_INFO    = 0x00;
static const uint8_t STATUS_SUCCESS = 0x01;
static const uint8_t STATUS_WARNING = 0x02;
static const uint8_t STATUS_ERROR   = 0x03;

// Códigos de Mensagem
static const uint8_t MSG_GENERIC       = 0x00;
static const uint8_t MSG_CMD_RECEIVED  = 0x01;
static const uint8_t MSG_TARA_DONE     = 0x10;
static const uint8_t MSG_CALIB_DONE    = 0x11;
static const uint8_t MSG_CALIB_FAILED  = 0x12;
static const uint8_t MSG_CONFIG_UPDATE = 0x20;
static const uint8_t MSG_ERROR_GENERIC = 0xF0;

// IDs de Parâmetros
static const uint8_t PARAM_GRAVITY     = 0x01;
static const uint8_t PARAM_CONV_FACTOR = 0x02;
static const uint8_t PARAM_LEIT_ESTAV  = 0x03;
static const uint8_t PARAM_TOLERANCIA  = 0x04;
static const uint8_t PARAM_MODE        = 0x05;
static const uint8_t PARAM_USE_EMA     = 0x06;
static const uint8_t PARAM_NUM_AMOSTRAS= 0x07;

// ======== ESTRUTURAS DE PACOTES ========

#pragma pack(push,1)

// Pacote DATA (16 bytes)
struct PacketData {
  uint16_t magic;   // 0xA1B2
  uint8_t  ver;     // 1
  uint8_t  type;    // TYPE_DATA (0x01)
  uint32_t t_ms;    // millis()
  float    forca_N; // Newtons
  uint8_t  status;  // 0=Pesando,1=Tarar,2=Calibrar,3=Pronta
  uint8_t  reserved; // Padding
  uint16_t crc;     // CRC16-CCITT
};

// Pacote CONFIG (64 bytes)
struct PacketConfig {
  uint16_t magic;                    // 0xA1B2
  uint8_t  ver;                      // 0x01
  uint8_t  type;                     // 0x02
  
  // Configurações (58 bytes)
  float    conversionFactor;         // 4 bytes
  float    gravity;                  // 4 bytes
  uint16_t leiturasEstaveis;         // 2 bytes
  uint32_t toleranciaEstabilidade;   // 4 bytes
  uint16_t numAmostrasMedia;         // 2 bytes
  uint16_t numAmostrasCalibracao;    // 2 bytes
  uint8_t  usarMediaMovel;           // 1 byte
  uint8_t  usarEMA;                  // 1 byte
  uint16_t timeoutCalibracao;        // 2 bytes (em segundos)
  int32_t  tareOffset;               // 4 bytes
  uint32_t capacidadeMaximaGramas;   // 4 bytes
  float    percentualAcuracia;       // 4 bytes
  uint8_t  mode;                     // 1 byte
  uint8_t  reserved[23];             // Padding para 58 bytes (total payload)
  
  uint16_t crc;                      // 2 bytes
};

// Pacote STATUS (12 bytes)
struct PacketStatus {
  uint16_t magic;         // 0xA1B2
  uint8_t  ver;           // 0x01
  uint8_t  type;          // 0x03
  
  uint8_t  status_type;   // 0=info, 1=success, 2=warning, 3=error
  uint8_t  code;          // Código específico
  uint16_t value;         // Valor adicional (opcional)
  uint32_t timestamp;     // millis()
  
  uint16_t crc;
};

// Comando TARA (8 bytes)
struct CmdTara {
  uint16_t magic;
  uint8_t  ver;
  uint8_t  type;
  uint16_t reserved;
  uint16_t crc;
};

// Comando CALIBRATE (12 bytes)
struct CmdCalibrate {
  uint16_t magic;
  uint8_t  ver;
  uint8_t  type;
  float    massa_g;
  uint16_t crc;
};

// Comando GET_CONFIG (8 bytes)
struct CmdGetConfig {
  uint16_t magic;
  uint8_t  ver;
  uint8_t  type;
  uint16_t reserved;
  uint16_t crc;
};

// Comando SET_PARAM (20 bytes)
struct CmdSetParam {
  uint16_t magic;
  uint8_t  ver;
  uint8_t  type;
  uint8_t  param_id;
  uint8_t  reserved[3];
  float    value_f;
  uint32_t value_i;
  uint16_t crc;
};

#pragma pack(pop)

// ======== FUNÇÃO CRC ========
static uint16_t crc16_ccitt(const uint8_t* data, size_t len) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < len; ++i) {
    crc ^= (uint16_t)data[i] << 8;
    for (uint8_t b = 0; b < 8; ++b) {
      if (crc & 0x8000) crc = (uint16_t)((crc << 1) ^ 0x1021);
      else              crc = (uint16_t)(crc << 1);
    }
  }
  return crc;
}

static inline uint8_t status_code_from_str(const char* s) {
  if (!s) return 0;
  if (strcmp(s, "Pesando")  == 0) return 0;
  if (strcmp(s, "Tarar")    == 0) return 1;
  if (strcmp(s, "Calibrar") == 0) return 2;
  if (strcmp(s, "Pronta")   == 0) return 3;
  return 0;
}

// ======== FUNÇÕES DE ENVIO ========

static inline void sendBinaryFrame(uint8_t status_code, float forca_N) {
  PacketData p;
  p.magic   = MAGIC_BIN_PROTO;
  p.ver     = PROTO_VERSION;
  p.type    = TYPE_DATA;
  p.t_ms    = millis();
  p.forca_N = forca_N;
  p.status  = status_code;
  p.reserved = 0;
  p.crc     = 0;
  p.crc     = crc16_ccitt((const uint8_t*)&p, sizeof(PacketData) - sizeof(uint16_t));
  Serial.write((const uint8_t*)&p, sizeof(PacketData));
}

// Forward declaration da struct Config
struct Config;

void sendBinaryConfig(const Config& cfg);
void sendBinaryStatus(uint8_t status_type, uint8_t code, uint16_t value = 0);

// ============================================================================
// BALANÇA GFIG - VERSÃO GATEWAY SERIAL COM PROTOCOLO BINÁRIO
// ============================================================================

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C
#define OLED_SDA 14
#define OLED_SCL 12
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

char jsonOutputBuffer[1024];
const size_t MAX_COMMAND_LEN = 256;

// Estrutura de Configuração
struct Config {
  unsigned long magic_number = 123456789;
  char staSSID[32] = "";
  char staPassword[32] = "";
  float conversionFactor = 21000.0;
  float gravity = 9.80665;
  int leiturasEstaveis = 10;
  float toleranciaEstabilidade = 100.0;
  int numAmostrasMedia = 3;
  unsigned long timeoutCalibracao = 20000;
  long tareOffset = 0;
  float capacidadeMaximaGramas = 5000.0;
  float percentualAcuracia = 0.05;
};
Config config;

const uint8_t pinData = D7;
const uint8_t pinClock = D8;

HX711 loadcell;
StaticJsonDocument<256> commandDoc;

char balancaStatusBuffer[32] = "Iniciando...";
float pesoAtual_g = 0.0;
unsigned long lastReadTime = 0;
unsigned long lastDisplayUpdateTime = 0;
unsigned long lastCommandCheckTime = 0;
bool systemOperational = true;

// Buffer para comandos binários
static uint8_t cmd_buffer[32];
static size_t cmd_buffer_pos = 0;

// Funções de Suporte
void atualizarDisplay(const char* status, float peso_em_gramas);
void saveConfig();
void loadConfig();
bool aguardarEstabilidade(const char *proposito);
void processSerialCommand();
void sendSerialConfig();
void sendSimpleJson(const char* type, const char* message);
bool processBinaryCommand();

// ======== IMPLEMENTAÇÃO DAS FUNÇÕES BINÁRIAS ========

void sendBinaryConfig(const Config& cfg) {
  PacketConfig p;
  memset(&p, 0, sizeof(p));
  
  p.magic   = MAGIC_BIN_PROTO;
  p.ver     = PROTO_VERSION;
  p.type    = TYPE_CONFIG;
  
  p.conversionFactor = cfg.conversionFactor;
  p.gravity = cfg.gravity;
  p.leiturasEstaveis = (uint16_t)cfg.leiturasEstaveis;
  p.toleranciaEstabilidade = (uint32_t)cfg.toleranciaEstabilidade;
  p.numAmostrasMedia = (uint16_t)cfg.numAmostrasMedia;
  p.numAmostrasCalibracao = 10000;
  p.usarMediaMovel = 1;
  p.usarEMA = 0;
  p.timeoutCalibracao = (uint16_t)(cfg.timeoutCalibracao / 1000);
  p.tareOffset = cfg.tareOffset;
  p.capacidadeMaximaGramas = (uint32_t)cfg.capacidadeMaximaGramas;
  p.percentualAcuracia = cfg.percentualAcuracia;
  p.mode = 0;
  
  p.crc = crc16_ccitt((const uint8_t*)&p, sizeof(PacketConfig) - sizeof(uint16_t));
  Serial.write((const uint8_t*)&p, sizeof(PacketConfig));
  Serial.flush();
  
  Serial.println("[INFO] Config enviada (binario)");
}

void sendBinaryStatus(uint8_t status_type, uint8_t code, uint16_t value) {
  PacketStatus p;
  p.magic = MAGIC_BIN_PROTO;
  p.ver = PROTO_VERSION;
  p.type = TYPE_STATUS;
  p.status_type = status_type;
  p.code = code;
  p.value = value;
  p.timestamp = millis();
  p.crc = crc16_ccitt((const uint8_t*)&p, sizeof(PacketStatus) - sizeof(uint16_t));
  Serial.write((const uint8_t*)&p, sizeof(PacketStatus));
  Serial.flush();
}

bool processBinaryCommand() {
  // Lê dados disponíveis no Serial
  while (Serial.available() && cmd_buffer_pos < sizeof(cmd_buffer)) {
    cmd_buffer[cmd_buffer_pos++] = Serial.read();
  }
  
  // Precisa de pelo menos 4 bytes para o header
  if (cmd_buffer_pos < 4) {
    return false;
  }
  
  // Verifica MAGIC (little-endian)
  uint16_t magic = cmd_buffer[0] | (cmd_buffer[1] << 8);
  if (magic != MAGIC_BIN_PROTO) {
    // MAGIC inválido, descarta primeiro byte
    memmove(cmd_buffer, cmd_buffer + 1, cmd_buffer_pos - 1);
    cmd_buffer_pos--;
    return false;
  }
  
  // Verifica versão
  if (cmd_buffer[2] != PROTO_VERSION) {
    memmove(cmd_buffer, cmd_buffer + 2, cmd_buffer_pos - 2);
    cmd_buffer_pos -= 2;
    return false;
  }
  
  uint8_t cmd_type = cmd_buffer[3];
  
  // Determina tamanho esperado do comando
  size_t expected_size = 0;
  switch (cmd_type) {
    case CMD_TARA:       expected_size = 8;  break;
    case CMD_CALIBRATE:  expected_size = 12; break;
    case CMD_GET_CONFIG: expected_size = 8;  break;
    case CMD_SET_PARAM:  expected_size = 20; break;
    default:
      // Tipo desconhecido, descarta este MAGIC
      memmove(cmd_buffer, cmd_buffer + 2, cmd_buffer_pos - 2);
      cmd_buffer_pos -= 2;
      return false;
  }
  
  // Aguarda comando completo
  if (cmd_buffer_pos < expected_size) {
    return false;
  }
  
  // Verifica CRC (little-endian)
  uint16_t crc_rx = cmd_buffer[expected_size - 2] | (cmd_buffer[expected_size - 1] << 8);
  uint16_t crc_calc = crc16_ccitt(cmd_buffer, expected_size - 2);
  
  if (crc_calc != crc_rx) {
    Serial.println("[WARNING] CRC invalido no comando");
    memmove(cmd_buffer, cmd_buffer + expected_size, cmd_buffer_pos - expected_size);
    cmd_buffer_pos -= expected_size;
    return false;
  }
  
  // Comando válido! Processa
  bool processed = false;
  
  switch (cmd_type) {
    case CMD_TARA: {
      Serial.println("[INFO] Comando TARA recebido (binario)");
      sendBinaryStatus(STATUS_INFO, MSG_CMD_RECEIVED);
      
      strcpy(balancaStatusBuffer, "Tarar");
      atualizarDisplay(balancaStatusBuffer, 0);
      
      if (aguardarEstabilidade("Tara Manual")) {
        loadcell.tare(config.numAmostrasMedia);
        config.tareOffset = loadcell.get_offset();
        saveConfig();
        sendBinaryStatus(STATUS_SUCCESS, MSG_TARA_DONE);
        Serial.println("[INFO] Tara concluida");
      } else {
        sendBinaryStatus(STATUS_ERROR, MSG_ERROR_GENERIC);
        Serial.println("[ERROR] Tara falhou");
      }
      
      strcpy(balancaStatusBuffer, "Pronta");
      processed = true;
      break;
    }
    
    case CMD_CALIBRATE: {
      CmdCalibrate* cmd = (CmdCalibrate*)cmd_buffer;
      Serial.printf("[INFO] Comando CALIBRATE recebido: massa=%.1fg (binario)\n", cmd->massa_g);
      sendBinaryStatus(STATUS_INFO, MSG_CMD_RECEIVED);
      
      float massa_conhecida_g = cmd->massa_g;
      
      if (massa_conhecida_g > 0 && massa_conhecida_g < 100000) {
        strcpy(balancaStatusBuffer, "Calibrar");
        atualizarDisplay(balancaStatusBuffer, 0);
        
        if (aguardarEstabilidade("Calibrar")) {
          long leituraRaw = loadcell.read_average(config.numAmostrasMedia);
          long offset = loadcell.get_offset();
          config.conversionFactor = (float)(leituraRaw - offset) / massa_conhecida_g;
          loadcell.set_scale(config.conversionFactor);
          saveConfig();
          sendBinaryStatus(STATUS_SUCCESS, MSG_CALIB_DONE);
          Serial.println("[INFO] Calibracao concluida");
          sendBinaryConfig(config);  // Envia config atualizada
        } else {
          sendBinaryStatus(STATUS_ERROR, MSG_CALIB_FAILED);
          Serial.println("[ERROR] Calibracao falhou");
        }
        
        strcpy(balancaStatusBuffer, "Pronta");
      } else {
        sendBinaryStatus(STATUS_ERROR, MSG_ERROR_GENERIC);
        Serial.println("[ERROR] Massa invalida");
      }
      
      processed = true;
      break;
    }
    
    case CMD_GET_CONFIG: {
      Serial.println("[INFO] Comando GET_CONFIG recebido (binario)");
      sendBinaryConfig(config);
      processed = true;
      break;
    }
    
    case CMD_SET_PARAM: {
      CmdSetParam* cmd = (CmdSetParam*)cmd_buffer;
      Serial.printf("[INFO] Comando SET_PARAM recebido: param_id=0x%02X (binario)\n", cmd->param_id);
      
      bool updated = false;
      
      switch (cmd->param_id) {
        case PARAM_GRAVITY:
          config.gravity = cmd->value_f;
          updated = true;
          Serial.printf("[INFO] Gravity atualizado: %.5f\n", config.gravity);
          break;
          
        case PARAM_CONV_FACTOR:
          config.conversionFactor = cmd->value_f;
          loadcell.set_scale(config.conversionFactor);
          updated = true;
          Serial.printf("[INFO] ConversionFactor atualizado: %.2f\n", config.conversionFactor);
          break;
          
        case PARAM_LEIT_ESTAV:
          config.leiturasEstaveis = (int)cmd->value_i;
          updated = true;
          Serial.printf("[INFO] LeiturasEstaveis atualizado: %d\n", config.leiturasEstaveis);
          break;
          
        case PARAM_TOLERANCIA:
          config.toleranciaEstabilidade = cmd->value_f;
          updated = true;
          Serial.printf("[INFO] Tolerancia atualizada: %.1f\n", config.toleranciaEstabilidade);
          break;
          
        case PARAM_NUM_AMOSTRAS:
          config.numAmostrasMedia = (int)cmd->value_i;
          updated = true;
          Serial.printf("[INFO] NumAmostrasMedia atualizado: %d\n", config.numAmostrasMedia);
          break;
          
        default:
          Serial.printf("[WARNING] Parametro desconhecido: 0x%02X\n", cmd->param_id);
          sendBinaryStatus(STATUS_ERROR, MSG_ERROR_GENERIC);
          break;
      }
      
      if (updated) {
        saveConfig();
        sendBinaryStatus(STATUS_SUCCESS, MSG_CONFIG_UPDATE);
        sendBinaryConfig(config);  // Envia config atualizada
      }
      
      processed = true;
      break;
    }
  }
  
  // Remove comando processado do buffer
  if (processed) {
    memmove(cmd_buffer, cmd_buffer + expected_size, cmd_buffer_pos - expected_size);
    cmd_buffer_pos -= expected_size;
  }
  
  return processed;
}

// ============================================================================
// SETUP E LOOP
// ============================================================================

void setup() {
  Serial.begin(921600);
  delay(100);

  Serial.println("\n\n################################################");
  Serial.println("## PONTO DE INICIO ALCANCADO COM SUCESSO! ##");
  Serial.println("################################################\n");

  Serial.println("\n\n===========================================");
  Serial.println("   Balanca GFIG - Modo Gateway Serial");
  Serial.println("   Versao: ESTAVEL V16 (Binary Protocol)");
  Serial.println("===========================================\n");

  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("Falha ao iniciar display SSD1306."));
  }
  atualizarDisplay(balancaStatusBuffer, 0);

  EEPROM.begin(sizeof(Config));
  loadConfig();

  Serial.println("Iniciando HX711...");
  loadcell.begin(pinData, pinClock);
  loadcell.set_scale(config.conversionFactor);
  loadcell.set_offset(config.tareOffset);

  if (config.tareOffset == 0) {
    atualizarDisplay("Tarando...", 0);
    if (aguardarEstabilidade("Tara Inicial")) {
      loadcell.tare(config.numAmostrasMedia);
      config.tareOffset = loadcell.get_offset();
      saveConfig();
    }
  }

  lastCommandCheckTime = millis();

  systemOperational = true;
  strcpy(balancaStatusBuffer, "Pronta");
  atualizarDisplay(balancaStatusBuffer, pesoAtual_g);

  Serial.println("\n===========================================");
  Serial.println("  SISTEMA OPERACIONAL (Binary Protocol)");
  Serial.println("===========================================");
  sendSerialConfig();
}

void loop() {
  ESP.wdtFeed();
  yield();

  // Rotina de Verificação de Comandos (a cada 100ms)
  if (millis() - lastCommandCheckTime >= 100) {
    lastCommandCheckTime = millis();
    processSerialCommand();
    yield();
  }

  // Rotina de Leitura e Envio da Célula de Carga (Alta Frequência)
  if (millis() - lastReadTime >= 10) {
    lastReadTime = millis();

    // Não lê durante calibração/tara
    if (strstr(balancaStatusBuffer, "Tarar") != NULL || strstr(balancaStatusBuffer, "Calibrar") != NULL) {
      return;
    }

    if (loadcell.is_ready()) {
      strcpy(balancaStatusBuffer, "Pesando");
      ESP.wdtFeed();

      pesoAtual_g = loadcell.get_units(config.numAmostrasMedia);
      if (config.conversionFactor < 0) {
        pesoAtual_g *= -1;
      }

      // Envia leitura como pacote binário
      float forcaN = (pesoAtual_g / 1000.0f) * config.gravity;
      uint8_t st = status_code_from_str(balancaStatusBuffer);
      sendBinaryFrame(st, forcaN);
      yield();
    }
  }

  // Rotina de Display (a cada 500ms)
  if (millis() - lastDisplayUpdateTime >= 500) {
    lastDisplayUpdateTime = millis();
    atualizarDisplay(balancaStatusBuffer, pesoAtual_g);
    yield();
  }
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

void sendSimpleJson(const char* type, const char* message) {
  StaticJsonDocument<128> doc;
  doc["type"] = type;
  doc["message"] = message;
  size_t written = serializeJson(doc, jsonOutputBuffer, sizeof(jsonOutputBuffer));
  if(written > 0) {
    Serial.println(jsonOutputBuffer);
    Serial.flush();
    delay(10);
  }
}

void sendSerialConfig() {
  // Usa protocolo binário agora!
  sendBinaryConfig(config);
}

void processSerialCommand() {
  // PRIORIDADE: Tenta processar comando binário primeiro
  if (processBinaryCommand()) {
    return;  // Comando binário processado com sucesso
  }
  
  // Fallback: Mantém compatibilidade com JSON (caso necessário)
  if (Serial.available() <= 0) {
    return;
  }

  sendSimpleJson("info", "Serial data available");

  char inputBuffer[MAX_COMMAND_LEN];
  size_t len = Serial.readBytesUntil('\n', inputBuffer, MAX_COMMAND_LEN - 1);

  inputBuffer[len] = '\0';

  while (len > 0 && (inputBuffer[len-1] == '\r' || inputBuffer[len-1] == '\n' || inputBuffer[len-1] == ' ')) {
    inputBuffer[--len] = '\0';
  }

  if (len == 0 || len < 5) {
    sendSimpleJson("info", "Command too short");
    return;
  }

  sendSimpleJson("info", "Parsing JSON command");

  DeserializationError error = deserializeJson(commandDoc, inputBuffer);

  if (error) {
    sendSimpleJson("error", "JSON parse error");
    return;
  }

  const char* cmd = commandDoc["cmd"];

  if (!cmd) {
    sendSimpleJson("error", "Comando 'cmd' ausente");
    return;
  }

  sendSimpleJson("info", "Command identified");

  // === LÓGICA DE COMANDOS JSON (LEGACY) ===
  if (strcmp(cmd, "t") == 0) {
    strcpy(balancaStatusBuffer, "Tarar");
    if (aguardarEstabilidade("Tarar")) {
      loadcell.tare(config.numAmostrasMedia);
      config.tareOffset = loadcell.get_offset();
      saveConfig();
      sendSimpleJson("success", "Tara OK");
      strcpy(balancaStatusBuffer, "Pronta");
    } else {
      sendSimpleJson("error", "Falha tara");
      strcpy(balancaStatusBuffer, "Pronta");
    }
  }

  else if (strcmp(cmd, "c") == 0) {
    float massa_g = commandDoc["massa_g"];
    if (massa_g > 0 && massa_g < 100000) {
      strcpy(balancaStatusBuffer, "Calibrar");
      if (aguardarEstabilidade("Calibrar")) {
        long leituraRaw = loadcell.read_average(config.numAmostrasMedia);
        long offset = loadcell.get_offset();
        config.conversionFactor = (float)(leituraRaw - offset) / massa_g;
        loadcell.set_scale(config.conversionFactor);
        saveConfig();
        sendSimpleJson("success", "Calibracao OK");
        strcpy(balancaStatusBuffer, "Pronta");
      } else {
        sendSimpleJson("error", "Falha calibracao");
        strcpy(balancaStatusBuffer, "Pronta");
      }
    } else {
      sendSimpleJson("error", "Massa invalida");
    }
  }

  else if (strcmp(cmd, "set") == 0) {
    const char* paramName = commandDoc["param"];
    float paramValueF = commandDoc["value"];
    long paramValueL = commandDoc["value"];
    bool changed = false;

    if (paramName && commandDoc.containsKey("value")) {
      if (strcmp(paramName, "conversionFactor") == 0) {
        config.conversionFactor = paramValueF;
        loadcell.set_scale(config.conversionFactor);
        changed = true;
      }
      else if (strcmp(paramName, "gravity") == 0) {
        config.gravity = paramValueF;
        changed = true;
      }
      else if (strcmp(paramName, "leiturasEstaveis") == 0) {
        config.leiturasEstaveis = constrain(paramValueL, 1, 50);
        changed = true;
      }
      else if (strcmp(paramName, "toleranciaEstabilidade") == 0) {
        config.toleranciaEstabilidade = paramValueF;
        changed = true;
      }
      else if (strcmp(paramName, "numAmostrasMedia") == 0) {
        config.numAmostrasMedia = constrain(paramValueL, 1, 20);
        changed = true;
      }
      else if (strcmp(paramName, "timeoutCalibracao") == 0) {
        config.timeoutCalibracao = paramValueL;
        changed = true;
      }
      else if (strcmp(paramName, "tareOffset") == 0) {
        config.tareOffset = paramValueL;
        loadcell.set_offset(config.tareOffset);
        changed = true;
      }
      else if (strcmp(paramName, "capacidadeMaximaGramas") == 0) {
        if (paramValueF > 0 && paramValueF <= 1000000) {
          config.capacidadeMaximaGramas = paramValueF;
          changed = true;
        } else {
          sendSimpleJson("error", "Capacidade invalida (0-1000000g)");
        }
      }
      else if (strcmp(paramName, "percentualAcuracia") == 0) {
        if (paramValueF >= 0 && paramValueF <= 10.0) {
          config.percentualAcuracia = paramValueF;
          changed = true;
        } else {
          sendSimpleJson("error", "Acuracia invalida (0-10%)");
        }
      }
      else {
        sendSimpleJson("error", "Parametro desconhecido");
      }

      if (changed) {
        saveConfig();
        sendSimpleJson("success", "Parametro atualizado!");
        sendSerialConfig();
      }
    } else {
      sendSimpleJson("error", "Parametro ou valor ausente");
    }
  }

  else if (strcmp(cmd, "get_config") == 0) {
    sendSimpleJson("info", "Sending config");
    sendSerialConfig();
  }

  else {
    sendSimpleJson("error", "Comando desconhecido");
  }
}

void atualizarDisplay(const char* status, float peso_em_gramas) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(0, 0);

  float peso_kg = peso_em_gramas / 1000.0;
  if (abs(peso_kg) < 10) {
    display.printf("%.3f kg", peso_kg);
  } else if (abs(peso_kg) < 100) {
    display.printf("%.2f kg", peso_kg);
  } else {
    display.printf("%.1f kg", peso_kg);
  }

  display.setTextSize(1);
  display.setCursor(0, 20);
  display.println(status);
  display.setCursor(0, 35);
  display.println("V16 BINARY PROTO");
  display.setCursor(0, 45);
  display.printf("Serial: 921600 Baud");
  display.setCursor(0, 55);
  display.printf("RAM: %u KB", ESP.getFreeHeap() / 1024);
  display.display();
}

void saveConfig() {
  EEPROM.put(0, config);
  EEPROM.commit();
  sendSimpleJson("info", "[CONFIG] Salvo na EEPROM");
}

void loadConfig() {
  Config tempConfig;
  EEPROM.get(0, tempConfig);
  if (tempConfig.magic_number == 123456789) {
    config = tempConfig;
    sendSimpleJson("info", "[CONFIG] Carregado da EEPROM");
  } else {
    sendSimpleJson("info", "[CONFIG] Usando padrao");
    saveConfig();
  }
}

bool aguardarEstabilidade(const char *proposito) {
  Serial.printf("{\"type\":\"info\",\"message\":\"[Estabilidade] Aguardando: %s\"}\n", proposito);

  unsigned long inicio = millis();
  int leiturasEstaveisCount = 0;
  long ultimaLeitura = 0;

  while (millis() - inicio < config.timeoutCalibracao) {
    ESP.wdtFeed();
    yield();

    if (!loadcell.is_ready()) {
      delay(1);
      continue;
    }

    long leituraAtual = loadcell.read_average(3);

    if (ultimaLeitura != 0) {
      long diferenca = abs(leituraAtual - ultimaLeitura);

      if (diferenca <= config.toleranciaEstabilidade) {
        leiturasEstaveisCount++;
        if (leiturasEstaveisCount >= config.leiturasEstaveis) {
          sendSimpleJson("info", "[Estabilidade] Estavel!");
          return true;
        }
      } else {
        leiturasEstaveisCount = 0;
      }
    }

    ultimaLeitura = leituraAtual;
    delay(100);
  }

  sendSimpleJson("info", "[Estabilidade] Timeout");
  return false;
}
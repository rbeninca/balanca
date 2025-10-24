#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <HX711.h>
#include <EEPROM.h>
#include <ArduinoJson.h>

// ======== PROTOCOLO BINÁRIO (16 bytes, little-endian) ========
static const uint16_t MAGIC_BIN_PROTO = 0xA1B2;

#pragma pack(push,1)
struct PacketBin {
  uint16_t magic;   // 0xA1B2
  uint8_t  ver;     // 1
  uint8_t  status;  // 0=Pesando,1=Tarar,2=Calibrar,3=Pronta
  uint32_t t_ms;    // millis()
  float    forca_N; // Newtons
  uint16_t crc;     // CRC16-CCITT
};
#pragma pack(pop)

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
  return 0; // default
}

static inline void sendBinaryFrame(uint8_t status_code, float forca_N) {
  PacketBin p;
  p.magic   = MAGIC_BIN_PROTO;
  p.ver     = 1;
  p.status  = status_code;
  p.t_ms    = millis();
  p.forca_N = forca_N;
  p.crc     = 0;
  p.crc     = crc16_ccitt((const uint8_t*)&p, sizeof(PacketBin) - sizeof(uint16_t));
  Serial.write((const uint8_t*)&p, sizeof(PacketBin));
}

#include <string.h> // Necessário para strcpy e strstr

// BALANÇA GFIG - VERSÃO GATEWAY SERIAL (ESTÁVEL V14)
// CORREÇÃO: Leituras são enviadas individualmente para evitar bloqueio do buffer serial.

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C
#define OLED_SDA 14
#define OLED_SCL 12
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Buffer para comandos e mensagens de status. O buffer de leituras foi removido.
char jsonOutputBuffer[1024];

// CRÍTICO: Tamanho máximo para o comando Serial
const size_t MAX_COMMAND_LEN = 256;

// Estrutura de Configuração (Mantida na EEPROM)
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
  // NOVO: Especificações da célula de carga
  float capacidadeMaximaGramas = 5000.0;  // Capacidade máxima em gramas (padrão: 5kg)
  float percentualAcuracia = 0.05;        // Acurácia em % (padrão: 0.05% = ±0.05%)
};
Config config;

const uint8_t pinData = D7;
const uint8_t pinClock = D8;

HX711 loadcell;
StaticJsonDocument<256> commandDoc;

// Usando char array em vez de String para balancaStatus para maior estabilidade
char balancaStatusBuffer[32] = "Iniciando...";
float pesoAtual_g = 0.0;
unsigned long lastReadTime = 0;
unsigned long lastDisplayUpdateTime = 0;
unsigned long lastCommandCheckTime = 0;
bool systemOperational = true;

// Funções de Suporte
void atualizarDisplay(const char* status, float peso_em_gramas);
void saveConfig();
void loadConfig();
bool aguardarEstabilidade(const char *proposito);
void processSerialCommand();
void sendSerialConfig();
void sendSimpleJson(const char* type, const char* message);


void setup() {
  Serial.begin(921600);
  delay(100);

  // ################ TESTE CRÍTICO DE SERIAL ################
  Serial.println("\n\n################################################");
  Serial.println("## PONTO DE INÍCIO ALCANÇADO COM SUCESSO! ##");
  Serial.println("################################################\n");

  Serial.println("\n\n===========================================");
  Serial.println("   Balanca GFIG - Modo Gateway Serial");
  Serial.println("   Versao: ESTAVEL V15 (LoadCell Specs)"); // Versão atualizada
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
  Serial.println("  SISTEMA OPERACIONAL (Gateway Serial)");
  Serial.println("===========================================");
  sendSerialConfig();
}

void loop() {
  ESP.wdtFeed();
  yield();

  // --- Rotina de Verificação de Comandos (a cada 100ms) ---
  if (millis() - lastCommandCheckTime >= 100) {
    lastCommandCheckTime = millis();
    processSerialCommand();
    yield();
  }

  // --- Rotina de Leitura e Envio da Célula de Carga (Alta Frequência) ---
  if (millis() - lastReadTime >= 10) {
    lastReadTime = millis();

    // Não lê durante calibração/tara.
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

        // Envia a leitura individualmente para evitar bloqueio do buffer serial
        float __forcaN = (pesoAtual_g / 1000.0f) * config.gravity;
uint8_t __st = status_code_from_str(balancaStatusBuffer);
sendBinaryFrame(__st, __forcaN);
yield();
    }
  }

  // --- Rotina de Display (a cada 500ms) ---
  if (millis() - lastDisplayUpdateTime >= 500) {
    lastDisplayUpdateTime = millis();
    atualizarDisplay(balancaStatusBuffer, pesoAtual_g);
    yield();
  }
}

/**
 * Utilitário para enviar JSON simples (status/erro/info) sem usar String.
 */
void sendSimpleJson(const char* type, const char* message) {
    StaticJsonDocument<128> doc;
    doc["type"] = type;
    doc["message"] = message;
    // Usa o buffer global jsonOutputBuffer temporariamente
    size_t written = serializeJson(doc, jsonOutputBuffer, sizeof(jsonOutputBuffer));
    if(written > 0) {
        Serial.println(jsonOutputBuffer);
        Serial.flush();
        delay(10); // Pequeno delay para evitar mistura com dados binários
    }
}

/**
 * Envia a configuração do dispositivo para o Serial Host.
 */
void sendSerialConfig() {
    StaticJsonDocument<512> doc;
    doc["type"] = "config";
    doc["conversionFactor"] = config.conversionFactor;
    doc["gravity"] = config.gravity;
    doc["leiturasEstaveis"] = config.leiturasEstaveis;
    doc["toleranciaEstabilidade"] = config.toleranciaEstabilidade;
    doc["numAmostrasMedia"] = config.numAmostrasMedia;
    doc["timeoutCalibracao"] = config.timeoutCalibracao;
    doc["tareOffset"] = config.tareOffset;
    doc["capacidadeMaximaGramas"] = config.capacidadeMaximaGramas;
    doc["percentualAcuracia"] = config.percentualAcuracia;
    doc["mode"] = "SERIAL_GATEWAY";
    doc["version"] = "STABLE_V15"; // Versão atualizada

    size_t len = measureJson(doc);
    if (len > sizeof(jsonOutputBuffer) - 1) {
        Serial.printf("{\"type\":\"error\",\"message\":\"Config JSON too large: %u bytes\"}\n", len);
        return;
    }

    size_t written = serializeJson(doc, jsonOutputBuffer, sizeof(jsonOutputBuffer));
    if (written > 0) {
        Serial.println(jsonOutputBuffer);
        Serial.flush();
        delay(50); // Aguarda transmissão completa antes de retomar envio binário
    }
}

/**
 * CRÍTICO: Função que monitora e processa comandos JSON recebidos via Serial.
 */
void processSerialCommand() {
    if (Serial.available() <= 0) {
        return;
    }

    sendSimpleJson("info", "Serial data available");

    char inputBuffer[MAX_COMMAND_LEN];
    size_t len = Serial.readBytesUntil('\n', inputBuffer, MAX_COMMAND_LEN - 1);

    // Adiciona null terminator
    inputBuffer[len] = '\0';

    // Remove caracteres de controle e whitespace no final
    while (len > 0 && (inputBuffer[len-1] == '\r' || inputBuffer[len-1] == '\n' || inputBuffer[len-1] == ' ')) {
        inputBuffer[--len] = '\0';
    }

    // Ignora linhas vazias ou muito curtas
    if (len == 0 || len < 5) {
        sendSimpleJson("info", "Command too short");
        return;
    }

    sendSimpleJson("info", "Parsing command");

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

    // === LÓGICA DE COMANDOS ===
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
                if (paramValueF > 0 && paramValueF <= 1000000) { // Até 1000kg
                    config.capacidadeMaximaGramas = paramValueF;
                    changed = true;
                } else {
                    sendSimpleJson("error", "Capacidade invalida (0-1000000g)");
                }
            }
            else if (strcmp(paramName, "percentualAcuracia") == 0) {
                if (paramValueF >= 0 && paramValueF <= 10.0) { // Até 10%
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

// === FUNÇÕES DE SUPORTE ===

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
  display.println("VERSAO ESTAVEL V15"); // Versão atualizada
  display.setCursor(0, 45);
  display.printf("Serial: %u Baud", 230400);
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
    // CRÍTICO: Alimentar o WDT antes da leitura demorada e em cada iteração
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
    delay(100); // Manter o delay entre as amostras de estabilidade
  }

  sendSimpleJson("info", "[Estabilidade] Timeout");
  return false;
}
#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <HX711.h>
#include <EEPROM.h>
#include <ArduinoJson.h>
#include <string.h>

// BALANÇA GFIG - VERSÃO GATEWAY SERIAL (ESTÁVEL V17 - PRODUÇÃO)
// OTIMIZADO PARA SISTEMAS DE BAIXA PERFORMANCE (Raspberry Pi, Docker)

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C
#define OLED_SDA 14
#define OLED_SCL 12
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Buffer para comandos e mensagens
char jsonOutputBuffer[512];

// Tamanho máximo para o comando Serial
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

  Serial.println("\n\n################################################");
  Serial.println("## PONTO DE INÍCIO ALCANÇADO COM SUCESSO! ##");
  Serial.println("################################################\n");

  Serial.println("\n\n===========================================");
  Serial.println("   Balanca GFIG - Modo Gateway Serial");
  Serial.println("   Versao: ESTAVEL V17 (Producao)");
  Serial.println("   Taxa: 10 Hz (100ms) - Otimizado");
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

  // --- Verificação de Comandos (a cada 50ms) ---
  if (millis() - lastCommandCheckTime >= 50) {
    lastCommandCheckTime = millis();
    processSerialCommand();
    yield();
  }

  // --- LEITURA E ENVIO DA CÉLULA DE CARGA ---
  // CRÍTICO: 100ms (10 Hz) para sistemas de baixa performance
  // Esta taxa garante estabilidade em Raspberry Pi e containers Docker
  if (millis() - lastReadTime >= 100) {
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

        // Envia a leitura de forma otimizada
        StaticJsonDocument<256> readingDoc;
        readingDoc["type"] = "data";
        readingDoc["tempo"] = millis() / 1000.0;
        readingDoc["forca"] = (pesoAtual_g / 1000.0) * config.gravity;
        readingDoc["status"] = balancaStatusBuffer;

        // Serializa para buffer primeiro
        size_t len = serializeJson(readingDoc, jsonOutputBuffer, sizeof(jsonOutputBuffer));
        
        if (len > 0) {
            // Envia o buffer completo de uma vez
            Serial.println(jsonOutputBuffer);
            
            // CRÍTICO: Aguarda o Serial terminar antes de continuar
            // Isso previne corrupção dos dados
            Serial.flush();
            
            // Pequeno delay adicional para sistemas lentos
            delay(5);
        }

        yield();
    }
  }

  // --- Display (a cada 500ms) ---
  if (millis() - lastDisplayUpdateTime >= 500) {
    lastDisplayUpdateTime = millis();
    atualizarDisplay(balancaStatusBuffer, pesoAtual_g);
    yield();
  }
}

void sendSimpleJson(const char* type, const char* message) {
    StaticJsonDocument<128> doc;
    doc["type"] = type;
    doc["message"] = message;
    size_t written = serializeJson(doc, jsonOutputBuffer, sizeof(jsonOutputBuffer));
    if(written > 0) {
        Serial.println(jsonOutputBuffer);
        Serial.flush();
        delay(5);
    }
}

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
    doc["version"] = "STABLE_V17_PROD";
    doc["rate_hz"] = 10;

    size_t written = serializeJson(doc, jsonOutputBuffer, sizeof(jsonOutputBuffer));
    if (written > 0) {
        Serial.println(jsonOutputBuffer);
        Serial.flush();
        delay(5);
    }
}

void processSerialCommand() {
    if (Serial.available() <= 0) {
        return;
    }

    char inputBuffer[MAX_COMMAND_LEN];
    size_t len = Serial.readBytesUntil('\n', inputBuffer, MAX_COMMAND_LEN - 1);

    inputBuffer[len] = '\0';

    while (Serial.available() > 0) {
        Serial.read();
    }

    if (len == 0 || len < 5) {
        return;
    }

    DeserializationError error = deserializeJson(commandDoc, inputBuffer);

    if (error) {
        sendSimpleJson("error", error.c_str());
        return;
    }

    const char* cmd = commandDoc["cmd"];

    if (!cmd) {
        sendSimpleJson("error", "Comando 'cmd' ausente");
        return;
    }

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
  display.println("V17 PROD - 10Hz");
  display.setCursor(0, 45);
  display.printf("Serial: %u Baud", 921600);
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
  Serial.flush();

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
#!/bin/bash

# Diagnóstico de Fluxo de Dados - Balança GFIG
# Verifica por que os dados do ESP32 não estão chegando no navegador

echo "╔════════════════════════════════════════════════════════╗"
echo "║   Diagnóstico de Fluxo de Dados - Balança GFIG        ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 1. Verificar se ESP32 está conectado
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  Verificando ESP32..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ESP_FOUND=false
ESP_PORT=""

if [ -e "/dev/ttyUSB0" ]; then
    echo -e "${GREEN}✅${NC} ESP32 encontrado em /dev/ttyUSB0"
    ESP_PORT="/dev/ttyUSB0"
    ESP_FOUND=true
elif [ -e "/dev/ttyACM0" ]; then
    echo -e "${GREEN}✅${NC} ESP32 encontrado em /dev/ttyACM0"
    ESP_PORT="/dev/ttyACM0"
    ESP_FOUND=true
else
    echo -e "${RED}❌${NC} ESP32 NÃO ENCONTRADO!"
    echo ""
    echo "PROBLEMA: Sem ESP32, não há dados para enviar."
    echo ""
    echo "SOLUÇÃO:"
    echo "  1. Conecte o ESP32 via USB"
    echo "  2. Verifique se o firmware está gravado"
    echo "  3. Execute: ls -l /dev/tty{USB,ACM}*"
    echo ""
    ESP_FOUND=false
fi
echo ""

# 2. Testar comunicação serial diretamente
if [ "$ESP_FOUND" = true ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "2️⃣  Testando comunicação serial direta (5 segundos)..."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Verificar permissões
    if [ -r "$ESP_PORT" ] && [ -w "$ESP_PORT" ]; then
        echo -e "${GREEN}✅${NC} Permissões OK para $ESP_PORT"
    else
        echo -e "${RED}❌${NC} Sem permissão para $ESP_PORT"
        echo ""
        echo "SOLUÇÃO:"
        echo "  sudo chmod 666 $ESP_PORT"
        echo "  # OU"
        echo "  sudo usermod -a -G dialout \$USER"
        echo "  (depois faça logout/login)"
        echo ""
    fi
    
    echo ""
    echo "Lendo dados da serial (timeout 5s)..."
    echo -e "${YELLOW}[Aguarde...]${NC}"
    echo ""
    
    # Tentar ler dados da serial
    if command -v screen &> /dev/null; then
        timeout 5 screen -L -Logfile /tmp/serial_test.log $ESP_PORT 230400 > /dev/null 2>&1
        if [ -f /tmp/serial_test.log ]; then
            DATA_SIZE=$(wc -c < /tmp/serial_test.log)
            if [ $DATA_SIZE -gt 0 ]; then
                echo -e "${GREEN}✅${NC} ESP32 ESTÁ ENVIANDO DADOS!"
                echo ""
                echo "Primeiras 5 linhas recebidas:"
                head -5 /tmp/serial_test.log
                echo ""
                
                # Verificar se é JSON
                if grep -q '^\[' /tmp/serial_test.log || grep -q '^{' /tmp/serial_test.log; then
                    echo -e "${GREEN}✅${NC} Dados estão em formato JSON"
                else
                    echo -e "${YELLOW}⚠️${NC}  Dados NÃO estão em formato JSON"
                    echo "     O server.py só aceita JSON (começando com [ ou {)"
                fi
                
                rm /tmp/serial_test.log
            else
                echo -e "${RED}❌${NC} ESP32 NÃO ESTÁ ENVIANDO DADOS"
                echo ""
                echo "POSSÍVEIS CAUSAS:"
                echo "  • Firmware não está gravado"
                echo "  • Baud rate incorreto (deve ser 230400)"
                echo "  • ESP32 travado ou reiniciando"
                echo "  • Célula de carga não conectada"
                rm /tmp/serial_test.log
            fi
        fi
    else
        # Alternativa sem screen: usar cat
        echo -e "${BLUE}ℹ️${NC}  'screen' não instalado, usando método alternativo..."
        
        # Configurar porta serial
        stty -F $ESP_PORT 230400 raw -echo 2>/dev/null
        
        # Ler por 5 segundos
        timeout 5 cat $ESP_PORT > /tmp/serial_test2.log 2>/dev/null
        
        if [ -f /tmp/serial_test2.log ]; then
            DATA_SIZE=$(wc -c < /tmp/serial_test2.log)
            if [ $DATA_SIZE -gt 10 ]; then
                echo -e "${GREEN}✅${NC} ESP32 ESTÁ ENVIANDO DADOS!"
                echo ""
                echo "Amostra dos dados:"
                head -c 500 /tmp/serial_test2.log
                echo ""
                echo ""
            else
                echo -e "${RED}❌${NC} ESP32 NÃO ESTÁ ENVIANDO DADOS"
            fi
            rm /tmp/serial_test2.log
        fi
    fi
else
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "2️⃣  Teste serial IGNORADO (ESP32 não encontrado)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi
echo ""

# 3. Verificar se server.py está rodando
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  Verificando servidor Python..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if pgrep -f "python.*server.py" > /dev/null; then
    echo -e "${GREEN}✅${NC} Servidor Python está rodando"
    echo "   PID: $(pgrep -f "python.*server.py")"
    
    # Verificar se está lendo a serial
    PY_PID=$(pgrep -f "python.*server.py")
    if lsof -p $PY_PID 2>/dev/null | grep -q "tty"; then
        echo -e "${GREEN}✅${NC} Servidor tem porta serial aberta"
    else
        echo -e "${YELLOW}⚠️${NC}  Servidor NÃO tem porta serial aberta"
        echo "     Pode estar travado ou esperando conexão"
    fi
else
    echo -e "${RED}❌${NC} Servidor Python NÃO está rodando"
    echo ""
    echo "SOLUÇÃO: Inicie o servidor com:"
    echo "  python3 server.py"
fi
echo ""

# 4. Verificar WebSocket
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  Verificando WebSocket..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if netstat -tuln 2>/dev/null | grep -q ":81.*LISTEN" || ss -tuln 2>/dev/null | grep -q ":81.*LISTEN"; then
    echo -e "${GREEN}✅${NC} WebSocket ouvindo na porta 81"
else
    echo -e "${RED}❌${NC} WebSocket NÃO está ouvindo"
fi
echo ""

# 5. Resumo e diagnóstico
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 DIAGNÓSTICO FINAL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$ESP_FOUND" = false ]; then
    echo -e "${RED}❌ PROBLEMA PRINCIPAL: ESP32 NÃO CONECTADO${NC}"
    echo ""
    echo "Sem ESP32, não há dados para enviar ao navegador."
    echo ""
    echo "PRÓXIMOS PASSOS:"
    echo "  1. Conecte o ESP32 via USB"
    echo "  2. Grave o firmware (main.cpp)"
    echo "  3. Execute este script novamente"
    echo ""
else
    echo -e "${BLUE}ℹ️${NC}  Para ver logs em tempo real do servidor:"
    echo ""
    echo "  # Em um terminal, inicie o servidor:"
    echo "  python3 server.py"
    echo ""
    echo "  # Você deve ver:"
    echo "  [INFO] Recebido da Serial: [...]"
    echo "  [INFO] Cliente conectado: ..."
    echo ""
    echo "  # No navegador (F12 → Console), você deve ver:"
    echo "  [Worker] Dados recebidos: ..."
    echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 DICA: Execute o servidor em um terminal separado"
echo "   para ver os logs em tempo real!"
echo ""
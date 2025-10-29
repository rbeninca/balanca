#!/bin/bash
# Script de instalação do sistema de monitoramento MySQL
# Executar como root no servidor de produção
# Uso: sudo ./install-monitoring.sh

set -e

echo "=== Instalação do Sistema de Monitoramento MySQL ==="

# Verifica se está rodando como root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Este script precisa ser executado como root (use sudo)"
    exit 1
fi

# Detecta o diretório do projeto
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "✓ Diretório do projeto: $SCRIPT_DIR"

# Verifica se os arquivos necessários existem
if [ ! -f "$SCRIPT_DIR/mysql-healthcheck.sh" ]; then
    echo "❌ Arquivo mysql-healthcheck.sh não encontrado!"
    exit 1
fi

if [ ! -f "$SCRIPT_DIR/docker-compose.yml" ]; then
    echo "❌ Arquivo docker-compose.yml não encontrado!"
    exit 1
fi

echo "✓ Arquivos do projeto encontrados"

# Torna os scripts executáveis
chmod +x "$SCRIPT_DIR/mysql-healthcheck.sh"
chmod +x "$SCRIPT_DIR/check-mysql.sh"
echo "✓ Permissões configuradas"

# Cria o serviço systemd
echo "Criando serviço systemd..."
cat > /etc/systemd/system/mysql-healthcheck.service << SERVICEEOF
[Unit]
Description=MySQL Healthcheck and Auto-Recovery Service
After=docker.service
Requires=docker.service
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=10
User=root
WorkingDirectory=$SCRIPT_DIR
ExecStart=/bin/bash $SCRIPT_DIR/mysql-healthcheck.sh
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICEEOF

echo "✓ Serviço systemd criado"

# Recarrega systemd
systemctl daemon-reload
echo "✓ Systemd recarregado"

# Habilita e inicia o serviço
systemctl enable mysql-healthcheck.service
systemctl start mysql-healthcheck.service
echo "✓ Serviço habilitado e iniciado"

# Aguarda um pouco e verifica o status
sleep 2
if systemctl is-active --quiet mysql-healthcheck.service; then
    echo "✅ Serviço está rodando!"
else
    echo "⚠️  Serviço pode não ter iniciado corretamente"
fi

# Mostra status
echo ""
echo "=== Status do Serviço ==="
systemctl status mysql-healthcheck.service --no-pager | head -15

echo ""
echo "=== Instalação Concluída! ==="
echo ""
echo "Comandos úteis:"
echo "  - Verificar status: $SCRIPT_DIR/check-mysql.sh"
echo "  - Ver logs: tail -f /var/log/mysql-healthcheck.log"
echo "  - Status do serviço: systemctl status mysql-healthcheck.service"
echo "  - Parar monitoramento: systemctl stop mysql-healthcheck.service"
echo "  - Iniciar monitoramento: systemctl start mysql-healthcheck.service"
echo ""

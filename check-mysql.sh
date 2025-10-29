#!/bin/bash
# Script para verificar status manual do MySQL
# Local: /home/rbeninca/balancaGFIG/check-mysql.sh

echo "=== Status dos Containers ==="
docker ps --filter name=balanca

echo ""
echo "=== Status do MySQL ==="
docker exec balanca_mysql sh -c 'mariadb -u balanca_user -pbalanca_password -e "SELECT VERSION() as versao, NOW() as horario"' 2>/dev/null && echo "✓ MySQL está respondendo corretamente" || echo "❌ MySQL NÃO está respondendo"

echo ""
echo "=== Uso de Recursos ==="
docker stats --no-stream balanca_mysql balanca

echo ""
echo "=== Últimas linhas do log do healthcheck ==="
tail -15 /var/log/mysql-healthcheck.log

echo ""
echo "=== Status do serviço de monitoramento ==="
systemctl status mysql-healthcheck.service --no-pager | head -15

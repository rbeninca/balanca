#!/bin/sh
# Inicialização do stack balancaGFIG2
# Uso: ./docker/iniciar.sh [--mariadb]
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

COMPOSE_FILES="-f docker/docker-compose.yml"

if [ "$1" = "--mariadb" ]; then
  COMPOSE_FILES="$COMPOSE_FILES -f docker/docker-compose.mariadb.yml"
  echo "Iniciando com MariaDB..."
else
  echo "Iniciando com SQLite..."
fi

# Gerar chave API se não existir
if [ ! -f /dados/.chave-api ]; then
  echo "Gerando chave API inicial..."
  node pacotes/api/dist/autenticacao/gerarChave.js /tmp/.chave-api-temp 2>/dev/null || true
fi

docker compose $COMPOSE_FILES up -d

echo ""
echo "Stack iniciado:"
echo "  Aplicação Web:     http://localhost"
echo "  API REST:          http://localhost:3000"
echo "  Gateway WebSocket: ws://localhost:8765"
echo "  Gateway HTTP:      http://localhost:8766/saude"

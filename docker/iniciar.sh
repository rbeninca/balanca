#!/bin/sh
# Uso: ./docker/iniciar.sh [--mariadb] [--build]
#   --mariadb  usa docker-compose.mariadb.yml em vez de SQLite
#   --build    força rebuild das imagens antes de iniciar
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

COMPOSE_FILES="-f docker/docker-compose.yml"
BUILD_FLAG=""

for arg in "$@"; do
  case "$arg" in
    --mariadb) COMPOSE_FILES="$COMPOSE_FILES -f docker/docker-compose.mariadb.yml" ;;
    --build)   BUILD_FLAG="--build" ;;
  esac
done

if echo "$COMPOSE_FILES" | grep -q mariadb; then
  echo "Iniciando com MariaDB..."
else
  echo "Iniciando com SQLite..."
fi

docker compose $COMPOSE_FILES up -d $BUILD_FLAG

echo ""
echo "Stack iniciado:"
echo "  Aplicação Web:     http://localhost"
echo "  API REST:          http://localhost:3000"
echo "  Gateway WebSocket: ws://localhost:8765"
echo "  Gateway HTTP:      http://localhost:8766/saude"

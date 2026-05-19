#!/bin/sh
# Uso: ./docker/iniciar.sh [--producao] [--mariadb] [--build]
#   --producao  usa imagens pré-compiladas do ghcr.io (para TVBOX e produção)
#   --mariadb   usa docker-compose.mariadb.yml em vez de SQLite
#   --build     força rebuild das imagens (apenas no modo desenvolvimento)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

PRODUCAO=0
COMPOSE_FILES=""
BUILD_FLAG=""

for arg in "$@"; do
  case "$arg" in
    --producao) PRODUCAO=1 ;;
    --mariadb)  MARIADB=1 ;;
    --build)    BUILD_FLAG="--build" ;;
  esac
done

if [ "$PRODUCAO" = "1" ]; then
  COMPOSE_FILES="-f docker/docker-compose.producao.yml"
  echo "Modo produção: usando imagens de ghcr.io/rbeninca/balanca (tag: ${TAG:-latest})"
  docker compose $COMPOSE_FILES pull
else
  COMPOSE_FILES="-f docker/docker-compose.yml"
  if [ "${MARIADB:-0}" = "1" ]; then
    COMPOSE_FILES="$COMPOSE_FILES -f docker/docker-compose.mariadb.yml"
  fi
fi

if [ "${MARIADB:-0}" = "1" ]; then
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

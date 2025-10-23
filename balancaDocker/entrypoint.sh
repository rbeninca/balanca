#!/usr/bin/env bash
set -euo pipefail

# Variáveis com defaults
: "${GIT_REPO:=https://github.com/rbeninca/balancaGFIG}"
: "${GIT_BRANCH:=balança_serial}"
: "${WEB_DIRECTORY:=/app/data}"
: "${PULL_INTERVAL:=120}"

: "${SERIAL_PORT:=/dev/ttyUSB0}"
: "${SERIAL_BAUD:=921600}"
: "${WS_PORT:=81}"
: "${HTTP_PORT:=8080}"

export SERIAL_PORT SERIAL_BAUD WS_PORT HTTP_PORT WEB_DIRECTORY

echo "[entrypoint] Repositório: ${GIT_REPO} | Branch: ${GIT_BRANCH}"
echo "[entrypoint] WEB_DIRECTORY: ${WEB_DIRECTORY}"
echo "[entrypoint] Serial: ${SERIAL_PORT} @ ${SERIAL_BAUD}"
echo "[entrypoint] WS: ${WS_PORT} | HTTP: ${HTTP_PORT}"
echo "[entrypoint] Pull interval: ${PULL_INTERVAL}s"

# Prepara diretórios
mkdir -p "${WEB_DIRECTORY}"

# Clona ou atualiza o repositório em WEB_DIRECTORY
if [ ! -d "${WEB_DIRECTORY}/.git" ]; then
  echo "[entrypoint] Clonando repositório pela primeira vez..."
  rm -rf "${WEB_DIRECTORY:?}"/*
  git clone --depth 1 --branch "${GIT_BRANCH}" "${GIT_REPO}" "${WEB_DIRECTORY}"
else
  echo "[entrypoint] Atualizando repositório existente..."
  git -C "${WEB_DIRECTORY}" fetch origin "${GIT_BRANCH}" --depth 1
  git -C "${WEB_DIRECTORY}" reset --hard "origin/${GIT_BRANCH}"
fi

# Loop de atualização em background
(
  while true; do
    sleep "${PULL_INTERVAL}"
    echo "[entrypoint] Verificando atualizações do repositório..."
    # Captura commit atual
    OLD_SHA="$(git -C "${WEB_DIRECTORY}" rev-parse HEAD || echo 'unknown')"
    git -C "${WEB_DIRECTORY}" fetch origin "${GIT_BRANCH}" --depth 1 || true
    NEW_SHA="$(git -C "${WEB_DIRECTORY}" rev-parse origin/${GIT_BRANCH} || echo 'unknown')"

    if [ "$OLD_SHA" != "$NEW_SHA" ]; then
      echo "[entrypoint] Novas alterações detectadas. Aplicando..."
      git -C "${WEB_DIRECTORY}" reset --hard "origin/${GIT_BRANCH}" || true
      # Como o server serve estáticos de WEB_DIRECTORY, não precisa reiniciar;
      # mudanças passam a valer imediatamente nas novas requisições HTTP/WS.
    else
      echo "[entrypoint] Nenhuma mudança."
    fi
  done
) &

# Ajuste de permissões para a serial (em muitos sistemas o grupo é dialout)
if getent group dialout >/dev/null 2>&1; then
  echo "[entrypoint] Adicionando usuário atual ao grupo dialout (se aplicável)..."
  adduser --disabled-password --gecos "" appuser || true
  usermod -a -G dialout appuser || true
  chown -R appuser:appuser /app || true
  chown -R appuser:appuser "${WEB_DIRECTORY}" || true
  exec gosu appuser python /app/server.py
else
  # fallback: roda como root
  exec python /app/server.py
fi

#!/usr/bin/env bash
set -euo pipefail

: "${GIT_REPO:=https://github.com/rbeninca/balancaGFIG}"
: "${GIT_BRANCH:=balanca_serial}"
: "${WEB_DIRECTORY:=/app/data}"
: "${PULL_INTERVAL:=120}"

: "${SERIAL_PORT:=/dev/ttyUSB0}"
: "${SERIAL_BAUD:=921600}"
: "${WS_PORT:=81}"
: "${HTTP_PORT:=80}"   # apenas para log; server.py agora usa 80

export SERIAL_PORT SERIAL_BAUD WS_PORT HTTP_PORT WEB_DIRECTORY

echo "[entrypoint] Repositório: ${GIT_REPO} | Branch: ${GIT_BRANCH}"
echo "[entrypoint] WEB_DIRECTORY: ${WEB_DIRECTORY}"
echo "[entrypoint] Serial: ${SERIAL_PORT} @ ${SERIAL_BAUD}"
echo "[entrypoint] WS: ${WS_PORT} | HTTP: ${HTTP_PORT}"
echo "[entrypoint] Pull interval: ${PULL_INTERVAL}s"

mkdir -p "${WEB_DIRECTORY}"

# Evita 'dubious ownership' do git
git config --global --add safe.directory "${WEB_DIRECTORY}" || true

# Clona ou atualiza
if [ ! -d "${WEB_DIRECTORY}/.git" ]; then
  echo "[entrypoint] Clonando repositório pela primeira vez..."
  rm -rf "${WEB_DIRECTORY:?}"/*
  git clone --depth 1 --branch "${GIT_BRANCH}" "${GIT_REPO}" "${WEB_DIRECTORY}"
else
  echo "[entrypoint] Atualizando repositório existente..."
  git -C "${WEB_DIRECTORY}" fetch origin "${GIT_BRANCH}" --depth 1 || true
  

  # git -C "${WEB_DIRECTORY}" reset --hard "origin/${GIT_BRANCH}" || true
fi

# Loop de atualização em background
(
  while true; do
    sleep "${PULL_INTERVAL}"
    echo "[entrypoint] Verificando atualizações do repositório..."
    OLD_SHA="$(git -C "${WEB_DIRECTORY}" rev-parse HEAD || echo 'unknown')"
    git -C "${WEB_DIRECTORY}" fetch origin "${GIT_BRANCH}" --depth 1 || true
    NEW_SHA="$(git -C "${WEB_DIRECTORY}" rev-parse origin/${GIT_BRANCH} || echo 'unknown')"
    if [ "$OLD_SHA" != "$NEW_SHA" ]; then
      echo "[entrypoint] Novas alterações detectadas. Aplicando..."
      # git -C "${WEB_DIRECTORY}" reset --hard "origin/${GIT_BRANCH}" || true
    else
      echo "[entrypoint] Nenhuma mudança."
    fi
  done
) &

# Roda como root (precisa da serial)
python -m pip install --upgrade pip >/dev/null 2>&1 || true
python -m pip install --no-cache-dir -r /app/requirements.txt >/dev/null 2>&1 || true

# Iniciar Avahi daemon para mDNS
echo "[entrypoint] Configurando Avahi daemon..."
if [ ! -d /var/run/dbus ]; then
  mkdir -p /var/run/dbus
fi

# Iniciar dbus (necessário para Avahi)
echo "[entrypoint] Iniciando dbus..."
dbus-daemon --system --nofork &
DBUS_PID=$!

# Aguardar um pouco para o dbus iniciar
sleep 2

# Iniciar Avahi daemon
echo "[entrypoint] Iniciando Avahi daemon..."
avahi-daemon --syslog &
AVAHI_PID=$!

# Aguardar Avahi iniciar
sleep 2

cd "${WEB_DIRECTORY}"
python /app/server.py
SH

chmod +x balancaDocker/entrypoint.sh
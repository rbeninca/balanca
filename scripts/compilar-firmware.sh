#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIRMWARE_DIR="$ROOT/firmware"
DESTINO="$FIRMWARE_DIR/firmware.bin"
ENV="nodemcuv2"

if ! command -v platformio &>/dev/null; then
  echo "ERRO: platformio não encontrado. Instale com: pip install platformio"
  exit 1
fi

echo "Compilando firmware (ambiente: $ENV)..."
platformio run --environment "$ENV" --project-dir "$FIRMWARE_DIR"

BIN="$FIRMWARE_DIR/.pio/build/$ENV/firmware.bin"
if [ ! -f "$BIN" ]; then
  echo "ERRO: binário não encontrado em $BIN"
  exit 1
fi

cp "$BIN" "$DESTINO"
echo "Firmware compilado: $DESTINO ($(du -h "$DESTINO" | cut -f1))"
echo "Adicione ao commit: git add firmware/firmware.bin firmware/versao.json"

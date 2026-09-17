#!/usr/bin/env bash
# Instala o BalançaGFIG no TX9 e libera o que o hotspot precisa.
#
# O TX9 roda Android 7.1.2 (API 25) mesmo anunciando "10.0", e traz
# net.tethering.noprovisioning=true. Nesse cenário setWifiApEnabled só exige o
# app-op WRITE_SETTINGS. O root (su) é usado pelo app para montar DHCP/NAT do
# hotspot e para obter a permissão USB da balança sem diálogo.
set -euo pipefail

DEVICE="${1:-192.168.1.111:5555}"
PACOTE="br.edu.ifsc.balancagfig"
APK="app/build/outputs/apk/debug/app-debug.apk"

echo "==> Conectando em $DEVICE"
adb connect "$DEVICE" >/dev/null
adb -s "$DEVICE" wait-for-device

if [ ! -f "$APK" ]; then
  echo "==> APK ausente; compilando"
  ./gradlew :app:assembleDebug
fi

echo "==> Instalando APK"
adb -s "$DEVICE" install -r "$APK"

echo "==> Liberando o app-op WRITE_SETTINGS"
adb -s "$DEVICE" shell "su -c 'appops set $PACOTE WRITE_SETTINGS allow'"
adb -s "$DEVICE" shell "su -c 'appops get $PACOTE WRITE_SETTINGS'"

echo "==> Abrindo o app"
adb -s "$DEVICE" shell monkey -p "$PACOTE" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true

cat <<'FIM'

==> Pronto.
    Na primeira execução o Superuser pede root para o app: marque
    "Lembre-se dessa escolha para sempre" e toque em "Permitir".
    Depois disso o app sobe sozinho no boot, liga o hotspot balancaGFIG e
    conecta à balança pela USB sem pedir nada na TV.
FIM

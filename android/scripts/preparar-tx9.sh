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
  NOME_APP="BalançaGFIG"
  SU_DB="/data/data/com.thirdparty.superuser/databases/su.sqlite"

  # uid é atribuído na instalação e varia por aparelho — leia sempre do box
  UID_APP="$(adb -s "$DEVICE" shell dumpsys package "$PACOTE" \
    | tr -d '\r' | sed -n 's/.*userId=\([0-9]*\).*/\1/p' | head -1)"

  # grava a política 'allow' permanente para o app (mesma linha do diálogo "lembrar para sempre")
  SQL="INSERT OR REPLACE INTO uid_policy
   (logging,desired_name,username,policy,until,command,uid,desired_uid,package_name,name,notification)
   VALUES (1,'','','allow',0,'',$UID_APP,0,'$PACOTE','$NOME_APP',1);"

  adb -s "$DEVICE" shell "echo \"$SQL\" > /data/local/tmp/su_policy.sql"
  adb -s "$DEVICE" shell "su -c 'sqlite3 $SU_DB < /data/local/tmp/su_policy.sql'"
  adb -s "$DEVICE" shell "rm -f /data/local/tmp/su_policy.sql"
  # confirma
  adb -s "$DEVICE" shell "su -c 'sqlite3 $SU_DB \"SELECT uid,policy,package_name FROM uid_policy WHERE uid=$UID_APP\"'"


echo "==> Liberando o app-op WRITE_SETTINGS"
adb -s "$DEVICE" shell "su -c 'appops set $PACOTE WRITE_SETTINGS allow'"
adb -s "$DEVICE" shell "su -c 'appops get $PACOTE WRITE_SETTINGS'"

# ── Pré-aprovar a permissão USB da balança (zero-toque) ──────────────────────
# O Android exige "usar por padrão para este dispositivo USB" na 1a vez que um
# app acessa um device USB. Gravamos essa preferência no usb_device_manager.xml,
# lendo os campos do conversor serial conectado (CH340/CP210x/FTDI). Requer a
# balança plugada; efetiva após o reboot no fim do script.
USB_XML="/data/system/users/0/usb_device_manager.xml"

DEV_PATH=""
for d in $(adb -s "$DEVICE" shell "su -c 'ls -d /sys/bus/usb/devices/*/'" | tr -d '\r'); do
  vid=$(adb -s "$DEVICE" shell "su -c 'cat ${d}idVendor 2>/dev/null'" | tr -d '\r ')
  case "$vid" in 1a86|10c4|0403) DEV_PATH="$d"; break ;; esac
done

if [ -z "$DEV_PATH" ]; then
  echo "==> Balanca nao encontrada na USB; pulei a pre-aprovacao USB."
else
  rd() { adb -s "$DEVICE" shell "su -c 'cat ${DEV_PATH}$1 2>/dev/null'" | tr -d '\r '; }
  VID=$((16#$(rd idVendor)));     PID=$((16#$(rd idProduct)))
  CLS=$((16#$(rd bDeviceClass))); SUB=$((16#$(rd bDeviceSubClass))); PRO=$((16#$(rd bDeviceProtocol)))
  PRODNAME=$(adb -s "$DEVICE" shell "su -c 'cat ${DEV_PATH}product 2>/dev/null'" | tr -d '\r')
  printf '%s\n' \
"<?xml version='1.0' encoding='utf-8' standalone='yes' ?>" \
"<settings>" \
"    <preference package=\"$PACOTE\">" \
"        <usb-device vendor-id=\"$VID\" product-id=\"$PID\" class=\"$CLS\" subclass=\"$SUB\" protocol=\"$PRO\" product-name=\"$PRODNAME\" />" \
"    </preference>" \
"</settings>" | adb -s "$DEVICE" shell "su -c 'cat > /data/local/tmp/u.xml'"
  adb -s "$DEVICE" shell "su -c 'cat /data/local/tmp/u.xml > $USB_XML; rm -f /data/local/tmp/u.xml; chown system:system $USB_XML; chmod 600 $USB_XML'"
  echo "==> Permissao USB pre-aprovada para $PACOTE (device $VID:$PID)."
fi

echo "==> Reiniciando o box para efetivar root + USB..."
adb -s "$DEVICE" reboot >/dev/null 2>&1 || true

cat <<'FIM'

==> Pronto. Root e permissao USB pre-aprovados: apos o reboot o app sobe
    sozinho, liga o hotspot balancaGFIG, conecta a balanca e serve tudo pela
    rede — sem nenhum toque na TV.
FIM

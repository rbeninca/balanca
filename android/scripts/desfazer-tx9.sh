#!/usr/bin/env bash
# Desfaz tudo que preparar-tx9.sh fez num box, devolvendo-o ao estado anterior:
# app (e seus dados), política de root no Superuser, app-op WRITE_SETTINGS,
# permissão USB pré-gravada (restaura o arquivo original), regras de NAT e
# hotspot. Reinicia no fim para o tethering e o boot ficarem como eram.
set -euo pipefail

DEVICE="${1:-192.168.1.111:5555}"
PACOTE="br.edu.ifsc.balancagfig"
SU_DB="/data/data/com.thirdparty.superuser/databases/su.sqlite"
USB_XML="/data/system/users/0/usb_device_manager.xml"

echo "==> Conectando em $DEVICE"
adb connect "$DEVICE" 2>&1 | grep -qE "connected to|already connected" || { echo "ERRO: sem ADB em $DEVICE" >&2; exit 1; }
adb -s "$DEVICE" wait-for-device

if adb -s "$DEVICE" shell pm list packages 2>/dev/null | tr -d '\r' | grep -q "^package:$PACOTE$"; then
  UID_APP="$(adb -s "$DEVICE" shell dumpsys package "$PACOTE" | tr -d '\r' | sed -n 's/.*userId=\([0-9]*\).*/\1/p' | head -1)"
  echo "==> Parando o app e desfazendo o que ele configurou em runtime"
  adb -s "$DEVICE" shell "am force-stop $PACOTE" >/dev/null 2>&1 || true
  adb -s "$DEVICE" shell "su -c 'iptables -t nat -D PREROUTING -j balanca_http 2>/dev/null; iptables -t nat -F balanca_http 2>/dev/null; iptables -t nat -X balanca_http 2>/dev/null; while iptables -t nat -D PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 8080 2>/dev/null; do :; done; exit 0'"
  echo "==> Removendo o app-op WRITE_SETTINGS"
  adb -s "$DEVICE" shell "su -c 'appops set $PACOTE WRITE_SETTINGS default'" 2>/dev/null || true
  if [ -n "${UID_APP:-}" ]; then
    echo "==> Removendo a política de root do Superuser (uid $UID_APP)"
    adb -s "$DEVICE" shell "su -c 'test -f $SU_DB && sqlite3 $SU_DB \"DELETE FROM uid_policy WHERE uid=$UID_APP OR package_name=\\\"$PACOTE\\\"\"'" 2>/dev/null || true
  fi
  echo "==> Desinstalando o app (apaga as sessões gravadas no box)"
  adb -s "$DEVICE" uninstall "$PACOTE" | tr -d '\r'
else
  echo "==> App não está instalado; limpando só o restante"
  adb -s "$DEVICE" shell "su -c 'test -f $SU_DB && sqlite3 $SU_DB \"DELETE FROM uid_policy WHERE package_name=\\\"$PACOTE\\\"\"'" 2>/dev/null || true
fi

echo "==> Restaurando a permissão USB"
adb -s "$DEVICE" shell "su -c '
  if [ -e $USB_XML.balanca.ausente ]; then rm -f $USB_XML $USB_XML.balanca.ausente; echo \"    (não existia antes: removido)\";
  elif [ -e $USB_XML.balanca.bak ]; then mv -f $USB_XML.balanca.bak $USB_XML; chown system:system $USB_XML; chmod 600 $USB_XML; echo \"    (original restaurado)\";
  else echo \"    (nada a restaurar)\"; fi'" | tr -d '\r'

echo "==> Desligando o hotspot balancaGFIG (o tethering não persiste ao reboot)"
adb -s "$DEVICE" shell "su -c 'ndc tether stop >/dev/null 2>&1; ndc ipfwd disable >/dev/null 2>&1; exit 0'" || true

echo "==> Reiniciando o box"
adb -s "$DEVICE" reboot >/dev/null 2>&1 || true
cat <<FIM

==> Desfeito. Após o reboot o box está como antes da instalação:
    sem o app, sem política de root, sem WRITE_SETTINGS, permissão USB
    original, sem regras de NAT e sem hotspot.
FIM

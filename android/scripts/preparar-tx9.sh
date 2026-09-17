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

echo "==> Abrindo o app"
adb -s "$DEVICE" shell monkey -p "$PACOTE" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true

cat <<'FIM'

==> Pronto.
    Root pré-aprovado no Superuser: o app sobe sem pedir root na TV. Ele
    inicia no boot, liga o hotspot balancaGFIG e serve tudo pela rede.
    Obs.: na primeira conexao da balanca o Android pode pedir a permissao
    USB uma vez ("usar por padrao para este dispositivo") — depois nao pergunta mais.
FIM

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
IP_BOX="${DEVICE%%:*}"

falhar() { echo; echo "ERRO: $*" >&2; exit 1; }

# ── Pré-checagens: cada falha diz o que fazer ──────────────────────────────
echo "==> Conectando em $DEVICE"
if ! adb connect "$DEVICE" 2>&1 | grep -qE "connected to|already connected"; then
  falhar "não deu para conectar por ADB em $DEVICE.
  - Confira o IP do box (Configurações → Rede na TV, ou a lista DHCP do roteador).
  - O box precisa de ADB pela rede: na TV, Configurações → Sobre → toque 7x em
    'Compilação' para liberar Opções do desenvolvedor → ligue 'Depuração USB' /
    'Depuração pela rede (ADB)'. Alternativa: cabo USB no box e 'adb tcpip 5555'."
fi
adb -s "$DEVICE" wait-for-device
MODELO=$(adb -s "$DEVICE" shell getprop ro.product.model | tr -d '\r')
SDK=$(adb -s "$DEVICE" shell getprop ro.build.version.sdk | tr -d '\r')
echo "    box: ${MODELO:-?} (API $SDK)"

echo "==> Verificando root (su)"
if ! adb -s "$DEVICE" shell "su -c id" 2>/dev/null | tr -d '\r' | grep -q "uid=0"; then
  falhar "o box não deu root ao shell (su). O app precisa de root para o hotspot,
  a permissão USB e a porta 80. Se a TV mostrar um diálogo do Superuser, marque
  'lembrar' e Permitir, e rode de novo. Se não houver Superuser no box, este
  firmware não serve sem root."
fi
SU_DB="/data/data/com.thirdparty.superuser/databases/su.sqlite"
TEM_SU_DB=0
if adb -s "$DEVICE" shell "su -c 'test -f $SU_DB && echo sim'" | tr -d '\r' | grep -q sim; then
  TEM_SU_DB=1
else
  echo "    aviso: banco do Superuser (Koush) não encontrado em $SU_DB — a pré-aprovação"
  echo "    de root do app será pulada; na 1ª abertura marque 'lembrar' e Permitir na TV."
fi

if [ ! -f "$APK" ]; then
  echo "==> APK ausente; compilando"
  ./gradlew :app:assembleDebug
fi

echo "==> Instalando APK ($(du -h "$APK" | cut -f1) — pode levar 1–2 min pela rede)"
if ! adb -s "$DEVICE" install -r "$APK" 2>&1 | tee /dev/stderr | grep -q "Success"; then
  falhar "instalação recusada. Se a mensagem acima for INSTALL_FAILED_UPDATE_INCOMPATIBLE,
  o box tem uma versão assinada com outra chave: 'adb -s $DEVICE uninstall $PACOTE'
  (apaga as sessões gravadas — faça backup pela tela Sessões antes) e rode de novo."
fi
  NOME_APP="BalançaGFIG"
  SU_DB="/data/data/com.thirdparty.superuser/databases/su.sqlite"

  # uid é atribuído na instalação e varia por aparelho — leia sempre do box
  UID_APP="$(adb -s "$DEVICE" shell dumpsys package "$PACOTE" \
    | tr -d '\r' | sed -n 's/.*userId=\([0-9]*\).*/\1/p' | head -1)"
  [ -n "$UID_APP" ] || falhar "não achei o uid do app instalado (dumpsys package)."
  if [ "$TEM_SU_DB" = 1 ]; then

  # grava a política 'allow' permanente para o app (mesma linha do diálogo "lembrar para sempre")
  SQL="INSERT OR REPLACE INTO uid_policy
   (logging,desired_name,username,policy,until,command,uid,desired_uid,package_name,name,notification)
   VALUES (1,'','','allow',0,'',$UID_APP,0,'$PACOTE','$NOME_APP',1);"

  adb -s "$DEVICE" shell "echo \"$SQL\" > /data/local/tmp/su_policy.sql"
  adb -s "$DEVICE" shell "su -c 'sqlite3 $SU_DB < /data/local/tmp/su_policy.sql'"
  adb -s "$DEVICE" shell "rm -f /data/local/tmp/su_policy.sql"
  # confirma
  echo "==> Root pré-aprovado: $(adb -s "$DEVICE" shell "su -c 'sqlite3 $SU_DB \"SELECT uid,policy,package_name FROM uid_policy WHERE uid=$UID_APP\"'" | tr -d '\r')"
  fi


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
  # hubs/raízes não têm idVendor: o cat falha e, com pipefail, mataria o script
  vid=$(adb -s "$DEVICE" shell "su -c 'cat ${d}idVendor 2>/dev/null'" | tr -d '\r ' || true)
  case "$vid" in 1a86|10c4|0403) DEV_PATH="$d"; break ;; esac
done

if [ -z "$DEV_PATH" ]; then
  echo "==> Balanca nao encontrada na USB; pulei a pre-aprovacao USB."
else
  rd() { adb -s "$DEVICE" shell "su -c 'cat ${DEV_PATH}$1 2>/dev/null'" | tr -d '\r ' || true; }
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
  # reversível: guarda o arquivo original (ou marca que não existia) para o desfazer-tx9.sh
  adb -s "$DEVICE" shell "su -c 'if [ ! -e $USB_XML.balanca.bak ] && [ ! -e $USB_XML.balanca.ausente ]; then if [ -f $USB_XML ]; then cp -p $USB_XML $USB_XML.balanca.bak; else touch $USB_XML.balanca.ausente; fi; fi'"
  adb -s "$DEVICE" shell "su -c 'cat /data/local/tmp/u.xml > $USB_XML; rm -f /data/local/tmp/u.xml; chown system:system $USB_XML; chmod 600 $USB_XML'"
  echo "==> Permissao USB pre-aprovada para $PACOTE (device $VID:$PID)."
fi

echo "==> Tudo que foi feito é desfeito por: bash scripts/desfazer-tx9.sh $DEVICE"
echo "==> Reiniciando o box para efetivar root + USB..."
adb -s "$DEVICE" reboot >/dev/null 2>&1 || true

# ── Verificação pós-reboot: o app subiu sozinho? ───────────────────────────
echo "==> Aguardando o box voltar (até 3 min)..."
adb disconnect "$DEVICE" >/dev/null 2>&1 || true
OK=0
for i in $(seq 1 36); do
  sleep 5
  if curl -s -m 3 "http://$IP_BOX:3000/saude" 2>/dev/null | grep -q '"status":"ok"'; then OK=1; break; fi
done
if [ "$OK" != 1 ]; then
  falhar "o box voltou mas a API (http://$IP_BOX:3000/saude) não respondeu em 3 min.
  Olhe a TV: se houver um diálogo do Superuser, aceite com 'lembrar'. Depois:
  adb connect $DEVICE && adb -s $DEVICE logcat -d | grep -E 'ServicoBalanca|Hotspot'"
fi
adb connect "$DEVICE" >/dev/null 2>&1 || true
sleep 2
VERSAO=$(adb -s "$DEVICE" shell dumpsys package "$PACOTE" 2>/dev/null | tr -d '\r' | sed -n 's/.*versionName=\([^ ]*\).*/\1/p' | head -1)
HOTSPOT=$(adb -s "$DEVICE" shell "ip addr show wlan0 2>/dev/null" | tr -d '\r' | grep -o "inet 192\.168\.43\.1" || true)
SAUDE=$(curl -s -m 5 "http://$IP_BOX:3000/saude" 2>/dev/null)
WS=$(node -e "
const ws = new WebSocket('ws://$IP_BOX:8765'); let s = 'sem SAUDE';
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.tipo === 'SAUDE') { s = 'serial ' + m.carga.serial + ', ' + m.carga.taxaHz + ' Hz'; ws.close(); } });
setTimeout(() => { console.log(s); process.exit(0); }, 4000);" 2>/dev/null || echo "node indisponível")
FRONT=$(curl -s -m 5 -o /dev/null -w "%{http_code}" "http://$IP_BOX/" 2>/dev/null || echo "?")

cat <<FIM

==> Pronto. Verificação após o reboot:
    app instalado ........ ${VERSAO:-?}
    API :3000 ............ ${SAUDE:-sem resposta}
    frontend http://$IP_BOX ... HTTP ${FRONT}
    WebSocket :8765 ...... ${WS}
    hotspot balancaGFIG .. $([ -n "$HOTSPOT" ] && echo "ligado (192.168.43.1)" || echo "NÃO ligado — veja o logcat")
    Sem nenhum toque na TV o app sobe no boot, liga o hotspot, conecta a
    balança e serve tudo pela rede. Se a balança não estava plugada durante a
    instalação, plugue agora: o app conecta sozinho (a permissão USB é
    concedida pelo Android na 1ª vez; se aparecer um diálogo na TV, marque
    'usar por padrão' e OK).
FIM

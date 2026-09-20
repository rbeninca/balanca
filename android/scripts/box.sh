#!/usr/bin/env bash
# BalançaGFIG num TV box: instalar, desfazer ou conferir — passando só o IP.
#
#   bash scripts/box.sh 192.168.1.110              # ciclo: desfaz e reinstala
#   bash scripts/box.sh estado    192.168.1.110
#   bash scripts/box.sh desfazer  192.168.1.110
#   bash scripts/box.sh instalar  192.168.1.110
#
# (a ordem dos argumentos é livre; `--sim` pula a confirmação do desfazer)
#
# Serve aos dois firmwares em uso, detectando sozinho qual é:
#
#   TX9  (Amlogic gxl)      Superuser Koush. O setWifiApEnabled do framework
#                           funciona, então o AP sobe direto.
#   MXQ  (Rockchip rk322x)  SuperSU Chainfire, que já libera root por padrão.
#                           O framework recusa o setWifiApEnabled de apps de
#                           terceiros (bug na linha 609 do WifiServiceImpl) e
#                           o app liga o AP pela tela do Settings — ver
#                           sistema/HotspotManager.kt.
#
# O desfazer APAGA as sessões gravadas no box (o `adb uninstall` remove os
# dados do app). Exporte antes pela tela Sessões se elas importarem.
set -euo pipefail

PACOTE="br.edu.ifsc.balancagfig"
APK="app/build/outputs/apk/debug/app-debug.apk"

# Launcher próprio (projeto separado, em ../launcherbox). O componente é o que
# vira tela inicial; o arquivo no box guarda a tela inicial ANTERIOR, para o
# 'launcher-desfazer' saber a quem devolver.
LAUNCHER_PACOTE="com.ifsc.laucherbox"
LAUNCHER_COMPONENTE="com.ifsc.laucherbox/.MainActivity"
LAUNCHER_APK="../launcherbox/app/build/outputs/apk/debug/app-debug.apk"
HOME_GUARDADO="/data/local/tmp/launcherbox.home-anterior"
SU_DB_KOUSH="/data/data/com.thirdparty.superuser/databases/su.sqlite"
USB_XML="/data/system/users/0/usb_device_manager.xml"

TAREFA=""; IP=""; SIM=0
for arg in "$@"; do
  case "$arg" in
    instalar|desfazer|estado|ciclo|launcher|launcher-desfazer) TAREFA="$arg" ;;
    --sim|-y) SIM=1 ;;
    *[0-9].[0-9]*) IP="$arg" ;;
    -h|--help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "não entendi o argumento '$arg'" >&2; exit 2 ;;
  esac
done
[ -n "$IP" ] || { echo "uso: bash scripts/box.sh [instalar|desfazer|estado|ciclo|launcher|launcher-desfazer] <IP> [--sim]" >&2; exit 2; }
[ -n "$TAREFA" ] || TAREFA="ciclo"
DEVICE="$IP:5555"

MODELO=""; PLATAFORMA=""; SDK=""; ROOT_MGR=""

# ── utilidades ─────────────────────────────────────────────────────────────
falhar() { echo; echo "ERRO: $*" >&2; exit 1; }
sh_()  { adb -s "$DEVICE" shell "$1" 2>/dev/null | tr -d '\r'; }
# Como root. O comando vai entre aspas simples, então NÃO pode conter aspas
# simples — para os casos complexos use script_raiz.
shu()  { adb -s "$DEVICE" shell "su -c '$1'" 2>/dev/null | tr -d '\r'; }

# SSID do AP em vigor, ou vazio se o hotspot está desligado.
hotspot_atual() {
  shu "iw dev wlan0 info 2>/dev/null | grep ssid | head -1" | tr -d '\r' | sed 's/^[[:space:]]*//'
}

# Estado da serial pelo WebSocket (o app publica SAUDE a cada 2 s).
estado_serial() {
  node -e "
    const w = new WebSocket('ws://$IP:8765');
    w.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.tipo === 'SAUDE') {
        console.log('serial ' + m.carga.serial + ', ' + m.carga.taxaHz + ' Hz'
          + (m.carga.taxaHz === 0 ? ' (porta aberta, mas o ESP não está enviando)' : ''));
        w.close(); process.exit(0);
      }
    });
    w.addEventListener('error', () => { console.log('sem resposta'); process.exit(0); });
    setTimeout(() => { console.log('sem resposta'); process.exit(0); }, 5000);" 2>/dev/null \
    || echo "node indisponível"
}

# Envia um script e roda como root — evita o inferno de aspas do adb shell.
script_raiz() {
  adb -s "$DEVICE" push "$1" /data/local/tmp/box-tmp.sh >/dev/null 2>&1
  adb -s "$DEVICE" shell 'su -c "sh /data/local/tmp/box-tmp.sh"' 2>/dev/null | tr -d '\r'
  adb -s "$DEVICE" shell "rm -f /data/local/tmp/box-tmp.sh" >/dev/null 2>&1 || true
}

conectar() {
  echo "==> Conectando em $DEVICE"
  local tentativa
  for tentativa in 1 2 3; do
    timeout 15 adb connect "$DEVICE" 2>&1 | grep -qE "connected to|already connected" && break
    adb disconnect "$DEVICE" >/dev/null 2>&1 || true
    sleep 2
  done
  # `adb wait-for-device` sem timeout espera para sempre quando o box não
  # existe — o script ficava pendurado em vez de dizer o que houve.
  if ! timeout 20 adb -s "$DEVICE" wait-for-device 2>/dev/null; then
    echo "    não consegui ADB em $DEVICE." >&2
    sugerir_ips
    falhar "confira o IP do box.
  - O IP muda: LAN por DHCP, ou 192.168.43.1 quando conectado no hotspot dele.
  - Na TV: Opções do desenvolvedor → 'Depuração pela rede (ADB)'.
  - Alternativa: cabo USB e 'adb tcpip 5555'."
  fi
}

# Varredura da /24 por hosts com a porta do ADB aberta, só para sugerir o IP
# certo quando a conexão falha. Rápido: os testes correm em paralelo.
sugerir_ips() {
  local rede="${IP%.*}"
  echo "    varrendo $rede.0/24 por ADB..." >&2
  for i in $(seq 1 254); do
    ( timeout 1 bash -c "echo > /dev/tcp/$rede.$i/5555" 2>/dev/null && echo "    achei: $rede.$i" >&2 ) &
  done
  wait
}

detectar() {
  MODELO=$(sh_ "getprop ro.product.model")
  PLATAFORMA=$(sh_ "getprop ro.board.platform")
  SDK=$(sh_ "getprop ro.build.version.sdk")
  local pacotes; pacotes=$(sh_ "pm list packages")
  if   grep -q "com.thirdparty.superuser" <<<"$pacotes"; then ROOT_MGR="Koush (Superuser)"
  elif grep -q "eu.chainfire.supersu"      <<<"$pacotes"; then ROOT_MGR="Chainfire (SuperSU)"
  else ROOT_MGR="nenhum"; fi
  echo "    box: ${MODELO:-?} · ${PLATAFORMA:-?} · API ${SDK:-?} · root: $ROOT_MGR"
}

exigir_root() {
  shu "id" | grep -q "uid=0" && return 0
  falhar "o box não deu root ao shell (su). Sem root o app não monta o
  hotspot nem pré-aprova a permissão USB. Se a TV mostrar um diálogo do
  Superuser, marque 'lembrar' e Permitir, e rode de novo."
}

# ── estado ─────────────────────────────────────────────────────────────────
fase_estado() {
  conectar; detectar
  echo
  local v; v=$(sh_ "dumpsys package $PACOTE" | sed -n 's/.*versionName=\([^ ]*\).*/\1/p' | head -1)
  echo "    app instalado ........ ${v:-NÃO}"
  echo "    WRITE_SETTINGS ....... $(shu "appops get $PACOTE WRITE_SETTINGS" | head -1 | sed 's/^ *//')"
  echo "    API :3000 ............ $(curl -s -m 5 "http://$IP:3000/saude" || echo 'sem resposta')"
  echo "    frontend :80 ......... HTTP $(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://$IP/" 2>/dev/null || echo '?')"
  echo "    WebSocket :8765 ...... $(estado_serial)"
  local ap; ap=$(hotspot_atual)
  echo "    hotspot .............. ${ap:-desligado}"
  local usbperm; usbperm=$(sh_ "dumpsys usb" | sed -n '/Device permissions/{n;p}' | sed 's/^ *//')
  echo "    permissão USB ........ ${usbperm:-nenhuma concedida}"

  echo
  echo "    redes:"
  listar_redes
  echo
  echo "    disco:"
  listar_disco
  echo
  listar_apps
}

# Interfaces com MAC, IP e estado. Vem de duas saídas do `ip` porque uma não
# traz MAC e a outra não traz o estado do link.
listar_redes() {
  local links ips linha nome mac estado ip4
  links=$(sh_ "ip -o link show 2>/dev/null")
  ips=$(sh_ "ip -4 -o addr show 2>/dev/null")
  while IFS= read -r linha; do
    [ -n "$linha" ] || continue
    nome=$(sed 's/^[0-9]*: \([^:]*\):.*/\1/' <<<"$linha"); nome=${nome%%@*}
    mac=$(sed -n 's/.*link\/\(ether\|loopback\) \([0-9a-f:]*\).*/\2/p' <<<"$linha")
    estado=$(sed -n 's/.*state \([A-Z]*\).*/\1/p' <<<"$linha")
    ip4=$(sed -n "s/^[0-9]*: *$nome .*inet \([0-9.]*\/[0-9]*\).*/\1/p" <<<"$ips")
    printf '      %-8s %-18s %-18s %s\n' "$nome" "${mac:---}" "${ip4:---}" "${estado:---}"
  done <<<"$links"
}

listar_disco() {
  sh_ "df -h 2>/dev/null" | grep -vE '^tmpfs' | tail -n +2 \
    | while read -r _ tamanho usado livre pct ponto; do
        printf '      %-22s %6s  %8s usados  %8s livres  %5s\n' \
          "$ponto" "$tamanho" "$usado" "$livre" "$pct"
      done
}

listar_apps() {
  echo "    apps de terceiros (instalados em /data):"
  sh_ "pm list packages -3" | sed 's/^package://' | sort | sed 's/^/      /'
  echo
  echo "    apps de sistema:"
  sh_ "pm list packages -s" | sed 's/^package://' | sort | paste -sd' ' - \
    | fold -s -w 96 | sed 's/^/      /'
}

# ── desfazer ───────────────────────────────────────────────────────────────
fase_desfazer() {
  conectar; detectar
  echo "==> DESFAZENDO a instalação em $IP"
  echo "    (as sessões gravadas no box serão apagadas junto com o app)"
  if [ "$SIM" != 1 ] && [ -t 0 ]; then
    read -r -p "    confirma? [s/N] " r; [ "${r,,}" = "s" ] || { echo "    abortado."; exit 1; }
  fi

  local uid_app=""
  if sh_ "pm list packages" | grep -q "^package:$PACOTE$"; then
    uid_app=$(sh_ "dumpsys package $PACOTE" | sed -n 's/.*userId=\([0-9]*\).*/\1/p' | head -1)
    echo "==> Parando o app e desfazendo o que ele configurou em runtime"
    sh_ "am force-stop $PACOTE" >/dev/null || true
    shu "iptables -t nat -D PREROUTING -j balanca_http 2>/dev/null; iptables -t nat -F balanca_http 2>/dev/null; iptables -t nat -X balanca_http 2>/dev/null; while iptables -t nat -D PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 8080 2>/dev/null; do :; done; exit 0" >/dev/null || true
    echo "==> Devolvendo o app-op WRITE_SETTINGS ao padrão"
    shu "appops set $PACOTE WRITE_SETTINGS default" >/dev/null || true

    if [ "$ROOT_MGR" = "Koush (Superuser)" ] && [ -n "$uid_app" ]; then
      echo "==> Removendo a política de root do Superuser (uid $uid_app)"
      shu "test -f $SU_DB_KOUSH && sqlite3 $SU_DB_KOUSH \"DELETE FROM uid_policy WHERE uid=$uid_app OR package_name=\\\"$PACOTE\\\"\"" >/dev/null || true
    elif [ "$ROOT_MGR" = "Chainfire (SuperSU)" ]; then
      echo "==> Root: o SuperSU deste box libera por padrão, não guarda política por app"
    fi

    echo "==> Desinstalando o app"
    adb -s "$DEVICE" uninstall "$PACOTE" 2>&1 | tr -d '\r'
  else
    echo "==> O app não está instalado; limpando só o resto"
    shu "test -f $SU_DB_KOUSH && sqlite3 $SU_DB_KOUSH \"DELETE FROM uid_policy WHERE package_name=\\\"$PACOTE\\\"\"" >/dev/null || true
  fi

  echo "==> Restaurando a permissão USB"
  shu "if [ -e $USB_XML.balanca.ausente ]; then rm -f $USB_XML $USB_XML.balanca.ausente; echo \"    (não existia antes: removido)\";
       elif [ -e $USB_XML.balanca.bak ]; then mv -f $USB_XML.balanca.bak $USB_XML; chown system:system $USB_XML; chmod 600 $USB_XML; echo \"    (original restaurado)\";
       else echo \"    (nada a restaurar)\"; fi"

  echo "==> Desligando o hotspot"
  if [ "$PLATAFORMA" = "gxl" ]; then
    shu "ndc tether stop >/dev/null 2>&1; ndc ipfwd disable >/dev/null 2>&1; exit 0" >/dev/null || true
    echo "    (tethering parado; o tethering do TX9 não persiste ao reboot)"
  else
    echo "    (no rk322x o AP não persiste: sai no reboot do fim do script)"
  fi

  echo "==> Reiniciando o box"
  adb -s "$DEVICE" reboot >/dev/null 2>&1 || true
  aguardar_voltar nao
}

# ── instalar ───────────────────────────────────────────────────────────────
fase_instalar() {
  conectar; detectar
  exigir_root

  if [ ! -f "$APK" ]; then
    echo "==> APK ausente; compilando"
    (cd "$(dirname "$APK")/../../.." && ./gradlew :app:assembleDebug)
  fi

  echo "==> Instalando APK ($(du -h "$APK" | cut -f1) — pode levar 1–2 min pela rede)"
  local saida; saida=$(adb -s "$DEVICE" install -r "$APK" 2>&1 | tr -d '\r' || true)
  echo "    $(tail -2 <<<"$saida" | tr '\n' ' ')"
  if ! grep -q "Success" <<<"$saida"; then
    falhar "instalação recusada. Se a mensagem acima for INSTALL_FAILED_UPDATE_INCOMPATIBLE,
  o box tem uma versão assinada com outra chave: rode 'desfazer' primeiro
  (apaga as sessões gravadas) e tente de novo."
  fi

  local uid_app; uid_app=$(sh_ "dumpsys package $PACOTE" | sed -n 's/.*userId=\([0-9]*\).*/\1/p' | head -1)
  [ -n "$uid_app" ] || falhar "não achei o uid do app instalado (dumpsys package)."

  if [ "$ROOT_MGR" = "Koush (Superuser)" ] && shu "test -f $SU_DB_KOUSH && echo sim" | grep -q sim; then
    echo "==> Pré-aprovando o root do app (uid $uid_app) no Superuser"
    local sql="INSERT OR REPLACE INTO uid_policy
   (logging,desired_name,username,policy,until,command,uid,desired_uid,package_name,name,notification)
   VALUES (1,'','','allow',0,'',$uid_app,0,'$PACOTE','BalançaGFIG',1);"
    sh_ "echo \"$sql\" > /data/local/tmp/su_policy.sql" >/dev/null
    shu "sqlite3 $SU_DB_KOUSH < /data/local/tmp/su_policy.sql" >/dev/null
    sh_ "rm -f /data/local/tmp/su_policy.sql" >/dev/null
    echo "    $(shu "sqlite3 $SU_DB_KOUSH \"SELECT uid,policy,package_name FROM uid_policy WHERE uid=$uid_app\"")"
  else
    echo "==> Root: sem banco do Koush — no SuperSU (MXQ) o root já é liberado por padrão."
    echo "    Se este box pedir confirmação na TV, marque 'lembrar' e Permitir."
  fi

  echo "==> Liberando o app-op WRITE_SETTINGS (hotspot)"
  shu "appops set $PACOTE WRITE_SETTINGS allow" >/dev/null
  shu "appops get $PACOTE WRITE_SETTINGS"

  # A permissão USB vem ANTES de abrir o app: ao subir, o app reenumera o
  # conversor (derruba e recria o device), e ler os descritores nessa janela
  # falha com "balança não encontrada".
  pre_aprovar_usb

  # Um pacote recém-instalado fica no estado "stopped", e nesse estado o
  # Android NÃO entrega o BOOT_COMPLETED — o app só subiria se alguém o
  # abrisse na TV. Abrir uma vez tira o pacote do estado parado, e daí em
  # diante ele sobe sozinho em todo boot. Confiro a flag em vez de confiar
  # num atraso fixo: uma vez ela não firmou e o app não subiu no boot.
  echo "==> Abrindo o app uma vez (tira o pacote do estado 'parado')"
  local parado=""
  for tentativa in 1 2 3; do
    sh_ "am start -n $PACOTE/.MainActivity" >/dev/null 2>&1 || true
    sleep 6
    parado=$(sh_ "dumpsys package $PACOTE" | grep -o "stopped=[a-z]*" | head -1)
    [ "$parado" = "stopped=false" ] && break
    echo "    ainda '$parado' (tentativa $tentativa); abrindo de novo"
  done
  if [ "$parado" = "stopped=false" ]; then
    echo "    pacote liberado (stopped=false)"
  else
    echo "    ATENÇÃO: o pacote continua '$parado' — o app pode não subir no boot."
    echo "    Abra o app uma vez na TV e rode 'instalar' de novo."
  fi

  echo
  echo "==> Tudo que foi feito é desfeito por: bash scripts/box.sh desfazer $IP"
  # O `stopped=false` que o `am start` deixou é gravado de forma assíncrona
  # pelo PackageManagerService. Sem esta pausa, um reboot logo em seguida
  # perde a gravação e o app não recebe o BOOT_COMPLETED no boot.
  echo "==> Deixando o box assentar antes do reboot (gravação das configurações)"
  sleep 20
  echo "==> Reiniciando o box para efetivar root + USB..."
  adb -s "$DEVICE" reboot >/dev/null 2>&1 || true
  aguardar_voltar sim
  garantir_app_rodando
  verificar_pos_reboot
}

# Se o app não subiu sozinho, abre uma vez pela rede. O `stopped` que o
# `am start` limpa é gravado de forma assíncrona pelo PackageManagerService, e
# um reboot logo em seguida pode perder a gravação — daí o app não receber o
# BOOT_COMPLETED. Abrir pela rede não é toque na TV, e a partir daí o pacote
# sobe sozinho em todo boot.
garantir_app_rodando() {
  sh_ "pidof $PACOTE" | grep -q . && return 0
  echo "==> O app não subiu no boot; abrindo pela rede (sem toque na TV)"
  sh_ "am start -n $PACOTE/.MainActivity" >/dev/null 2>&1 || true
  for _ in $(seq 1 12); do
    sleep 5
    curl -s -m 3 "http://$IP:3000/saude" 2>/dev/null | grep -q '"status":"ok"' && return 0
  done
  return 0
}

# Pré-aprova a permissão USB gravando o VID:PID do conversor no
# usb_device_manager.xml (efetiva após o reboot). Guarda o original para o
# desfazer — ou marca que não existia.
pre_aprovar_usb() {
  # diretório próprio: dois boxes rodando ao mesmo tempo não se atrapalham
  local tmp; tmp=$(mktemp -d)
  cat > "$tmp/ler.sh" <<'SCRIPT'
# Procura o conversor, insistindo: ele some do barramento por alguns segundos
# quando o app reenumera a USB.
DEV_PATH=""
for tentativa in 1 2 3 4 5; do
  for d in $(ls -d /sys/bus/usb/devices/*/ 2>/dev/null); do
    vid=$(cat ${d}idVendor 2>/dev/null || true)
    case "$vid" in 1a86|10c4|0403) DEV_PATH="$d"; break ;; esac
  done
  [ -n "$DEV_PATH" ] && break
  sleep 2
done
if [ -z "$DEV_PATH" ]; then echo "CPULE"; exit 0; fi
rd() { cat ${DEV_PATH}$1 2>/dev/null | tr -d ' \r'; }
VID=$((16#$(rd idVendor))); PID=$((16#$(rd idProduct)))
CLS=$((16#$(rd bDeviceClass))); SUB=$((16#$(rd bDeviceSubClass))); PRO=$((16#$(rd bDeviceProtocol)))
PRODNAME=$(cat ${DEV_PATH}product 2>/dev/null || true)
echo "DADOS $VID $PID $CLS $SUB $PRO $PRODNAME"
SCRIPT
  local saida; saida=$(script_raiz "$tmp/ler.sh")
  if grep -q CPULE <<<"$saida"; then
    rm -rf "$tmp"
    echo "==> Balança não encontrada na USB; pulei a pré-aprovação USB."
    echo "    (plugue e rode 'instalar' de novo, ou deixe que o app peça na 1ª vez)"
    return 0
  fi
  local vid pid cls sub pro prodname
  read -r _ vid pid cls sub pro prodname <<<"$(grep DADOS <<<"$saida")"

  cat > "$tmp/usb.xml" <<XML
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<settings>
    <preference package="$PACOTE">
        <usb-device vendor-id="$vid" product-id="$pid" class="$cls" subclass="$sub" protocol="$pro" product-name="$prodname" />
    </preference>
</settings>
XML
  adb -s "$DEVICE" push "$tmp/usb.xml" /data/local/tmp/box-usb.xml >/dev/null 2>&1
  cat > "$tmp/gravar.sh" <<SCRIPT
if [ ! -e $USB_XML.balanca.bak ] && [ ! -e $USB_XML.balanca.ausente ]; then
  if [ -f $USB_XML ]; then cp -p $USB_XML $USB_XML.balanca.bak; else touch $USB_XML.balanca.ausente; fi
fi
cat /data/local/tmp/box-usb.xml > $USB_XML
rm -f /data/local/tmp/box-usb.xml
chown system:system $USB_XML; chmod 600 $USB_XML
echo "gravado"
SCRIPT
  script_raiz "$tmp/gravar.sh" >/dev/null
  rm -rf "$tmp"
  echo "==> Permissão USB pré-aprovada para $PACOTE (device $vid:$pid $prodname)."
}

# Espera o box voltar. `esperar_app=sim` aguarda a API responder (só faz
# sentido depois de instalar); `nao` só espera o box responder na rede, que é
# o caso do desfazer — ali o app foi removido e a API não vai subir mesmo.
aguardar_voltar() {
  local esperar_app="$1"
  echo "==> Aguardando o box voltar (até 4 min)..."
  adb disconnect "$DEVICE" >/dev/null 2>&1 || true
  sleep 10
  local ok=0
  for _ in $(seq 1 48); do
    if [ "$esperar_app" = "sim" ]; then
      curl -s -m 3 "http://$IP:3000/saude" 2>/dev/null | grep -q '"status":"ok"' && { ok=1; break; }
    else
      ping -c1 -W1 "$IP" >/dev/null 2>&1 && { ok=1; break; }
    fi
    sleep 5
  done
  [ "$ok" = 1 ] || echo "    (não confirmei que voltou; confira com: bash scripts/box.sh estado $IP)"
  sleep 8
  adb connect "$DEVICE" >/dev/null 2>&1 || true
  adb -s "$DEVICE" wait-for-device 2>/dev/null || true
}

verificar_pos_reboot() {
  local versao saude ws front ap
  versao=$(sh_ "dumpsys package $PACOTE" | sed -n 's/.*versionName=\([^ ]*\).*/\1/p' | head -1 || true)
  saude=$(curl -s -m 5 "http://$IP:3000/saude" 2>/dev/null || true)
  front=$(curl -s -m 5 -o /dev/null -w "%{http_code}" "http://$IP/" 2>/dev/null || echo "?")
  ws=$(estado_serial)
  ap=$(hotspot_atual)
  cat <<FIM

==> Pronto. Verificação após o reboot:
    app instalado ........ ${versao:-?}
    API :3000 ............ ${saude:-sem resposta}
    frontend http://$IP ... HTTP $front
    WebSocket :8765 ...... $ws
    hotspot .............. ${ap:-NÃO ligado — veja o logcat}
FIM
  if [ -n "$versao" ] && grep -q '"status":"ok"' <<<"$saude"; then
    cat <<FIM
    RESULTADO: OK — sem nenhum toque na TV o app sobe no boot, liga o
    hotspot, conecta a balança e serve tudo pela rede.
FIM
  else
    cat <<FIM
    RESULTADO: FALHOU — o app não está servindo. Diagnóstico:
      adb -s $DEVICE logcat -d | grep -E 'ServicoBalanca|HotspotManager|AutorizacaoUsb'
      adb -s $DEVICE shell "dumpsys package $PACOTE | grep -o 'stopped=[a-z]*'"
FIM
  fi
}

# ── ciclo ──────────────────────────────────────────────────────────────────
fase_ciclo() {
  echo "### CICLO COMPLETO em $IP: desfazer e reinstalar ###"
  echo
  fase_desfazer
  echo
  echo "### Reinstalando ###"
  echo
  fase_instalar
}

# ── launcher próprio ───────────────────────────────────────────────────────

# Componente que responde como tela inicial agora.
home_atual() {
  sh_ "cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME" \
    | tail -1 | tr -d '\r' | sed 's/^[[:space:]]*//'
}

# Candidatos a tela inicial, menos o nosso.
outros_homes() {
  sh_ "cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME" \
    | tr -d '\r' | sed 's/^[[:space:]]*//' | grep '/' | grep -v "^$LAUNCHER_PACOTE/" | sort -u
}

# Instala o launcherbox e o define como tela inicial, guardando a anterior.
# O `cmd package set-home-activity` existe no API 25 — o `pm`, que seria o
# comando natural, NÃO tem essa opção nessa versão.
fase_launcher() {
  conectar; detectar
  echo "==> Instalando o launcher próprio em $IP"

  [ -f "$LAUNCHER_APK" ] || falhar "APK do launcher ausente.
  Compile antes:  (cd ../launcherbox && ./gradlew :app:assembleDebug)"

  local anterior; anterior=$(home_atual)
  echo "    tela inicial atual: ${anterior:-não identifiquei}"

  # guarda a anterior só se ainda não houver registro — assim rodar 'launcher'
  # duas vezes não sobrescreve o original com o nosso próprio componente
  if [ -n "$anterior" ] && [ "$anterior" != "$LAUNCHER_COMPONENTE" ] \
     && [ -z "$(sh_ "cat $HOME_GUARDADO 2>/dev/null" | tr -d '\r')" ]; then
    sh_ "echo '$anterior' > $HOME_GUARDADO"
    echo "    guardado para o desfazer: $anterior"
  fi

  local saida; saida=$(adb -s "$DEVICE" install -r "$LAUNCHER_APK" 2>&1 | tr -d '\r' || true)
  echo "    $(tail -1 <<<"$saida")"
  grep -q "Success" <<<"$saida" || falhar "instalação do launcher recusada."

  # tira o pacote do estado 'parado', senão ele não recebe BOOT_COMPLETED
  sh_ "am start -n $LAUNCHER_COMPONENTE" >/dev/null 2>&1 || true
  sleep 4

  # no TX9 o Koush pré-aprova root POR UID, e o launcher tem UID novo — sem
  # isto ele pediria root na TV, onde não há quem clique
  if [ "$ROOT_MGR" = "Koush (Superuser)" ]; then
    local uid; uid=$(sh_ "dumpsys package $LAUNCHER_PACOTE" | sed -n 's/.*userId=\([0-9]*\).*/\1/p' | head -1)
    if [ -n "$uid" ]; then
      echo "==> Pré-aprovando o root do launcher (uid $uid) no Superuser"
      local sql="INSERT OR REPLACE INTO uid_policy
   (logging,desired_name,username,policy,until,command,uid,desired_uid,package_name,name,notification)
   VALUES (0,'','','allow',0,'',$uid,0,'$LAUNCHER_PACOTE','Painel GFIG',0);"
      sh_ "echo \"$sql\" > /data/local/tmp/lb_policy.sql" >/dev/null
      shu "sqlite3 $SU_DB_KOUSH < /data/local/tmp/lb_policy.sql" >/dev/null || true
      sh_ "rm -f /data/local/tmp/lb_policy.sql" >/dev/null
    fi
  else
    echo "==> Root: no SuperSU deste box o launcher já ganha root sozinho."
  fi

  echo "==> Definindo como tela inicial"
  shu "cmd package set-home-activity $LAUNCHER_COMPONENTE" >/dev/null || true
  local agora; agora=$(home_atual)
  if [ "$agora" = "$LAUNCHER_COMPONENTE" ]; then
    echo "    tela inicial agora: $agora"
  else
    echo "    ATENÇÃO: continua '$agora' — o sistema recusou a troca."
    echo "    (o launcher está instalado; dá para escolhê-lo no seletor da TV)"
  fi

  echo
  echo "==> Para devolver a tela inicial anterior: bash scripts/box.sh launcher-desfazer $IP"
}

# Devolve a tela inicial que estava antes. O launcher NÃO é desinstalado: sai
# do caminho como Home e continua abrível pela lista de apps — assim dá para
# voltar atrás sem perder o app.
fase_launcher_desfazer() {
  conectar; detectar
  echo "==> Devolvendo a tela inicial de $IP"

  local destino; destino=$(sh_ "cat $HOME_GUARDADO 2>/dev/null" | tr -d '\r' | sed 's/^[[:space:]]*//')

  if [ -z "$destino" ]; then
    echo "    não há registro da tela inicial anterior; procurando candidatos"
    destino=$(outros_homes | head -1)
  fi

  if [ -z "$destino" ]; then
    falhar "não achei nenhuma outra tela inicial neste box.
  O launcher segue instalado: escolha outra no seletor da TV, ou desinstale
  com 'adb -s $DEVICE uninstall $LAUNCHER_PACOTE'."
  fi

  echo "    devolvendo para: $destino"
  shu "cmd package set-home-activity $destino" >/dev/null || true

  local agora; agora=$(home_atual)
  if [ "$agora" = "$destino" ]; then
    echo "    tela inicial agora: $agora"
    sh_ "rm -f $HOME_GUARDADO" >/dev/null
  else
    falhar "o sistema não aceitou '$destino' (continua '$agora')."
  fi

  echo
  echo "    O launcher continua instalado — abra pela lista de apps."
  echo "    Para removê-lo de vez: adb -s $DEVICE uninstall $LAUNCHER_PACOTE"
}

case "$TAREFA" in
  estado)            fase_estado ;;
  desfazer)          fase_desfazer ;;
  instalar)          fase_instalar ;;
  ciclo)             fase_ciclo ;;
  launcher)          fase_launcher ;;
  launcher-desfazer) fase_launcher_desfazer ;;
esac

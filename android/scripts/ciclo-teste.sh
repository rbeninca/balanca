#!/usr/bin/env bash
# Ciclo de teste no box: sobe o APK com as modificações e depois devolve o APK
# guardado, deixando o box com atualização pendente para testar o caminho da web.
#
#   bash scripts/ciclo-teste.sh modificada            # build limpo + instala o APK local
#   bash scripts/ciclo-teste.sh modificada 192.168.1.16
#   bash scripts/ciclo-teste.sh guardada              # devolve o APK guardado
#   bash scripts/ciclo-teste.sh situacao              # versões e linha no painel
#
# (a ordem dos argumentos é livre. BALANCA_BOX troca o IP padrão, 192.168.1.17;
#  BALANCA_GUARDADO aponta para outra pasta de APKs guardados, o padrão é
#  ~/backups/balanca/apk-<versão>/ com o .apk e o manifest.json ao lado.)
#
# 'modificada' compila com `clean` de propósito: o compileDebugKotlin
# incremental reaproveita a classe do arquivo que não mudou e mantém inlinada a
# constante velha do BuildConfig — o APK sai com PAINEL_URL/PAINEL_CHAVE vazios,
# o box some do painel e nada dá erro em lugar nenhum. Depois de instalar, o
# script espera a batida chegar no painel, que é a prova de que o APK subiu
# inteiro.
#
# 'guardada' confere o sha256 contra o manifest.json antes de instalar, libera o
# pacote do estado 'parado' (parado, o Android não entrega o BOOT_COMPLETED e o
# app não subiria no boot) e reinicia. O rebaixamento é o objetivo: é ele que
# deixa o box devendo uma atualização, que é o que se quer testar.
#
# A verificação de atualização é automática (uns 30 s depois do boot, e a cada
# 6 h), mas a INSTALAÇÃO não é: o app só consulta e monta o plano, quem dispara
# é o usuário — o botão na tela da TV, ou POST /atualizacao/iniciar com a chave
# da API. O script espera a versão subir depois desse disparo.
#
# A chave do painel sai do chaves.properties direto para o curl — não é
# impressa em lugar nenhum.
set -euo pipefail

# Roda do android/, não importa de onde foi chamado.
cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.."

PACOTE="br.edu.ifsc.balancagfig"
APK="app/build/outputs/apk/debug/app-debug.apk"
CHAVES="chaves/chaves.properties"
GUARDADO="${BALANCA_GUARDADO:-$HOME/backups/balanca}"

TAREFA=""; IP="${BALANCA_BOX:-192.168.1.17}"; IP="${IP%%:*}"
for arg in "$@"; do
  case "$arg" in
    modificada|guardada|situacao) TAREFA="$arg" ;;
    *[0-9].[0-9]*) IP="${arg%%:*}" ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | head -n -1 | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "não entendi o argumento '$arg'" >&2; exit 2 ;;
  esac
done
if [ -z "$TAREFA" ]; then
  echo "uso: bash scripts/ciclo-teste.sh [modificada|guardada|situacao] [IP]" >&2
  exit 2
fi
DEVICE="$IP:5555"

# ── utilidades ─────────────────────────────────────────────────────────────
falhar() { echo; echo "ERRO: $*" >&2; exit 1; }
aviso()  { echo "AVISO: $*" >&2; }
sh_()    { adb -s "$DEVICE" shell "$1" 2>/dev/null | tr -d '\r'; }

# JSON deste tamanho não precisa de parser: um sed resolve. Os espaços são
# opcionais porque o manifest.json é formatado, não compacto como o do painel.
# O `.*` guloso pega a última ocorrência da chave na linha.
texto_json()  { sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" <<<"$2" | head -1 || true; }
numero_json() { sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\(-\?[0-9][0-9]*\).*/\1/p" <<<"$2" | head -1 || true; }

# epoch ms → dd/mm HH:MM:SS na hora local.
quando() {
  local ms="${1:-}"
  case "$ms" in ''|0|null) echo "—"; return 0 ;; esac
  date -d "@$((ms / 1000))" '+%d/%m %H:%M:%S' 2>/dev/null || echo "—"
}

conectar() {
  echo "==> Conectando em $DEVICE"
  local tentativa
  for tentativa in 1 2 3; do
    timeout 15 adb connect "$DEVICE" 2>&1 | grep -qE "connected to|already connected" && break
    adb disconnect "$DEVICE" >/dev/null 2>&1 || true
    sleep 2
  done
  # Sem timeout, `wait-for-device` espera para sempre quando o box não existe.
  timeout 20 adb -s "$DEVICE" wait-for-device 2>/dev/null || falhar "sem ADB em $DEVICE.
  Confira o IP (BALANCA_BOX=... ou o argumento) e a depuração pela rede na TV.
  Box zerado ou recém-formatado é caso do box.sh, não deste script."
}

# Espera o box voltar depois do reboot e reconecta. `$1 = sim` aguarda a API do
# app responder (só faz sentido depois de instalar); `nao` só a rede.
aguardar_box() {
  echo "==> Aguardando o box voltar (até 4 min)..."
  adb disconnect "$DEVICE" >/dev/null 2>&1 || true
  sleep 10
  local ok=0
  for _ in $(seq 1 48); do
    if [ "${1:-sim}" = "sim" ]; then
      curl -s -m 3 "http://$IP:3000/saude" 2>/dev/null | grep -q '"status":"ok"' && { ok=1; break; }
    else
      ping -c1 -W1 "$IP" >/dev/null 2>&1 && { ok=1; break; }
    fi
    sleep 5
  done
  [ "$ok" = 1 ] || echo "    (não confirmei que voltou; confira com: bash scripts/ciclo-teste.sh situacao $IP)"
  sleep 8
  adb connect "$DEVICE" >/dev/null 2>&1 || true
  adb -s "$DEVICE" wait-for-device 2>/dev/null || true
}

# ── app no box ─────────────────────────────────────────────────────────────
versao_local()  { sed -n 's/.*versionName = "\([^"]*\)".*/\1/p' app/build.gradle.kts | head -1 || true; }
codigo_local()  { sed -n 's/.*versionCode = \([0-9]*\).*/\1/p' app/build.gradle.kts | head -1 || true; }
versao_no_box() { sh_ "dumpsys package $PACOTE" | sed -n 's/.*versionName=\([^ ]*\).*/\1/p' | head -1 || true; }
codigo_no_box() { sh_ "dumpsys package $PACOTE" | sed -n 's/.*versionCode=\([0-9]*\).*/\1/p' | head -1 || true; }

# Tira o pacote do estado 'parado'. Parado, o Android não entrega o
# BOOT_COMPLETED e o app só subiria com um toque na TV — num box remoto isso é
# ficar mudo até alguém ir lá. A flag é gravada de forma assíncrona pelo
# PackageManagerService, e é por isso que o reboot espera um pouco depois disto.
liberar_pacote() {
  local parado="" tentativa
  sh_ "am force-stop $PACOTE" >/dev/null 2>&1 || true
  for tentativa in 1 2 3; do
    sh_ "am start -n $PACOTE/.MainActivity" >/dev/null 2>&1 || true
    sleep 6
    parado=$(sh_ "dumpsys package $PACOTE" | grep -o "stopped=[a-z]*" | head -1 || true)
    [ "$parado" = "stopped=false" ] && break
    echo "    ainda '$parado' (tentativa $tentativa); abrindo de novo"
  done
  if [ "$parado" = "stopped=false" ]; then
    echo "    pacote liberado (stopped=false)"
  else
    echo "    ATENÇÃO: o pacote continua '$parado' — o app pode não subir no boot."
  fi
}

esperar_saude() {                # $1 = segundos
  local i
  for i in $(seq 1 "$1"); do
    curl -s -m 3 "http://$IP:3000/saude" 2>/dev/null | grep -q '"status":"ok"' && return 0
    sleep 1
  done
  return 1
}

serial_do_box() { curl -s -m 3 "http://$IP:3000/saude" 2>/dev/null | sed -n 's/.*"serial":"\([^"]*\)".*/\1/p' || true; }

# O manifest.json é formatado em várias linhas: achata antes de ler os campos.
ler_manifest() { tr -d '\n' < "$1" 2>/dev/null || true; }

# ── painel ─────────────────────────────────────────────────────────────────
campo_chaves() { sed -n "s/^$1=//p" "$CHAVES" 2>/dev/null | tr -d '\r' | head -1 || true; }

painel_json() {
  [ -f "$CHAVES" ] || return 1
  local url chave
  url=$(campo_chaves painelUrl); chave=$(campo_chaves painelChave)
  [ -n "$url" ] && [ -n "$chave" ] || return 1
  curl -s -m 15 "$url/boxes?chave=$chave" 2>/dev/null | tr -d '\n' || return 1
}

# O objeto deste box dentro do JSON de /boxes. Casa pelo serial; sem serial no
# /saude (app fora do ar) casa pelo IP.
objeto_do_box() {                # $1 = json, $2 = serial (pode vir vazio)
  local obj
  while IFS= read -r obj; do
    if [ -n "${2:-}" ]; then
      grep -qF "\"$2\"" <<<"$obj" && { echo "$obj"; return 0; }
    else
      grep -qF "\"$IP\"" <<<"$obj" && { echo "$obj"; return 0; }
    fi
  done < <(sed 's/},{/}\n{/g' <<<"$1")
  return 1
}

exibir_painel() {                # $1 = json, $2 = serial
  local agora alvo obj serial versao codigo atualizou batida marca
  agora=$(numero_json agora "$1")
  alvo=$(texto_json alvo "$1"); [ -n "$alvo" ] || alvo="livre"
  echo "    painel: alvo de atualização $alvo"
  obj=$(objeto_do_box "$1" "${2:-}") || { echo "    (este box ainda não aparece no painel)"; return 0; }
  serial=$(texto_json serial "$obj"); versao=$(texto_json versao "$obj")
  codigo=$(numero_json versionCode "$obj")
  atualizou=$(numero_json atualizouEm "$obj"); batida=$(numero_json ultimaBatidaEm "$obj")
  grep -qE '"atualizouEmEstimado"[[:space:]]*:[[:space:]]*true' <<<"$obj" && marca="~" || marca=""
  printf '    %s  %s (código %s)  atualizou %s%s  última batida %s' \
    "$serial" "${versao:-—}" "${codigo:-—}" "$marca" "$(quando "$atualizou")" "$(quando "$batida")"
  if [ -n "$batida" ] && [ -n "$agora" ] && [ "$batida" -gt 0 ]; then
    printf ' (%s min)' "$(((agora - batida) / 60000))"
  fi
  echo
}

# ── as duas direções ───────────────────────────────────────────────────────

# Confirma no painel que a batida deste box chegou depois de $1 (epoch em
# segundos). É a prova ponta a ponta: com as chaves vazias no APK (a armadilha
# do BuildConfig inlinado) o app fica mudo, e nada mais denuncia isso.
esperar_batida() {
  local desde="$1" json serial ms i
  echo "==> Esperando a batida no painel (o check-in sai ~30 s depois do app subir)"
  serial=$(serial_do_box)
  if [ -z "$serial" ]; then
    echo "    (não peguei o serial no /saude; pulei a conferência do painel)"
    return 0
  fi
  for i in $(seq 1 12); do
    sleep 10
    json=$(painel_json) || continue
    ms=$(numero_json ultimaBatidaEm "$(objeto_do_box "$json" "$serial" || echo '{}')")
    if [ -n "$ms" ] && [ "$ms" -ge $(( (desde - 60) * 1000 )) ]; then
      echo "    batida confirmada às $(quando "$ms") — o APK subiu com as chaves embutidas."
      return 0
    fi
    echo "    ... sem batida nova ($((i * 10))s)"
  done
  aviso "o box não bateu no painel em 2 min. O registro do app aparece só na tela da
  TV; se ali estiver 'Painel: sem URL configurada', o APK saiu com o BuildConfig
  vazio — compile de novo com :app:clean (:app:clean :app:assembleDebug)."
}

# O app consulta o alvo ~30 s depois do boot e monta o plano sozinho, mas não
# instala: quem dispara é o usuário (botão na TV ou POST /atualizacao/iniciar).
# Aqui só se acompanha, para o teste provar que a atualização pela web aconteceu.
esperar_atualizacao() {
  local base="$1" codigo i
  echo "    a consulta é automática, a instalação não: dispare na tela da TV"
  echo "    (ou POST /atualizacao/iniciar com a chave da API) que eu aguardo aqui."
  for i in $(seq 1 24); do
    sleep 20
    codigo=$(codigo_no_box)
    if [ -n "$codigo" ] && [ "$codigo" -gt "$base" ]; then
      echo "    ATUALIZOU em ~$((i * 20))s: agora $(versao_no_box) (código $codigo)"
      return 0
    fi
    echo "    ... $((i * 20))s: $(versao_no_box) (código ${codigo:-?})"
  done
  aviso "não vi a versão subir em 8 min. A instalação chegou a ser disparada? Sem o
  disparo o app só fica com o plano montado. Se disparou e não subiu, veja a tela
  do app na TV e: adb -s $DEVICE logcat -d | grep -iE 'atualiz|Atualizador' | tail -20"
}

fase_modificada() {
  conectar
  echo "==> Build limpo (:app:clean :app:assembleDebug)"
  ./gradlew :app:clean :app:assembleDebug || falhar "a compilação falhou."
  [ -f "$APK" ] || falhar "o Gradle não produziu $APK"
  local versao codigo; versao=$(versao_local); codigo=$(codigo_local)
  echo "    APK local: $versao (código $codigo), $(du -h "$APK" | cut -f1)"

  echo "==> Instalando (o app é encerrado no meio; sessão em andamento se perde)"
  local saida; saida=$(adb -s "$DEVICE" install -r "$APK" 2>&1 | tr -d '\r' || true)
  echo "    $(tail -2 <<<"$saida" | tr '\n' ' ')"
  grep -q Success <<<"$saida" || falhar "instalação recusada:
$saida"

  local antes; antes=$(date +%s)
  echo "==> Abrindo o app"
  liberar_pacote
  echo "==> Esperando a API responder"
  esperar_saude 90 || falhar "a API não respondeu em 90 s. Últimos logs:
  adb -s $DEVICE logcat -d | grep -E 'ServicoBalanca|AutorizacaoUsb' | tail -20"
  echo "    $(curl -s -m 3 "http://$IP:3000/saude")"
  local no_box; no_box=$(versao_no_box)
  [ "$no_box" = "$versao" ] || echo "    ATENÇÃO: no box está $no_box, e eu esperava $versao."

  esperar_batida "$antes"
  echo
  echo "==> Teste no ar. Para devolver o APK guardado e ver o box se atualizar:"
  echo "    bash scripts/ciclo-teste.sh guardada $IP"
}

# Pasta do APK guardado: a de versão mais nova em $GUARDADO (apk-<versão>).
achar_guardado() { ls -d "$GUARDADO"/apk-* 2>/dev/null | sort -V | tail -1 || true; }

fase_guardada() {
  local pasta manifest m versao codigo esperado_sha esperado_tam arquivo sha tam
  pasta=$(achar_guardado)
  [ -n "$pasta" ] || falhar "nenhum APK guardado em $GUARDADO (esperava apk-<versão>/)."
  manifest="$pasta/manifest.json"
  [ -f "$manifest" ] || falhar "sem manifest.json em $pasta — sem ele não dá para conferir o APK."
  m=$(ler_manifest "$manifest")
  versao=$(texto_json versao "$m"); codigo=$(numero_json versionCode "$m")
  esperado_sha=$(texto_json sha256 "$m"); esperado_tam=$(numero_json tamanho "$m")
  arquivo="$pasta/$(texto_json apk "$m")"
  [ -f "$arquivo" ] || falhar "o manifest aponta '$(texto_json apk "$m")', que não está em $pasta."

  echo "==> APK guardado: $versao (código $codigo) — $(basename "$arquivo")"
  sha=$(sha256sum "$arquivo" | cut -d' ' -f1)
  tam=$(stat -c %s "$arquivo")
  if [ "$sha" != "$esperado_sha" ] || [ "$tam" != "$esperado_tam" ]; then
    falhar "este arquivo não é o APK que foi guardado (não confere com o manifest):
  manifest: $esperado_sha ($esperado_tam bytes)
  arquivo:  $sha ($tam bytes)"
  fi
  echo "    sha256 confere com o manifest"

  conectar
  local codigo_atual; codigo_atual=$(codigo_no_box)
  echo "    no box agora: $(versao_no_box) (código ${codigo_atual:-?})"
  if [ -n "$codigo_atual" ] && [ "$codigo" -lt "$codigo_atual" ]; then
    echo "    rebaixamento de propósito — é ele que faz o box voltar a procurar atualização."
  fi

  echo "==> Instalando (o app é encerrado no meio; sessão em andamento se perde)"
  local saida; saida=$(adb -s "$DEVICE" install -r -d "$arquivo" 2>&1 | tr -d '\r' || true)
  echo "    $(tail -2 <<<"$saida" | tr '\n' ' ')"
  grep -q Success <<<"$saida" || falhar "instalação recusada:
$saida"

  echo "==> Liberando o pacote e reiniciando"
  liberar_pacote
  echo "==> Deixando o box assentar antes do reboot (gravação das configurações)"
  sleep 20
  adb -s "$DEVICE" reboot >/dev/null 2>&1 || true
  aguardar_box sim
  echo "    no box: $(versao_no_box) (código $(codigo_no_box))"

  echo "==> Acompanhando a atualização pela web"
  local json; json=$(painel_json 2>/dev/null) || json=""
  [ -n "$json" ] && exibir_painel "$json" "$(serial_do_box)"
  esperar_atualizacao "$codigo"
}

fase_situacao() {
  echo "==> $IP"
  conectar
  echo "    no box ......... $(versao_no_box) (código $(codigo_no_box))"
  local pasta manifest m
  pasta=$(achar_guardado)
  if [ -n "$pasta" ]; then
    manifest="$pasta/manifest.json"
    m=$(ler_manifest "$manifest")
    echo "    APK guardado ... $(texto_json versao "$m") (código $(numero_json versionCode "$m")) — $(basename "$pasta")"
  else
    echo "    APK guardado ... nenhum em $GUARDADO"
  fi
  if esperar_saude 1; then
    echo "    API :3000 ...... $(curl -s -m 3 "http://$IP:3000/saude")"
  else
    echo "    API :3000 ...... sem resposta"
  fi
  local json; json=$(painel_json 2>/dev/null) || json=""
  if [ -n "$json" ]; then
    exibir_painel "$json" "$(serial_do_box)"
  else
    echo "    painel ......... não consultei ($CHAVES sem painelUrl/painelChave, ou sem resposta)"
  fi
}

case "$TAREFA" in
  modificada) fase_modificada ;;
  guardada)   fase_guardada ;;
  situacao)   fase_situacao ;;
esac

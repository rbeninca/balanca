#!/usr/bin/env bash
# Monta a pasta do kit de instalação para levar até o box (Windows 10): o APK
# da release, o adb do Windows e os arquivos que a pessoa vai usar.
#
#   bash scripts/montar-kit.sh                 # a release mais nova
#   bash scripts/montar-kit.sh 2.8.503
#   bash scripts/montar-kit.sh 2.8.503 ~/kit   # outra pasta de saída
#
# A pasta sai pronta: é só compactar e mandar para quem vai aplicar. O APK e o
# manifest vêm da release publicada (a mesma que os boxes baixam), e o sha256 é
# conferido contra o manifest antes de entrar no kit.
set -euo pipefail
cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.."

REPO="rbeninca/balanca"
TOOLS_URL="https://dl.google.com/android/repository/platform-tools-latest-windows.zip"
DESTINO_BASE="${BALANCA_KIT:-$HOME/backups/balanca}"

falhar() { echo; echo "ERRO: $*" >&2; exit 1; }

VERSAO="${1:-}"
if [ -z "$VERSAO" ]; then
  tag=$(gh release view --repo "$REPO" --json tagName -q .tagName 2>/dev/null || true)
  [ -n "$tag" ] || falhar "não descobri a release mais nova. Passe a versão: bash scripts/montar-kit.sh 2.8.503"
  VERSAO="${tag#v}"
fi
DESTINO="${2:-$DESTINO_BASE/kit-$VERSAO}"
mkdir -p "$DESTINO"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
base="https://github.com/$REPO/releases/download/v$VERSAO"

echo "==> Kit $VERSAO em $DESTINO"
echo "==> Baixando o manifest da release"
curl -fsSL -m 60 "$base/manifest.json" -o "$tmp/manifest.json" || falhar "não baixei o manifest da v$VERSAO (a release existe?)."

sha_esperado=$(sed -n 's/.*"sha256"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$tmp/manifest.json")
tam_esperado=$(sed -n 's/.*"tamanho"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' "$tmp/manifest.json")
nome_apk=$(sed -n 's/.*"apk"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$tmp/manifest.json")
[ -n "$sha_esperado" ] && [ -n "$nome_apk" ] || falhar "o manifest da v$VERSAO não trouxe sha256/apk."

echo "==> Baixando $nome_apk"
curl -fsSL -m 600 "$base/$nome_apk" -o "$tmp/$nome_apk" || falhar "não baixei o APK da v$VERSAO."
sha=$(sha256sum "$tmp/$nome_apk" | cut -d' ' -f1)
tam=$(stat -c %s "$tmp/$nome_apk")
if [ "$sha" != "$sha_esperado" ] || [ "$tam" != "$tam_esperado" ]; then
  falhar "o APK baixado não confere com o manifest:
  manifest: $sha_esperado ($tam_esperado bytes)
  baixado:  $sha ($tam bytes)"
fi
echo "    sha256 confere ($sha)"

# APK de outra versão sobrando na pasta deixaria o .bat apontando para o
# arquivo errado (ele pega o primeiro balancagfig-*.apk que encontrar).
rm -f "$DESTINO"/balancagfig-*.apk
cp "$tmp/$nome_apk" "$DESTINO/"
cp "$tmp/manifest.json" "$DESTINO/"

echo "==> Baixando o adb do Windows (platform-tools)"
curl -fsSL -m 600 "$TOOLS_URL" -o "$tmp/platform-tools.zip" || falhar "não baixei o platform-tools do Windows."
unzip -o -j "$tmp/platform-tools.zip" \
  'platform-tools/adb.exe' 'platform-tools/AdbWinApi.dll' 'platform-tools/AdbWinUsbApi.dll' \
  -d "$DESTINO" >/dev/null || falhar "não consegui extrair o adb.exe do zip."
[ -s "$DESTINO/adb.exe" ] || falhar "o adb.exe saiu vazio do zip."

echo "==> Arquivos de apoio"
cp scripts/kit/LEIA-ME.txt scripts/kit/instalar.bat "$DESTINO/"
# O COMANDOS.txt cita o nome do arquivo do APK: sai com a versão deste kit.
sed -E "s/balancagfig-[0-9]+\.[0-9]+\.[0-9]+\.apk/$nome_apk/g" \
  scripts/kit/COMANDOS.txt > "$DESTINO/COMANDOS.txt"

echo
echo "==> Pronto: $DESTINO"
ls -lh "$DESTINO" | tail -n +2 | awk '{printf "    %-30s %s\n", $9, $5}'
echo
echo "Compacte a pasta e mande. Quem for aplicar: dois cliques em instalar.bat,"
echo "com o notebook no WiFi do box (rede balancaGFIG-...)."

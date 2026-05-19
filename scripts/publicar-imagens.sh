#!/usr/bin/env bash
# Compila imagens multi-arch (amd64 + arm64) e envia para ghcr.io.
# Uso: ./scripts/publicar-imagens.sh [TAG]
#   TAG  tag da imagem (padrão: latest)
#
# Pré-requisitos:
#   - docker buildx instalado (vem com Docker >= 19.03)
#   - autenticado no ghcr.io: echo $GITHUB_TOKEN | docker login ghcr.io -u <usuario> --password-stdin
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGISTRY="ghcr.io/rbeninca/balanca"
PLATFORMS="linux/amd64,linux/arm64"
BUILDER="balancagfig-multiarch"
TAG="${1:-latest}"

# ── Verificações ──────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "ERRO: docker não encontrado."
  echo "  Fedora/RHEL: sudo dnf install docker-ce docker-buildx-plugin"
  echo "  Ubuntu/Debian: sudo apt install docker-ce docker-buildx-plugin"
  exit 1
fi

if ! docker buildx version &>/dev/null; then
  echo "ERRO: plugin docker-buildx não encontrado."
  echo ""
  # Detecta o gerenciador de pacotes disponível
  if command -v dnf &>/dev/null; then
    echo "  Instale com: sudo dnf install docker-buildx-plugin"
  elif command -v apt-get &>/dev/null; then
    echo "  Instale com: sudo apt-get install docker-buildx-plugin"
  elif command -v pacman &>/dev/null; then
    echo "  Instale com: sudo pacman -S docker-buildx"
  else
    echo "  Baixe em: https://github.com/docker/buildx/releases"
    echo "  Salve em: ~/.docker/cli-plugins/docker-buildx"
    echo "  Execute:  chmod +x ~/.docker/cli-plugins/docker-buildx"
  fi
  exit 1
fi

# ── Builder multi-arch ────────────────────────────────────────────────────────
if ! docker buildx inspect "$BUILDER" &>/dev/null; then
  echo "Criando builder multi-arch '$BUILDER'..."
  docker buildx create --name "$BUILDER" --driver docker-container --bootstrap
fi
docker buildx use "$BUILDER"

# Garante suporte a ARM64 via QEMU
docker run --privileged --rm tonistiigi/binfmt --install arm64 2>/dev/null || true

# ── Build e push ──────────────────────────────────────────────────────────────
build() {
  local nome="$1"
  local dockerfile="$2"
  echo ""
  echo "▶ Compilando $nome ($PLATFORMS)..."
  docker buildx build \
    --platform "$PLATFORMS" \
    --file "$ROOT/docker/$dockerfile" \
    --tag "$REGISTRY/$nome:$TAG" \
    --push \
    "$ROOT"
  echo "✓ $REGISTRY/$nome:$TAG publicado"
}

build "gateway"    "Dockerfile.gateway"
build "api"        "Dockerfile.api"
build "webapp"     "Dockerfile.webapp"
build "atualizador" "Dockerfile.firmware"

echo ""
echo "Imagens publicadas em $REGISTRY com tag '$TAG':"
echo "  $REGISTRY/gateway:$TAG"
echo "  $REGISTRY/api:$TAG"
echo "  $REGISTRY/webapp:$TAG"
echo "  $REGISTRY/atualizador:$TAG"
echo ""
echo "Para iniciar no TVBOX:"
echo "  TAG=$TAG docker compose -f docker/docker-compose.producao.yml pull"
echo "  TAG=$TAG docker compose -f docker/docker-compose.producao.yml up -d"

#!/usr/bin/env bash
# Instala Docker + despliega backend prod. Ejecutar en terminal interactiva (pide sudo).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== 1/3 Docker ==="
bash "$ROOT/scripts/install-docker.sh"

if ! groups | grep -q docker; then
  echo ""
  echo "Añadido al grupo docker. Ejecuta: newgrp docker"
  echo "Luego vuelve a correr: ./scripts/setup-backend-host.sh --skip-docker"
  exit 0
fi

if [[ "${1:-}" == "--skip-docker" ]]; then
  shift
fi

echo ""
echo "=== 2/3 .env ==="
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Creado .env desde .env.example — EDITA secretos antes de producción real:"
  echo "  nano .env"
  echo ""
  read -r -p "¿Continuar con valores de ejemplo? (s/N) " ans
  if [[ "${ans,,}" != "s" ]]; then
    exit 0
  fi
fi

echo ""
echo "=== 3/3 Deploy ==="
bash "$ROOT/scripts/deploy-backend.sh"

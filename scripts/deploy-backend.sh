#!/usr/bin/env bash
# Despliega solo backend + DB + Caddy (HTTPS api.ea-iptv.leyluz.com).
# No toca docker-compose.yml (stack monolítico local / legacy).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="docker-compose.backend.prod.yml"

if [[ ! -f .env ]]; then
  echo "Falta .env — copia .env.example y rellena secretos:"
  echo "  cp .env.example .env && nano .env"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker no encontrado. Ejecuta: ./scripts/install-docker.sh"
  exit 1
fi

echo "==> Build y arranque ($COMPOSE_FILE)"
docker compose -f "$COMPOSE_FILE" up -d --build

echo ""
echo "==> Estado"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "Listo. Verifica:"
echo "  curl -sI https://api.ea-iptv.leyluz.com/api/diagnostics/config"
echo ""
echo "Frontend Vercel debe tener VITE_API_BASE_URL=https://api.ea-iptv.leyluz.com/api"

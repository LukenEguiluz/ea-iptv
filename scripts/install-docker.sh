#!/usr/bin/env bash
# Instala Docker Engine + plugin Compose (Ubuntu/Debian).
set -euo pipefail

if command -v docker >/dev/null 2>&1; then
  echo "Docker ya instalado: $(docker --version)"
  docker compose version
  exit 0
fi

echo "Instalando Docker..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

. /etc/os-release
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  ${VERSION_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker "$USER" || true

echo ""
echo "Docker instalado. Si es la primera vez, cierra sesión y vuelve a entrar"
echo "para usar docker sin sudo, o ejecuta: newgrp docker"

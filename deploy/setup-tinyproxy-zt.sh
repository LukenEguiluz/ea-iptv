#!/usr/bin/env bash
# Instalar tinyproxy en un nodo ZeroTier de salida (Linux).
# Ejecutar EN el nodo (ej. 10.234.232.58), no en el servidor VM.
#
# Uso:
#   sudo ZT_IP=10.234.232.58 ./setup-tinyproxy-zt.sh
#   sudo ZT_IP=10.234.232.58 PORT=8888 ./setup-tinyproxy-zt.sh

set -euo pipefail

ZT_IP="${ZT_IP:-}"
PORT="${PORT:-8888}"
ZT_NET="${ZT_NET:-10.234.232.0/24}"

if [[ -z "$ZT_IP" ]]; then
  echo "Indica la IP ZeroTier del nodo: ZT_IP=10.234.232.58 $0" >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "Ejecuta como root (sudo)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq tinyproxy curl

cat > /etc/tinyproxy/tinyproxy.conf <<EOF
User tinyproxy
Group tinyproxy
Port ${PORT}
Listen ${ZT_IP}
Allow ${ZT_NET}
Timeout 600
MaxClients 64
EOF

systemctl enable tinyproxy
systemctl restart tinyproxy

echo "tinyproxy escuchando en ${ZT_IP}:${PORT} (Allow ${ZT_NET})"
echo "Prueba local:"
echo "  curl -m 15 -x http://${ZT_IP}:${PORT} 'http://line.trxdnscloud.ru/player_api.php?username=USER&password=PASS&action=get_live_categories' | head -c 200"
echo ""
echo "En el servidor VM (.env):"
echo "  XTREAM_HTTP_PROXY=http://${ZT_IP}:${PORT}"

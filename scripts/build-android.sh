#!/usr/bin/env bash
# Build web + sync Capacitor Android (app nativa estilo Smarters).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="$ROOT/frontend"

cd "$FRONTEND"

if [[ -z "${VITE_API_BASE_URL:-}" ]]; then
  export VITE_API_BASE_URL="${VITE_API_BASE_URL:-https://api.ea-iptv.leyluz.com/api}"
  echo "==> VITE_API_BASE_URL=$VITE_API_BASE_URL"
fi

echo "==> npm install"
npm install

echo "==> vite build"
npm run build

if [[ ! -d android ]]; then
  echo "==> cap add android (primera vez)"
  npx cap add android
fi

echo "==> cap sync"
npx cap sync android

# HTTP cleartext para panel Xtream
MANIFEST="$FRONTEND/android/app/src/main/AndroidManifest.xml"
if [[ -f "$MANIFEST" ]] && ! grep -q 'usesCleartextTraffic' "$MANIFEST"; then
  sed -i 's/<application /<application android:usesCleartextTraffic="true" /' "$MANIFEST" || true
fi

echo ""
echo "Listo. Abre Android Studio:"
echo "  cd $FRONTEND && npx cap open android"
echo ""
echo "O instala en dispositivo:"
echo "  cd $FRONTEND && npx cap run android"

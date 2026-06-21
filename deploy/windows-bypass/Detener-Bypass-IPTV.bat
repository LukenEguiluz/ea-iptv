@echo off
cd /d "%~dp0"

echo Deteniendo contenedor Docker...
docker compose down 2>nul
docker stop ea-iptv-xtream-bypass 2>nul
docker rm ea-iptv-xtream-bypass 2>nul

echo.
echo Bypass Docker detenido. Cierra la ventana de Python si la tienes abierta.
echo.
pause


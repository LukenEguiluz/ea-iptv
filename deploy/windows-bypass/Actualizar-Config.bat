@echo off
cd /d "%~dp0"

echo Reconstruyendo bypass Docker...
if exist tinyproxy.conf del /f /q tinyproxy.conf 2>nul
docker compose down 2>nul
docker compose build --no-cache
docker compose up -d
docker compose logs --tail 10
echo.
echo Listo. Prueba con Probar-Bypass-IPTV.bat
pause


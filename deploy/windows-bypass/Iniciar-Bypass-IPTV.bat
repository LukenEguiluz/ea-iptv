@echo off
setlocal EnableExtensions
title EA IPTV - Bypass Docker

cd /d "%~dp0"

set PROXY_PORT=8888
set ZT_IP=10.234.232.218
set SERVIDOR_VM=10.234.232.149

echo.
echo ============================================================
echo  EA IPTV - Bypass Xtream via Docker
echo ============================================================
echo.

where docker >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker Desktop no instalado o no esta en PATH.
  pause
  exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
  echo ERROR: Abre Docker Desktop y espera a que arranque.
  pause
  exit /b 1
)

echo Comprobando ZeroTier...
ipconfig | findstr /i "10.234.232."

echo.
net session >nul 2>&1
if %errorlevel%==0 (
  netsh advfirewall firewall delete rule name="EA-IPTV Xtream Bypass" >nul 2>&1
  netsh advfirewall firewall delete rule name="EA-IPTV Xtream Bypass VM" >nul 2>&1
  netsh advfirewall firewall add rule name="EA-IPTV Xtream Bypass" dir=in action=allow protocol=TCP localport=%PROXY_PORT% remoteip=10.234.232.0/24 profile=any >nul
  netsh advfirewall firewall add rule name="EA-IPTV Xtream Bypass VM" dir=in action=allow protocol=TCP localport=%PROXY_PORT% remoteip=%SERVIDOR_VM%/32 profile=any >nul
)

if exist tinyproxy.conf del /f /q tinyproxy.conf 2>nul

echo Construyendo contenedor...
docker compose build --no-cache
if errorlevel 1 (
  echo ERROR al construir imagen.
  pause
  exit /b 1
)

docker compose up -d
docker compose ps

echo.
echo Bypass activo en puerto %PROXY_PORT%
echo Servidor VM: XTREAM_HTTP_PROXY=http://%ZT_IP%:%PROXY_PORT%
echo.
pause


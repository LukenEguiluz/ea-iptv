@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title EA IPTV - Actualizar config tinyproxy

cd /d "%~dp0"

echo.
echo  Actualizando tinyproxy.conf (permite red ZeroTier + Docker)...
echo.

> tinyproxy.conf (
echo Port 8888
echo Listen 0.0.0.0
echo Allow 127.0.0.1
echo Allow 10.234.232.0/24
echo Allow 172.16.0.0/12
echo Allow 192.168.0.0/16
echo Allow 0.0.0.0/0
echo Timeout 600
echo MaxClients 64
echo ConnectPort 443
echo ConnectPort 563
echo ConnectPort 80
echo ConnectPort 8080
)

echo  Reiniciando contenedor...
docker compose up -d --build

echo.
docker compose logs --tail 8
echo.
echo  Listo. Prueba con Probar-Bypass-IPTV.bat
echo.
pause

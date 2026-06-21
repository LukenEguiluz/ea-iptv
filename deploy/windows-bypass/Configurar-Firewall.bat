@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title EA IPTV - Firewall bypass

:: Requiere ejecutar como administrador (clic derecho - Ejecutar como administrador)

net session >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Ejecuta este archivo como administrador:
    echo         Clic derecho -^> Ejecutar como administrador
    pause
    exit /b 1
)

set "PROXY_PORT=8888"
set "ZT_NETWORK=10.234.232.0/24"

echo.
echo  Creando regla de firewall para puerto %PROXY_PORT% desde %ZT_NETWORK%...
echo.

netsh advfirewall firewall delete rule name="EA-IPTV Xtream Bypass" >nul 2>&1
netsh advfirewall firewall add rule name="EA-IPTV Xtream Bypass" dir=in action=allow protocol=TCP localport=%PROXY_PORT% remoteip=%ZT_NETWORK%

if errorlevel 1 (
    echo [ERROR] No se pudo crear la regla.
    pause
    exit /b 1
)

echo  Regla creada correctamente.
echo.
pause
exit /b 0

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
set "SERVIDOR_VM=10.234.232.149"

echo.
echo  Creando reglas de firewall para puerto %PROXY_PORT%...
echo  Origen permitido: red ZeroTier + servidor VM (%SERVIDOR_VM%)
echo.

netsh advfirewall firewall delete rule name="EA-IPTV Xtream Bypass" >nul 2>&1
netsh advfirewall firewall delete rule name="EA-IPTV Xtream Bypass VM" >nul 2>&1

netsh advfirewall firewall add rule name="EA-IPTV Xtream Bypass" dir=in action=allow protocol=TCP localport=%PROXY_PORT% remoteip=%ZT_NETWORK% profile=any
netsh advfirewall firewall add rule name="EA-IPTV Xtream Bypass VM" dir=in action=allow protocol=TCP localport=%PROXY_PORT% remoteip=%SERVIDOR_VM%/32 profile=any

if errorlevel 1 (
    echo [ERROR] No se pudo crear la regla.
    pause
    exit /b 1
)

echo  Regla creada correctamente.
echo.
pause
exit /b 0

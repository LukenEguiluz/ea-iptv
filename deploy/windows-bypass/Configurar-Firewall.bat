@echo off
title EA IPTV - Firewall

net session >nul 2>&1
if errorlevel 1 (
  echo ERROR: Ejecutar como administrador (clic derecho).
  pause
  exit /b 1
)

set PROXY_PORT=8888
set SERVIDOR_VM=10.234.232.149

netsh advfirewall firewall delete rule name="EA-IPTV Xtream Bypass" >nul 2>&1
netsh advfirewall firewall delete rule name="EA-IPTV Xtream Bypass VM" >nul 2>&1
netsh advfirewall firewall add rule name="EA-IPTV Xtream Bypass" dir=in action=allow protocol=TCP localport=%PROXY_PORT% remoteip=10.234.232.0/24 profile=any
netsh advfirewall firewall add rule name="EA-IPTV Xtream Bypass VM" dir=in action=allow protocol=TCP localport=%PROXY_PORT% remoteip=%SERVIDOR_VM%/32 profile=any

echo Reglas de firewall creadas para puerto %PROXY_PORT%
pause


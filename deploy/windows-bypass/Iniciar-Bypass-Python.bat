@echo off
setlocal EnableExtensions
title EA IPTV - Bypass Python

cd /d "%~dp0"

set PROXY_PORT=8888
set ZT_IP=10.234.232.218
set SERVIDOR_VM=10.234.232.149
set XTREAM_HOST=line.trxdnscloud.ru

echo.
echo ============================================================
echo  EA IPTV - Bypass Xtream (Python en Windows)
echo ============================================================
echo.
echo URL Xtream sin puerto: http://%XTREAM_HOST%/player_api.php
echo.

where python >nul 2>&1
if %errorlevel%==0 (
  set PYTHON=python
) else (
  where py >nul 2>&1
  if errorlevel 1 (
    echo ERROR: Instala Python 3 desde https://www.python.org/downloads/
    pause
    exit /b 1
  )
  set PYTHON=py -3
)

echo Comprobando ZeroTier...
ipconfig | findstr /i "10.234.232."

echo.
echo Configurando firewall puerto %PROXY_PORT% ...
net session >nul 2>&1
if %errorlevel%==0 (
  netsh advfirewall firewall delete rule name="EA-IPTV Xtream Bypass" >nul 2>&1
  netsh advfirewall firewall delete rule name="EA-IPTV Xtream Bypass VM" >nul 2>&1
  netsh advfirewall firewall add rule name="EA-IPTV Xtream Bypass" dir=in action=allow protocol=TCP localport=%PROXY_PORT% remoteip=10.234.232.0/24 profile=any >nul
  netsh advfirewall firewall add rule name="EA-IPTV Xtream Bypass VM" dir=in action=allow protocol=TCP localport=%PROXY_PORT% remoteip=%SERVIDOR_VM%/32 profile=any >nul
)

echo.
echo Iniciando proxy en puerto %PROXY_PORT% ...
echo Cierra esta ventana para detener el bypass.
echo.
echo En el servidor VM usar:
echo   XTREAM_HTTP_PROXY=http://%ZT_IP%:%PROXY_PORT%
echo.

%PYTHON% "%~dp0proxy-host.py"
pause


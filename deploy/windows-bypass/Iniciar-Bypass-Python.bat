@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title EA IPTV - Bypass (Python, recomendado)

cd /d "%~dp0"

set "PROXY_PORT=8888"
set "ZT_IP_ESPERADA=10.234.232.218"
set "SERVIDOR_VM=10.234.232.149"
set "XTREAM_HOST=line.trxdnscloud.ru"

echo.
echo  ============================================================
echo   EA IPTV - Bypass Xtream (Python en el host Windows)
echo  ============================================================
echo.
echo  Sin Docker: el trafico sale con la IP residencial de este PC.
echo  URL Xtream: %XTREAM_HOST%  (sin puerto en la URL)
echo.

where python >nul 2>&1
if errorlevel 1 (
    where py >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Python no encontrado. Instala Python 3 desde python.org
        goto :fin_error
    )
    set "PYTHON=py -3"
) else (
    set "PYTHON=python"
)

echo [1/3] Comprobando ZeroTier...
set "ZT_OK=0"
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /i /c:"10.234.232."') do (
    set "ZT_OK=1"
    echo        IP ZeroTier: 10.234.232%%A
)
if "%ZT_OK%"=="0" (
    echo [AVISO] No se detecto IP 10.234.232.x — revisa ZeroTier EA_VPN
)

echo.
echo [2/3] Firewall puerto %PROXY_PORT%...
net session >nul 2>&1
if not errorlevel 1 (
    netsh advfirewall firewall delete rule name="EA-IPTV Xtream Bypass" >nul 2>&1
    netsh advfirewall firewall delete rule name="EA-IPTV Xtream Bypass VM" >nul 2>&1
    netsh advfirewall firewall add rule name="EA-IPTV Xtream Bypass" dir=in action=allow protocol=TCP localport=%PROXY_PORT% remoteip=10.234.232.0/24 profile=any >nul
    netsh advfirewall firewall add rule name="EA-IPTV Xtream Bypass VM" dir=in action=allow protocol=TCP localport=%PROXY_PORT% remoteip=%SERVIDOR_VM%/32 profile=any >nul
)

echo.
echo [3/3] Iniciando proxy en 0.0.0.0:%PROXY_PORT% ...
echo        Cierra esta ventana para detener el bypass.
echo.
echo  En el servidor VM:
echo    XTREAM_HTTP_PROXY=http://%ZT_IP_ESPERADA%:%PROXY_PORT%
echo.

%PYTHON% "%~dp0proxy-host.py"
goto :fin

:fin_error
pause
exit /b 1

:fin
pause

@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title EA IPTV - Iniciar bypass Xtream

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

set "PROXY_PORT=8888"
set "ZT_NETWORK=10.234.232.0/24"
set "ZT_IP_ESPERADA=10.234.232.218"
set "SERVIDOR_VM=10.234.232.149"

echo.
echo  ============================================================
echo   EA IPTV - Bypass Xtream via ZeroTier + Docker
echo  ============================================================
echo.
echo  Este PC debe estar en la red ZeroTier EA_VPN
echo  IP esperada en este equipo: %ZT_IP_ESPERADA%
echo  Puerto proxy: %PROXY_PORT%
echo.

where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker no esta instalado o no esta en el PATH.
    echo         Instala Docker Desktop: https://www.docker.com/products/docker-desktop/
    goto :fin_error
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop no esta en ejecucion.
    echo         Abre Docker Desktop, espera a que arranque y vuelve a ejecutar este archivo.
    goto :fin_error
)

echo [1/4] Comprobando ZeroTier...
set "ZT_OK=0"
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /i /c:"10.234.232."') do (
    set "ZT_OK=1"
    echo        IP ZeroTier detectada: 10.234.232%%A
)
if "%ZT_OK%"=="0" (
    echo [AVISO] No se detecto IP 10.234.232.x en este PC.
    echo         Une este equipo a la red EA_VPN en ZeroTier y autorizalo en el panel.
    echo         Network ID: b9a18a606fa730f4
    echo.
    choice /C SN /M "Continuar de todos modos"
    if errorlevel 2 goto :fin_error
)

echo.
echo [2/4] Regla de firewall (puerto %PROXY_PORT% desde %ZT_NETWORK%)...
net session >nul 2>&1
if errorlevel 1 (
    echo [AVISO] Sin permisos de administrador: no se puede crear la regla de firewall.
    echo         Si el servidor no conecta, ejecuta Configurar-Firewall.bat como administrador.
) else (
    netsh advfirewall firewall delete rule name="EA-IPTV Xtream Bypass" >nul 2>&1
    netsh advfirewall firewall delete rule name="EA-IPTV Xtream Bypass VM" >nul 2>&1
    netsh advfirewall firewall add rule name="EA-IPTV Xtream Bypass" dir=in action=allow protocol=TCP localport=%PROXY_PORT% remoteip=%ZT_NETWORK% profile=any >nul
    netsh advfirewall firewall add rule name="EA-IPTV Xtream Bypass VM" dir=in action=allow protocol=TCP localport=%PROXY_PORT% remoteip=%SERVIDOR_VM%/32 profile=any >nul
    if errorlevel 1 (
        echo [AVISO] No se pudo crear la regla de firewall automaticamente.
    ) else (
        echo        Regla de firewall OK.
    )
)

echo.
echo [3/4] Construyendo e iniciando contenedor Docker...
if exist tinyproxy.conf del /f /q tinyproxy.conf 2>nul
docker compose build --no-cache
if errorlevel 1 (
    echo [ERROR] Fallo al construir la imagen.
    goto :fin_error
)
docker compose up -d
if errorlevel 1 (
    echo [ERROR] Fallo al iniciar docker compose.
    goto :fin_error
)

echo.
echo [4/4] Estado del contenedor...
docker compose ps
docker inspect --format "{{.State.Health.Status}}" ea-iptv-xtream-bypass 2>nul

echo.
echo  ============================================================
echo   Bypass ACTIVO
echo  ============================================================
echo.
echo  En el servidor VM (%SERVIDOR_VM%) debe configurarse:
echo.
echo    XTREAM_HTTP_PROXY=http://%ZT_IP_ESPERADA%:%PROXY_PORT%
echo.
echo  Prueba local (PowerShell):
echo    curl.exe -x http://127.0.0.1:%PROXY_PORT% "http://line.trxdnscloud.ru/player_api.php?username=USER^&password=PASS^&action=get_live_categories"
echo.
echo  Para detener: ejecuta Detener-Bypass-IPTV.bat
echo.
pause
exit /b 0

:fin_error
echo.
pause
exit /b 1

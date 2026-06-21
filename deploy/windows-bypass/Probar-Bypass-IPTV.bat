@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title EA IPTV - Probar bypass

cd /d "%~dp0"

set "PROXY_PORT=8888"
set "XTREAM_HOST=line.trxdnscloud.ru"

echo.
echo  ============================================================
echo   Prueba bypass EA IPTV
echo  ============================================================
echo.
echo  URL Xtream (sin puerto): http://%XTREAM_HOST%/player_api.php
echo  Nota: curl puede decir "port 80" — es el HTTP normal, no :80 en la URL.
echo.

set /p "XTREAM_USER=Usuario Xtream: "
set /p "XTREAM_PASS=Password Xtream: "

if "%XTREAM_USER%"=="" (
    echo Usuario vacio, cancelado.
    pause
    exit /b 1
)

where curl >nul 2>&1
if errorlevel 1 (
    echo curl no encontrado.
    pause
    exit /b 1
)

set "XTREAM_URL=http://%XTREAM_HOST%/player_api.php?username=%XTREAM_USER%&password=%XTREAM_PASS%&action=get_live_categories"

echo.
echo [1/3] Directo desde este PC (sin proxy)...
curl.exe -m 20 -sS "%XTREAM_URL%" | more +0
if errorlevel 1 (
    echo        ^(fallo directo — revisa red o credenciales^)
) else (
    echo        ^(si ves JSON arriba, Xtream funciona en este PC^)
)

echo.
echo [2/3] Via proxy local 127.0.0.1:%PROXY_PORT% (example.com)...
curl.exe -m 10 -sS -o nul -w "HTTP %%{http_code}\n" -x http://127.0.0.1:%PROXY_PORT% http://example.com/

echo.
echo [3/3] Via proxy local hacia Xtream...
curl.exe -m 25 -sS -x http://127.0.0.1:%PROXY_PORT% "%XTREAM_URL%"

echo.
echo.
echo  JSON con categorias = bypass OK. Avise al admin del servidor.
echo.
pause

@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title EA IPTV - Probar bypass

cd /d "%~dp0"

set "PROXY_PORT=8888"
set "XTREAM_URL=http://line.trxdnscloud.ru/player_api.php"

echo.
echo  Prueba del proxy local (127.0.0.1:%PROXY_PORT%)
echo.
echo  Necesitas usuario y contraseña de una cuenta IPTV del proveedor.
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
    echo curl no encontrado. Usa PowerShell o instala curl en Windows 10/11.
    pause
    exit /b 1
)

echo.
echo  Solicitando categorias live via proxy...
echo.

curl.exe -m 20 -sS -x http://127.0.0.1:%PROXY_PORT% "%XTREAM_URL%?username=%XTREAM_USER%&password=%XTREAM_PASS%&action=get_live_categories"

echo.
echo.
echo  Si ves JSON con categorias, el bypass funciona desde este PC.
echo  Avise al administrador del servidor para activar XTREAM_HTTP_PROXY.
echo.
pause

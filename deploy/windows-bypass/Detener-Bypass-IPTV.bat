@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title EA IPTV - Detener bypass Xtream

cd /d "%~dp0"

echo.
echo  Deteniendo contenedor ea-iptv-xtream-bypass...
echo.

where docker >nul 2>&1
if errorlevel 1 (
    echo Docker no encontrado.
    goto :fin
)

docker compose down
if errorlevel 1 (
    echo No se pudo detener con compose; intentando stop directo...
    docker stop ea-iptv-xtream-bypass >nul 2>&1
    docker rm ea-iptv-xtream-bypass >nul 2>&1
)

echo.
echo  Bypass detenido.
echo.

:fin
pause

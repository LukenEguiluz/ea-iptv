@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title EA IPTV - Reconstruir bypass

cd /d "%~dp0"

echo.
echo  Reconstruyendo imagen (config embebida en Dockerfile, sin tinyproxy.conf local)...
echo.

if exist tinyproxy.conf (
    echo  Eliminando tinyproxy.conf local corrupto si existe...
    del /f /q tinyproxy.conf 2>nul
)

docker compose down 2>nul
docker compose build --no-cache
if errorlevel 1 goto :error

docker compose up -d
if errorlevel 1 goto :error

echo.
docker compose logs --tail 10
echo.
echo  OK. Prueba con Probar-Bypass-IPTV.bat
echo.
pause
exit /b 0

:error
echo.
echo  ERROR al reconstruir. Comprueba que Docker Desktop este en ejecucion.
pause
exit /b 1

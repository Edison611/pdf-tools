@echo off
setlocal
cd /d "%~dp0"

echo Stopping PDF Tools...
docker compose down

echo.
echo   Stopped. Containers and the compose network are removed; images are kept.
echo.
pause

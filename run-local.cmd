@echo off
setlocal
cd /d "%~dp0"

echo Starting PDF Tools...
echo.

docker compose up --build -d
if errorlevel 1 goto failed

echo.
echo Waiting for the API health check to pass...
timeout /t 5 /nobreak >nul

start "" http://localhost:8080

echo.
echo   PDF Tools is running at http://localhost:8080
echo   Logs:  docker compose logs -f
echo   Stop:  stop-local.cmd
echo.
pause
exit /b 0

:failed
echo.
echo   Startup failed. Most likely cause: Docker Desktop is not running.
echo   Start Docker Desktop, wait for the whale icon to settle, then retry.
echo.
pause
exit /b 1

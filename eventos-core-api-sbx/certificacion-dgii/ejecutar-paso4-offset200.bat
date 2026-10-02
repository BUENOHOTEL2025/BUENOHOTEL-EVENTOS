@echo off
cd /d "%~dp0"
echo Paso 4 — firmar 29 XML y enviar 25 por API (secuencias +200)
echo.
call npm run firmar-todos
if errorlevel 1 exit /b 1
call npm run enviar-api
pause

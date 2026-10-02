@echo off
cd /d "%~dp0"
echo === Instalar dependencias Paso 4 (sin Puppeteer) ===
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del /f /q package-lock.json
call npm install
if errorlevel 1 (
  echo ERROR npm install
  pause
  exit /b 1
)
echo.
echo OK. Ahora ejecuta:
echo   npm run firmar-todos
echo   npm run enviar-api
pause
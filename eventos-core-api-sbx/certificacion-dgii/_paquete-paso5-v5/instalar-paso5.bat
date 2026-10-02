@echo off
cd /d "%~dp0"
echo Instalando dependencias Paso 5 ^(dgii-ecf, qrcode, puppeteer^)...
call npm install
if errorlevel 1 (
  echo ERROR: npm install fallo
  pause
  exit /b 1
)
echo.
echo Listo. Ahora ejecute: npm run paso5
pause

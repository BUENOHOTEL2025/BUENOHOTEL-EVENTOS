@echo off
cd /d "%~dp0"
echo Paso 5 — generar HTML + PDF automatico
if not exist "node_modules\puppeteer\package.json" (
  echo.
  echo Instalando dependencias ^(primera vez, puede tardar 1-2 min^)...
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install fallo
    pause
    exit /b 1
  )
)
call npm run paso5
if errorlevel 1 exit /b 1
start "" "%~dp0salida\representacion-impresa\pdf"
pause

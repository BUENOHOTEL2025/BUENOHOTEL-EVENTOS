@echo off
cd /d "%~dp0"
echo Trabajando en: %CD%
if exist node_modules ren node_modules node_modules_OLD 2>nul
if exist package-lock.json del /f /q package-lock.json
echo Instalando dgii-ecf dotenv xlsx qrcode...
call npm install dgii-ecf@1.8.0 dotenv@16.0.3 xlsx@0.18.5 qrcode@1.5.4
if errorlevel 1 (
  echo ERROR
  pause
  exit /b 1
)
echo OK - ahora: npm run firmar-todos
pause
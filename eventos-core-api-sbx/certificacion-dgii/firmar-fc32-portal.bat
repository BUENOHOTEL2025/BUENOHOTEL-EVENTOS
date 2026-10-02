@echo off
chcp 65001 >nul
title BUENOHOTEL - Firmar 4 FC32 menor 250k (portal DGII)
cd /d "%~dp0"

if not exist ".env.cert" (
  echo [ERROR] Falta .env.cert con ruta al .p12 y clave
  pause
  exit /b 1
)

set F1=salida\ecf-sin-firmar\131631088E320000000011.xml
set F2=salida\ecf-sin-firmar\131631088E320000000012.xml
set F3=salida\ecf-sin-firmar\131631088E320000000013.xml
set F4=salida\ecf-sin-firmar\131631088E320000000014.xml

for %%F in (%F1% %F2% %F3% %F4%) do (
  if not exist "%%F" (
    echo [ERROR] Falta: %%F
    echo Descargue los XML desde S3 o dgii-xml-fc32-portal.zip
    pause
    exit /b 1
  )
)

if not exist "node_modules" call npm install

echo Firmando 4 facturas FC32 ^<250k para subir al portal...
echo.
node firmar-xml-p12.js %F1% %F2% %F3% %F4%
if errorlevel 1 (
  echo [ERROR] Revisar .env.cert y que exista firmar-xml-p12.js
  pause
  exit /b 1
)

echo.
echo [OK] Firmados en salida\ecf-firmados\
echo Subir esos 4 archivos en el portal: Facturas de consumo ^< 250Mil
echo (deben tener raiz ECF, NO RFCE)
echo.
pause

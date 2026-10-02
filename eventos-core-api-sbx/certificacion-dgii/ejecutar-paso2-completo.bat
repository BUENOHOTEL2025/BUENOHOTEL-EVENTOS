@echo off
chcp 65001 >nul
title BUENOHOTEL - Paso 2 DGII completo (29 XML)
cd /d "%~dp0"

if not exist ".env.cert" (
  echo [ERROR] Falta .env.cert con ruta al .p12 y clave
  pause
  exit /b 1
)

if not exist "node_modules" call npm install

echo.
echo === PASO 2 DGII — 29 XML ===
echo   25 por API (lote completo)  +  4 FC32 portal despues
echo.

call npm run reenviar-api-25
if errorlevel 1 (
  echo [ERROR] Revise el reporte JSON en salida\envio-resultados\
  pause
  exit /b 1
)

echo.
echo === Portal (solo si API 25/25) ===
echo Subir 4 archivos desde salida\ecf-firmados\:
echo   131631088E320000000011.xml … 014.xml
echo Seccion: Facturas de consumo ^< 250Mil
echo.
pause

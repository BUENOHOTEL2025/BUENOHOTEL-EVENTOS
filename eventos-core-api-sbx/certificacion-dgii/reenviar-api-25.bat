@echo off
chcp 65001 >nul
title BUENOHOTEL — Reenviar 25 API (lote completo DGII)
cd /d "%~dp0"

if not exist ".env.cert" (
  echo [ERROR] Falta .env.cert con ruta al .p12 y clave
  pause
  exit /b 1
)

if not exist "node_modules" call npm install

echo.
echo === REENVIO API — 25 comprobantes en un solo lote ===
echo   DGII NO permite enviar solo los rechazados.
echo   Se parchea, firma 29 y envia los 25 por API.
echo.
pause

call npm run reenviar-api-25
if errorlevel 1 (
  echo.
  echo [AVISO] Revise salida\envio-resultados\ — deben ser 25 Aceptados.
  pause
  exit /b 1
)

echo.
echo === Si los 25 salieron Aceptados ===
echo Portal: subir 4 FC32 desde salida\ecf-firmados\
echo   131631088E320000000011.xml … 014.xml
echo Seccion: Facturas de consumo ^< 250Mil
echo.
pause

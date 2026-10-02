@echo off
chcp 65001 >nul
title BUENOHOTEL - Ultimas 3 notas DGII (Paso 2)
cd /d "%~dp0"

echo.
echo  ============================================
echo   BUENOHOTEL - Notas pendientes DGII
echo   6 XML: 3 referencias + 3 notas
echo  ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado.
  echo Descarguelo desde: https://nodejs.org  (version LTS)
  echo.
  pause
  exit /b 1
)

if not exist ".env.cert" (
  echo [ERROR] Falta el archivo .env.cert
  echo.
  echo 1. Copie .env.cert.example y renombre a .env.cert
  echo 2. Editelo con la ruta de su certificado .p12 y la clave
  echo.
  pause
  exit /b 1
)

set "F1=salida\ecf-sin-firmar\131631088E320000000006.xml"
set "F2=salida\ecf-sin-firmar\131631088E330000000001.xml"
set "F3=salida\ecf-sin-firmar\131631088E310000000034.xml"
set "F4=salida\ecf-sin-firmar\131631088E340000000002.xml"
set "F5=salida\ecf-sin-firmar\131631088E410000000001.xml"
set "F6=salida\ecf-sin-firmar\131631088E340000000015.xml"

if not exist "%F1%" (
  echo [ERROR] Faltan XML en salida\ecf-sin-firmar\
  echo Descargue el ZIP dgii-claudia-notas-v9.zip que le envio Elmer.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias (solo la primera vez)...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install fallo.
    pause
    exit /b 1
  )
  echo.
)

echo Paso 1/2: Firmando 6 XML con certificado .p12 ...
echo.
call npm run firmar-p12 -- --pendientes-notas
if errorlevel 1 (
  echo [ERROR] Fallo la firma. Revise .env.cert
  pause
  exit /b 1
)

echo.
echo Paso 2/2: Enviando a DGII (cadena referencia - nota)...
echo.
call npm run enviar-notas

echo.
if errorlevel 1 (
  echo [AVISO] Revisar salida\envio-resultados\envio-notas-*.json
) else (
  echo [OK] Las 3 notas deberian estar Aceptadas.
)
echo.
echo Envie captura o el JSON a Elmer.
echo.
pause

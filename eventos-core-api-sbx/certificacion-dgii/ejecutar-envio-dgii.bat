@echo off
chcp 65001 >nul
title BUENOHOTEL - Envio certificacion DGII (Paso 2)
cd /d "%~dp0"

echo.
echo  ============================================
echo   Envio a DGII CerteCF - BUENOHOTEL SRL
echo   29 comprobantes firmados (4 RFCE + 25 ECF)
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

if not exist "salida\ecf-firmados\*.xml" (
  echo [ERROR] No hay XML en salida\ecf-firmados\
  echo Verifique que los 25 ECF firmados esten en esa carpeta.
  pause
  exit /b 1
)

if not exist "salida\rfce-firmados\*.xml" (
  echo [ERROR] No hay XML en salida\rfce-firmados\
  echo Verifique que los 4 RFCE firmados esten en esa carpeta.
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

echo Verificando archivos...
call npm run verificar
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo Iniciando envio a DGII (puede tardar varios minutos)...
echo.
call npm run enviar

echo.
if errorlevel 1 (
  echo [AVISO] Hubo errores. Revise salida\envio-resultados\
) else (
  echo [OK] Proceso terminado. Revise salida\envio-resultados\
)
echo.
pause

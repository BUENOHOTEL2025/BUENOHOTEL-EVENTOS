@echo off
cd /d "%~dp0"
echo ============================================================
echo  CORRECCION QR Paso 5 — nombre emisor BUENOHOTEL, S.R.L.
echo ============================================================
echo.
echo El QR de DGII muestra el nombre del XML FIRMADO enviado en Paso 4.
echo La factura impresa debe coincidir con ese XML.
echo.
echo PASO 1 — Parchear XML sin firmar...
call node parchear-xml-sin-firmar.js
if errorlevel 1 exit /b 1
echo.
echo PASO 2 — OBLIGATORIO: firmar de nuevo los XML parcheados
echo         npm run firmar-todos
echo         (o firmar con P12 los de salida\ecf-sin-firmar y rfce-sin-firmar)
echo.
echo PASO 3 — OBLIGATORIO: reenviar Paso 4 a DGII para actualizar el QR
echo         npm run enviar-api-pendientes
echo         (o el comando de envio Paso 4 que usen)
echo.
echo PASO 4 — Regenerar PDF Paso 5
echo         npm run paso5
echo.
pause

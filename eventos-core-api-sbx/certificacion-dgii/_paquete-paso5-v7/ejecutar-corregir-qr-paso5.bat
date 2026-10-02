@echo off
cd /d "%~dp0"
echo ============================================================
echo  CORRECCION QR ? BUENOHOTEL, S.R.L. (parche + firmar + enviar + PDF)
echo ============================================================
if not exist "node_modules\dgii-ecf\package.json" call npm install
call node parchear-xml-sin-firmar.js
if errorlevel 1 goto fail
call npm run firmar-todos
if errorlevel 1 goto fail
call npm run enviar-api
if errorlevel 1 goto fail
call npm run paso5
if errorlevel 1 goto fail
echo.
echo Listo. Revisa un PDF (escanear QR) y sube salida\representacion-impresa\pdf\
start "" "%~dp0salida\representacion-impresa\pdf"
pause
exit /b 0
:fail
echo ERROR ? revisa el mensaje arriba
pause
exit /b 1

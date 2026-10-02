@echo off
cd /d "%~dp0"
echo ============================================================
echo  Paso 4 offset +300 — BUENOHOTEL (QR correcto)
echo ============================================================
if not exist "node_modules\dgii-ecf\package.json" call npm install
call npm run paso4
if errorlevel 1 goto fail
echo.
echo Siguiente: npm run firmar-todos
echo Luego:     npm run enviar-api
echo Luego:     portal (4 FC32 menor 250k)
echo Luego:     npm run paso5  y subir PDF a mano
pause
exit /b 0
:fail
echo ERROR
pause
exit /b 1

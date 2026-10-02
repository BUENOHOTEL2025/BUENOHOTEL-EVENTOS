@echo off
cd /d "%~dp0"
echo Generando 11 representaciones impresas Paso 5...
call npm run paso5-generar
if errorlevel 1 exit /b 1
start "" "%~dp0salida\representacion-impresa\index.html"
pause

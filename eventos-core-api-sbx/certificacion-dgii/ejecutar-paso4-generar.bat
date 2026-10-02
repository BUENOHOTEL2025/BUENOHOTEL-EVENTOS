@echo off
cd /d "%~dp0"
echo === Paso 4: Generar Excel + XML sin firmar ===
call npm run paso4-generar-xml
if errorlevel 1 goto fin
call npm run paso4-preparar
:fin
pause

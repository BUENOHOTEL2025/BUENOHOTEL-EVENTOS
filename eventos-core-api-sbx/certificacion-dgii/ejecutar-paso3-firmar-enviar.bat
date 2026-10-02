@echo off
cd /d "%~dp0"
echo === Paso 3: Firmar + Enviar ACECF (XML ya generados) ===
call npm run firmar-acecf
if errorlevel 1 goto fin
call npm run enviar-acecf
:fin
pause

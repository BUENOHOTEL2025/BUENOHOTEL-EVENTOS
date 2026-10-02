@echo off
cd /d "%~dp0"
echo.
echo  PASO 4 — REENVIO COMPLETO (25 API, NO solo los 3 rechazados)
echo.
call npm run reenviar-paso4-25
pause

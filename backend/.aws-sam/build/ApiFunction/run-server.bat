@echo off
echo Starting server with debug information...
echo ===================================
echo Current directory: %CD%
echo ===================================

:: Check Node.js version
node -v
if %ERRORLEVEL% NEQ 0 (
    echo Error: Node.js is not installed or not in PATH
    pause
    exit /b 1
)

echo ===================================
echo Environment Variables:
set NODE
set AWS
set JWT

echo ===================================
echo Running server...
node --trace-warnings --unhandled-rejections=strict server.js

if %ERRORLEVEL% NEQ 0 (
    echo ===================================
    echo Error starting server. Exit code: %ERRORLEVEL%
    pause
)

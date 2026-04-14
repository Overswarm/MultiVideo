@echo off
title MultiVideo
echo Starting MultiVideo...
echo.

:: Find an available port (default 8080, fallback to 8081-8089)
set PORT=8080

:: Start the server in the background
start /b python -m http.server %PORT% >nul 2>&1

:: Wait a moment for the server to start
timeout /t 1 /nobreak >nul

:: Open in Chrome
echo Opening http://localhost:%PORT% in Chrome...
start "" "chrome" "http://localhost:%PORT%"

echo.
echo MultiVideo is running at http://localhost:%PORT%
echo Press any key to stop the server and exit.
pause >nul

:: Kill the python server
taskkill /f /im python.exe >nul 2>&1

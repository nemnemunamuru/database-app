@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo ========================================
echo  Laser Experiment Database (Local)
echo ========================================
echo.

REM --- Backend ---
echo [INFO] Starting backend...
start "Backend" cmd /c ".venv\Scripts\uvicorn.exe backend.main:app --reload > logs\backend.log 2>&1"

REM --- Frontend ---
echo [INFO] Starting frontend...
if not exist frontend\node_modules (
    echo [INFO] Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)
start "Frontend" cmd /c "cd frontend && npm run dev > ..\logs\frontend.log 2>&1"

REM --- Wait and open browser ---
echo [INFO] Waiting for services to start...
timeout /t 4 /nobreak >nul

echo.
echo ========================================
echo  App is running!
echo   Frontend : http://localhost:5173
echo   API docs : http://localhost:8000/docs
echo ========================================
echo.

start "" http://localhost:5173

echo [INFO] Press any key to stop all services.
pause >nul

echo.
echo [INFO] Stopping services...
taskkill /f /fi "WINDOWTITLE eq Backend" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq Frontend" >nul 2>&1
taskkill /f /im uvicorn.exe >nul 2>&1
taskkill /f /fi "MEMUSAGE gt 1 /im node.exe" >nul 2>&1
echo [OK] Done.

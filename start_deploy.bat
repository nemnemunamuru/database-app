@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo ========================================
echo  Laser Experiment Database
echo ========================================
echo.

REM --- Check venv ---
if not exist .venv\Scripts\uvicorn.exe (
    echo [ERROR] Setup not complete. Please run setup.bat first.
    pause
    exit /b 1
)

REM --- Check build ---
if not exist frontend\dist\index.html (
    echo [ERROR] Frontend not built.
    echo Please run build.bat on the source PC and copy frontend\dist\ here.
    pause
    exit /b 1
)

echo [INFO] Starting server on http://localhost:8000 ...
start "Laser DB Server" .venv\Scripts\uvicorn.exe backend.main:app --host 0.0.0.0 --port 8000

echo [INFO] Waiting for server to start...
timeout /t 3 /nobreak >nul

REM --- Open browser (Edge実行ファイルを直接確認 > Chrome > microsoft-edge:プロトコル) ---
set EDGE1=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
set EDGE2=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
if exist "%EDGE1%" (
    start "" "%EDGE1%" http://localhost:8000
    goto :browser_done
)
if exist "%EDGE2%" (
    start "" "%EDGE2%" http://localhost:8000
    goto :browser_done
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" http://localhost:8000
    goto :browser_done
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" http://localhost:8000
    goto :browser_done
)
REM --- 最終手段: microsoft-edge: プロトコル ---
start microsoft-edge:http://localhost:8000
:browser_done

echo.
echo [INFO] サーバーが起動中です。
echo [INFO] 停止するには「Laser DB Server」ウィンドウを閉じてください。
pause

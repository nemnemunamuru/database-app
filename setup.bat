@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo ========================================
echo  Setup: Laser Experiment Database
echo ========================================
echo.

REM --- Check Python ---
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found.
    echo Please install Python 3.13 from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)

for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo [OK] Python %PYVER% found.

REM --- Check / Install Edge ---
echo.
where msedge >nul 2>&1
if not errorlevel 1 (
    echo [OK] Microsoft Edge found.
    goto :edge_ok
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    echo [OK] Google Chrome found.
    goto :edge_ok
)
echo [WARN] Microsoft Edge / Chrome が見つかりません。
echo インストールしますか？
echo   1. winget でインストール（推奨・インターネット必要）
echo   2. スキップ（後で手動インストール）
set /p INSTALL_EDGE="選択 [1/2]: "
if "%INSTALL_EDGE%"=="1" (
    echo [INFO] winget で Microsoft Edge をインストール中...
    winget install --id Microsoft.Edge -e --silent --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo [WARN] winget によるインストールに失敗しました。
        echo 以下のURLから手動でダウンロードしてインストールしてください:
        echo https://www.microsoft.com/ja-jp/edge/download
        pause
    ) else (
        echo [OK] Microsoft Edge をインストールしました。
    )
) else (
    echo [INFO] ブラウザのインストールをスキップします。
    echo アプリ起動後、手動で http://localhost:8000 を Chrome / Edge で開いてください。
)
:edge_ok
echo.
echo プロキシを使用しますか？（不要な場合はそのままEnterを押してください）
echo 例: http://proxy.example.com:8080
set /p PROXY_URL="プロキシURL: "

set PIP_PROXY_OPT=
if not "%PROXY_URL%"=="" (
    set PIP_PROXY_OPT=--proxy %PROXY_URL%
    echo [INFO] プロキシを使用します: %PROXY_URL%
) else (
    echo [INFO] プロキシなしで接続します。
)

REM --- Create virtual environment ---
if exist .venv (
    echo [INFO] .venv already exists, skipping creation.
) else (
    echo [INFO] Creating virtual environment...
    python -m venv --copies .venv
)

REM --- Activate venv and install dependencies ---
echo [INFO] Installing Python dependencies...
call .venv\Scripts\activate.bat
python -m pip install --no-cache-dir %PIP_PROXY_OPT% ^
    "fastapi>=0.136.1" ^
    "uvicorn[standard]>=0.46.0" ^
    "sqlalchemy>=2.0.49" ^
    "python-multipart>=0.0.26"

if errorlevel 1 (
    echo.
    echo [ERROR] pip install failed.
    if not "%PROXY_URL%"=="" (
        echo プロキシアドレスが正しいか確認してください: %PROXY_URL%
    ) else (
        echo プロキシが必要な場合は、再度 setup.bat を実行してプロキシURLを入力してください。
    )
    pause
    exit /b 1
)

REM --- Create db directory ---
if not exist db mkdir db

echo.
echo ========================================
echo  Setup complete!
echo  Run start_deploy.bat to launch the app.
echo ========================================
echo.
pause

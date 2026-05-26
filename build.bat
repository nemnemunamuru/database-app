@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo ========================================
echo  Build frontend for deployment
echo ========================================
echo.

if not exist frontend\node_modules (
    echo [INFO] Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

echo [INFO] Building React app...
cd frontend
call npm run build
cd ..

if not exist frontend\dist (
    echo [ERROR] Build failed. Check output above.
    pause
    exit /b 1
)

echo.
echo [OK] Build complete!  frontend\dist\ is ready.
echo.
echo Next: zip the following files and copy to target PC:
echo   - backend\
echo   - frontend\dist\
echo   - db\  (empty or with existing data)
echo   - setup.bat
echo   - start_deploy.bat
echo   - pyproject.toml
echo.
pause

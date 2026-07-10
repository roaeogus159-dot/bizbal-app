@echo off
rem === Bizbal app launcher (double-click to run) ===
cd /d "%~dp0.."
echo.
echo  Starting Bizbal dev server...
echo  Browser will open at http://localhost:5173 in a few seconds.
echo  To stop: close this window or press Ctrl+C.
echo.
start "" /b cmd /c "timeout /t 4 >nul & start http://localhost:5173/"
npm run dev

@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 24 o superior para iniciar el panel.
  pause
  exit /b 1
)
echo Abre http://127.0.0.1:4310 en tu navegador.
echo Conserva esta ventana abierta mientras uses el panel.
node server/app.mjs
pause

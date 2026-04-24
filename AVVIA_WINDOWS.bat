@echo off
cd /d "%~dp0"
TITLE Avvio File Extractor CLOUD
echo Inizializzazione sistema in corso...

REM Prova con 'python'
python --version >nul 2>&1
if %errorlevel% == 0 (
    set PY_CMD=python
    goto :found
)

REM Prova con 'py' (Python Launcher per Windows)
py --version >nul 2>&1
if %errorlevel% == 0 (
    set PY_CMD=py
    goto :found
)

echo.
echo [!] ERRORE: Python non rilevato nel sistema.
echo.
echo 1. Assicurati di aver installato Python da https://www.python.org
echo 2. DURANTE L'INSTALLAZIONE, spunta la casella "Add Python to PATH"
echo.
pause
exit /b

:found
echo Python rilevato: %PY_CMD%
echo Prima esecuzione o aggiornamento librerie...
%PY_CMD% start_app.py
pause

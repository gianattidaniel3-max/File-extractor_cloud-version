@echo off
TITLE Avvio File Extractor CLOUD
echo Inizializzazione sistema in corso...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRORE: Python non trovato. Per favore installa Python da python.org
    pause
    exit /b
)
echo Prima esecuzione o aggiornamento librerie...
python start_app.py
pause

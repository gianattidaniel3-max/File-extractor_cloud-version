#!/bin/bash
cd -- "$(dirname "$0")"
clear
echo "Inizializzazione sistema in corso..."
if ! command -v python3 &> /dev/null
then
    echo "ERRORE: Python3 non trovato. Per favore installa Python da python.org"
    exit
fi
python3 start_app.py

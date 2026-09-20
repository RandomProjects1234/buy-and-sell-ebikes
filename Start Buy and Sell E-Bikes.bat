@echo off
cd /d "%~dp0"
start "" http://localhost:3497
python serve.py 3497

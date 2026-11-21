@echo off
cd /d %~dp0
call .venv\Scripts\activate.bat
python ai-service\app.py
pause

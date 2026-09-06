@echo off
cd /d "%~dp0"
:loop
"C:\Users\ser\.workbuddy\binaries\node\versions\22.22.2\node.exe" ncm-server.js >> logs-ncm.txt 2>&1
timeout /t 3 /nobreak >nul
goto loop

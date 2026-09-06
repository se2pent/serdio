@echo off
REM Serdio 双服务启动器：崩溃自动重启（窗口最小化）
start "Serdio" /min cmd /c "%~dp0run-serdio.cmd"
start "NCM" /min cmd /c "%~dp0run-ncm.cmd"
echo Radio services started.

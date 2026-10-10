@echo off
cd /d "%~dp0"
"%~dp0runtime\node.exe" "%~dp0launcher.mjs"
if errorlevel 1 pause

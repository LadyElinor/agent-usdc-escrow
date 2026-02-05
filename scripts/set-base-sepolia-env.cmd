@echo off
setlocal

REM Prints the PowerShell commands to set Base Sepolia env vars.
REM Note: a .cmd cannot modify the parent PowerShell session's environment.
REM Use this to copy/paste into PowerShell, or call PowerShell directly.

set SCRIPT_DIR=%~dp0
set PS1=%SCRIPT_DIR%set-base-sepolia-env.ps1

if not exist "%PS1%" (
  echo ERROR: missing %PS1%
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -PrintOnly

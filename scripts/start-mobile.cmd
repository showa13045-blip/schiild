@echo off
cd /d "%~dp0.."
set EXPO_NO_TELEMETRY=1
set "__UNSAFE_EXPO_HOME_DIRECTORY=%CD%\.expo-home"
call pnpm dev:mobile
pause

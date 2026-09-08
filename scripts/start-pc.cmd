@echo off
cd /d "%~dp0.."
call pnpm --filter mobile web
pause

@echo off
title Music Melting Drive PWA Server
echo Dang khoi dong may chu Music Melting Drive...
start http://localhost:3000
agy-node server.js
if %errorlevel% neq 0 (
  node server.js
)
pause

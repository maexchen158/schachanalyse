@echo off
rem Startet die Schachanalyse: installiert beim ersten Mal die Bibliotheken,
rem öffnet den Browser und startet den lokalen Server (Fenster offen lassen).
cd /d "%~dp0"
if not exist node_modules (
  echo Bibliotheken werden installiert ...
  call npm install || goto :fehler
)
start "" http://localhost:8080
node server.js
goto :eof

:fehler
echo Installation fehlgeschlagen. Ist Node.js installiert? https://nodejs.org
pause

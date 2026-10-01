@echo off
setlocal
cd /d "%~dp0"
title PrivateStream Bridge - Setup
where node >nul 2>nul
if errorlevel 1 goto node_missing
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=11)?0:1)" >nul 2>nul
if errorlevel 1 goto node_missing
echo Abrindo o assistente no navegador. Mantenha esta janela aberta durante o setup.
echo Se o navegador nao abrir: http://localhost:4177
node "%~dp0scripts\setup-ui.mjs"
if errorlevel 1 pause
exit /b

:node_missing
echo Instale o Node.js LTS pelo instalador oficial e abra este arquivo novamente.
echo Nenhum comando precisa ser digitado. Reinicie esta janela apos a instalacao.
start "" "https://nodejs.org/en/download"
pause
exit /b 1

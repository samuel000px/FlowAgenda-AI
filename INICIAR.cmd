@echo off
setlocal
cd /d "%~dp0"
title Encaixa - Desenvolvimento local
where node >nul 2>nul
if errorlevel 1 (
  echo Instale Node.js 22.13 ou superior e abra este arquivo novamente.
  pause
  exit /b 1
)
if not exist "node_modules\vinext\package.json" (
  call npm run install:ci
  if errorlevel 1 goto erro
)
if not exist "dist\server\wrangler.json" (
  call npm run build
  if errorlevel 1 goto erro
)
call npm run db:init
if errorlevel 1 goto erro
echo.
echo Abra no navegador o endereco Local exibido abaixo.
echo Mantenha esta janela aberta enquanto usa o sistema.
call npm run dev
if errorlevel 1 goto erro
exit /b
:erro
echo.
echo Nao foi possivel iniciar. Veja a mensagem acima e o README.md.
pause

@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando as dependencias do App EO...
  call npm.cmd ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Abra o endereco Local exibido abaixo no navegador.
call npm.cmd run dev
pause

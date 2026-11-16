[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

$branch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $branch -ne "main") {
  throw "Execute este script na pasta principal do EO, no ramo main."
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "Abra o PowerShell com GitHub CLI autenticado. Não envie credenciais no chat."
}

git push origin main
if ($LASTEXITCODE -ne 0) { throw "O envio do código falhou. Nenhuma compilação foi solicitada." }

gh workflow run eo-mobile-build.yml --ref main -f platform=ios-testflight
if ($LASTEXITCODE -ne 0) { throw "O GitHub não confirmou o início da compilação." }

Write-Host "Compilação iOS solicitada. O workflow mostrará a versão e a compilação geradas."
Write-Host "Depois do upload, aguarde o processamento da Apple e confira o grupo EO - Teste interno."
Write-Host "https://github.com/mbdomatheus-a11y/app-eo/actions/workflows/eo-mobile-build.yml"

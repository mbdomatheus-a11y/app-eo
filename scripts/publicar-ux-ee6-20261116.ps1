[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$otaTag = 'ota-20261116-ux-ee6'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw 'Abra este projeto no PowerShell com GitHub CLI autenticado. Nao envie credenciais no chat.'
}
git show-ref --verify --quiet "refs/tags/$otaTag"
if ($LASTEXITCODE -ne 0) { throw 'A tag local da OTA nao foi encontrada. Nao publique main como OTA no iPhone.' }

git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Falha ao enviar o site. Nenhuma OTA foi solicitada.' }
git push origin $otaTag
if ($LASTEXITCODE -ne 0) { throw 'Falha ao enviar a tag compativel. Nenhuma OTA foi solicitada.' }

gh workflow run eo-mobile-update.yml --ref $otaTag -f channel=production -f platform=ios -f 'message=EO: acesso, diario e lembretes no Runtime instalado'
if ($LASTEXITCODE -ne 0) { throw 'O GitHub nao confirmou o inicio da atualizacao.' }

Write-Host 'Atualizacao solicitada. Aguarde a conclusao do workflow antes de abrir o EO.'
Write-Host 'Confira no painel Expo se o Runtime publicado e exatamente ee6c10e120100f0eaa3b33f9a2ba9e7693e7e812.'
Write-Host 'Se o Runtime for diferente, nao tente instalar esta OTA. Avise para preparar nova compilacao.'
Write-Host 'https://github.com/mbdomatheus-a11y/app-eo/actions/workflows/eo-mobile-update.yml'

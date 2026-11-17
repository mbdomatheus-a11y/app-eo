[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$otaTag = 'ota-20261117-escala-ee6'

if ((git branch --show-current) -ne 'main') {
  throw 'Abra a pasta principal do EO na branch main.'
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw 'Entre no GitHub CLI neste PowerShell antes de continuar.'
}
git show-ref --verify --quiet "refs/tags/$otaTag"
if ($LASTEXITCODE -ne 0) {
  throw 'A tag compatível com o iPhone não foi encontrada. Não publique uma OTA de main.'
}

git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Falha ao enviar o site. Nenhuma OTA foi solicitada.' }
git push origin $otaTag
if ($LASTEXITCODE -ne 0) { throw 'Falha ao enviar a tag. Nenhuma OTA foi solicitada.' }

gh workflow run eo-mobile-update.yml --ref $otaTag -f channel=production -f platform=ios -f 'message=EO: Escala de colaboradores no iPhone'
if ($LASTEXITCODE -ne 0) { throw 'O GitHub não confirmou o início da atualização.' }

Write-Host 'Site enviado e atualização do iPhone solicitada.'
Write-Host 'Aguarde o workflow concluir e confirme no painel Expo o Runtime ee6c10e120100f0eaa3b33f9a2ba9e7693e7e812.'
Write-Host 'https://github.com/mbdomatheus-a11y/app-eo/actions/workflows/eo-mobile-update.yml'

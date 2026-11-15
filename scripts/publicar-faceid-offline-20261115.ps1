[CmdletBinding()]
param([ValidateSet('ios','android')][string]$Plataforma='ios')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Abra no PowerShell onde o GitHub CLI esta instalado e autenticado. Nao envie tokens no chat.' }
$otaTag='ota-20261115-faceid-offline'
git show-ref --verify --quiet "refs/tags/$otaTag"
if ($LASTEXITCODE -ne 0) { throw 'Tag OTA local nao encontrada. Pare e confira a preparacao.' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'O envio da main falhou. Nenhuma atualizacao foi solicitada.' }
$otaRef='main'
if ($Plataforma -eq 'ios') {
 git push origin $otaTag
 if ($LASTEXITCODE -ne 0) { throw 'O envio da tag compativel com o iPhone falhou.' }
 $otaRef=$otaTag
}
gh workflow run eo-mobile-update.yml --ref $otaRef -f channel=production -f platform=$Plataforma -f 'message=EO: Face ID sem espera infinita, push independente e sincronizacao offline'
if ($LASTEXITCODE -ne 0) { throw 'O GitHub nao confirmou o inicio da atualizacao. Confira a autenticacao e o ambiente eo-production.' }
Write-Host 'Atualizacao solicitada sem build. Aguarde o workflow concluir e abra o EO conectado para baixar.'
Write-Host 'https://github.com/mbdomatheus-a11y/app-eo/actions/workflows/eo-mobile-update.yml'

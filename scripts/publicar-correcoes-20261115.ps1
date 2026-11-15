[CmdletBinding()]
param([ValidateSet('ios','android')][string]$Plataforma='ios')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Abra no PowerShell onde o GitHub CLI (gh) esta instalado e autenticado. Nao envie tokens no chat.' }
$otaTag='ota-20261115-cinco-correcoes'
git show-ref --verify --quiet "refs/tags/$otaTag"
if ($LASTEXITCODE -ne 0) { throw 'Tag OTA local nao encontrada. Pare e confira a preparacao.' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'O push da main falhou. Nenhuma atualizacao foi solicitada.' }
$otaRef='main'
if ($Plataforma -eq 'ios') {
 git push origin $otaTag
 if ($LASTEXITCODE -ne 0) { throw 'O push da tag compativel com o iPhone falhou.' }
 $otaRef=$otaTag
}
gh workflow run eo-mobile-update.yml --ref $otaRef -f channel=production -f platform=$Plataforma -f 'message=EO: logo, icones, ditado, notificacoes e entrada'
if ($LASTEXITCODE -ne 0) { throw 'O GitHub nao confirmou o inicio da atualizacao. Confira a autenticacao e o ambiente eo-production.' }
Write-Host 'Atualizacao solicitada, sem build nativa. Aguarde o workflow concluir antes de testar no celular.'
Write-Host 'https://github.com/mbdomatheus-a11y/app-eo/actions/workflows/eo-mobile-update.yml'

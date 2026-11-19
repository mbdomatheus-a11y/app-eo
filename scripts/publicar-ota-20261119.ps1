[CmdletBinding()]
param(
  [ValidateSet("android", "ios")]
  [string]$Plataforma = "android",
  # Runtime informado pelo aparelho em Mais, Notificações e aparelho. Android 4901: d50e3fea...
  [string]$RuntimeEsperado = "d50e3fea02bb63f3c59c99496c0aa06b2f8e5c08"
)
# 19/11/2026: envia a main e publica atualização OTA do app no canal production para uma plataforma.
# Depois confere no log se o Runtime da OTA é igual ao do aparelho. Se for diferente, a OTA não chega.
$ErrorActionPreference = "Stop"
$projectRoot = "C:\Users\Usúario\Documents\ChatGPT\App_EO"
Set-Location -LiteralPath $projectRoot

$branch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $branch -ne "main") { throw "Execute na pasta do EO, no ramo main." }

$arquivos = @(
  ".github/workflows/eo-mobile-build.yml",
  ".github/workflows/eo-mobile-update.yml",
  "mobile/App.tsx",
  "mobile/src/app/_layout.tsx",
  "mobile/src/app/device.tsx",
  "mobile/src/features/AppVersionCard.tsx",
  "mobile/src/features/app-version.ts",
  "scripts/publicar-ota-20261119.ps1",
  "docs/CONTINUIDADE-EO.md",
  "docs/REMODELAGEM-ESPEC-20261119.md"
)
git add -- $arquivos
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "feat: versao atual e anterior do app com data e hora"
  if ($LASTEXITCODE -ne 0) { throw "O commit falhou. Nada foi enviado." }
}
git push origin main
if ($LASTEXITCODE -ne 0) { throw "O envio falhou. Nenhuma OTA foi publicada." }

$inicio = (Get-Date).ToUniversalTime()
gh workflow run eo-mobile-update.yml --ref main -f channel=production -f platform=$Plataforma -f message="Fundacao: busca, catalogo e versao do app"
if ($LASTEXITCODE -ne 0) { throw "O GitHub não confirmou a publicação da OTA." }

$runId = $null
for ($i = 0; $i -lt 12 -and -not $runId; $i++) {
  Start-Sleep -Seconds 5
  $lista = gh run list --workflow eo-mobile-update.yml --branch main --limit 3 --json databaseId,createdAt | ConvertFrom-Json
  $runId = ($lista | Where-Object { ([datetime]$_.createdAt).ToUniversalTime() -ge $inicio.AddSeconds(-30) } | Select-Object -First 1).databaseId
}
if (-not $runId) { throw "OTA solicitada, mas a execução não apareceu. Confira em https://github.com/mbdomatheus-a11y/app-eo/actions" }

gh run watch $runId --exit-status
if ($LASTEXITCODE -ne 0) { throw "A OTA falhou. Envie só as últimas linhas: gh run view $runId --log-failed" }

$log = gh run view $runId --log | Out-String
$achou = [regex]::Matches($log, "[0-9a-f]{40}") | ForEach-Object Value | Select-Object -Unique
if ($achou -contains $RuntimeEsperado) {
  Write-Host "OK: a OTA saiu no Runtime $RuntimeEsperado, igual ao do aparelho."
  Write-Host "No aparelho: Mais, Notificações e aparelho, Buscar atualização, Reiniciar. Depois confira Versão do app."
} else {
  Write-Host "ATENÇÃO: o Runtime $RuntimeEsperado não apareceu no log. Confira no Expo antes de esperar a atualização:"
  Write-Host "https://expo.dev/accounts/controlalls-team/projects/eo/updates"
}

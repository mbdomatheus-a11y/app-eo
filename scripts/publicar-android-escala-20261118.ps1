[CmdletBinding()]
param()
# Envia a main (com a correção da saída do editor da Escala no portal) e compila o AAB Android.
# Não altera banco, Runtime nem OTA. Executar no PowerShell do Matheus, com GitHub CLI autenticado.
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

$branch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $branch -ne "main") { throw "Execute na pasta do EO, no ramo main." }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "GitHub CLI não encontrado. Não envie credenciais no chat." }

# Somente os arquivos desta entrega entram no commit; arquivos de outras frentes ficam como estão.
$arquivos = @(
  "public/ferramentas/escala.html",
  "src/features/escala/EscalaModule.tsx",
  "scripts/publicar-android-escala-20261118.ps1",
  "docs/ANDROID-PLAY.md",
  "docs/CONTINUIDADE-EO.md",
  "docs/UX-MOBILE-ESCALA-20261117.md"
)
git add -- $arquivos
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "fix: confirma gravacao ao sair do editor da escala no portal e prepara AAB Android"
  if ($LASTEXITCODE -ne 0) { throw "O commit falhou. Nada foi enviado." }
}

git push origin main
if ($LASTEXITCODE -ne 0) { throw "O envio falhou. Nenhuma compilação foi solicitada." }

$inicio = (Get-Date).ToUniversalTime()
gh workflow run eo-mobile-build.yml --ref main -f platform=android-play
if ($LASTEXITCODE -ne 0) { throw "O GitHub não confirmou o início da compilação Android." }

$runId = $null
for ($i = 0; $i -lt 12 -and -not $runId; $i++) {
  Start-Sleep -Seconds 5
  $runs = gh run list --workflow eo-mobile-build.yml --branch main --event workflow_dispatch --limit 3 --json databaseId,createdAt | ConvertFrom-Json
  $runId = ($runs | Where-Object { ([datetime]$_.createdAt).ToUniversalTime() -ge $inicio.AddSeconds(-30) } | Select-Object -First 1).databaseId
}
if (-not $runId) { throw "Compilação solicitada, mas a execução não apareceu. Confira em https://github.com/mbdomatheus-a11y/app-eo/actions" }

Write-Host "Acompanhando a execução $runId (cerca de 20 minutos)..."
gh run watch $runId --exit-status
if ($LASTEXITCODE -ne 0) { throw "A compilação Android falhou. Envie só as últimas linhas do erro: gh run view $runId --log-failed" }

$destino = Join-Path $projectRoot "output\android\run-$runId"
New-Item -ItemType Directory -Force -Path $destino | Out-Null
gh run download $runId -p "eo-android-aab-*" -D $destino
Get-ChildItem -Recurse -Filter *.aab -Path $destino | ForEach-Object { Write-Host "AAB: $($_.FullName)" }

$envio = gh run view $runId --json jobs | ConvertFrom-Json
$passo = $envio.jobs.steps | Where-Object { $_.name -eq "Enviar ao teste interno da Play" } | Select-Object -First 1
Write-Host "Envio automático à Play (teste interno): $($passo.conclusion)"
Write-Host "Se aparecer skipped, o envio é manual: Play Console, EO, Teste fechado Alpha, Criar versão, enviar o AAB acima."
Write-Host "Se aparecer success, promova a versão do teste interno para o Teste fechado Alpha, onde estão os testadores."

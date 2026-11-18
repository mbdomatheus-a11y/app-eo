[CmdletBinding()]
param(
  # Compila o Android mesmo sem o segredo do Firebase (push no Android continuará sem funcionar).
  [switch]$SemFirebase
)
# 18/11/2026: menus reorganizados, Escala em tela cheia com rotação e trava de retrato no resto do app.
# Inclui dependência nativa nova (expo-screen-orientation): exige binário novo no Android e no iPhone.
# Não altera banco nem publica OTA. Executar no PowerShell do Matheus, com GitHub CLI autenticado.
$ErrorActionPreference = "Stop"
$projectRoot = "C:\Users\Usúario\Documents\ChatGPT\App_EO"
Set-Location -LiteralPath $projectRoot

$branch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $branch -ne "main") { throw "Execute na pasta do EO, no ramo main." }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "GitHub CLI não encontrado. Não envie credenciais no chat." }

$segredos = gh secret list --repo mbdomatheus-a11y/app-eo
if (-not ($segredos -match "GOOGLE_SERVICES_JSON_B64") -and -not $SemFirebase) {
  throw "Falta o segredo GOOGLE_SERVICES_JSON_B64 (Firebase). Faça a etapa do Firebase e rode de novo, ou rode com -SemFirebase."
}

$arquivos = @(
  "mobile/package.json",
  "mobile/package-lock.json",
  "mobile/app.json",
  "mobile/src/features/orientation.ts",
  "mobile/src/features/ScaleEditor.tsx",
  "mobile/src/navigation/route-screens.tsx",
  "mobile/src/app/(tabs)/_layout.tsx",
  "mobile/src/app/_layout.tsx",
  "scripts/publicar-reorganizacao-20261118.ps1",
  "docs/CONTINUIDADE-EO.md",
  "docs/ANDROID-PLAY.md",
  "docs/UX-MOBILE-ESCALA-20261117.md"
)
git add -- $arquivos
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "feat: reorganiza menus, escala em tela cheia com rotacao e retrato no restante do app"
  if ($LASTEXITCODE -ne 0) { throw "O commit falhou. Nada foi enviado." }
}
git push origin main
if ($LASTEXITCODE -ne 0) { throw "O envio falhou. Nenhuma compilação foi solicitada." }

$inicio = (Get-Date).ToUniversalTime()
gh workflow run eo-mobile-build.yml --ref main -f platform=android-play
if ($LASTEXITCODE -ne 0) { throw "O GitHub não confirmou a compilação Android." }
Start-Sleep -Seconds 3
gh workflow run eo-mobile-build.yml --ref main -f platform=ios-testflight
if ($LASTEXITCODE -ne 0) { throw "Android solicitado, mas o GitHub não confirmou a compilação iOS." }

$runs = @()
for ($i = 0; $i -lt 12 -and $runs.Count -lt 2; $i++) {
  Start-Sleep -Seconds 5
  $runs = @(gh run list --workflow eo-mobile-build.yml --branch main --event workflow_dispatch --limit 4 --json databaseId,createdAt | ConvertFrom-Json |
    Where-Object { ([datetime]$_.createdAt).ToUniversalTime() -ge $inicio.AddSeconds(-30) } | Sort-Object createdAt)
}
if ($runs.Count -lt 1) { throw "Compilações solicitadas, mas não apareceram. Confira em https://github.com/mbdomatheus-a11y/app-eo/actions" }
$androidId = $runs[0].databaseId
if ($runs.Count -ge 2) { Write-Host "iOS: execução $($runs[1].databaseId). Envia sozinho ao TestFlight." }

Write-Host "Acompanhando o Android, execução $androidId (cerca de 20 minutos)..."
gh run watch $androidId --exit-status
if ($LASTEXITCODE -ne 0) { throw "A compilação Android falhou. Envie só as últimas linhas: gh run view $androidId --log-failed" }

$destino = Join-Path $projectRoot "output\android\run-$androidId"
New-Item -ItemType Directory -Force -Path $destino | Out-Null
gh run download $androidId -p "eo-android-aab-*" -D $destino
Get-ChildItem -Recurse -Filter *.aab -Path $destino | ForEach-Object { Write-Host "AAB para enviar à Play: $($_.FullName)" }
Write-Host "No Play Console: Teste fechado, Alpha, Criar versão, Enviar este AAB. Se aparecer versão anterior incluída, remova."

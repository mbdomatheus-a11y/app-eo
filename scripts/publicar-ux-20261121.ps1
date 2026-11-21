[CmdletBinding()]
param()
# 21/11/2026: movimento, resposta ao toque e estados de carregamento no site e no app.
# Envia a main (site pelo Vercel) e publica OTA no Android e no iPhone, conferindo o Runtime.
$ErrorActionPreference = "Stop"
$projectRoot = "C:\Users\Usúario\Documents\ChatGPT\App_EO"
Set-Location -LiteralPath $projectRoot
$branch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $branch -ne "main") { throw "Execute na pasta do EO, no ramo main." }

$arquivos = @(
  "docs/REMODELAGEM-ESPEC-20261119.md",
  "docs/UX-MOVIMENTO-CARREGAMENTO-20261121.md",
  "docs/referencias/PFINS_SPEC_REPLICACAO.md",
  "mobile/src/design.tsx",
  "mobile/src/ui.tsx",
  "mobile/src/features/Loading.tsx",
  "mobile/src/features/ReportsHub.tsx",
  "mobile/src/features/SalesReportsScreen.tsx",
  "mobile/src/features/ScaleScreen.tsx",
  "src/components/Loading.tsx",
  "src/ConnectedApp.tsx",
  "src/portal.css",
  "src/features/escala/EscalaModule.tsx",
  "src/features/identity/ModuleIconSettings.tsx",
  "src/features/reports/ReportsHub.tsx",
  "src/features/sales/SalesDatasetView.tsx",
  "src/features/sales/SalesReports.tsx",
  "scripts/publicar-ux-20261121.ps1"
)
git add -- $arquivos
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "feat: movimento, resposta ao toque e estados de carregamento no site e no app"
  if ($LASTEXITCODE -ne 0) { throw "O commit falhou. Nada foi enviado." }
}
git push origin main
if ($LASTEXITCODE -ne 0) { throw "O envio falhou." }
Write-Host "Site: o Vercel publica em alguns minutos em https://app-eo.vercel.app/"

$ota = Join-Path $projectRoot "scripts\publicar-ota-20261119.ps1"
& $ota -Plataforma android -RuntimeEsperado "d50e3fea02bb63f3c59c99496c0aa06b2f8e5c08" -Mensagem "Toque, movimento e carregamento"
& $ota -Plataforma ios -RuntimeEsperado "ede61a46f0c16cdae8329875390ef82f0b27252f" -Mensagem "Toque, movimento e carregamento"

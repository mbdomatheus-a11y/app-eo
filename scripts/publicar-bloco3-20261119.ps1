[CmdletBinding()]
param()
# 19/11/2026: bloco 3 da especificação (salvamento discreto no checklist, economia de dados, orientação de
# tamanho de texto) e estrutura do código (CI com tipos do app). Envia a main e publica OTA no Android e
# no iPhone, conferindo o Runtime de cada aparelho.
$ErrorActionPreference = "Stop"
$projectRoot = "C:\Users\Usúario\Documents\ChatGPT\App_EO"
Set-Location -LiteralPath $projectRoot
$branch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $branch -ne "main") { throw "Execute na pasta do EO, no ramo main." }

$arquivos = @(
  ".github/workflows/ci.yml",
  "docs/ESTRUTURA-CODIGO.md",
  "docs/REMODELAGEM-ESPEC-20261119.md",
  "mobile/App.tsx",
  "mobile/src/app/device.tsx",
  "mobile/src/features/SaveStatus.tsx",
  "mobile/src/features/data-saver.ts",
  "mobile/src/features/ActionAgenda.tsx",
  "mobile/src/features/AssortmentTiming.tsx",
  "mobile/src/features/Communications.tsx",
  "mobile/src/features/MoodReminderBanner.tsx",
  "mobile/src/providers/eo-provider.tsx",
  "scripts/publicar-ota-20261119.ps1",
  "scripts/publicar-bloco3-20261119.ps1"
)
git add -- $arquivos
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "feat: salvamento discreto no checklist, economia de dados e tipos do app na CI"
  if ($LASTEXITCODE -ne 0) { throw "O commit falhou. Nada foi enviado." }
}
git push origin main
if ($LASTEXITCODE -ne 0) { throw "O envio falhou. Nenhuma OTA foi publicada." }

$ota = Join-Path $projectRoot "scripts\publicar-ota-20261119.ps1"
& $ota -Plataforma android -RuntimeEsperado "d50e3fea02bb63f3c59c99496c0aa06b2f8e5c08" -Mensagem "Bloco 3: salvamento discreto e economia de dados"
& $ota -Plataforma ios -RuntimeEsperado "ede61a46f0c16cdae8329875390ef82f0b27252f" -Mensagem "Bloco 3: salvamento discreto e economia de dados"

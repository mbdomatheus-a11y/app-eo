[CmdletBinding()]
param()
# 19/11/2026: navegação em blocos (Início, Aplicativos, barra inferior, menu do botão central e aba Mais).
# Só JavaScript: publica por OTA no Android e no iPhone, conferindo o Runtime de cada aparelho.
$ErrorActionPreference = "Stop"
$projectRoot = "C:\Users\Usúario\Documents\ChatGPT\App_EO"
Set-Location -LiteralPath $projectRoot
$branch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $branch -ne "main") { throw "Execute na pasta do EO, no ramo main." }

$arquivos = @(
  "mobile/App.tsx",
  "mobile/src/app/(tabs)/_layout.tsx",
  "mobile/src/app/_layout.tsx",
  "mobile/src/app/contact.tsx",
  "mobile/src/features/Launcher.tsx",
  "mobile/src/navigation/route-screens.tsx",
  "docs/REMODELAGEM-ESPEC-20261119.md",
  "scripts/publicar-navegacao-20261119.ps1"
)
git add -- $arquivos
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "feat: navegacao em blocos, barra com aba ativa, menu de acoes em grade e aba Mais organizada"
  if ($LASTEXITCODE -ne 0) { throw "O commit falhou. Nada foi enviado." }
}
git push origin main
if ($LASTEXITCODE -ne 0) { throw "O envio falhou. Nenhuma OTA foi publicada." }

$ota = Join-Path $projectRoot "scripts\publicar-ota-20261119.ps1"
& $ota -Plataforma android -RuntimeEsperado "d50e3fea02bb63f3c59c99496c0aa06b2f8e5c08" -Mensagem "Navegacao em blocos e menus"
& $ota -Plataforma ios -RuntimeEsperado "ede61a46f0c16cdae8329875390ef82f0b27252f" -Mensagem "Navegacao em blocos e menus"

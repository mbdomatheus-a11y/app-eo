[CmdletBinding()]
param()
# 19/11/2026: Fundação da especificação, blocos 1 (app) e 2 (site). Envia a main; o Vercel publica o site.
# O app recebe estas telas por OTA só depois de conferir que o Runtime instalado é igual ao da OTA.
$ErrorActionPreference = "Stop"
$projectRoot = "C:\Users\Usúario\Documents\ChatGPT\App_EO"
Set-Location -LiteralPath $projectRoot

$branch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $branch -ne "main") { throw "Execute na pasta do EO, no ramo main." }

$arquivos = @(
  "docs/ESPECIFICACAO-PRODUTO.md",
  "docs/REMODELAGEM-ESPEC-20261119.md",
  "mobile/App.tsx",
  "mobile/src/app/(tabs)/_layout.tsx",
  "mobile/src/app/_layout.tsx",
  "mobile/src/features/CommercialScreen.tsx",
  "mobile/src/features/OfflineStatus.tsx",
  "mobile/src/features/app-icons.ts",
  "mobile/src/features/ModuleSearch.tsx",
  "mobile/src/features/module-catalog.ts",
  "mobile/src/navigation/route-screens.tsx",
  "scripts/publicar-reorganizacao-20261118.ps1",
  "scripts/publicar-fundacao-20261119.ps1",
  "src/App.tsx",
  "src/ConnectedApp.tsx",
  "src/core/app-icons.ts",
  "src/core/module-search.ts",
  "src/features/search/ModuleSearchBar.tsx",
  "src/features/commercial/CommercialPanel.tsx",
  "src/features/operations/OperationsPanel.tsx",
  "src/mobile/NativeExperience.tsx",
  "src/portal.css"
)
git add -- $arquivos
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "feat: fundacao da especificacao com catalogo unico, busca no topo e acao principal"
  if ($LASTEXITCODE -ne 0) { throw "O commit falhou. Nada foi enviado." }
}
git push origin main
if ($LASTEXITCODE -ne 0) { throw "O envio falhou." }
Write-Host "Enviado. O Vercel publica o site em alguns minutos: https://app-eo.vercel.app/"
Write-Host "Verificação automática: https://github.com/mbdomatheus-a11y/app-eo/actions"

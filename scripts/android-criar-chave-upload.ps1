# Cria a chave de upload do Android do EO e cadastra os segredos no GitHub (repositorio app-eo).
# Rode UMA vez no PowerShell, dentro da pasta App_EO:  powershell -ExecutionPolicy Bypass -File scripts\android-criar-chave-upload.ps1
# Requisitos: Java (keytool) e GitHub CLI (gh) logado. Nada daqui vai para o repositorio.
$ErrorActionPreference = "Stop"
$pasta = Join-Path $env:USERPROFILE "Documents\EO-chaves"
New-Item -ItemType Directory -Force -Path $pasta | Out-Null
$arquivo = Join-Path $pasta "eo-upload.keystore"
if (Test-Path $arquivo) { throw "Ja existe $arquivo. Nao gere outra chave: a Play so aceita a chave cadastrada." }

$keytool = (Get-Command keytool -ErrorAction SilentlyContinue).Source
if (-not $keytool) {
  $jbr = "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"
  if (Test-Path $jbr) { $keytool = $jbr } else { throw "keytool nao encontrado. Instale o Java (Temurin 21) ou o Android Studio." }
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "GitHub CLI (gh) nao encontrado. Instale em https://cli.github.com e rode 'gh auth login'." }

$bytes = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$senha = [Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', ''
$alias = "eo-upload"
& $keytool -genkeypair -v -storetype PKCS12 -keystore $arquivo -alias $alias -keyalg RSA -keysize 4096 -validity 10000 `
  -storepass $senha -keypass $senha -dname "CN=Excelencia Operacional EO, O=Pernambucanas, C=BR"

$repo = "mbdomatheus-a11y/app-eo"
[Convert]::ToBase64String([IO.File]::ReadAllBytes($arquivo)) | gh secret set ANDROID_UPLOAD_KEYSTORE_B64 --repo $repo
$senha | gh secret set ANDROID_UPLOAD_KEYSTORE_PASSWORD --repo $repo
$senha | gh secret set ANDROID_UPLOAD_KEY_PASSWORD --repo $repo
$alias | gh secret set ANDROID_UPLOAD_KEY_ALIAS --repo $repo

Write-Host ""
Write-Host "Chave criada em $arquivo e segredos cadastrados no GitHub." -ForegroundColor Green
Write-Host "Guarde AGORA no seu gerenciador de senhas a senha abaixo e uma copia do arquivo .keystore:" -ForegroundColor Yellow
Write-Host $senha

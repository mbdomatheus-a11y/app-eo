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
  $candidatos = @("C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe") +
    (Get-ChildItem "C:\Program Files\Eclipse Adoptium\*\bin\keytool.exe", "C:\Program Files\Java\*\bin\keytool.exe", "C:\Program Files\Microsoft\jdk*\bin\keytool.exe" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  $keytool = $candidatos | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $keytool) { throw "keytool nao encontrado. Rode: winget install EclipseAdoptium.Temurin.21.JDK  e depois rode este script de novo." }
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "GitHub CLI (gh) nao encontrado. Rode: winget install GitHub.cli  feche e abra o PowerShell, rode gh auth login e depois este script de novo." }

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

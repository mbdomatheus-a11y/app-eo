[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
throw 'A OTA da Escala saiu com Runtime diferente do iPhone atual. Execute scripts/publicar-testflight-versao.ps1 para gerar uma nova compilação iOS.'

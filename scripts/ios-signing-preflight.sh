#!/bin/bash
set -euo pipefail
# Não fabricar um xcarchive sem os metadados/perfil de um archive Xcode real.
# O gate definitivo permanece no IPA e no perfil reais, antes de qualquer upload.
python3 ../scripts/ios-validate-signing-inputs.py "$1" "$2"

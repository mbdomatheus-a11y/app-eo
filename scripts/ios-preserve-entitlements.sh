#!/bin/bash
set -euo pipefail
app_path="$1"
source_entitlements="$2"
target_entitlements="$3"
python3 - "$source_entitlements" "$target_entitlements" <<'PY'
import os, plistlib, sys
with open(sys.argv[1], 'rb') as f:
    entitlements = plistlib.load(f)
if entitlements.get('aps-environment') != 'production':
    raise SystemExit('O target EO precisa declarar APNs production.')
team = os.environ['APPLE_TEAM_ID']
entitlements.update({'application-identifier': team + '.com.appeo.mobile',
                     'com.apple.developer.team-identifier': team,
                     'get-task-allow': False})
with open(sys.argv[2], 'wb') as f:
    plistlib.dump(entitlements, f)
PY
# Preserve target entitlements in an intermediate local signature. Xcode replaces
# this signature with the Apple Distribution signature during App Store export.
while IFS= read -r -d '' nested; do
  codesign --force --sign - --timestamp=none "$nested"
done < <(find "$app_path" -depth \( -name '*.framework' -o -name '*.dylib' \) -print0)
codesign --force --sign - --timestamp=none --entitlements "$target_entitlements" "$app_path"
codesign --display --entitlements - --xml "$app_path" > "$target_entitlements.verified"
test "$(/usr/libexec/PlistBuddy -c 'Print :aps-environment' "$target_entitlements.verified")" = production

#!/bin/bash
set -euo pipefail
export_options="$1"
source_entitlements="$2"
probe_archive="$RUNNER_TEMP/EO-signing-probe.xcarchive"
probe_app="$probe_archive/Products/Applications/EOProbe.app"
mkdir -p "$probe_app"
printf 'int main(void) { return 0; }\n' > "$RUNNER_TEMP/EOProbe.c"
xcrun --sdk iphoneos clang -arch arm64 -miphoneos-version-min=16.0 \
  "$RUNNER_TEMP/EOProbe.c" -o "$probe_app/EOProbe"
python3 - "$probe_archive" "$probe_app" <<'PY'
import datetime, plistlib, sys
archive, app = sys.argv[1:]
info = {'CFBundleIdentifier': 'com.appeo.mobile', 'CFBundleName': 'EOProbe',
        'CFBundleExecutable': 'EOProbe', 'CFBundlePackageType': 'APPL',
        'CFBundleShortVersionString': '1.0.0', 'CFBundleVersion': '19',
        'CFBundleSupportedPlatforms': ['iPhoneOS'], 'MinimumOSVersion': '16.0',
        'UIDeviceFamily': [1, 2], 'LSRequiresIPhoneOS': True}
with open(app + '/Info.plist', 'wb') as f:
    plistlib.dump(info, f)
with open(archive + '/Info.plist', 'wb') as f:
    plistlib.dump({'ArchiveVersion': 2, 'CreationDate': datetime.datetime.now(datetime.timezone.utc),
                  'Name': 'EOProbe', 'SchemeName': 'EOProbe',
                  'ApplicationProperties': {'ApplicationPath': 'Applications/EOProbe.app',
                    'CFBundleIdentifier': 'com.appeo.mobile', 'CFBundleShortVersionString': '1.0.0',
                    'CFBundleVersion': '19', 'Architectures': ['arm64'], 'SigningIdentity': ''}}, f)
PY
bash ../scripts/ios-preserve-entitlements.sh "$probe_app" "$source_entitlements" "$RUNNER_TEMP/EO-probe-entitlements.plist"
xcodebuild -exportArchive -archivePath "$probe_archive" \
  -exportPath "$RUNNER_TEMP/EO-probe-export" -exportOptionsPlist "$export_options" \
  -allowProvisioningUpdates -authenticationKeyPath "$ASC_API_KEY_PATH" \
  -authenticationKeyID "$ASC_API_KEY_ID" -authenticationKeyIssuerID "$ASC_API_ISSUER_ID"
probe_ipa="$(find "$RUNNER_TEMP/EO-probe-export" -maxdepth 1 -name '*.ipa' -print -quit)"
test -n "$probe_ipa"
unzip -q "$probe_ipa" -d "$RUNNER_TEMP/EO-probe-verify"
signed_app="$(find "$RUNNER_TEMP/EO-probe-verify/Payload" -maxdepth 1 -name '*.app' -print -quit)"
codesign --display --entitlements - --xml "$signed_app" > "$RUNNER_TEMP/EO-probe-signed.plist"
test "$(/usr/libexec/PlistBuddy -c 'Print :aps-environment' "$RUNNER_TEMP/EO-probe-signed.plist")" = production
security cms -D -i "$signed_app/embedded.mobileprovision" > "$RUNNER_TEMP/EO-probe-profile.plist"
test "$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:aps-environment' "$RUNNER_TEMP/EO-probe-profile.plist")" = production
echo 'Assinatura App Store e APNs production validados antes de compilar o app. A amostra não foi enviada à Apple.'

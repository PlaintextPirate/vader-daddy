#!/bin/bash
# Builds VaderDaddy.app (a window around `vader serve`) and installs it to /Applications (or ~/Applications).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/app/build/VaderDaddy.app"
rm -rf "$OUT"; mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources"
( cd "$ROOT/ui" && [ -d node_modules ] || npm i --no-audit --no-fund; npm run build >/dev/null )
swiftc -O -target "$(uname -m)-apple-macos13.0" -o "$OUT/Contents/MacOS/VaderDaddy" "$ROOT/app/main.swift" -framework Cocoa -framework WebKit
printf '%s\n' "$ROOT/bin/vader" > "$OUT/Contents/Resources/vader-path.txt"
cp "$ROOT/app/AppIcon.icns" "$OUT/Contents/Resources/AppIcon.icns"  # made from icon.svg by app/icon.sh
cat > "$OUT/Contents/Info.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>VaderDaddy</string>
  <key>CFBundleDisplayName</key><string>VaderDaddy</string>
  <key>CFBundleIdentifier</key><string>com.vaderdaddy.app</string>
  <key>CFBundleExecutable</key><string>VaderDaddy</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PL
codesign --force -s - "$OUT" >/dev/null 2>&1 || true
DEST=/Applications; [ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }
rm -rf "$DEST/VaderDaddy.app"; cp -R "$OUT" "$DEST/"
echo "Installed $DEST/VaderDaddy.app"

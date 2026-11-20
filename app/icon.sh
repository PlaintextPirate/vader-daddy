#!/bin/bash
# Renders app/icon.svg to app/AppIcon.icns (kept in the repository; app/build.sh only copies it).
# Needs Google Chrome for the SVG render. Run after changing icon.svg:  app/icon.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Google Chrome not found."; exit 1; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1024,1024 \
  --default-background-color=00000000 --screenshot="$TMP/1024.png" "file://$HERE/icon.svg" >/dev/null 2>&1
SET="$TMP/AppIcon.iconset"; mkdir "$SET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$TMP/1024.png" --out "$SET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$TMP/1024.png" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o "$HERE/AppIcon.icns"
cp "$TMP/1024.png" "$HERE/icon.png"
echo "Wrote $HERE/AppIcon.icns"

#!/bin/bash
# Installs the VaderDaddy helper (root daemon for the dongle in XInput mode). Run:  sudo helper/install.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run with sudo."; exit 1; }
OWNER_UID="${SUDO_UID:?run via sudo from your own account}"
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="/Library/Application Support/VaderDaddy"
PLIST=/Library/LaunchDaemons/com.vaderdaddy.helper.plist
PYUSB="$(echo "$SRC"/../.venv/lib/python3*/site-packages/usb)"
# Homebrew is in /opt/homebrew on Apple silicon and /usr/local on Intel Macs.
BREW_LIB=/opt/homebrew/lib; [ -e "$BREW_LIB/libusb-1.0.0.dylib" ] || BREW_LIB=/usr/local/lib
LIBUSB="$(/usr/bin/readlink -f "$BREW_LIB/libusb-1.0.0.dylib" 2>/dev/null || echo "$BREW_LIB/libusb-1.0.0.dylib")"
[ -d "$PYUSB" ] || { echo "pyusb not found. Set up the project first (see README.md): python3 -m venv .venv && .venv/bin/pip install hidapi pyusb"; exit 1; }
[ -f "$LIBUSB" ] || { echo "libusb not found (brew install libusb)"; exit 1; }

launchctl bootout system "$PLIST" 2>/dev/null || true
rm -rf "$DEST"; mkdir -p "$DEST"
cp "$SRC/vader_helper.py" "$DEST/"
cp -R "$PYUSB" "$DEST/usb"
cp "$LIBUSB" "$DEST/libusb-1.0.0.dylib"
find "$DEST" -name '__pycache__' -prune -exec rm -rf {} +
printf '{"uid": %s}\n' "$OWNER_UID" > "$DEST/helper.json"
# Everything the root daemon runs must be writable by root only.
chown -R root:wheel "$DEST"; chmod -R go-w "$DEST"

cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.vaderdaddy.helper</string>
  <key>ProgramArguments</key><array><string>/usr/bin/python3</string><string>$DEST/vader_helper.py</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>/var/log/vaderdaddy.log</string>
</dict></plist>
PL
chown root:wheel "$PLIST"; chmod 644 "$PLIST"
launchctl bootstrap system "$PLIST"
for _ in $(seq 1 20); do [ -S /var/run/vaderdaddy.sock ] && break; sleep 0.5; done
[ -S /var/run/vaderdaddy.sock ] && echo "Helper installed and running (socket owned by uid $OWNER_UID)." || { echo "Helper did not start; see /var/log/vaderdaddy.log"; tail -5 /var/log/vaderdaddy.log 2>/dev/null; exit 1; }

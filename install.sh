#!/bin/bash
# Sets up everything and installs VaderDaddy.app. Run from this folder:  ./install.sh
#   ./install.sh --no-helper   skips the wireless helper (the only step that asks for your password);
#                              the app then works over the USB-C cable and the dongle in DInput mode.
# Safe to run again: it updates what is already there.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
HELPER=1; [ "${1:-}" = "--no-helper" ] && HELPER=0
say() { printf '\n==> %s\n' "$1"; }
need() { echo; echo "Missing: $1"; echo "  $2"; echo "Then run ./install.sh again."; exit 1; }

[ "$(uname)" = Darwin ] || { echo "VaderDaddy is a macOS app."; exit 1; }
[ "$(id -u)" != 0 ] || { echo "Run this without sudo; it asks for your password when it needs it."; exit 1; }
xcrun --find swiftc >/dev/null 2>&1 || need "Xcode command line tools" "xcode-select --install"
command -v brew >/dev/null || need "Homebrew" "See https://brew.sh"
command -v python3 >/dev/null || need "Python 3" "brew install python"
command -v npm >/dev/null || need "Node.js" "brew install node"

say "USB library"
brew list libusb >/dev/null 2>&1 || brew install libusb

say "Python environment"
[ -x .venv/bin/python ] || python3 -m venv .venv
.venv/bin/pip install --quiet --disable-pip-version-check hidapi pyusb

say "Building the app (a minute or two the first time)"
app/build.sh

if [ "$HELPER" = 1 ]; then
  say "Wireless helper (needed for the dongle in XInput mode; asks for your Mac password)"
  sudo helper/install.sh
fi

say "Done. Opening VaderDaddy."
echo "Keep this folder where it is: the app runs from it. To remove everything: ./uninstall.sh"
pkill -x VaderDaddy 2>/dev/null || true
pkill -f "vader.cli serve" 2>/dev/null || true
open -a VaderDaddy

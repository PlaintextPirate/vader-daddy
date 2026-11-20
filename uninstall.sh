#!/bin/bash
# Removes VaderDaddy.app and the wireless helper. Run from this folder:  ./uninstall.sh
# Your backups and settings in ~/Library/Application Support/VaderDaddy and this folder are left alone.
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
pkill -x VaderDaddy 2>/dev/null
pkill -f "vader.cli serve" 2>/dev/null
for app in /Applications/VaderDaddy.app "$HOME/Applications/VaderDaddy.app"; do
  [ -d "$app" ] && rm -rf "$app" && echo "Removed $app"
done
if [ -e /Library/LaunchDaemons/com.vaderdaddy.helper.plist ]; then
  echo "Removing the wireless helper (asks for your Mac password)."
  sudo "$ROOT/helper/uninstall.sh"
fi
echo "Done. Delete this folder to remove the rest."

#!/bin/bash
# Removes the VaderDaddy helper. Run:  sudo helper/uninstall.sh
set -u
[ "$(id -u)" = 0 ] || { echo "Run with sudo."; exit 1; }
launchctl bootout system /Library/LaunchDaemons/com.vaderdaddy.helper.plist 2>/dev/null
rm -f /Library/LaunchDaemons/com.vaderdaddy.helper.plist /var/run/vaderdaddy.sock
rm -rf "/Library/Application Support/VaderDaddy"
echo "Helper removed."

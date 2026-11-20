#!/usr/bin/env python3
"""Logs every button change (about 5 ms resolution) from the running app, for measuring turbo timing.
Output: backups/turbo-cal.txt. Stops after 15 minutes."""
import json, os, time, urllib.request
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
f = open(os.path.join(root, "backups", "turbo-cal.txt"), "w")
t0 = time.monotonic(); last = None
while time.monotonic() - t0 < 900:
    try:
        s = json.load(urllib.request.urlopen("http://127.0.0.1:47815/api/input", timeout=1))
    except Exception:
        time.sleep(0.3); continue
    if s.get("connected"):
        cur = (tuple(sorted(s.get("buttons", []))), tuple(sorted(s.get("rates", {}).items())))
        if cur != last:
            f.write(f"{time.monotonic() - t0:8.3f} {'+'.join(cur[0]) or '-':6} rates={dict(cur[1])}\n"); f.flush(); last = cur
    time.sleep(0.003)

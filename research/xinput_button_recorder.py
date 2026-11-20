#!/usr/bin/env python3
"""Background recorder for tests: logs every button change with timestamps to backups/button-log-xinput.txt.

It polls the running app's live-input endpoint (the app holds the gamepad's HID device exclusively, so a second
reader can't open it). Resolution is about 5 ms. Stops by itself after 20 minutes.
Run:  .venv/bin/python research/xinput_button_recorder.py &
"""
import json, os, time, urllib.request

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
f = open(os.path.join(root, "backups", "button-log-xinput.txt"), "w")
f.write(time.strftime("recorder started %H:%M:%S (polling the app)\n")); f.flush()
t0 = time.monotonic(); last = None; prev = None
while time.monotonic() - t0 < 1200:
    try:
        s = json.load(urllib.request.urlopen("http://127.0.0.1:47815/api/input", timeout=1))
    except Exception:
        time.sleep(0.5); continue
    cur = tuple(sorted(s.get("buttons", []))) if s.get("connected") else None
    if cur is not None and last is not None and cur != last:
        t = time.monotonic() - t0
        f.write(f"{t:7.2f}s {('+%5.0fms' % ((t - prev) * 1000)) if prev is not None else '        '}  {'+'.join(cur) or '-'}\n"); f.flush(); prev = t
    if cur is not None:
        last = cur
    time.sleep(0.004)

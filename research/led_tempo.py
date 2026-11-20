"""Measures how fast the controller really plays an animation, by tapping along.

Run with VaderDaddy open and the controller on:   .venv/bin/python research/led_tempo.py

It shows a test pattern on the light bar (red fading to off and back) WITHOUT saving it, asks you to press Enter
each time the bar goes fully off, and puts your own lighting back at the end (also on Ctrl-C).
Prints the time per step for each stored speed, which is what the app needs to draw animations in step.
"""
import json
import statistics
import time
import urllib.request

API = "http://127.0.0.1:47815/api/call"
FILLER = bytes((0x00, 0x74, 0xFF))  # what unused cells hold in the factory animation
TAPS = 7


def call(**body):
    req = urllib.request.Request(API, json.dumps(body).encode(), {"Content-Type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=60))
    if not r.get("ok"):
        raise SystemExit(f"{body.get('op')}: {r.get('error')}")
    return r


def pattern(raw, speed):
    """Two steps, every LED: full red, then off. Same layout the app writes for an animation."""
    out = bytearray(raw[:490])
    out[2], out[3], out[4], out[5], out[6], out[7], out[8] = 0, 0, 1, speed, 60, 5, 1
    out[20:470] = FILLER * 150  # 15 LED blocks of 10 cells; the 20 bytes after them stay as read
    for led in range(5):
        at = 20 + led * 30
        out[at : at + 6] = bytes((100, 0, 0, 0, 0, 0))
    return bytes(out)


def run(slot, raw, speed):
    call(op="write_led", slot=slot, data=pattern(raw, speed).hex())
    t0 = time.monotonic()
    print(f"\nSpeed {speed}: press Enter each time the bar goes fully OFF ({TAPS} times).")
    taps = []
    for i in range(TAPS):
        input(f"  {i + 1}/{TAPS} ")
        taps.append(time.monotonic() - t0)
    gaps = [b - a for a, b in zip(taps, taps[1:])]
    loop = statistics.median(gaps)
    print(f"  one loop (off -> red -> off): {loop:.2f} s; per step: {loop / 2 * 1000:.0f} ms; "
          f"per speed unit: {loop / 2 / speed * 1000:.1f} ms")
    print(f"  first off came {taps[0]:.2f} s after the pattern was sent ({taps[0] % loop:.2f} s into a loop)")
    print(f"  gaps: {' '.join(f'{g:.2f}' for g in gaps)}")
    return loop / 2 / speed * 1000


def main():
    slot = call(op="active_profile").get("slot")
    if slot is None:
        raise SystemExit("Could not tell which profile is active.")
    raw = bytes.fromhex(call(op="read_led", slot=slot)["data"])
    units = []
    try:
        for speed in (25, 10):
            units.append(run(slot, raw, speed))
    finally:
        call(op="write_led", slot=slot, data=raw[:490].hex())
        print("\nYour lighting is back (nothing was saved).")
    print("RESULT ms per speed unit: " + ", ".join(f"{u:.1f}" for u in units))


if __name__ == "__main__":
    main()

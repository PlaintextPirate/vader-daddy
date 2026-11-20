"""Live controller input for the app's input panel: sticks, triggers and buttons as the Mac receives them.

Reads the ordinary gamepad HID device (no root, no helper):
  XInput dongle  045e:028e, the HID device macOS's Xbox driver exposes (20-byte Xbox 360 report)
  DInput / cable 04b4:2412, usage page 1 usage 5 (9-byte report)
A background thread keeps the latest state; the device vanishes briefly whenever the helper borrows the dongle,
so the reader just reopens it.
"""
import collections
import struct
import threading
import time

import hid

from . import keys

X_BUTTONS = {  # (byte, bit) -> name, Xbox 360 report
    (2, 0x01): "Up", (2, 0x02): "Down", (2, 0x04): "Left", (2, 0x08): "Right", (2, 0x10): "Start", (2, 0x20): "Select",
    (2, 0x40): "L3", (2, 0x80): "R3", (3, 0x01): "LB", (3, 0x02): "RB", (3, 0x04): "Home",
    (3, 0x10): "A", (3, 0x20): "B", (3, 0x40): "X", (3, 0x80): "Y",
}
# The controller fills the report's spare bytes 17..19 with its physical buttons, mapped or not (seen 2026-11-20:
# A -> byte 17 0x10, RB -> byte 18 0x08). The paddles are in byte 19; they reach the Mac here even when they have no
# assignment on the controller. M1 is not identified yet.
X_PADDLES = {(19, 0x04): "M2", (19, 0x20): "M3", (19, 0x10): "M4"}
D_BUTTONS = {(6, 0x80): "A", (6, 0x40): "B", (6, 0x10): "X", (6, 0x08): "Y", (6, 0x20): "C", (6, 0x04): "Z"}
HAT = {0: ["Up"], 1: ["Up", "Right"], 2: ["Right"], 3: ["Down", "Right"], 4: ["Down"], 5: ["Down", "Left"], 6: ["Left"], 7: ["Up", "Left"]}

_state = {"connected": False}
_lock = threading.Lock()
_changed = threading.Condition(_lock)
_seq = 0
_started = False
_buzz = None  # pending vibration test: {"left", "right", "until", "on", "done", "error"}


def _set(s):
    """Publish a new state and wake anything streaming it."""
    global _state, _seq
    with _changed:
        _state = s
        _seq += 1
        _changed.notify_all()


def _parse_x(b):
    lx, ly, rx, ry = struct.unpack_from("<hhhh", b, 6)
    paddles = [n for (i, m), n in X_PADDLES.items() if b[i] & m] if len(b) >= 20 else []
    return {"mode": "XInput", "paddles": paddles, "rawButtons": b[17:20].hex(), "lx": lx / 32767, "ly": ly / 32767, "rx": rx / 32767, "ry": ry / 32767,
            "raw": [lx, ly, rx, ry], "lt": b[4] / 255, "rt": b[5] / 255,
            "buttons": [n for (i, m), n in X_BUTTONS.items() if b[i] & m] + paddles}


def _parse_d(b):
    ax = [(v - 127.5) / 127.5 for v in b[0:4]]
    buttons = list(HAT.get(b[4] & 0x0F, []))
    buttons += [n for (i, m), n in D_BUTTONS.items() if b[i] & m]
    known = {(i, m) for (i, m) in D_BUTTONS}
    for i, lo in ((4, 4), (5, 0), (6, 0)):  # buttons not yet named in DInput: show them by position
        for bit in range(lo, 8):
            if b[i] & (1 << bit) and (i, 1 << bit) not in known:
                buttons.append(f"Button {i - 4}.{bit}")
    return {"mode": "DInput", "lx": ax[0], "ly": -ax[1], "rx": ax[2], "ry": -ax[3], "raw": list(b[0:4]),
            "lt": (b[7] / 255) if len(b) > 8 else 0, "rt": (b[8] / 255) if len(b) > 8 else 0, "buttons": buttons}


def _find():
    for d in hid.enumerate(0x045E, 0x028E):
        if d["usage"] == 5:
            return d["path"], _parse_x, 14
    for d in hid.enumerate(0x04B4, 0x2412):
        if (d["usage_page"], d["usage"]) == (1, 5):
            return d["path"], _parse_d, 9
    return None


def _run():
    while True:
        found = _find()
        if not found:
            _set({"connected": False})
            time.sleep(1.0)
            continue
        path, parse, need = found
        h = hid.device()
        try:
            h.open_path(path)
            idle = 0
            held = set()
            presses = collections.defaultdict(collections.deque)  # button -> times it went down in the last second
            while idle < 40:  # ~2 s without a report: assume the device went away and look again
                p = h.read(64, 50)
                _serve_buzz(h, parse)
                if not p:
                    idle += 1
                    continue
                idle = 0
                if len(p) >= need:
                    s = parse(bytes(p))
                    s["connected"] = True
                    keys.feed(s.get("paddles", ()))
                    # The panel only polls ~30 times a second, too slow to show turbo. Every report is seen
                    # here, so count presses per second per button and let the panel show that number.
                    now = time.monotonic()
                    down = set(s["buttons"])
                    for name in down - held:
                        presses[name].append(now)
                    held = down
                    rates = {}
                    for name, q in presses.items():
                        while q and now - q[0] > 1.0:
                            q.popleft()
                        if len(q) >= 3:
                            rates[name] = len(q)
                    s["rates"] = rates
                    _set(s)
        except (OSError, ValueError):
            pass
        finally:
            keys.feed(())  # never leave a key held when the controller goes away
            _fail_buzz("The controller went away.")
            try:
                h.close()
            except Exception:  # noqa: BLE001
                pass
        _set({"connected": False})
        time.sleep(0.3)


def _motors(h, left, right):
    """Xbox 360 rumble report: big (left) and small (right) motor, 0..255 each. Raises if the driver refuses it."""
    if h.write([0x00, 0x00, 0x08, 0x00, left, right, 0x00, 0x00, 0x00]) < 0:
        raise OSError(h.error() or "write failed")


def _fail_buzz(msg):
    global _buzz
    with _lock:
        b, _buzz = _buzz, None
    if b:
        b["error"] = b["error"] or (None if b["on"] else msg)
        b["done"].set()


def _serve_buzz(h, parse):
    """Runs on the reader thread between reads, so the device handle is only ever used from one thread."""
    global _buzz
    b = _buzz
    if not b:
        return
    try:
        if not b["on"]:
            if parse is not _parse_x:
                raise OSError("The vibration test needs the dongle in XInput mode.")
            _motors(h, b["left"], b["right"])
            b["on"] = True
            b["until"] = time.monotonic() + b["ms"] / 1000
            b["done"].set()  # started: the caller does not wait for the end
        elif b.get("renew"):
            # A newer request while running: change the levels and keep going (the app holds a toggle on by
            # asking again before the time runs out, so a closed window or a lost page always ends the rumble).
            left, right, ms = b.pop("renew")
            _motors(h, left, right)
            b["until"] = time.monotonic() + ms / 1000
        elif time.monotonic() >= b["until"]:
            _motors(h, 0, 0)
            with _lock:
                if _buzz is b:
                    _buzz = None
    except (OSError, ValueError) as e:
        b["error"] = str(e)
        with _lock:
            if _buzz is b:
                _buzz = None
        b["done"].set()


def buzz(left, right, ms):
    """Run both grip motors for `ms` milliseconds. Returns None when it started, or why it could not."""
    global _buzz
    _start()
    b = {"left": left, "right": right, "ms": ms, "until": 0.0, "on": False, "done": threading.Event(), "error": None}
    with _lock:
        if _buzz is not None:
            _buzz["renew"] = (left, right, ms)  # already running: extend it with the new levels
            return None
        _buzz = b
    if not b["done"].wait(6.0):
        with _lock:
            if _buzz is b:
                _buzz = None
        return "The controller did not answer. It may be busy; try again."
    return b["error"]


def _start():
    global _started
    with _lock:
        if not _started:
            _started = True
            threading.Thread(target=_run, daemon=True).start()


start = _start


def state():
    _start()
    with _lock:
        return dict(_state)


def wait(seen, timeout=1.0):
    """Block until the state is newer than `seen` (or the timeout passes); returns (sequence number, state)."""
    _start()
    with _changed:
        if _seq == seen:
            _changed.wait(timeout)
        return _seq, dict(_state)

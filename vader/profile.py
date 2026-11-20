"""Profile (840 bytes): only the fields mapped so far. Edits are applied on top of the raw bytes."""
PROFILE_BYTES = 840
KEYS = {0: "up", 1: "right", 2: "down", 3: "left", 4: "a", 5: "b", 6: "select", 7: "x", 8: "y", 9: "start",
        10: "lb", 11: "rb", 12: "lt", 13: "rt", 14: "l3", 15: "r3",
        # Extra buttons, identified on a Vader 4 Pro by pressing each one (2026-11-18). The older Flydigi
        # numbering (18 = M1, 19 = M2, 20 = M3, 21 = M4) is wrong for this controller.
        16: "c", 17: "z", 18: "m2", 19: "m1", 20: "m4", 21: "m3",
        24: "menu", 27: "home", 28: "back"}
IDS = {v: k for k, v in KEYS.items()}
DEADZONE = {"left": 110, "right": 117, "lt": 124, "rt": 131}
VERSION_BYTES = (225, 226)  # rewritten by the save command; ignore when comparing


def key_id(name):
    n = name.strip().lower()
    if n not in IDS:
        raise ValueError(f"Unknown button '{name}'. Buttons: {', '.join(IDS)}")
    return IDS[n]


def remaps(raw):
    out = {}
    for k, name in KEYS.items():
        t = raw[13 + k * 3]
        if t < 32 and t != k:
            out[name] = KEYS.get(t, str(t))
    return out


def set_remap(raw, source, target):
    b = bytearray(raw)
    b[13 + key_id(source) * 3] = 0xFF if target.lower() in ("default", "none") else key_id(target)
    return bytes(b)


def set_deadzone(raw, which, value):
    if which not in DEADZONE:
        raise ValueError(f"Deadzone must be one of: {', '.join(DEADZONE)}")
    limit = 127 if which in ("left", "right") else 255
    if not 0 <= value <= limit:
        raise ValueError(f"{which} deadzone must be 0..{limit}")
    b = bytearray(raw)
    b[DEADZONE[which]] = value
    return bytes(b)


def describe(raw):
    return {"deadzone": {k: raw[o] for k, o in DEADZONE.items()}, "remaps": remaps(raw),
            "vibration": raw[145] == 0, "version": raw[225] | raw[226] << 8}


def same(a, b):
    return len(a) == len(b) and all(a[i] == b[i] for i in range(len(a)) if i not in VERSION_BYTES)

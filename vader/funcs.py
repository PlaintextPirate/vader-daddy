"""Function settings: controller-wide hardware options that live outside the profile (Space Station: FuncSetConfig).

Read as one 10-byte block (XInput `A5 50 07`), set one at a time (`A5 50 <sub> <value>`). Option values and
labels are the ones Space Station 3.4.9.5's settings screen uses.
"""
ON_OFF = {0: "off", 1: "on"}
#           key                  label                         index  sub   choices
SETTINGS = [
    ("polling_rate",       "Polling rate",                  5, 0x0A, {1: "1000 Hz", 2: "500 Hz", 4: "250 Hz", 8: "125 Hz"}),
    ("stick_resolution",   "Stick resolution",              6, 0x0B, {3: "12 bit", 5: "11 bit", 2: "10 bit", 4: "9 bit", 1: "8 bit"}),
    ("centre_sensitivity", "Stick centre sensitivity",      7, 0x0D, {14: "high", 17: "medium", 20: "low"}),
    ("rebound",            "Stick rebound algorithm",       8, 0x0E, ON_OFF),
    ("auto_centre",        "Stick automatic calibration",   2, 0x09, ON_OFF),
    ("trigger_antishake",  "Trigger anti-shake",            1, 0x08, ON_OFF),
]
# Index 9 / sub 0x10 ("round type") is a global switch only on Flydigi's M1-family pads (Space Station shows it when
# GamePadVersionUtils.IsM1). The Vader 4 Pro ignores it: its circularity is per stick in the profile (bytes 800, 812).
BY_KEY = {s[0]: s for s in SETTINGS}


def describe(block: bytes):
    """[{key, name, value, label, choices}] for a 10-byte block."""
    out = []
    for key, name, idx, _sub, choices in SETTINGS:
        v = block[idx]
        out.append({"key": key, "name": name, "value": v, "label": choices.get(v, f"unknown ({v})"),
                    "choices": [{"value": k, "label": lab} for k, lab in choices.items()]})
    return out


def resolve(key: str, wanted) -> tuple:
    """(sub-command, value) for a setting key and a value given as a number or a label like '500 Hz' / 'on'."""
    if key not in BY_KEY:
        raise ValueError(f"Unknown setting '{key}'. Settings: {', '.join(BY_KEY)}")
    _k, _n, _idx, sub, choices = BY_KEY[key]
    w = str(wanted).strip().lower().replace(" ", "")
    for v, lab in choices.items():
        if w in (str(v), lab.lower().replace(" ", ""), lab.lower().split()[0]):
            return sub, v
    raise ValueError(f"'{wanted}' isn't an option for {key}. Options: {', '.join(choices.values())}")

"""Paddle -> keyboard key, done on this Mac (the controller itself cannot send keys).

The input reader (vader/inputs.py) sees the physical paddles in the spare bytes of the XInput report, also when a
paddle has no assignment on the controller. `feed()` gets the set of paddles held right now and presses or
releases the chosen key through a Core Graphics event, so a held paddle is a held key.

Works only while the service runs, and only once macOS has allowed the app to send keys (Privacy & Security >
Accessibility). The choice is kept in ~/Library/Application Support/VaderDaddy/paddle-keys.json.
"""
import ctypes
import json
import os
import threading

PATH = os.path.expanduser("~/Library/Application Support/VaderDaddy/paddle-keys.json")
PADDLES = ("M1", "M2", "M3", "M4")

# KeyboardEvent.code (what the page reports for a key press) -> macOS virtual key code (ANSI layout positions).
KEYCODES = {
    **{f"Key{c}": k for c, k in zip("ASDFHGZXCVBQWERYT", (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17))},
    "KeyO": 31, "KeyU": 32, "KeyI": 34, "KeyP": 35, "KeyL": 37, "KeyJ": 38, "KeyK": 40, "KeyN": 45, "KeyM": 46,
    "Digit1": 18, "Digit2": 19, "Digit3": 20, "Digit4": 21, "Digit6": 22, "Digit5": 23, "Digit9": 25, "Digit7": 26,
    "Digit8": 28, "Digit0": 29,
    "Equal": 24, "Minus": 27, "BracketRight": 30, "BracketLeft": 33, "Quote": 39, "Semicolon": 41, "Backslash": 42,
    "Comma": 43, "Slash": 44, "Period": 47, "Backquote": 50,
    "Enter": 36, "Tab": 48, "Space": 49, "Backspace": 51, "Escape": 53, "Delete": 117,
    "Home": 115, "End": 119, "PageUp": 116, "PageDown": 121,
    "ArrowLeft": 123, "ArrowRight": 124, "ArrowDown": 125, "ArrowUp": 126,
    "F1": 122, "F2": 120, "F3": 99, "F4": 118, "F5": 96, "F6": 97, "F7": 98, "F8": 100, "F9": 101, "F10": 109,
    "F11": 103, "F12": 111, "F13": 105, "F14": 107, "F15": 113, "F16": 106, "F17": 64, "F18": 79, "F19": 80, "F20": 90,
    "ShiftLeft": 56, "ShiftRight": 60, "ControlLeft": 59, "ControlRight": 62, "AltLeft": 58, "AltRight": 61,
    "MetaLeft": 55, "MetaRight": 54,
}
# Modifier keys travel as "flags changed" events carrying their flag while held.
MOD_FLAGS = {56: 0x20000, 60: 0x20000, 59: 0x40000, 62: 0x40000, 58: 0x80000, 61: 0x80000, 55: 0x100000, 54: 0x100000}
FLAGS_CHANGED, HID_TAP = 12, 0

_lock = threading.Lock()
_map = None  # paddle -> KeyboardEvent.code, loaded on first use
_held = frozenset()
_sent = {}  # paddle -> key code pressed for it and not yet released
_cg = None


def _core_graphics():
    global _cg
    if _cg is None:
        cg = ctypes.CDLL("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics")
        cg.CGEventCreateKeyboardEvent.restype = ctypes.c_void_p
        cg.CGEventCreateKeyboardEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint16, ctypes.c_bool]
        cg.CGEventSetType.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
        cg.CGEventSetFlags.argtypes = [ctypes.c_void_p, ctypes.c_uint64]
        cg.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]
        cg.CFRelease.argtypes = [ctypes.c_void_p]
        cg.CGPreflightPostEventAccess.restype = ctypes.c_bool
        cg.CGRequestPostEventAccess.restype = ctypes.c_bool
        _cg = cg
    return _cg


def _post(keycode, down):
    """Press or release one key system-wide. Without the Accessibility permission macOS drops it silently."""
    cg = _core_graphics()
    ev = cg.CGEventCreateKeyboardEvent(None, keycode, down)
    if not ev:
        return
    if keycode in MOD_FLAGS:
        cg.CGEventSetType(ev, FLAGS_CHANGED)
        cg.CGEventSetFlags(ev, MOD_FLAGS[keycode] if down else 0)
    cg.CGEventPost(HID_TAP, ev)
    cg.CFRelease(ev)


post = _post  # replaced in tests


def allowed():
    """True when macOS lets this process send keys."""
    try:
        return bool(_core_graphics().CGPreflightPostEventAccess())
    except (OSError, AttributeError):
        return False


def ask_permission():
    """Shows macOS's own prompt (once per app) and returns whether sending keys is allowed now."""
    try:
        return bool(_core_graphics().CGRequestPostEventAccess())
    except (OSError, AttributeError):
        return False


def _load():
    global _map
    if _map is None:
        try:
            raw = json.load(open(PATH))
        except (OSError, ValueError):
            raw = {}
        _map = {p: c for p, c in raw.items() if p in PADDLES and c in KEYCODES} if isinstance(raw, dict) else {}
    return _map


def get():
    """{"M1": code or None, ...} for every paddle."""
    with _lock:
        m = _load()
        return {p: m.get(p) for p in PADDLES}


def set_key(paddle, code):
    """Choose the key a paddle sends (a KeyboardEvent.code), or None for no key. Releases a key held for it."""
    if paddle not in PADDLES:
        raise ValueError(f"Unknown paddle '{paddle}'.")
    if code is not None and code not in KEYCODES:
        raise ValueError(f"That key ('{code}') can't be sent.")
    with _lock:
        m = dict(_load())
        if code is None:
            m.pop(paddle, None)
        else:
            m[paddle] = code
        os.makedirs(os.path.dirname(PATH), exist_ok=True)
        tmp = PATH + ".tmp"
        with open(tmp, "w") as f:
            json.dump(m, f)
        os.replace(tmp, PATH)
        _set_map(m)
        was = _sent.pop(paddle, None)
    if was is not None:
        post(was, False)


def _set_map(m):
    global _map
    _map = m


def feed(down):
    """Called by the input reader with the paddles held right now; presses and releases the keys chosen for them."""
    global _held
    down = frozenset(down)
    if down == _held:  # the common case, about a thousand times a second
        return
    todo = []
    with _lock:
        m = _load()
        for p in down - _held:
            code = m.get(p)
            if code:
                _sent[p] = KEYCODES[code]
                todo.append((KEYCODES[code], True))
        for p in _held - down:
            kc = _sent.pop(p, None)
            if kc is not None:
                todo.append((kc, False))
        _held = down
    for kc, is_down in todo:
        post(kc, is_down)

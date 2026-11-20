"""Lighting slot (v2): 500 bytes read, 490 written; channels are 0-100."""
LED_WRITE_BYTES, FRAME_OFFSET, FRAME_BYTES = 490, 20, 30
STEADY, ANIMATED = 5, 1
COLOURS = {
    "orange": (255, 79, 0), "red": (255, 0, 0), "green": (0, 255, 0), "blue": (0, 0, 255), "white": (255, 255, 255),
    "yellow": (255, 200, 0), "purple": (150, 0, 255), "pink": (255, 40, 120), "cyan": (0, 255, 255), "off": (0, 0, 0),
}


def parse_colour(s):
    s = s.strip().lower()
    if s in COLOURS:
        return COLOURS[s]
    h = s.lstrip("#")
    if len(h) == 6 and all(c in "0123456789abcdef" for c in h):
        return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))
    raise ValueError(f"Unknown colour '{s}'. Use a name ({', '.join(COLOURS)}) or #rrggbb.")


def to100(rgb):
    return tuple(round(v * 100 / 255) for v in rgb)


def to255(rgb):
    return tuple(round(min(v, 100) * 255 / 100) for v in rgb)


def make_steady(raw: bytes, rgb255, brightness: int) -> bytes:
    """The layout verified to persist: mode 5, 5 LEDs, frames cleared, colour in LED 0 of frames 0-4."""
    out = bytearray(raw[:LED_WRITE_BYTES].ljust(LED_WRITE_BYTES, b"\0"))
    out[2], out[4], out[6], out[7], out[8] = 0, 0, max(0, min(100, brightness)), 5, STEADY
    out[FRAME_OFFSET:] = bytes(LED_WRITE_BYTES - FRAME_OFFSET)
    c = to100(rgb255)
    for f in range(5):
        out[FRAME_OFFSET + f * FRAME_BYTES : FRAME_OFFSET + f * FRAME_BYTES + 3] = bytes(c)
    return bytes(out)


def describe(raw: bytes) -> dict:
    mode = {STEADY: "steady", ANIMATED: "animated"}.get(raw[8], f"mode {raw[8]}")
    rgb = to255(raw[FRAME_OFFSET : FRAME_OFFSET + 3])
    return {"mode": mode, "brightness": raw[6], "colour": "#%02x%02x%02x" % rgb if raw[8] == STEADY else None}

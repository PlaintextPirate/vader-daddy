#!/usr/bin/env python3
"""
Vader 4 Pro HID tool (cable or dongle, PC/DInput mode, VID 04B4 PID 2412, usage page 0xFFA0).
Used by vader.backends for the cable and the dongle in DInput mode. Also runnable for low-level work:
  .venv/bin/python -m vader.hid_transport info

  python -m vader.hid_transport info
  python -m vader.hid_transport backup [slot]                 -> backups/<time>-profile<slot>.bin, -led<slot>.bin
  python -m vader.hid_transport write-profile <file> [slot]   -> EA/22 write to working memory, then read back and diff
  python -m vader.hid_transport write-led <file> [slot]       -> E7/33 lighting write to working memory, read back and diff
  python -m vader.hid_transport save [version]                -> 50 03 commit to flash (cable only)
  python -m vader.hid_transport diff <a.bin> <b.bin>

Needs: pip install hidapi   (in the project's .venv)
"""
import os
import random
import sys
import time

import hid

VID, PID, PAGE, REPORT = 0x04B4, 0x2412, 0xFFA0, 0x05
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # project root (backups/ lives there)
hx = lambda b: " ".join(f"{x:02x}" for x in b)


def out_len_from_descriptor(desc: bytes) -> int | None:
    """Payload length (bytes, without id) of output report 5, from the HID report descriptor."""
    size = count = rid = 0
    bits: dict[int, int] = {}
    i = 0
    while i < len(desc):
        p = desc[i]
        if p == 0xFE:  # long item
            i += 3 + desc[i + 1]
            continue
        n = (0, 1, 2, 4)[p & 3]
        val = int.from_bytes(desc[i + 1 : i + 1 + n], "little")
        tag = p & 0xFC
        if tag == 0x74:
            size = val
        elif tag == 0x94:
            count = val
        elif tag == 0x84:
            rid = val
        elif tag == 0x90:  # Output
            bits[rid] = bits.get(rid, 0) + size * count
        i += 1 + n
    return bits[REPORT] // 8 if bits.get(REPORT) else None


class Vader:
    def __init__(self, verbose=True):
        self.verbose = verbose
        cands = [d for d in hid.enumerate(VID, PID) if d["usage_page"] == PAGE]
        if not cands:
            seen = [(hex(d["usage_page"]), d["interface_number"]) for d in hid.enumerate(VID, PID)]
            raise SystemExit(f"Config interface 0xFFA0 not found. Flydigi interfaces seen: {seen or 'none'}")
        self.d = hid.device()
        self.d.open_path(cands[0]["path"])
        self.out_len = 31
        try:
            n = out_len_from_descriptor(bytes(self.d.get_report_descriptor()))
            if n:
                self.out_len = n
        except Exception as e:  # noqa: BLE001
            self.log(f"(report descriptor unavailable: {e}; using {self.out_len})")
        self.log(f"opened {cands[0]['product_string']!r} out_len={self.out_len}")

    def log(self, s):
        if self.verbose:
            print(s, flush=True)

    def send(self, payload):
        buf = bytes([REPORT]) + bytes(payload[: self.out_len]).ljust(self.out_len, b"\0")
        self.log(f"tx {hx(payload[:16])}")
        if self.d.write(buf) < 0:
            raise RuntimeError(f"HID write failed: {self.d.error()}")

    def frames(self, ms):
        """Yield vendor reply frames (p[0]=report id 4, p[1..2]=ff f0) until `ms` passes with the caller not breaking."""
        end = time.monotonic() + ms / 1000
        while (left := end - time.monotonic()) > 0:
            p = self.d.read(64, int(min(left * 1000, 50)) or 1)
            if p and len(p) >= 16 and p[0] == 4 and p[1] == 0xFF and p[2] == 0xF0:
                yield bytes(p)

    def request(self, payload, match, ms=1500):
        self.send(payload)
        for p in self.frames(ms):
            if match(p):
                self.log(f"rx {hx(p[1:17])}")
                return p
        return None

    def drain(self, ms=150):
        for _ in self.frames(ms):
            pass

    # ---- reads
    # Over the dongle the controller ignores a command identical to the one before it when it comes within about
    # a second (measured 2026-11-19: `EC` every 0.3 s answers every other time; `EC` and `EB A0` alternating answer
    # every time). So a retry first sends a different harmless query (`nudge`) and never waits long: replies
    # arrive within ~10 ms.
    def _nudge(self, other):
        self.send(other)
        self.drain(120)

    def info(self):
        p = None
        for _ in range(4):
            p = self.request([0xEC], lambda p: p[15] == 0xEC, 400)
            if p:
                break
            self._nudge([0xEB, 0xA0])
        if not p:
            raise RuntimeError("no reply to device info")
        return {
            "device_id": p[3],
            "firmware": ".".join(map(str, [p[10] >> 4, p[10] & 15, p[9] >> 4, p[9] & 15])),
            "battery": p[11],
            "connection": {1: "wired", 0: "dongle"}.get(p[13], f"unknown({p[13]})"),
        }

    def read_block(self, cmd, slot):
        got = {}
        for attempt in range(4):  # an unanswered read is retried; parcels start within ~10 ms when it is heard
            if attempt:
                self._nudge([0xEC])
            self.send([cmd, slot])
            start = last = time.monotonic()
            while True:
                now = time.monotonic()
                if (got and now - last > 0.4) or (not got and now - start > 0.6):
                    break
                for p in self.frames(60):
                    if p[15] == cmd:
                        got.setdefault(p[3], p[5:15])
                        last = time.monotonic()
            if got:
                break
        n = max(got) + 1 if got else 0
        missing = [i for i in range(n) if i not in got]
        if not n or missing:
            raise RuntimeError(f"read {cmd:02x}/{slot}: " + (f"missing parcels {missing}" if n else "no reply"))
        self.drain()
        return b"".join(got[i] for i in range(n))

    def active_profile(self):
        """Slot (0..3) the controller is using now, or None. Reply: `aa ac <slot> a0 <NS-mode slot>`."""
        for _ in range(4):
            self.drain(50)
            p = self.request([0xEB, 0xA0], lambda p: p[3] == 0xAA and p[4] == 0xAC, 400)
            if p:
                return p[5] if p[5] < 4 else None
            self._nudge([0xEC])
        return None

    # Space Station 4.2: `E4` sleep now, `ED` switch to XInput. No arguments and no reply is waited for: the
    # controller switches off, or the dongle leaves USB and returns as the XInput device. Sleep is sent twice (with a different query between,
    # because the dongle sometimes misses a command); the mode switch once, as a second copy could switch back.
    def simple(self, cmd, times=1):
        for _ in range(times):
            try:
                self.send([cmd])
                self.drain(250)
                self._nudge([0xEC])
            except (OSError, RuntimeError, ValueError):
                return  # already gone

    def profile_id(self, slot):
        p = self.request(checksum([0x50, 0x02, slot], 4), lambda p: p[3] == 0x50 and p[4] == 0x02, 1000)
        return (p[5] | p[6] << 8) if p else None

    # ---- writes
    def write_parcels(self, start, inner, data, label):
        n = -(-len(data) // 10)
        chunks = [start] + [[inner, *data[i * 10 : i * 10 + 10].ljust(10, b"\0"), 0xA0, i] for i in range(n)]
        verbose, acks = self.verbose, []
        for i, c in enumerate(chunks):
            self.verbose = verbose and i < 3
            a = self.request(c, lambda p: p[15] in (0xE7, 0x33, 0xEA, 0x22, 0xEF), 1500 if i else 6000)
            self.verbose = verbose
            if not a:
                raise RuntimeError(f"{label}: no acknowledgement for parcel {i}/{len(chunks) - 1}")
            if a[15] == 0xEF:
                raise RuntimeError(f"{label}: rejected by controller at parcel {i}: {hx(a[1:17])}")
            acks.append(a)
        self.log(f"{label}: {len(chunks)} parcels acknowledged; last ack {hx(acks[-1][1:17])}")
        self.log("ack index sequence: " + " ".join(f"{a[3]:02x}" for a in acks))
        time.sleep(0.3)
        return acks

    def write_config(self, slot, data):
        return self.write_parcels([0xEA, -(-len(data) // 10), 0xA0, slot], 0x22, data, f"profile slot {slot}")

    def write_led(self, slot, data):
        data = data[:490]  # read gives 500 bytes, write takes 490 (49 parcels)
        return self.write_parcels([0xE7, slot, -(-len(data) // 10)], 0x33, data, f"lighting slot {slot}")

    def save(self, ver=None):
        ver = ver or random.randint(1, 0xFFFE)
        p = self.request(checksum([0x50, 0x03, ver & 0xFF, ver >> 8], 5), lambda p: p[3] == 0x50 and p[4] == 0x03, 10000)
        if not p:
            raise RuntimeError("save: no reply (cable only; the dongle drops it)")
        return p[5], ver


def checksum(payload, idx, length=15):
    full = [REPORT, *payload] + [0] * (length - 1 - len(payload))
    full[idx] = 0
    for i in range(len(full) - 1):
        full[idx] = (full[idx] + full[i]) & 0xFF
    return full[1:]


def diff(a: bytes, b: bytes):
    d = [i for i in range(min(len(a), len(b))) if a[i] != b[i]]
    if len(a) != len(b):
        print(f"length differs: {len(a)} vs {len(b)}")
    for i in d[:60]:
        print(f"  [{i}] {a[i]:02x} -> {b[i]:02x}")
    print(f"{len(d)} byte(s) differ")
    return d


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "info"
    if cmd == "diff":
        diff(open(sys.argv[2], "rb").read(), open(sys.argv[3], "rb").read())
        return
    v = Vader()
    print("info:", v.info())
    if cmd == "backup":
        slot = int(sys.argv[2]) if len(sys.argv) > 2 else 0
        os.makedirs(os.path.join(HERE, "backups"), exist_ok=True)
        ts = time.strftime("%Y%m%d-%H%M%S")
        print(f"profile id slot {slot}: {v.profile_id(slot)}")
        for name, c in (("profile", 0xEB), ("led", 0xE5)):
            data = v.read_block(c, slot)
            path = os.path.join(HERE, "backups", f"{ts}-{name}{slot}.bin")
            open(path, "wb").write(data)
            print(f"{name}: {len(data)} bytes -> {path}\n  head {hx(data[:20])}")
    elif cmd == "write-profile":
        data = open(sys.argv[2], "rb").read()
        slot = int(sys.argv[3]) if len(sys.argv) > 3 else 0
        before = v.read_block(0xEB, slot)
        print(f"before vs file ({len(data)} bytes to write):")
        diff(before, data)
        v.write_config(slot, data)
        after = v.read_block(0xEB, slot)
        print("read-back vs file:")
        bad = diff(after, data)
        print("WRITE VERIFIED (working memory)" if not bad and len(after) == len(data) else "WRITE NOT VERIFIED")
    elif cmd == "write-led":
        data = open(sys.argv[2], "rb").read()
        slot = int(sys.argv[3]) if len(sys.argv) > 3 else 0
        v.write_led(slot, data)
        after = v.read_block(0xE5, slot)
        print("read-back vs file (first 490 bytes):")
        bad = diff(after[:490], data[:490])
        print("WRITE VERIFIED (working memory)" if not bad else "WRITE NOT VERIFIED")
    elif cmd == "save":
        status, ver = v.save(int(sys.argv[2]) if len(sys.argv) > 2 else None)
        print(f"save status={status} (1 = OK) version={ver}; profile id slot 0 now {v.profile_id(0)}")


if __name__ == "__main__":
    main()

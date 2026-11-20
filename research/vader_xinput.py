#!/usr/bin/env python3
"""
Vader 4 Pro over the 2.4G dongle in XInput mode (USB 045e:028e, vendor interface 0, OUT ep 0x05, IN ep 0x81).
Framing from flydigictl / Space Station: 15-byte packets  A5 <cmd> <args…> <sum of first 14 bytes>.
Replies ride on the XInput report: p[14] == A5, p[15] = cmd, payload from p[16].

macOS's Xbox gamepad driver owns the interface, so this must run as root (sudo) to detach it.
Needs: brew install libusb; pip install pyusb.
"""
import time

import usb.backend.libusb1
import usb.core
import usb.util

BACKEND = usb.backend.libusb1.get_backend(find_library=lambda _: "/opt/homebrew/lib/libusb-1.0.dylib")

hx = lambda b: " ".join(f"{x:02x}" for x in b)
INFO, DONGLE, READ_CFG, READ_LED = 0x10, 0x11, 0x21, 0x26
CFG_START, CFG_DATA, LED_DATA, LED_START = 0x25, 0x24, 0x29, 0x2A


def pkt(cmd, *args):
    p = bytearray(15)
    p[0], p[1] = 0xA5, cmd
    p[2 : 2 + len(args)] = bytes(args)
    p[14] = sum(p[:14]) & 0xFF
    return bytes(p)


class VaderX:
    def __init__(self):
        self.dev = usb.core.find(idVendor=0x045E, idProduct=0x028E, backend=BACKEND)
        if self.dev is None:
            raise SystemExit("045e:028e not found (dongle not in XInput mode?)")
        # macOS binds its own Xbox gamepad driver to this interface; detaching it needs root.
        self.detached = False
        try:
            if self.dev.is_kernel_driver_active(0):
                self.dev.detach_kernel_driver(0)
                self.detached = True
        except (usb.core.USBError, NotImplementedError) as e:
            print(f"(could not detach the system driver: {e})")
        usb.util.claim_interface(self.dev, 0)

    def close(self):
        usb.util.release_interface(self.dev, 0)
        if self.detached:
            try:
                self.dev.attach_kernel_driver(0)
            except Exception as e:  # noqa: BLE001
                print(f"(could not re-attach the system driver: {e}; replug the dongle)")
        usb.util.dispose_resources(self.dev)

    def send(self, p):
        self.dev.write(0x05, p, 1000)

    def frames(self, ms):
        end = time.monotonic() + ms / 1000
        while (left := end - time.monotonic()) > 0:
            try:
                p = bytes(self.dev.read(0x81, 64, max(1, int(min(left * 1000, 50)))))
            except usb.core.USBTimeoutError:
                continue
            if len(p) > 16 and p[14] == 0xA5:
                yield p

    def ask(self, p, ms=1200, want=None):
        self.send(p)
        out = []
        for f in self.frames(ms):
            out.append(f)
            if want and f[15] in want:
                break
        return out

    def info(self):
        for f in self.ask(pkt(INFO), want={INFO}):
            if f[15] == INFO:
                return {"device_id": f[16], "firmware": ".".join(map(str, [f[22] >> 4, f[22] & 15, f[21] >> 4, f[21] & 15])),
                        "battery": f[23], "connection": f[25], "raw": hx(f[14:30])}

    def read_block(self, cmd, slot):
        got = {}
        self.send(pkt(cmd, slot))
        start = last = time.monotonic()
        while True:
            now = time.monotonic()
            if (got and now - last > 0.4) or (not got and now - start > 2.5):
                break
            for f in self.frames(60):
                if f[15] == cmd + 1:
                    got.setdefault(f[16], f[17:27])
                    last = time.monotonic()
        n = max(got) + 1 if got else 0
        missing = [i for i in range(n) if i not in got]
        if not n or missing:
            raise RuntimeError(f"read {cmd:02x}/{slot}: " + (f"missing {missing}" if n else "no reply"))
        return b"".join(got[i] for i in range(n))

    def write_parcels(self, start, inner, data, acks_ok, retries=3):
        """Send start + parcels. Ack for chunk i (0 = start) carries p[16] >= i (flydigictl's rule); lost acks are retried."""
        n = -(-len(data) // 10)
        chunks = [start] + [pkt(inner, *data[i * 10 : i * 10 + 10].ljust(10, b"\0"), 0xA0, i, 0) for i in range(n)]
        self.trace = []
        for i, c in enumerate(chunks):
            for attempt in range(retries):
                self.send(c)
                ack = None
                for f in self.frames(1500 if i else 3000):
                    if (i == 0 and f[15] in acks_ok) or (i > 0 and f[15] == inner and f[16] >= i):
                        ack = f
                        break
                    if f[15] in acks_ok:
                        self.trace.append(f"chunk {i}: stale ack idx {f[16]}")
                if ack:
                    self.trace.append(f"chunk {i}: ack cmd {ack[15]:02x} idx {ack[16]} try {attempt + 1}")
                    break
            else:
                raise RuntimeError(f"no ack for chunk {i}/{len(chunks) - 1} after {retries} tries; trace tail {self.trace[-4:]}")
        return len(chunks)

    def write_led(self, slot, data):
        data = data[:490]
        return self.write_parcels(pkt(LED_START, slot, -(-len(data) // 10)), LED_DATA, data, {LED_START, LED_DATA})

    def write_config(self, slot, data):
        """Profile write. Afterwards send nothing for a few seconds: in DInput mode an immediate command hung the controller."""
        return self.write_parcels(pkt(CFG_START, -(-len(data) // 10), 0xA0, slot), CFG_DATA, data, {0x23, CFG_START, CFG_DATA})

    def save(self, ver):
        # low byte first: sending 07 d2 for 2002 was stored and read back as 07 d2 = 0xD207
        return self.ask(pkt(0x50, 0x03, ver & 0xFF, ver >> 8), 4000, want={0x50})

#!/usr/bin/python3
"""
VaderDaddy helper: a small root daemon that talks to the Flydigi Vader 4 Pro dongle in XInput mode.

Why root: macOS's own Xbox gamepad driver owns the dongle (045e:028e) exclusively and only root may detach it.
The helper borrows the device for the length of one client connection, then hands it back to macOS.

It accepts a fixed set of operations over a Unix socket owned by one user (see install.sh):
    ping, info, version, read_profile, read_led, write_profile, write_led, save, sleep_get, sleep_set,
    func_get, func_set, active_profile
One JSON object per line in, one JSON object per line out. It never runs anything else.
Python 3.9 compatible; depends only on the vendored pyusb next to this file and libusb.
"""
import json
import os
import socket
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import usb.backend.libusb1  # noqa: E402
import usb.core  # noqa: E402
import usb.util  # noqa: E402

SOCK = "/var/run/vaderdaddy.sock"
CONF = os.path.join(HERE, "helper.json")
LOGF = "/var/log/vaderdaddy.log"
VID, PID = 0x045E, 0x028E
INFO, DONGLE, READ_CFG, READ_LED = 0x10, 0x11, 0x21, 0x26
CFG_START, CFG_DATA, LED_DATA, LED_START = 0x25, 0x24, 0x29, 0x2A
PROFILE_BYTES, LED_WRITE_BYTES = 840, 490
FUNC_SET = (0x08, 0x09, 0x0A, 0x0B, 0x0D, 0x0E, 0x10)  # trigger jitter, stick auto-centre, polling rate, stick
# resolution, centre sensitivity, rebound algorithm, circularity type
QUIET_AFTER_PROFILE_WRITE = 5.0  # an immediate command after a profile write hung the controller in DInput mode
IDLE_TIMEOUT = 30
STUCK_AFTER = 60  # no single step takes this long; a USB call that never returns (seen 2026-11-20 after a mode
# switch took the dongle off the bus) would otherwise block every later client. launchd restarts the helper.
OPEN_CLOSE_LIMIT = 8  # taking or releasing the dongle
_busy_since = None


def _watchdog():
    while True:
        time.sleep(2)
        t = _busy_since
        if t is not None and time.monotonic() - t > STUCK_AFTER:
            log("stuck in a USB call: exiting so launchd restarts the helper")
            os._exit(1)


class busy:
    """Marks a step the watchdog times; `limit` seconds shorter than STUCK_AFTER for steps that are normally instant."""

    def __init__(self, limit=STUCK_AFTER):
        self.limit = limit

    def __enter__(self):
        global _busy_since
        _busy_since = time.monotonic() - (STUCK_AFTER - self.limit)

    def __exit__(self, *a):
        global _busy_since
        _busy_since = None

_backend = usb.backend.libusb1.get_backend(find_library=lambda _: os.path.join(HERE, "libusb-1.0.0.dylib"))


def log(msg):
    try:
        with open(LOGF, "a") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")
    except OSError:
        pass


def pkt(cmd, *args):
    p = bytearray(15)
    p[0], p[1] = 0xA5, cmd
    p[2 : 2 + len(args)] = bytes(args)
    p[14] = sum(p[:14]) & 0xFF
    return bytes(p)


class NoDevice(Exception):
    pass


class Device:
    """The dongle in XInput mode. 15-byte A5 packets out on ep 0x05; replies ride on the XInput report (p[14] == A5)."""

    def __init__(self):
        self.dev = usb.core.find(idVendor=VID, idProduct=PID, backend=_backend)
        if self.dev is None:
            raise NoDevice("Dongle not found in XInput mode (045e:028e).")
        self.detached = False
        if self.dev.is_kernel_driver_active(0):
            self.dev.detach_kernel_driver(0)
            self.detached = True
        usb.util.claim_interface(self.dev, 0)
        self.quiet_until = 0.0
        self.leaving = False  # a mode switch was sent: the dongle is dropping off the bus

    def close(self):
        # After a mode switch the device is going away by itself; releasing it or handing it back to the Xbox
        # driver then fails or blocks, so just let go of our handle.
        if not self.leaving:
            try:
                usb.util.release_interface(self.dev, 0)
                if self.detached:
                    self.dev.attach_kernel_driver(0)
            except Exception as e:  # noqa: BLE001
                log("release problem: %r" % (e,))
        usb.util.dispose_resources(self.dev)

    def _settle(self):
        wait = self.quiet_until - time.monotonic()
        if wait > 0:
            time.sleep(wait)

    def send(self, p):
        self.dev.write(0x05, p, 1000)

    def frames(self, ms):
        end = time.monotonic() + ms / 1000.0
        while True:
            left = end - time.monotonic()
            if left <= 0:
                return
            try:
                p = bytes(self.dev.read(0x81, 64, max(1, int(min(left * 1000, 50)))))
            except usb.core.USBTimeoutError:
                continue
            if len(p) > 16 and p[14] == 0xA5:
                yield p

    def ask(self, p, cmd, ms=1500, tries=3):
        self._settle()
        for _ in range(tries):
            self.send(p)
            for f in self.frames(ms):
                if f[15] == cmd:
                    return f
        raise RuntimeError("No reply to command %02x." % cmd)

    def info(self):
        f = self.ask(pkt(INFO), INFO)
        d = self.ask(pkt(DONGLE), DONGLE)
        return {
            "device_id": f[16],
            "firmware": ".".join(str(x) for x in (f[22] >> 4, f[22] & 15, f[21] >> 4, f[21] & 15)),
            "battery_raw": f[23],
            "dongle": "%d.%d" % (d[17], d[16]),
            "connection": "dongle-xinput",
        }

    def version(self, slot):
        f = self.ask(pkt(0x50, 0x02, slot), 0x50)
        return f[17] | (f[18] << 8)

    def read_block(self, cmd, slot):
        self._settle()
        for _ in range(3):
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
            if n and all(i in got for i in range(n)):
                return b"".join(got[i] for i in range(n))
        raise RuntimeError("Read %02x slot %d failed (no reply or missing parcels)." % (cmd, slot))

    def write_parcels(self, start, inner, data, start_acks):
        self._settle()
        n = -(-len(data) // 10)
        chunks = [start] + [pkt(inner, *data[i * 10 : i * 10 + 10].ljust(10, b"\0"), 0xA0, i, 0) for i in range(n)]
        for i, c in enumerate(chunks):
            ok = False
            for _ in range(3):
                self.send(c)
                for f in self.frames(3000 if i == 0 else 1500):
                    if (i == 0 and f[15] in start_acks) or (i > 0 and f[15] == inner and f[16] >= i):
                        ok = True
                        break
                if ok:
                    break
            if not ok:
                raise RuntimeError("No acknowledgement for packet %d of %d." % (i, len(chunks) - 1))

    def write_profile(self, slot, data):
        self.write_parcels(pkt(CFG_START, -(-len(data) // 10), 0xA0, slot), CFG_DATA, data, (0x23, CFG_START))
        self.quiet_until = time.monotonic() + QUIET_AFTER_PROFILE_WRITE

    def write_led(self, slot, data):
        self.write_parcels(pkt(LED_START, slot, -(-len(data) // 10)), LED_DATA, data, (LED_START,))

    # Auto-sleep timer (Space Station: XinputCommand get/setK1Info, command 0x30 sub 4 = read, sub 5 = set).
    # Only these two sub-commands are ever sent: other 0x30 sub-commands start firmware upgrades.
    def sleep_get(self):
        f = self.ask(pkt(0x30, 0x04), 0x30)
        return f[14:32].hex()

    def sleep_set(self, value):
        self.send(pkt(0x30, 0x05, value))
        time.sleep(0.3)

    # Which profile slot the controller is using (Space Station 4.2: ReadCurrentMappingConfigIdCommandXInput,
    # command 0x20, no arguments; the slot is the first payload byte). A read: nothing is changed.
    def active_profile(self):
        f = self.ask(pkt(0x20), 0x20, ms=600, tries=2)
        return f[14:32].hex()

    # "Sleep now" (0x16) and "switch to DInput" (0x17; 0xED is the DInput-side command), both without arguments (Space Station 4.2:
    # SleepCommandXInput, SwitchToDInputCommandFactory). No reply is expected: the controller switches off, or
    # the dongle drops off USB and comes back as the DInput device. Sleep is sent twice in case one is missed;
    # the mode switch once, since a second copy could switch straight back.
    def simple(self, cmd, times=1):
        self._settle()
        for _ in range(times):
            try:
                self.send(pkt(cmd))
            except usb.core.USBError:
                break  # already gone
            time.sleep(0.25)

    # Function settings (Space Station: FuncSetConfig). A5 50 07 reads all ten bytes; each setting has its own
    # set sub-command. Only the sub-commands listed in FUNC_SET are ever sent.
    def func_get(self):
        self._settle()
        for _ in range(3):
            self.send(pkt(0x50, 0x07))
            for f in self.frames(1500):
                if f[15] == 0x50 and f[16] == 0x07:
                    return f[14:32].hex()
        raise RuntimeError("No reply to the function-settings query.")

    def func_set(self, sub, value):
        self._settle()
        self.send(pkt(0x50, sub, value))
        time.sleep(0.3)

    def save(self, ver):
        f = self.ask(pkt(0x50, 0x03, ver & 0xFF, ver >> 8), 0x50, ms=4000, tries=1)
        return f[17]


def slot_of(req):
    s = req.get("slot", 0)
    if not isinstance(s, int) or not 0 <= s <= 3:
        raise ValueError("slot must be 0..3")
    return s


def data_of(req, sizes):
    d = bytes.fromhex(req.get("data", ""))
    if len(d) not in sizes:
        raise ValueError("data must be %s bytes, got %d" % (" or ".join(map(str, sizes)), len(d)))
    return d


def handle(dev, req):
    op = req.get("op")
    if op == "info":
        return dev.info()
    if op == "version":
        return {"version": dev.version(slot_of(req))}
    if op == "read_profile":
        return {"data": dev.read_block(READ_CFG, slot_of(req)).hex()}
    if op == "read_led":
        return {"data": dev.read_block(READ_LED, slot_of(req)).hex()}
    if op == "write_profile":
        dev.write_profile(slot_of(req), data_of(req, (PROFILE_BYTES,)))
        return {}
    if op == "write_led":
        dev.write_led(slot_of(req), data_of(req, (LED_WRITE_BYTES, 500))[:LED_WRITE_BYTES])
        return {}
    if op == "sleep_get":
        return {"raw": dev.sleep_get()}
    if op == "sleep_set":
        v = req.get("value")
        if not isinstance(v, int) or not 0 <= v <= 254:
            raise ValueError("value must be 0..254")
        dev.sleep_set(v)
        return {}
    if op == "func_get":
        return {"raw": dev.func_get()}
    if op == "active_profile":
        return {"raw": dev.active_profile()}
    if op == "sleep_now":
        dev.simple(0x16, 2)
        return {}
    if op == "switch_mode":
        dev.simple(0x17)
        dev.leaving = True
        return {}
    if op == "func_set":
        sub, v = req.get("sub"), req.get("value")
        if sub not in FUNC_SET or not isinstance(v, int) or not 0 <= v <= 255:
            raise ValueError("sub must be one of %s and value 0..255" % (FUNC_SET,))
        dev.func_set(sub, v)
        return {}
    if op == "save":
        v = req.get("version")
        if not isinstance(v, int) or not 1 <= v <= 0xFFFE:
            raise ValueError("version must be 1..65534")
        return {"status": dev.save(v)}
    raise ValueError("unknown op")


def serve(conn):
    dev = None
    conn.settimeout(IDLE_TIMEOUT)
    f = conn.makefile("rwb")
    try:
        for line in f:
            if len(line) > 8192:
                break
            try:
                req = json.loads(line)
                if req.get("op") == "ping":
                    res = {"ok": True, "helper": 1}
                else:
                    if dev is None:
                        with busy(OPEN_CLOSE_LIMIT):
                            dev = Device()
                    with busy():
                        res = dict(handle(dev, req), ok=True)
            except NoDevice as e:
                res = {"ok": False, "error": str(e), "code": "no_device"}
            except Exception as e:  # noqa: BLE001
                res = {"ok": False, "error": "%s: %s" % (type(e).__name__, e)}
                log("op failed: %s -> %s" % (line[:60], res["error"]))
            f.write((json.dumps(res) + "\n").encode())
            f.flush()
    except (socket.timeout, OSError):
        pass
    finally:
        if dev is not None:
            wait = dev.quiet_until - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            with busy(OPEN_CLOSE_LIMIT):
                dev.close()
        conn.close()


def main():
    conf = json.load(open(CONF))
    uid = int(conf["uid"])
    if os.path.exists(SOCK):
        os.unlink(SOCK)
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    old = os.umask(0o177)
    srv.bind(SOCK)
    os.umask(old)
    os.chown(SOCK, uid, 0)
    os.chmod(SOCK, 0o600)
    srv.listen(4)
    log("helper started, socket owner uid %d" % uid)
    threading.Thread(target=_watchdog, daemon=True).start()
    while True:
        conn, _ = srv.accept()
        serve(conn)  # one client at a time: the controller can't interleave transfers


if __name__ == "__main__":
    main()

"""One interface over the three ways to reach the controller.

  cable            HID, everything works, no root
  dongle (DInput)  HID, profile writes persist by themselves, lighting can't be saved
  dongle (XInput)  via the root helper (helper/), everything works wirelessly
"""
import json
import os
import socket
import time

SOCK = "/var/run/vaderdaddy.sock"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class VaderError(Exception):
    pass


class HelperBackend:
    name = "dongle (XInput, wireless)"
    can_save_lighting = True

    def __init__(self):
        if not os.path.exists(SOCK):
            raise VaderError("The wireless helper isn't installed. Run:  sudo helper/install.sh")
        self.s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.s.settimeout(40)
        try:
            self.s.connect(SOCK)
        except OSError as e:
            raise VaderError(f"Can't reach the wireless helper ({e}).")
        self.f = self.s.makefile("rwb")
        self._fresh = True  # no device operation has succeeded on this connection yet

    def call(self, op, **kw):
        # Right after another connection handed the dongle back to macOS, claiming it again can fail with a
        # transient USB error. Nothing has been sent to the controller at that point, so retrying is safe.
        for attempt in range(4):
            self.f.write((json.dumps(dict(kw, op=op)) + "\n").encode())
            self.f.flush()
            line = self.f.readline()
            if not line:
                raise VaderError("The helper closed the connection.")
            r = json.loads(line)
            if r.get("ok") or not self._fresh or "USBError" not in r.get("error", "") or attempt == 3:
                break
            time.sleep(1.0)
        self._fresh = False
        if not r.get("ok"):
            e = VaderError(r.get("error", "helper error"))
            e.code = r.get("code")
            raise e
        return r

    def info(self):
        return self.call("info")

    def read_profile(self, slot=0):
        return bytes.fromhex(self.call("read_profile", slot=slot)["data"])

    def read_led(self, slot=0):
        return bytes.fromhex(self.call("read_led", slot=slot)["data"])

    def write_profile(self, data, slot=0):
        self.call("write_profile", slot=slot, data=data.hex())

    def write_led(self, data, slot=0):
        self.call("write_led", slot=slot, data=data.hex())

    def save(self, version):
        return self.call("save", version=version)["status"]

    def sleep_get(self):
        """Auto-sleep timeout in minutes (0 = never). Reply is a5 30 04 <minutes> <flag>."""
        return bytes.fromhex(self.call("sleep_get")["raw"])[3]

    def sleep_set(self, minutes):
        self.call("sleep_set", value=minutes)

    def active_profile(self):
        """Slot (0..3) in use on the controller, or None (no answer, or an installed helper older than this op)."""
        try:
            slot = bytes.fromhex(self.call("active_profile")["raw"])[2]
        except VaderError as e:
            if getattr(e, "code", None) == "no_device":
                raise
            return None
        return slot if slot < 4 else None

    def _simple(self, op):
        try:
            self.call(op)
        except VaderError as e:
            if "unknown op" in str(e):
                raise VaderError("The wireless helper is older than this app. Run:  sudo helper/install.sh")
            raise

    def sleep_now(self):
        self._simple("sleep_now")

    def switch_mode(self):
        self._simple("switch_mode")

    def func_get(self):
        """The ten function-setting bytes (see vader/funcs.py)."""
        return bytes.fromhex(self.call("func_get")["raw"])[3:13]

    def func_set(self, sub, value):
        self.call("func_set", sub=sub, value=value)

    def close(self):
        # Both the file wrapper and the socket: closing only the socket leaves the connection open until Python
        # frees the wrapper, and the helper serves one client at a time, so every later request waited behind
        # it for up to 30 s (seen 2026-11-20 as "didn't answer in time" with the controller off).
        for c in (self.f, self.s):
            try:
                c.close()
            except (OSError, ValueError):
                pass


class HidBackend:
    def __init__(self):
        from . import hid_transport as vader_hid

        try:
            self.v = vader_hid.Vader(verbose=False)
        except SystemExit as e:
            raise VaderError(str(e))
        self._info = self.v.info()
        self.wired = self._info["connection"] == "wired"
        self.name = "cable" if self.wired else "dongle (DInput, wireless)"
        self.can_save_lighting = self.wired

    def info(self):
        i = self._info
        return {"device_id": i["device_id"], "firmware": i["firmware"], "battery_raw": i["battery"],
                "connection": "cable" if self.wired else "dongle-dinput"}

    def read_profile(self, slot=0):
        return self.v.read_block(0xEB, slot)

    def read_led(self, slot=0):
        return self.v.read_block(0xE5, slot)

    def active_profile(self):
        """Slot (0..3) in use on the controller, or None when it does not answer."""
        return self.v.active_profile()

    def sleep_now(self):
        self.v.simple(0xE4, 2)

    def switch_mode(self):
        if self.wired:
            raise VaderError("The mode can only be switched over the dongle.")
        self.v.simple(0xED)

    def write_profile(self, data, slot=0):
        self.v.write_config(slot, data)
        if not self.wired:
            time.sleep(6)  # over the dongle, any command right after a profile write hangs the controller

    def write_led(self, data, slot=0):
        self.v.write_led(slot, data)

    def save(self, version):
        if not self.wired:
            return None  # the dongle drops the save in DInput mode; profile writes persist anyway
        return self.v.save(version)[0]

    def close(self):
        try:
            self.v.d.close()
        except Exception:  # noqa: BLE001
            pass


def connect():
    """Cable or DInput dongle if present (no root needed), otherwise the XInput dongle through the helper."""
    import hid

    if any(d["usage_page"] == 0xFFA0 for d in hid.enumerate(0x04B4, 0x2412)):
        return HidBackend()
    if not os.path.exists(SOCK):
        # Without the helper only a controller in XInput mode is out of reach; say so only when one is plugged in.
        e = VaderError("No controller found. Plug in the dongle (or the cable) and switch the controller on.")
        if hid.enumerate(0x045E, 0x028E):
            e = VaderError("The wireless helper isn't installed. Run:  sudo helper/install.sh")
            e.code = "no_helper"
        raise e
    b = HelperBackend()
    try:
        b.info()
    except VaderError as e:
        b.close()
        if getattr(e, "code", None) == "no_device":
            raise VaderError("No controller found. Plug in the dongle (or the cable) and switch the controller on.")
        raise
    return b

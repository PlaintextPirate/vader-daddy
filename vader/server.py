"""Local service behind the Mac app: serves the UI (ui/build) and a tiny JSON API on 127.0.0.1 only.

POST /api/call {"op": ..., "slot": 0, "data": "<hex>"}  ->  {"ok": true, ...} | {"ok": false, "error": ...}

The controller connection is opened on demand and dropped after a short idle period, so macOS gets the gamepad
back between operations. Requests from other origins or with a foreign Host header are refused, so no web page
can drive the controller through this port.
"""
import json
import mimetypes
import os
import random
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import funcs, inputs, keys, profile
from .backends import ROOT, HelperBackend, VaderError, connect

PORT = 47815
UI = os.path.join(ROOT, "ui", "build")
IDLE_CLOSE = 2.5
# Device ids this app's layouts were worked out on. Anything else is refused before a single setting is read or
# written: other Flydigi controllers answer the same commands with different layouts.
SUPPORTED_IDS = {85: "Vader 4 Pro"}
_lock = threading.Lock()
_backend = None
_last = 0.0


def _reaper():
    global _backend
    while True:
        time.sleep(0.5)
        with _lock:
            if _backend is not None and time.monotonic() - _last > IDLE_CLOSE:
                _backend.close()
                _backend = None


def _slot(req):
    s = req.get("slot", 0)
    if not isinstance(s, int) or not 0 <= s <= 3:
        raise VaderError("slot must be 0..3")
    return s


def _buzz(req):
    """Vibration test. Goes through the ordinary gamepad device, not the settings connection (which takes the
    gamepad away from macOS while it is open), so that connection is dropped first."""
    global _backend
    vals = [req.get(k) for k in ("left", "right", "ms")]
    if not all(isinstance(v, int) for v in vals) or not (0 <= vals[0] <= 255 and 0 <= vals[1] <= 255 and 50 <= vals[2] <= 2000):
        return {"ok": False, "error": "left and right must be 0..255, ms 50..2000"}
    with _lock:
        if _backend is not None:
            _backend.close()
            _backend = None
    err = inputs.buzz(*vals)
    return {"ok": False, "error": err} if err else {"ok": True}


def _keys(op, req):
    """Paddle -> keyboard key (vader/keys.py). Nothing here talks to the controller."""
    try:
        if op == "keys_set":
            keys.set_key(req.get("paddle"), req.get("code"))
        allowed = keys.ask_permission() if op == "keys_permission" else keys.allowed()
        return {"ok": True, "keys": keys.get(), "allowed": allowed, "paddles": sorted(inputs.X_PADDLES.values()),
                "codes": sorted(keys.KEYCODES)}
    except ValueError as e:
        return {"ok": False, "error": str(e)}


def _present(xinput):
    import hid

    if xinput:
        return bool(hid.enumerate(0x045E, 0x028E))
    return any(d["usage_page"] == 0xFFA0 for d in hid.enumerate(0x04B4, 0x2412))


def _wait(cond, seconds):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if cond():
            return True
        time.sleep(0.2)
    return cond()


def _switch_mode(b):
    """XInput <-> DInput over the dongle, then the connection in the new mode. Nothing touches the dongle while
    it leaves USB and comes back as the other device: grabbing it half-way is what hung the helper (2026-11-20).
    The command is sent again once if the old device is still there after 3 s (the dongle misses commands)."""
    to_x = not isinstance(b, HelperBackend)
    for attempt in range(2):
        try:
            b.switch_mode()
        finally:
            b.close()
        if _wait(lambda: not _present(not to_x), 3):
            break
        if attempt == 0:
            b = connect()
    else:
        raise VaderError("The controller did not switch mode. Try again.")
    if not _wait(lambda: _present(to_x), 8):
        raise VaderError("The controller left its old mode but did not come back. Try again, or unplug the dongle and plug it back in.")
    time.sleep(1.5)  # let macOS finish attaching its own drivers before anything claims the device
    return connect()


def call(req):
    global _backend, _last
    op = req.get("op")
    if op == "buzz":
        return _buzz(req)
    if op in ("keys_get", "keys_set", "keys_permission"):
        return _keys(op, req)
    with _lock:
        try:
            if _backend is None:
                _backend = connect()
            b = _backend
            if op == "info":
                r = dict(b.info(), name=b.name, can_save_lighting=b.can_save_lighting)
                if r.get("device_id") not in SUPPORTED_IDS:
                    b.close()
                    _backend = None
                    return {"ok": False, "code": "unsupported_model",
                            "error": f"Controller with device id {r.get('device_id')} is not supported (Vader 4 Pro is 85)."}
            elif op == "read_profile":
                r = {"data": b.read_profile(_slot(req)).hex()}
            elif op == "read_led":
                r = {"data": b.read_led(_slot(req)).hex()}
            elif op == "write_profile":
                d = bytes.fromhex(req.get("data", ""))
                if len(d) != profile.PROFILE_BYTES:
                    raise VaderError(f"A profile is {profile.PROFILE_BYTES} bytes, got {len(d)}.")
                b.write_profile(d, _slot(req))
                r = {}
            elif op == "write_led":
                d = bytes.fromhex(req.get("data", ""))
                if len(d) not in (490, 500):
                    raise VaderError(f"Lighting data is 490 bytes, got {len(d)}.")
                b.write_led(d[:490], _slot(req))
                r = {}
            elif op == "active_profile":
                r = {"slot": b.active_profile() if hasattr(b, "active_profile") else None}
            elif op == "sleep_get":
                r = {"minutes": b.sleep_get() if hasattr(b, "sleep_get") else None}
            elif op == "sleep_set":
                m = req.get("minutes")
                if not hasattr(b, "sleep_set"):
                    raise VaderError("The sleep timer can only be changed over the dongle in XInput mode for now.")
                if not isinstance(m, int) or not 0 <= m <= 254:
                    raise VaderError("minutes must be 0..254")
                b.sleep_set(m)
                r = {"minutes": b.sleep_get()}
            elif op == "sleep_now":
                b.sleep_now()  # the controller goes away: drop the connection
                b.close()
                _backend = None
                r = {}
            elif op == "switch_mode":
                _backend = None
                _backend = b = _switch_mode(b)
                r = dict(b.info(), name=b.name, can_save_lighting=b.can_save_lighting)
            elif op == "func_get":
                r = {"settings": funcs.describe(b.func_get()) if hasattr(b, "func_get") else None}
            elif op == "func_set":
                if not hasattr(b, "func_set"):
                    raise VaderError("Hardware settings can only be changed over the dongle in XInput mode for now.")
                b.func_set(*funcs.resolve(str(req.get("key")), req.get("value")))
                r = {"settings": funcs.describe(b.func_get())}
            elif op == "save":
                r = {"status": b.save(random.randint(1, 0xFFFE))}
            else:
                raise VaderError("unknown op")
            return dict(r, ok=True)
        except Exception as e:  # noqa: BLE001
            # Drop the connection on any failure so the next request starts clean.
            if _backend is not None:
                _backend.close()
                _backend = None
            no_dev = "No controller found" in str(e) or getattr(e, "code", None) == "no_device"
            return {"ok": False, "error": str(e) if isinstance(e, (VaderError, ValueError)) else f"{type(e).__name__}: {e}",
                    **({"code": "no_device"} if no_dev else {"code": "no_helper"} if getattr(e, "code", None) == "no_helper" else {})}
        finally:
            _last = time.monotonic()


class Handler(BaseHTTPRequestHandler):
    server_version = "VaderDaddy"

    def log_message(self, *a):
        pass

    def _local(self):
        ok_hosts = (f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}")
        origin = self.headers.get("Origin")
        return self.headers.get("Host") in ok_hosts and (origin is None or origin in tuple("http://" + h for h in ok_hosts))

    def _send(self, code, body, ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _stream_input(self):
        """Server-sent events: push the input state as it changes, at most ~120 times a second."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        seen = -1
        try:
            while True:
                seen, s = inputs.wait(seen, 1.0)  # a timeout resends the last state, which doubles as a heartbeat
                self.wfile.write(b"data: " + json.dumps(s, separators=(",", ":")).encode() + b"\n\n")
                self.wfile.flush()
                time.sleep(0.008)
        except OSError:  # the page closed the stream
            pass

    def do_POST(self):
        if not self._local() or self.path != "/api/call" or "application/json" not in (self.headers.get("Content-Type") or ""):
            return self._send(403, b'{"ok": false, "error": "forbidden"}')
        try:
            req = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 65536)))
            assert isinstance(req, dict)
        except Exception:  # noqa: BLE001
            return self._send(400, b'{"ok": false, "error": "bad request"}')
        self._send(200, json.dumps(call(req)).encode())

    def do_GET(self):
        if not self._local():
            return self._send(403, b"forbidden", "text/plain")
        if self.path.split("?")[0] == "/api/input":
            return self._send(200, json.dumps(inputs.state()).encode())
        if self.path.split("?")[0] == "/api/input/stream":
            return self._stream_input()
        rel = self.path.split("?")[0].lstrip("/") or "index.html"
        path = os.path.realpath(os.path.join(UI, rel))
        if not path.startswith(os.path.realpath(UI) + os.sep) or not os.path.isfile(path):
            path = os.path.join(UI, "index.html")  # single-page app fallback
        if not os.path.isfile(path):
            return self._send(500, b"UI not built: run `npm run build` in ui/", "text/plain")
        self._send(200, open(path, "rb").read(), mimetypes.guess_type(path)[0] or "application/octet-stream")


def serve(port=PORT):
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=_reaper, daemon=True).start()
    inputs.start()  # from the start, not on the first page request: paddle keys work with the window hidden too
    print(f"http://127.0.0.1:{port}/", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass

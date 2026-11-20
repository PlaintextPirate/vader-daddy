#!/usr/bin/env python3
"""One-shot test: can lighting be written AND saved through the dongle in XInput mode?
Run as root (macOS's Xbox driver must be detached):
    sudo .venv/bin/python xinput_save_test.py
Writes the orange lighting backup to slot 0, sends the save command, and logs everything to backups/xinput-test.log.
"""
import glob, os, sys, time, traceback

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # project root
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vader_xinput as X

LOG = os.path.join(HERE, "backups", "xinput-test.log")
logf = open(LOG, "w")


def log(*a):
    s = " ".join(str(x) for x in a)
    print(s, flush=True)
    logf.write(s + "\n")
    logf.flush()


def step(name, fn):
    try:
        r = fn()
        log(f"[ok] {name}: {r if not isinstance(r, bytes) else str(len(r)) + ' bytes'}")
        return r
    except Exception as e:  # noqa: BLE001
        log(f"[FAIL] {name}: {type(e).__name__}: {e}")
        logf.write(traceback.format_exc())
        return None


def main():
    orange = open(os.path.join(HERE, "backups", "20261118-110706-led0.bin"), "rb").read()
    pristine = open(os.path.join(HERE, "backups", "20261118-110706-profile0.bin"), "rb").read()
    log("euid", os.geteuid(), time.strftime("%H:%M:%S"))
    v = X.VaderX()
    log("claimed interface; detached system driver:", v.detached)
    try:
        step("device info", v.info)
        step("dongle version", lambda: [X.hx(f[14:22]) for f in v.ask(X.pkt(X.DONGLE), want={X.DONGLE})])
        led = step("read lighting", lambda: v.read_block(X.READ_LED, 0))
        if led:
            log("   lighting bytes", len(led), "differs from orange by", sum(a != b for a, b in zip(led, orange)), "head", X.hx(led[:12]))
        cfg = step("read profile", lambda: v.read_block(X.READ_CFG, 0))
        if cfg:
            log("   profile bytes", len(cfg), "diff vs pristine at", [i for i in range(min(len(cfg), 840)) if cfg[i] != pristine[i]][:20])
        step("read version (50 02)", lambda: [X.hx(f[14:30]) for f in v.ask(X.pkt(0x50, 0x02, 0), 1500)])
        acks = step("write orange lighting", lambda: v.write_led(0, orange))
        retried = [x for x in getattr(v, "trace", []) if "stale" in x or "try 1" not in x]
        log("   chunks needing a retry or with stale acks:", retried[:20], "| last:", getattr(v, "trace", [])[-2:])
        time.sleep(0.5)
        led2 = step("read lighting back", lambda: v.read_block(X.READ_LED, 0))
        if led2:
            log("   after write: differs from orange (first 490) by", sum(a != b for a, b in zip(led2[:490], orange[:490])))
        if acks:
            step("SAVE (50 03, version 2002)", lambda: [X.hx(f[14:30]) for f in v.save(2002)])
            time.sleep(1.5)
            step("read version after save", lambda: [X.hx(f[14:30]) for f in v.ask(X.pkt(0x50, 0x02, 0), 1500)])
            step("device info after save", v.info)
    finally:
        step("release", v.close)
        uid = os.environ.get("SUDO_UID")
        if uid:
            os.chown(LOG, int(uid), int(os.environ.get("SUDO_GID", uid)))
    log("done. Now power-cycle the controller to see whether orange survived.")


if __name__ == "__main__":
    main()

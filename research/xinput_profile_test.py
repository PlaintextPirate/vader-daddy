#!/usr/bin/env python3
"""One-shot test: profile write + save through the dongle in XInput mode.
    sudo .venv/bin/python xinput_profile_test.py
Changes left-stick deadzone (byte 110) 0 -> 1, saves, reads back, then restores the original and saves again.
Lighting is only read. Log: backups/xinput-profile-test.log
"""
import os, sys, time, traceback

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # project root
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vader_xinput as X

LOG = os.path.join(HERE, "backups", "xinput-profile-test.log")
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


def diff(a, b):
    return [(i, a[i], b[i]) for i in range(min(len(a), len(b))) if a[i] != b[i]][:12]


def main():
    orange = open(os.path.join(HERE, "backups", "20261118-110706-led0.bin"), "rb").read()
    pristine = open(os.path.join(HERE, "backups", "20261118-110706-profile0.bin"), "rb").read()
    changed = bytearray(pristine)
    changed[110] = 1
    changed = bytes(changed)
    log("euid", os.geteuid(), time.strftime("%H:%M:%S"))
    v = X.VaderX()
    try:
        step("device info", v.info)
        cur = step("read profile", lambda: v.read_block(X.READ_CFG, 0))
        if cur is None or len(cur) != 840:
            log("profile read failed or wrong size; stopping before any write")
            return
        log("   current vs original (ignoring version bytes 225-226):", [d for d in diff(cur, pristine) if d[0] not in (225, 226)])
        open(os.path.join(HERE, "backups", time.strftime("%Y%m%d-%H%M%S") + "-xinput-profile0.bin"), "wb").write(cur)
        for label, data, ver in (("CHANGED (deadzone 1)", changed, 2003), ("ORIGINAL (deadzone 0)", pristine, 2002)):
            n = step(f"write {label}", lambda: v.write_config(0, data))
            log("   retries/stale:", [x for x in getattr(v, "trace", []) if "stale" in x or "try 1" not in x][:10], "| last:", getattr(v, "trace", [])[-1:])
            time.sleep(6)
            back = step("read back", lambda: v.read_block(X.READ_CFG, 0))
            if back:
                log("   read-back vs intended (ignoring 225-226):", [d for d in diff(back, data) if d[0] not in (225, 226)], "| byte 110 =", back[110])
            if n and back and back[110] == data[110]:
                step(f"save version {ver}", lambda: [X.hx(f[14:22]) for f in v.save(ver)])
                time.sleep(1.5)
                step("read version", lambda: [X.hx(f[14:22]) for f in v.ask(X.pkt(0x50, 0x02, 0), 1500, want={0x50})])
            else:
                log("   write not confirmed; skipping save")
        led = step("read lighting", lambda: v.read_block(X.READ_LED, 0))
        if led:
            log("   lighting differs from orange (first 490) by", sum(a != b for a, b in zip(led[:490], orange[:490])))
        fin = step("final profile read", lambda: v.read_block(X.READ_CFG, 0))
        if fin:
            log("   FINAL vs original (ignoring 225-226):", [d for d in diff(fin, pristine) if d[0] not in (225, 226)], "| version bytes", X.hx(fin[225:227]))
    finally:
        step("release", v.close)
        uid = os.environ.get("SUDO_UID")
        if uid:
            for f in os.listdir(os.path.join(HERE, "backups")):
                p = os.path.join(HERE, "backups", f)
                if os.stat(p).st_uid == 0:
                    os.chown(p, int(uid), int(os.environ.get("SUDO_GID", uid)))
    log("done.")


if __name__ == "__main__":
    main()

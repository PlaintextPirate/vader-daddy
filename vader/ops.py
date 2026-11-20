"""High-level operations shared by the CLI and the app: every change is backed up, verified by read-back, then saved."""
import os
import random
import time

from . import led, profile
from .backends import VaderError

BACKUPS = os.path.expanduser("~/Library/Application Support/VaderDaddy/backups")


def backup(b, label="manual", slot=0, prof=None, lights=None):
    os.makedirs(BACKUPS, exist_ok=True)
    prof = prof or b.read_profile(slot)
    lights = lights or b.read_led(slot)
    base = os.path.join(BACKUPS, time.strftime("%Y%m%d-%H%M%S") + f"-{label}-slot{slot}")
    open(base + ".profile.bin", "wb").write(prof)
    open(base + ".led.bin", "wb").write(lights)
    return base


def _save(b):
    status = b.save(random.randint(1, 0xFFFE))
    if status not in (1, None):
        raise VaderError(f"The controller answered the save with status {status}.")
    return status == 1


def set_lighting(b, rgb255, brightness, slot=0):
    cur = b.read_led(slot)
    backup(b, "before-lighting", slot, lights=cur)
    new = led.make_steady(cur, rgb255, brightness)
    b.write_led(new, slot)
    back = b.read_led(slot)
    if back[: led.LED_WRITE_BYTES] != new:
        raise VaderError("Lighting read-back differs from what was written; not saved.")
    return {"saved": _save(b) if b.can_save_lighting else False, **led.describe(back)}


def write_led_raw(b, data, slot=0):
    data = data[: led.LED_WRITE_BYTES]
    b.write_led(data, slot)
    if b.read_led(slot)[: led.LED_WRITE_BYTES] != data:
        raise VaderError("Lighting read-back differs from what was written; not saved.")
    return _save(b) if b.can_save_lighting else False


def write_profile(b, new, slot=0, cur=None):
    if len(new) != profile.PROFILE_BYTES:
        raise VaderError(f"A profile is {profile.PROFILE_BYTES} bytes, got {len(new)}.")
    backup(b, "before-profile", slot, prof=cur)
    b.write_profile(new, slot)
    back = b.read_profile(slot)
    if not profile.same(back, new):
        raise VaderError("Profile read-back differs from what was written; not saved.")
    _save(b)  # no-op on the DInput dongle, where the write itself persists
    return profile.describe(b.read_profile(slot))


def restore(b, base, slot=0):
    prof = open(base + ".profile.bin", "rb").read()
    lights = open(base + ".led.bin", "rb").read()
    cur_p, cur_l = b.read_profile(slot), b.read_led(slot)
    backup(b, "before-restore", slot, prof=cur_p, lights=cur_l)
    done = []
    if cur_l[: led.LED_WRITE_BYTES] != lights[: led.LED_WRITE_BYTES]:
        b.write_led(lights[: led.LED_WRITE_BYTES], slot)
        done.append("lighting")
    if not profile.same(cur_p, prof):
        b.write_profile(prof, slot)
        done.append("profile")
    if done:
        _save(b)
    return done


def list_backups():
    """Backup names (without directory or extension), oldest first."""
    if not os.path.isdir(BACKUPS):
        return []
    return sorted(f[: -len(".profile.bin")] for f in os.listdir(BACKUPS) if f.endswith(".profile.bin"))


def resolve_backup(name):
    """'latest', a name from list_backups(), or a path prefix -> path prefix that has .profile.bin and .led.bin."""
    names = list_backups()
    if name == "latest":
        if not names:
            raise VaderError("There are no backups yet.")
        name = names[-1]
    for base in (name, os.path.join(BACKUPS, os.path.basename(name))):
        if os.path.exists(base + ".profile.bin") and os.path.exists(base + ".led.bin"):
            return base
    raise VaderError(f"No backup named '{name}'. See: vader backups")

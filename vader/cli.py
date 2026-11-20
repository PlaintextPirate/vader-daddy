"""vader: command-line settings for the Flydigi Vader 4 Pro.

  vader status                         connection, firmware, current lighting and profile summary
  vader lighting [colour] [-b 0-100]   show, or set a steady colour (name or #rrggbb) and brightness
  vader deadzone <left|right|lt|rt> <n>
  vader remap <button> <target|default>
  vader backup                         save profile + lighting to ~/Library/Application Support/VaderDaddy/backups
  vader backups                        list backups
  vader restore <name|latest>          write a backup back to the controller
  vader settings                       show polling rate, stick resolution and the other hardware options
  vader set <setting> <value>          change one, e.g.  vader set polling_rate 500
  vader sleep [minutes|never]          show or set how long the idle controller waits before switching off
  vader serve                          run the local service behind the Mac app (http://127.0.0.1:47815)
"""
import argparse
import os
import sys

from . import funcs, led, ops, profile
from .backends import VaderError, connect


def main(argv=None):
    ap = argparse.ArgumentParser(prog="vader", description="Settings for the Flydigi Vader 4 Pro.")
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("status")
    p = sub.add_parser("lighting")
    p.add_argument("colour", nargs="?")
    p.add_argument("-b", "--brightness", type=int)
    p = sub.add_parser("deadzone")
    p.add_argument("which")
    p.add_argument("value", type=int)
    p = sub.add_parser("remap")
    p.add_argument("button")
    p.add_argument("target")
    sub.add_parser("backup")
    sub.add_parser("serve")
    sub.add_parser("settings")
    p = sub.add_parser("set")
    p.add_argument("setting")
    p.add_argument("value")
    p = sub.add_parser("sleep")
    p.add_argument("value", nargs="?")
    sub.add_parser("backups")
    p = sub.add_parser("restore")
    p.add_argument("name")
    a = ap.parse_args(argv)
    cmd = a.cmd or "status"

    if cmd == "serve":
        from . import server

        try:
            server.serve()
        except OSError as e:
            print(f"vader: can't start the service ({e}); is it already running?", file=sys.stderr)
            return 1
        return 0
    if cmd == "backups":
        for b in ops.list_backups():
            print(b)
        return 0
    try:
        if cmd == "lighting" and a.colour:
            rgb = led.parse_colour(a.colour)  # validate before touching the controller
        c = connect()
    except (VaderError, ValueError) as e:
        print(f"vader: {e}", file=sys.stderr)
        return 1
    try:
        if cmd == "status":
            i = c.info()
            print(f"Connected via {c.name}  |  firmware {i['firmware']}" + (f"  |  dongle {i['dongle']}" if "dongle" in i else ""))
            active = c.active_profile() if hasattr(c, "active_profile") else None
            if active is not None:
                print(f"Active profile: {active + 1}")
            l, p = led.describe(c.read_led()), profile.describe(c.read_profile())
            print(f"Lighting: {l['mode']}" + (f" {l['colour']}" if l["colour"] else "") + f", brightness {l['brightness']}")
            print(f"Deadzones: {p['deadzone']}  |  vibration {'on' if p['vibration'] else 'off'}")
            print("Remaps: " + (", ".join(f"{k}->{v}" for k, v in p["remaps"].items()) or "none"))
            if not c.can_save_lighting:
                print("Note: in this mode lighting changes apply but are lost at power-off (use XInput mode or the cable).")
        elif cmd == "lighting":
            cur = led.describe(c.read_led())
            if not a.colour and a.brightness is None:
                print(f"{cur['mode']}" + (f" {cur['colour']}" if cur["colour"] else "") + f", brightness {cur['brightness']}")
            else:
                if not a.colour:
                    if not cur["colour"]:
                        raise VaderError("Lighting is animated; give a colour to switch to steady.")
                    rgb = led.parse_colour(cur["colour"])
                r = ops.set_lighting(c, rgb, cur["brightness"] if a.brightness is None else a.brightness)
                print(f"Lighting set to {r['colour']}, brightness {r['brightness']}" + (" and saved." if r["saved"] else " (NOT saved: lost at power-off in this mode)."))
        elif cmd == "deadzone":
            cur = c.read_profile()
            r = ops.write_profile(c, profile.set_deadzone(cur, a.which.lower(), a.value), cur=cur)
            print(f"Deadzones now {r['deadzone']} (saved).")
        elif cmd == "remap":
            cur = c.read_profile()
            r = ops.write_profile(c, profile.set_remap(cur, a.button, a.target), cur=cur)
            print("Remaps now: " + (", ".join(f"{k}->{v}" for k, v in r["remaps"].items()) or "none") + " (saved).")
        elif cmd in ("settings", "set"):
            if not hasattr(c, "func_get"):
                raise VaderError("Hardware settings are only wired up for the dongle in XInput mode so far.")
            if cmd == "set":
                c.func_set(*funcs.resolve(a.setting.lower(), a.value))
            for d in funcs.describe(c.func_get()):
                print(f"{d['key']:20} {d['label']:10}  ({d['name']}; options: {', '.join(x['label'] for x in d['choices'])})")
        elif cmd == "sleep":
            if not hasattr(c, "sleep_get"):
                raise VaderError("The sleep timer is only wired up for the dongle in XInput mode so far.")
            if a.value is not None:
                m = 0 if a.value.lower() == "never" else int(a.value)
                if not 0 <= m <= 254:
                    raise VaderError("Minutes must be 1..254, or 'never'.")
                c.sleep_set(m)
            m = c.sleep_get()
            print("The controller " + (f"switches off after {m} idle minutes." if m else "never switches off by itself."))
        elif cmd == "backup":
            print("Backup written:", ops.backup(c))
        elif cmd == "restore":
            base = ops.resolve_backup(a.name)
            done = ops.restore(c, base)
            print("Restored " + (" and ".join(done) if done else "nothing (controller already matches)") + f" from {os.path.basename(base)}.")
        return 0
    except (VaderError, ValueError, RuntimeError) as e:
        print(f"vader: {e}", file=sys.stderr)
        return 1
    finally:
        c.close()


if __name__ == "__main__":
    sys.exit(main())

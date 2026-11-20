# Debugging the VaderDaddy UI

## Run it without a controller

```sh
cd ui && npx vite dev --port 5173
open 'http://localhost:5173/?demo'          # stand-in controller held in memory, moving live input
open 'http://localhost:5173/?demo&debug'    # plus the debug badge and window.__vader
```

`?demo` never talks to the service or the controller. Without it, the page calls `POST /api/call` and
`GET /api/input/stream` on its own origin (the `vader serve` service, normally http://127.0.0.1:47815).
`/classic` is the old interface (full page load from Settings › Diagnostics).

## Flags

Read once at load: defaults → `localStorage['vaderdaddy.flags']` (JSON, e.g. `{"profileNames": true}`) →
`?flags=a,b` (switches on; `-a` switches off). See `src/lib/flags.ts`:

| flag | default | what |
| --- | --- | --- |
| `responseCurve` | off | stick Response tab |
| `profileNames` | on in demo | profile name field (bytes 770..785, never written to hardware yet) |
| `pressToSelect` | on | a press on the controller opens that part when nothing is open |

## The debug badge (`?debug`)

Bottom left: average and worst frame time of the last 120 frames, how many of them were slow (> 16.7 ms),
the input bus status (`live` / `retrying` / `idle`) and where input comes from (`stream`, `poll` after three
failed stream attempts, or `demo`), and the JS heap. It is loaded with a dynamic import only when `?debug` is in
the URL, so the normal bundle never contains it, and its sampler only runs while it is shown.

## `window.__vader`

Present in dev builds and with `?debug`. Everything the shell wires together:

| key | what |
| --- | --- |
| `device` | connection: `status`, `info`, `busy`, `lastError`, `t` (the transport: `readConfig`, `getSettings`, …) |
| `profile`, `lighting` | per-slot `slots[n].original` / `.draft`, `changes`, `undo(id)`, `discard()`, `save()` |
| `session` | `slot`, `selection`, `view`, `sheet`, `palette`, `menu`; `select('ls')`, `openView('history')` |
| `scripts`, `history`, `hardware`, `toasts`, `flags` | the other stores (`hardware` = controller-wide settings) |
| `bus` | live input: `latest()`, `status`, `transport`, `press('A')` (pretend a press) |
| `log` | the debug log: `entries()`, `text()`, `clear()` |
| `demo` | demo failure switches (below) |

### Simulating failures (demo only)

```js
__vader.demo.offline = true          // calls answer "no controller": no-controller screen; set false to reconnect (≤ 5 s)
__vader.demo.serviceDown = true      // calls fail as if the service were not running: pill says so
__vader.demo.hang = true             // calls never answer; the call timeout fires after demo.timeoutMs (15 000)
__vader.demo.timeoutMs = 1500        //   …shorter, for trying it
__vader.demo.failSlots = [2]         // reads of profile 3 fail: warning dot on the switcher, "Try again" in the menu
__vader.demo.lighting = false        // next connect reports DInput over the dongle: lighting cannot be saved
```

After changing `lighting`, reconnect: `__vader.device.status = 'disconnected'; __vader.device.connect()`.
Real-service failures (not demo) can be tried in headless Chrome with the DevTools `Fetch` domain: fail
`/api/input/stream` to see the bus fall back to polling `/api/input`, or never answer `/api/call` to see the
15 s timeout.

## Logs

- In the app: Settings › Diagnostics shows the newest 200 lines; "Copy log" copies all 500.
- In code: `log.add(kind, text, detail)` from `$lib/stores/debug` (`tx`, `rx`, `info`, `error`, `save`).
  Transport calls, connection changes, saves, backups and every error caught by a boundary land there; error
  boundaries record the region's name (`stage`, `inspector`, `history`, `settings`, `palette`, `script sheet`).
- The service logs to its terminal; the root helper to `/var/log/vaderdaddy.log`.

## Context

The shell puts the live input bus in Svelte context under **`'vader.inputBus'`** (`setContext` in
`src/routes/+page.svelte`). Panels read it with `getContext('vader.inputBus')` and fall back to an inert bus when
it is absent (for example in `/kit`).

## Adding a panel

1. Write `src/lib/panels/MyPanel.svelte`. It takes `PanelProps` (`part`, `side`) and reads/writes the stores
   (`profile.draft`, …) directly. Wrap it in `Panel` from `$lib/ui` (title + Done calling `session.select(null)`).
2. Register it in `src/lib/app/panels.ts`: add a loader to `LOAD` (it becomes its own chunk) and route a selection
   to it in `panelFor` (parts route through `PARTS[id].inspector` in `src/lib/controller/parts.ts`).
3. If it should be searchable, add an entry in `CommandPalette.svelte`'s item list.
4. Strings go in `src/lib/copy.ts`. The inspector wraps every panel in an error boundary already.

## Adding a setting to the change list

Profile fields are described in `src/lib/stores/changes.ts`: add a `Field` to `FIELDS` with an `id`, a `label`
(from `copy`), an accessor (`field((c) => c.path, 'key')`) and a `format` for the from → to text. That one entry
gives the unsaved count, the line in the changes popover, its Undo and ⌘Z. Lighting changes are described in
`src/lib/stores/lightingModel.ts` (`describeLightChanges`). Add a test next to it (`npm test`).

Whole-profile operations (copy to another slot, import, reset) show as one change ("Profile replaced by …") with
one Undo; later edits are listed against the replaced profile (`slotChanges` in `stores/profile.svelte.ts`).

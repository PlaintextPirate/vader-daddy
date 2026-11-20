# VaderDaddy redesign: implementation brief

Shared contract for everyone building the new UI. The mock-ups are
`docs/redesign/v2/01-home.png` … `13-no-controller.png` (1440×900). They are the visual spec: match them.

## Goals, in order

1. Correct: never write anything to the controller the user did not ask for; unknown bytes survive every edit.
2. Smooth: 60 fps while live input streams; no layout shift; interactions answer within one frame.
3. Easy to extend and debug: one obvious place for each concern, small files, typed boundaries, no cleverness.
4. Degrades gracefully: a failing panel, stream or connection never takes the whole window down.

## Stack and rules

- SvelteKit, Svelte 5 runes, TypeScript strict, static adapter. No new runtime dependencies without a reason
  written in the commit message. Icons: `@lucide/svelte` deep imports only.
- Font: Inter (bundle the variable woff2 in `ui/static/fonts`, `font-display: swap`, system fallback).
- British spelling in copy. Every user-visible string lives in `ui/src/lib/copy.ts`.
- No per-frame Svelte state. Live input is painted straight to the DOM/canvas from one `requestAnimationFrame` loop.
- Animate only `transform` and `opacity`. Respect `prefers-reduced-motion`.
- Every interactive element is a real `<button>`/`<input>`, reachable by keyboard, with a visible focus ring and
  an accessible name. Hit targets ≥ 28 px. Text contrast ≥ 4.5:1.
- Each file under ~250 lines. A component does one thing. Logic that can be a pure function lives in a `.ts`
  file with a `node --test` test next to it.
- Errors: throw `AppError` (code + user message); only the action runner and error boundaries catch.

## Layout of `ui/src`

```
routes/+page.svelte            new shell (thin: composes lib/app/*)
routes/classic/+page.svelte    the old UI, untouched in behaviour (components moved to lib/classic/)
lib/copy.ts                    all strings
lib/theme/tokens.css           design tokens (colours, radii, spacing, motion, type); base.css resets
lib/ui/                        primitives: Button, Chip, Seg, Slider, Switch, Stepper, Field, Panel, Popover,
                               Sheet, Toasts, Tooltip-free. No app knowledge. Each takes `label`/aria props.
lib/device/                    transport.ts (existing API calls), errors.ts, device.svelte.ts (connection, info,
                               busy, action runner), input.ts (SSE stream + reconnect/backoff + demo generator;
                               non-reactive bus: subscribe(fn), latest())
lib/protocol/                  codecs (existing; pure, tested). Add names.ts (profile name, bytes 770..785).
lib/stores/                    session.svelte.ts (slot, selection, open sheet, palette), profile.svelte.ts
                               (original + draft per slot, change list, undo one, discard, save),
                               lighting.svelte.ts (same pattern for LEDs), scripts.svelte.ts (script library),
                               history.svelte.ts (backups), toasts.svelte.ts, debug.ts (ring log)
lib/controller/                Controller.svelte (inline SVG), parts.ts (part ids, key ids, panel routing),
                               live.ts (paints presses/sticks/triggers/LEDs onto the SVG from the input bus)
lib/panels/                    ButtonPanel, StickPanel (Range/Response), TriggerPanel, GyroPanel,
                               VibrationPanel, LightPanel (+ColourPopover), each lazy-loaded
lib/sheets/ScriptSheet.svelte  script timeline editor
lib/app/                       TopBar, ProfileSwitcher, ProfileMenu, SaveBar (+ChangesPopover), Inspector
                               (hosts the open panel inside an error boundary), EmptyState, HistoryView,
                               SettingsView (controller-wide options + diagnostics/log), CommandPalette
```

## State model

- `device`: `status: 'connecting' | 'connected' | 'disconnected'`, `info`, `busy`, `run(label, fn)` (the only place
  that sets busy, catches, logs and raises a toast). Reconnects by itself every 5 s when disconnected.
- `session`: `slot` (0–3), `selection: PartId | 'gyro' | 'vibration' | 'light' | null`, `sheet`, `palette`.
  Selection is mirrored to the URL hash so a reload returns to the same panel.
- `profile`: for each slot `original: ProfileConfig` (as read) and `draft` (deep clone). Panels bind to
  `profile.draft`. `changes` is derived by comparing semantic fields of draft and original through a table of
  descriptors `{ id, label(c), read(c), write(c, v), format(v) }`; that one table drives the unsaved count, the
  changes popover and "undo one change". `save()` = backup snapshot → encode → write → read back → compare →
  commit, exactly the verified flow in the old `state.svelte.ts` (keep its checks and messages).
- `lighting`: same original/draft/changes/save pattern for the LED config of the slot.
- The save bar shows `profile.changes.length + lighting.changes.length`; Save runs both saves that have changes;
  Discard resets both drafts; ⌘S saves, ⌘Z undoes the latest change, Esc closes the open panel/sheet/popover.
- Nothing is written to the controller until Save. Controller-wide settings (Settings view) are the exception
  and apply immediately, as now.

## Controller drawing

- One inline SVG, viewBox `0 -20 720 490`, authored by hand from `docs/redesign/v2/controller.svg` (a flattened
  export: use it for shapes and colours only) and the PNGs. Target well under 30 KB of markup.
- Each interactive part is a `<g data-part="…">` containing its shapes and label, plus a transparent, slightly
  enlarged hit shape with `role="button"`, `tabindex="0"` and an accessible name. Part ids: `lt rt lb rb ls rs
  dpad a b x y c z select start home capture m1 m2 m3 m4 light`.
- States are classes on the part group: `.is-selected` (orange outline), `.is-pressed` (white, live),
  `.is-dim`. Stick caps move by CSS transform set from `live.ts`; trigger pull fills a clip; LEDs take CSS
  custom properties `--led0`…`--led4` so the lighting panel can preview without touching the profile.
- Paddle captions (two lines) and the Gyro/Vibration chips are HTML positioned under the SVG.
- Clicking or pressing Enter/Space on a part sets `session.selection`. Pressing a standard button on the real
  controller selects it too when no panel is open and focus is not in a text field (press-to-select).

## Feature scope for this round

- Built fully: main screen, button panel, script sheet, stick Range tab, trigger, gyro, vibration, light panel
  with colour popover, save bar with change list and per-change undo, profile switcher and menu (name, copy to
  slot, export, import, reset), History (backups), Settings (controller-wide options, sleep timer, diagnostics),
  ⌘K palette, no-controller screen, toasts, `/classic` fallback.
- Stick Response tab: built behind `flags.responseCurve`; only switched on if the curve bytes are decoded and
  verified. See `docs/redesign/CURVE_NOTES.md` when it exists.
- Not built: anything that needs the active slot to be read or switched from software.

## Engineering checks before any hand-off

`npm run check` (0 errors), `npm test`, `npm run build` in `ui/`. Then open `http://localhost:5173/?demo`
(vite dev) and exercise the feature. Never talk to the real controller unless your brief says so.

## Git

Branch `redesign-ui`. Small commits, imperative subject, body says why. Only the lead commits.

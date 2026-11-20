import { decodeLed, encodeLed, LED_WRITE_BYTES, type LedConfig } from '$lib/protocol/led';
import { AppError, toAppError } from '$lib/device/errors';
import { device } from '$lib/device/device.svelte';
import { fmt, copy } from '$lib/copy';
import { changeOrder } from './order';
import { session } from './session.svelte';
import { history } from './history.svelte';
import { log } from './debug';
import { toDraft, fromDraft, describeLightChanges, steadyColours, type LightDraft } from './lightingModel';
import { differences } from './profileSlot';
import { flags } from '$lib/flags';
import { MS_PER_SPEED_UNIT } from './speed';
import { prefs } from './prefs.svelte';

export type { LightDraft, LightChange } from './lightingModel';

/** Quiet time after the last lighting edit before it is shown on the controller. */
const LIVE_DELAY_MS = 250;
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
/** LED of the lighting data shown by each segment of the V, left to right (see LED_SEG in Controller.svelte). */
const SEG_LED = [3, 4, 0, 1, 2];

/** How often the Dock icon is redrawn while the lighting is animated. */
const DOCK_FRAME_MS = 125;
const mix = (a: string, b: string, t: number) =>
  '#' + [1, 3, 5].map((i) => {
    const x = parseInt(a.slice(i, i + 2), 16), y = parseInt(b.slice(i, i + 2), 16);
    return Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  }).join('');

interface SlotState { base: LedConfig; original: LightDraft; draft: LightDraft }
const cloneDraft = (d: LightDraft): LightDraft => $state.snapshot(d) as LightDraft;

/** Lighting per slot: same original/draft/changes/save pattern as the profile store. */
class Lighting {
  slots = $state<Record<number, SlotState>>({});
  /** Not saved. The LED (0–4) the light panel is pointing at (row hovered or focused); the stage outlines it. */
  hoverLed = $state<number | null>(null);
  /** The LED whose colour popover is open: the stage keeps its callout while focus is inside the popover. */
  pickLed = $state<number | null>(null);
  /** Not saved. The step the light panel is editing; the stage shows it instead of animating. Null: animate. */
  previewStep = $state<number | null>(null);

  get original(): LightDraft | null { return this.slots[session.slot]?.original ?? null; }
  get draft(): LightDraft | null { return this.slots[session.slot]?.draft ?? null; }

  #changes = $derived.by(() => (this.original && this.draft ? describeLightChanges(this.original, this.draft) : []));
  get changes() { return this.#changes; }

  hasChanges(slot: number) {
    const s = this.slots[slot];
    return !!s && describeLightChanges(s.original, s.draft).length > 0;
  }

  /** False on the dongle in DInput mode: lighting there is lost at power-off, so Save refuses. */
  get canSave() { return device.canSaveLighting; }

  adoptRead(slot: number, base: LedConfig) {
    const original = toDraft(base);
    this.slots[slot] = { base, original, draft: cloneDraft(original) };
    this.#shown[slot] = this.#liveKey(slot);
  }

  // Live preview: every lighting edit is written to the controller's working memory shortly after it is made,
  // so the real LEDs follow the panel. Nothing is saved: Save still does the verified write and the commit, and
  // Discard or Undo show the old lighting again the same way. A power cycle brings back what was last saved.
  /** Per slot: the bytes the controller's LEDs show now, as far as this app knows. */
  #shown: Record<number, string | null> = {};
  #pushing = false;
  #liveKey(slot: number): string | null {
    try { return this.slots[slot] ? hex(this.encode(slot)) : null; } catch { return null; }
  }
  /** Shows the slot's draft on the controller if it is not what the LEDs show already. Never throws. */
  async showLive(slot = session.slot): Promise<void> {
    if (!flags.liveLighting || this.#pushing || session.writing) return;
    this.#pushing = true;
    try {
      // Edits made while a write is on its way are picked up by the next round, so only the latest is sent.
      for (let round = 0; round < 20; round++) {
        const key = this.#liveKey(slot);
        if (key === null || key === this.#shown[slot] || device.status !== 'connected') return;
        const data = this.encode(slot);
        const ok = await device.run(copy.light.previewing, async () => { await device.t.writeLed(slot, data); return true; }, { toast: false, quiet: true });
        if (!ok) return;
        this.#shown[slot] = key;
        this.#noteWritten(slot, data);
      }
    } finally { this.#pushing = false; }
  }

  // The animation clock: where the controller is in its loop, as far as the app can know. Measured by tapping
  // along (research/led_tempo.py, 2026-11-20, fw 6.9.3.3): one step lasts speed x 100 ms; an animation written
  // over steady lighting starts at step 0 when the write lands; one written over a running animation carries on
  // from where that was. The controller never reports its position, so this only gets the speed right: the drawing
  // and the Dock icon run at the controller's pace but not in step with it (lining them up was tried and dropped,
  // since they drift apart again within minutes).
  #anim = { pos: 0, at: 0, stepMs: 1600 };
  /** Whether the controller is running an animation whose position `#anim` follows. */
  #running = false;
  /** Bumped whenever the clock is set, so the drawing and the Dock icon pick it up. */
  animRev = $state(0);
  get animStepMs() { return this.#anim.stepMs; }
  /** Position in the loop, in steps (not wrapped): 2.25 is a quarter of the way from step 2 to step 3. */
  animPos(now = performance.now()) { return Math.max(0, this.#anim.pos + (now - this.#anim.at) / this.#anim.stepMs); }
  #noteWritten(slot: number, data: Uint8Array) {
    if (slot !== session.slot) return;
    const animated = data[8] === 1, now = performance.now();
    if (animated) {
      const stepMs = Math.max(80, data[5] * MS_PER_SPEED_UNIT);
      this.#anim = this.#running ? { pos: this.animPos(now), at: now, stepMs } : { pos: 0, at: now, stepMs };
    }
    this.#running = animated;
    this.animRev++;
  }
  read = (slot: number) => device.run(fmt(copy.save.reading, { n: slot + 1 }), async () => {
    this.adoptRead(slot, decodeLed(await device.t.readLed(slot)));
  }, { toast: false });

  undo = (id: string) => {
    const c = this.changes.find((x) => x.id === id);
    if (c && this.draft && this.original) c.revert(this.draft, this.original);
  };

  discard = () => {
    const s = this.slots[session.slot];
    if (s) s.draft = cloneDraft(s.original);
  };

  /** Brings back a light draft kept from before a reload (unsaved.svelte.ts). */
  restoreDraft(slot: number, d: LightDraft) {
    if (this.slots[slot]) this.slots[slot].draft = structuredClone(d);
  }

  /** The bytes the current draft of a slot writes (header fields nobody changed keep their stored bytes). */
  encode(slot: number): Uint8Array {
    const s = this.slots[slot];
    const base = $state.snapshot(s.base) as LedConfig;
    return encodeLed(fromDraft(base, $state.snapshot(s.draft) as LightDraft, $state.snapshot(s.original) as LightDraft));
  }

  /**
   * Compares a read-back with what was written: the read-back becomes the base and original either way; on a
   * mismatch the user's draft stays, so the change list shows what did not land. Returns the differing indices.
   */
  settleRestore(slot: number, written: Uint8Array, back: Uint8Array): number[] {
    const bad = differences(written, back.subarray(0, LED_WRITE_BYTES));
    const keep = bad.length && this.slots[slot] ? cloneDraft(this.slots[slot].draft) : null;
    this.adoptRead(slot, decodeLed(back));
    if (keep) this.slots[slot].draft = keep;
    return bad;
  }

  /**
   * Verified flow (classic `saveLed`): snapshot → encode → write → read back → compare → commit to flash.
   * `backup: false` when the caller (saveAll) already took one snapshot for the whole save.
   */
  save = (opts: { backup?: boolean } = {}) => {
    const slot = session.slot;
    return device.run(copy.save.saving, async () => {
      const s = this.slots[slot];
      if (!s) return;
      if (!device.canSaveLighting) throw new AppError('unsupported', copy.light.dinputNoSave);
      if (opts.backup !== false) history.snapshot(fmt(copy.save.backupLight, { n: slot + 1 }));
      let data: Uint8Array;
      try { data = this.encode(slot); } catch (e) { throw toAppError(e); }
      await device.t.writeLed(slot, data);
      const bad = this.settleRestore(slot, data, await device.t.readLed(slot));
      if (bad.length) throw new AppError('verify_failed', copy.save.readBackLight, { bad });
      const status = await device.t.save();
      log.add('save', `lighting ${slot} saved, status ${status}`);
      return status;
    });
  };

  /** The LED colours to show on the drawing for a step (wraps), as 5 hex strings. `previewStep` wins when set. */
  ledsAt(step: number): string[] {
    const d = this.draft;
    if (!d) return [];
    if (d.mode === 'steady') return steadyColours(d);
    const k = this.previewStep ?? step;
    return d.grid.map((steps) => steps[k % steps.length]);
  }

  init() {
    return $effect.root(() => {
      $effect(() => changeOrder.sync('lighting', this.changes.map((c) => ({ id: c.id, value: `${c.from}→${c.to}` }))));
      $effect(() => {
        const slot = session.slot;
        if (!flags.liveLighting || device.status !== 'connected' || this.#liveKey(slot) === this.#shown[slot]) return;
        const t = setTimeout(() => this.showLive(slot), LIVE_DELAY_MS);
        return () => clearTimeout(t);
      });
      // The Mac app's Dock icon wears the light bar's colours (app/main.swift); a browser has no such handler.
      $effect(() => {
        const dock = (globalThis as any).webkit?.messageHandlers?.vaderIcon;
        if (!dock) return;
        const d = this.draft;
        if (!d || device.status !== 'connected') { dock.postMessage([]); return; }
        const send = (colours: string[]) =>
          dock.postMessage(SEG_LED.map((led) => (d.brightness <= 0 ? '#000000' : colours[led] ?? '#000000')));
        const held = this.previewStep;
        if (d.mode === 'steady' || held !== null || !prefs.dockAnimated) {
          send(d.mode === 'steady' ? steadyColours(d) : d.grid.map((steps) => steps[(held ?? 0) % steps.length]));
          return;
        }
        // Animated: the icon runs through the steps like the light bar, fading from each colour to the next.
        const grid = $state.snapshot(d.grid) as string[][];
        void this.animRev; // the clock was set: carry on from the controller's position
        const frame = () => {
          const pos = this.animPos(), k = Math.floor(pos), t = pos - k;
          send(grid.map((steps) => mix(steps[k % steps.length], steps[(k + 1) % steps.length], t)));
        };
        frame();
        const timer = setInterval(frame, DOCK_FRAME_MS);
        return () => clearInterval(timer);
      });
    });
  }
}

export const lighting = new Lighting();

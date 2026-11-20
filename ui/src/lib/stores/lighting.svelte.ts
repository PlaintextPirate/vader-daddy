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

export type { LightDraft, LightChange } from './lightingModel';

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
    });
  }
}

export const lighting = new Lighting();

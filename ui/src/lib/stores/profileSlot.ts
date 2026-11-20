/**
 * The write logic of the profile store as pure functions over plain objects (the store passes snapshots of its
 * $state): decode / encode a draft, the change list of a slot, whole-profile replace (copy, import, reset), and
 * what a save leaves behind (verified or not). Tested in profileSlot.test.ts.
 */
import { decodeConfig, encodeConfig } from '../protocol/config.ts';
import { readName, writeName } from '../protocol/names.ts';
import { keepGuarded, type GuardFlags } from '../protocol/guards.ts';
import type { Script } from '../protocol/bindings.ts';
import { VERSION_BYTES, replaceBytes, sameProfile } from '../app/profileFile.ts';
import { describeChanges, type Change, type ProfileDraft } from './changes.ts';

/**
 * After a whole-profile replace the change list shows one entry for it rather than dozens of field changes;
 * `base` is the replaced profile, and later edits are listed against it.
 */
export interface Replaced { label: string; base: ProfileDraft }
export interface SlotState { original: ProfileDraft; draft: ProfileDraft; replaced?: Replaced }

export const REPLACED = 'replaced';
const clone = <T>(x: T): T => structuredClone(x);

/** Profile bytes as a draft, with the name when profile names are switched on. */
export function decodeDraft(raw: Uint8Array, f: GuardFlags): ProfileDraft {
  const c: ProfileDraft = decodeConfig(raw);
  if (f.profileNames) c.name = readName(raw);
  return c;
}

/**
 * The bytes a draft writes. The name is written only when it was changed; flag-guarded ranges whose flag is off
 * keep the draft's bytes as read (guards.ts), whatever the fields say.
 */
export function encodeDraft(d: ProfileDraft, f: GuardFlags): Uint8Array {
  let out = encodeConfig(d, { responseCurve: f.responseCurve });
  if (f.profileNames && d.name !== undefined && d.name !== readName(d.raw)) out = writeName(out, d.name);
  return keepGuarded(out, d.raw, f);
}

export function slotChanges(s: SlotState, scripts: Script[], f: GuardFlags): Change[] {
  const opts = { responseCurve: f.responseCurve };
  if (!s.replaced) return describeChanges(s.original, s.draft, scripts, opts);
  const whole: Change = { id: REPLACED, label: s.replaced.label, from: '', to: '', revert: () => {} };
  return [whole, ...describeChanges(s.replaced.base, s.draft, scripts, opts)];
}

/** A slot just read from the controller: original and draft both what it holds. */
export function readSlot(raw: Uint8Array, f: GuardFlags): SlotState {
  const original = decodeDraft(raw, f);
  return { original, draft: clone(original) };
}

/**
 * `bytes` (a whole profile) as the new draft of a slot: see replaceBytes for what is kept from the slot itself.
 * `keepName` (reset to defaults) keeps the slot's name whatever the flags. One change entry, none when equal.
 */
export function replaceSlot(s: SlotState, bytes: Uint8Array, label: string, f: GuardFlags, opts: { keepName?: boolean } = {}): SlotState {
  const draft = decodeDraft(replaceBytes(bytes, s.original.raw, f, opts), f);
  return { original: s.original, draft, replaced: sameProfile(draft.raw, s.original.raw) ? undefined : { label, base: clone(draft) } };
}

/** Indices where the read-back differs from what was written, ignoring `ignore`. */
export function differences(written: Uint8Array, back: Uint8Array, ignore: readonly number[] = []): number[] {
  const out: number[] = [];
  for (let i = 0; i < written.length; i++) if (back[i] !== written[i] && !ignore.includes(i)) out.push(i);
  return out;
}

/**
 * What a profile write leaves behind. The read-back always becomes the original (it is what the controller holds:
 * over the dongle a write sticks even without the save command). Verified: the draft is the read-back too.
 * Not verified: the user's draft is kept, so the change list shows what still differs; when that difference is
 * in bytes no listed field covers, one `notTaken` entry keeps Save available.
 */
export function settleProfileWrite(s: SlotState, written: Uint8Array, back: Uint8Array, f: GuardFlags, notTaken: string):
  { state: SlotState; bad: number[] } {
  const bad = differences(written, back, VERSION_BYTES);
  const original = decodeDraft(back, f);
  if (!bad.length) return { state: { original, draft: clone(original) }, bad };
  const state: SlotState = { original, draft: s.draft, replaced: s.replaced };
  if (!state.replaced && !slotChanges(state, [], f).length && !sameProfile(encodeDraft(s.draft, f), back))
    state.replaced = { label: notTaken, base: clone(original) };
  return { state, bad };
}

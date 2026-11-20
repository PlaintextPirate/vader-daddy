/**
 * Unsaved drafts kept across a reload or quit (sessionStorage), as pure functions. Each slot's entry holds the
 * draft's encoded profile and the light draft, each keyed by a hash of the original it was made against, so a
 * draft is only offered back when the controller still holds that same original. Tested in unsavedModel.test.ts.
 */
import { compactHex, parseHex } from '../protocol/bytes.ts';
import type { LightDraft } from './lightingModel.ts';

export interface SlotEntry {
  /** Hash of the profile original, and the draft's bytes (compact hex). */
  profile?: { of: string; bytes: string };
  /** Hash of the lighting as read, and the light draft. */
  light?: { of: string; draft: LightDraft };
}
export type Entries = Record<number, SlotEntry>;

/** FNV-1a, 32 bit, as 8 hex digits: enough to tell two reads of a slot apart. */
export function hashBytes(b: ArrayLike<number>): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export const profileEntry = (original: Uint8Array, draft: Uint8Array) => ({ of: hashBytes(original), bytes: compactHex(draft) });
export const lightEntry = (base: Uint8Array, draft: LightDraft) => ({ of: hashBytes(base), draft });

const isLight = (d: unknown): d is LightDraft => {
  const x = d as LightDraft;
  return !!x && (x.mode === 'steady' || x.mode === 'animated') && typeof x.brightness === 'number' && typeof x.speed === 'number' &&
    Array.isArray(x.grid) && x.grid.every((r) => Array.isArray(r) && r.every((h) => typeof h === 'string')) &&
    Array.isArray(x.steady) && typeof x.perLed === 'boolean';
};

/** What can be offered back for a slot whose original / lighting as read hash to these; null when nothing. */
export function offerFor(e: SlotEntry | undefined, profileRaw: Uint8Array | null, lightRaw: Uint8Array | null):
  { profile?: Uint8Array; light?: LightDraft } | null {
  if (!e) return null;
  const out: { profile?: Uint8Array; light?: LightDraft } = {};
  if (e.profile && profileRaw && e.profile.of === hashBytes(profileRaw)) {
    const b = typeof e.profile.bytes === 'string' ? parseHex(e.profile.bytes) : null;
    if (b && b.length === profileRaw.length) out.profile = b;
  }
  if (e.light && lightRaw && e.light.of === hashBytes(lightRaw) && isLight(e.light.draft)) out.light = e.light.draft;
  return out.profile || out.light ? out : null;
}

/** Reads the stored entries, tolerating anything malformed. */
export function parseEntries(json: string | null): Entries {
  try {
    const v = json ? JSON.parse(json) : null;
    if (!v || typeof v !== 'object') return {};
    const out: Entries = {};
    for (const [k, e] of Object.entries(v as Record<string, SlotEntry>)) if (/^[0-3]$/.test(k) && e && typeof e === 'object') out[+k] = e;
    return out;
  } catch { return {}; }
}

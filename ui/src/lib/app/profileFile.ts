/**
 * Whole-profile operations that work on the 840 raw bytes, so regions the app does not decode travel too:
 * copy to another slot, export to a file, import from a file, reset to defaults. Pure; tested.
 */
import { CONFIG_BYTES } from '../protocol/config.ts';
import { compactHex, parseHex } from '../protocol/bytes.ts';
import { keepGuarded, type GuardFlags } from '../protocol/guards.ts';
import { NAME_OFFSET, NAME_BYTES } from '../protocol/names.ts';

/** Save version (little-endian), rewritten by the controller on every save: always the target slot's own. */
export const VERSION_BYTES = [225, 226] as const;

/** Every profile starts with these: format 01 03, 0x54 = 84 parcels. */
export const PROFILE_HEADER = [0x01, 0x03, 0x54] as const;
export const hasProfileHeader = (b: Uint8Array) => PROFILE_HEADER.every((v, i) => b[i] === v);

/**
 * `source` as the new content of a slot that currently holds `target`. Every byte comes from `source` except:
 * the save version (always the target's), the flag-guarded ranges whose flag is off (guards.ts: the target's
 * bytes stay), and with `keepName` the profile name (reset to defaults must not put the factory name on a slot).
 */
export function replaceBytes(source: Uint8Array, target: Uint8Array, flags: GuardFlags, opts: { keepName?: boolean } = {}): Uint8Array {
  if (source.length !== CONFIG_BYTES || target.length !== CONFIG_BYTES) throw new Error(`A profile is ${CONFIG_BYTES} bytes.`);
  const out = Uint8Array.from(source);
  for (const i of VERSION_BYTES) out[i] = target[i];
  keepGuarded(out, target, flags);
  if (opts.keepName) out.set(target.subarray(NAME_OFFSET, NAME_OFFSET + NAME_BYTES), NAME_OFFSET);
  return out;
}

/** True when two profiles are the same apart from the save version. */
export function sameProfile(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && i !== VERSION_BYTES[0] && i !== VERSION_BYTES[1]) return false;
  return true;
}

export { compactHex };

/** The exported file. */
export interface ProfileFile { app: 'VaderDaddy'; kind: 'profile'; version: 1; name?: string; config: string }

export function toProfileFile(bytes: Uint8Array, name?: string): ProfileFile {
  return { app: 'VaderDaddy', kind: 'profile', version: 1, ...(name ? { name } : {}), config: compactHex(bytes) };
}

export type ParseFailure = 'json' | 'kind' | 'hex' | 'length' | 'header';
export type ParseResult = { ok: true; bytes: Uint8Array; name?: string } | { ok: false; reason: ParseFailure };

/**
 * Reads an exported profile: compact hex, or two-digit tokens separated by spaces (backups use them); 840 bytes
 * starting 01 03 54. Anything else is refused with a reason.
 */
export function parseProfileFile(text: string): ParseResult {
  let j: unknown;
  try { j = JSON.parse(text); } catch { return { ok: false, reason: 'json' }; }
  if (!j || typeof j !== 'object') return { ok: false, reason: 'kind' };
  const o = j as Record<string, unknown>;
  if (o.kind !== 'profile' || typeof o.config !== 'string') return { ok: false, reason: 'kind' };
  const bytes = parseHex(o.config);
  if (!bytes) return { ok: false, reason: 'hex' };
  if (bytes.length !== CONFIG_BYTES) return { ok: false, reason: 'length' };
  if (!hasProfileHeader(bytes)) return { ok: false, reason: 'header' };
  return { ok: true, bytes, ...(typeof o.name === 'string' ? { name: o.name } : {}) };
}

/** A file name for an export: "vader4pro-Shooter.json". */
export const exportName = (label: string) => `vader4pro-${label.replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-+|-+$/g, '') || 'profile'}.json`;

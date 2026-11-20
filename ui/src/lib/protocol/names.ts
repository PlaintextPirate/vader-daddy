/**
 * Profile name, bytes 770..785 of the profile: UTF-16LE, 16 bytes, at most 8 UTF-16 code units, zero padded.
 * Factory slot 0 holds 常规游戏配置 ("regular game configuration") followed by four zero bytes.
 *
 * Derived from the Space Station decompile and checked against the factory dump only: NEVER WRITTEN to a
 * controller yet. The app keeps it behind `flags.profileNames`.
 */
export const NAME_OFFSET = 770;
export const NAME_BYTES = 16;
export const NAME_MAX = NAME_BYTES / 2; // UTF-16 code units

/** Reads the name; stops at the first 0x0000 code unit. */
export function readName(raw: Uint8Array): string {
  let out = '';
  for (let i = 0; i < NAME_MAX; i++) {
    const o = NAME_OFFSET + i * 2;
    const u = raw[o] | (raw[o + 1] << 8);
    if (u === 0) break;
    out += String.fromCharCode(u);
  }
  return out;
}

/** Cuts a name to what fits (8 code units), never splitting a surrogate pair, and drops NUL characters. */
export function clampName(name: string): string {
  let s = name.replaceAll('\u0000', '');
  if (s.length <= NAME_MAX) return s;
  s = s.slice(0, NAME_MAX);
  const last = s.charCodeAt(s.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) s = s.slice(0, -1); // lone high surrogate
  return s;
}

/** Returns a copy of `raw` with the name written (clamped) and the rest of the 16 bytes zeroed. */
export function writeName(raw: Uint8Array, name: string): Uint8Array {
  const out = Uint8Array.from(raw);
  const s = clampName(name);
  out.fill(0, NAME_OFFSET, NAME_OFFSET + NAME_BYTES);
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    out[NAME_OFFSET + i * 2] = u & 0xff;
    out[NAME_OFFSET + i * 2 + 1] = u >> 8;
  }
  return out;
}

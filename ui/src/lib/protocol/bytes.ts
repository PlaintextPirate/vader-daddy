/** Byte helpers shared by the codecs, the transport and the file formats. Pure; tested in bytes.test.ts. */

/** "01 03 54 …": two lower-case hex digits per byte, space separated (backups and fixtures use this). */
export const hex = (a: ArrayLike<number>): string =>
  Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(' ');

/** "010354…": the same without spaces (the service and profile files use this). */
export const compactHex = (a: ArrayLike<number>): string =>
  Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Strict hex parsing: either one compact run of an even number of digits, or whitespace-separated tokens of
 * exactly two digits each. Anything else (odd tokens, stray characters, "1 2 3") gives null.
 */
export function parseHex(s: string): Uint8Array | null {
  const t = s.trim();
  if (!t) return new Uint8Array(0);
  const tokens = t.split(/\s+/);
  const pairs = tokens.length === 1 ? (/^(?:[0-9a-f]{2})+$/i.test(t) ? t.match(/../g)! : null) : tokens;
  if (!pairs || !pairs.every((x) => /^[0-9a-f]{2}$/i.test(x))) return null;
  return Uint8Array.from(pairs, (x) => parseInt(x, 16));
}

/** parseHex for data that must be well formed (fixtures, the app's own backups); throws otherwise. */
export function fromHex(s: string): Uint8Array {
  const b = parseHex(s);
  if (!b) throw new Error('Malformed hex data.');
  return b;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

/**
 * Checksum used by Space Station 3.x for the 0x50 command family.
 * `full` includes the report id at index 0. Mirrors their loop exactly:
 * for i < len-1: full[idx] += full[i]   (which ends up as 2 × sum of the bytes before idx).
 */
export function withChecksum(payload: number[], idx: number, len = 15): number[] {
  const full = [0x05, ...payload];
  while (full.length < len) full.push(0);
  full[idx] = 0;
  for (let i = 0; i < full.length - 1; i++) full[idx] = (full[idx] + full[i]) & 0xff;
  return full.slice(1);
}

/** Split a block into the 10-byte parcels the controller expects: [inner, 10 data bytes, 0xA0, index]. */
export function parcels(inner: number, data: Uint8Array): number[][] {
  const n = Math.ceil(data.length / 10);
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const part = Array.from(data.slice(i * 10, i * 10 + 10));
    while (part.length < 10) part.push(0);
    out.push([inner, ...part, 0xa0, i]);
  }
  return out;
}

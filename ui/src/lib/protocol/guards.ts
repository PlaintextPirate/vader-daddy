/**
 * Flag-guarded byte ranges of the 840-byte profile: regions the app understands from the decompile but has not
 * verified on hardware. While a region's flag is off, the app NEVER changes its bytes on a slot: not when
 * encoding a draft, not when copying another slot over it, not when importing a file or resetting to defaults.
 * This table is the one place that says which bytes those are; `encodeDraft`, `encodeConfig` and `replaceBytes`
 * all go through `keepGuarded`. Pure; tested in guards.test.ts.
 */
export interface GuardFlags {
  /** flags.profileNames */
  profileNames: boolean;
  /** flags.responseCurve */
  responseCurve: boolean;
}

/** Half-open [from, to) ranges per flag. */
export const GUARDED: Record<keyof GuardFlags, readonly (readonly [number, number])[]> = {
  // Profile name, UTF-16LE, 16 bytes.
  profileNames: [[770, 786]],
  // Second stick block per stick: type and the 9-point table (B+0..9), and the edge (B+11). B+10 (bytes 800 and
  // 812) is circularity, verified on hardware and always written, so it is NOT guarded.
  responseCurve: [[790, 800], [801, 802], [802, 812], [813, 814]]
};

/** Every byte index that is kept as it is with these flags. */
export function guardedBytes(f: GuardFlags): number[] {
  const out: number[] = [];
  for (const k of Object.keys(GUARDED) as (keyof GuardFlags)[]) {
    if (f[k]) continue;
    for (const [a, b] of GUARDED[k]) for (let i = a; i < b; i++) out.push(i);
  }
  return out;
}

/** Copies `keep`'s bytes into `out` for every range whose flag is off. Mutates and returns `out`. */
export function keepGuarded(out: Uint8Array, keep: Uint8Array, f: GuardFlags): Uint8Array {
  for (const i of guardedBytes(f)) out[i] = keep[i];
  return out;
}

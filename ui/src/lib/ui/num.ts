// Number helpers for the numeric primitives (Slider, Stepper): clamp, snap to a step grid, parse typed input.

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Snaps `v` to min + k·step and clamps it; rounding keeps decimal steps (0.1) free of float noise. */
export function snap(v: number, min: number, max: number, step: number): number {
  const s = step > 0 ? Math.round((v - min) / step) * step + min : v;
  const decimals = (String(step).split('.')[1] ?? '').length;
  return clamp(Number(s.toFixed(decimals)), min, max);
}

export interface ParseOptions {
  /** Accept a decimal part (default true). */
  decimal?: boolean;
  /** Accept a leading minus (default true). */
  negative?: boolean;
}

/**
 * Reads a typed number: digits, optionally a leading minus and a decimal part (point or comma), optionally followed
 * by the unit the control shows ("100 ms", "8%", "0,5", "15 min"). Anything else ("1e3", "12abc", "1-2") is
 * rejected with null, so the caller keeps the old value.
 */
export function parseTyped(text: string, opts: ParseOptions = {}): number | null {
  const { decimal = true, negative = true } = opts;
  const m = /^\s*(-?)(\d+(?:[.,]\d*)?|[.,]\d+)\s*(?:ms|min|s|%)?\s*$/i.exec(text);
  if (!m) return null;
  if (m[1] && !negative) return null;
  if (/[.,]/.test(m[2]) && !decimal) return null;
  const n = Number(m[1] + m[2].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Script timeline maths: time scale and ticks, zoom, snapping and clamping of presses, lanes, keeping two presses
 * of one button apart, and hit-testing a bar. Pure; tested in timeline.test.ts.
 */
import type { MacroAction } from '../../protocol/config.ts';

export const STEP_MS = 10;
export const MIN_LEN = 10;
export const MAX_MS = 60000;
export const GAP_MS = 50;
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 16;
export const ZOOM_FACTOR = 1.5;

export type Press = MacroAction;
export type Zone = 'start' | 'end' | 'body';

export const snapMs = (ms: number) => Math.round(ms / STEP_MS) * STEP_MS;
export const endOf = (p: Press) => p.startMs + p.holdMs;
export const contentEnd = (ps: Press[]) => ps.reduce((m, p) => Math.max(m, endOf(p)), 0);

/** 1, 2 or 5 × 10ⁿ, the smallest at or above `raw` (never below 10 ms). */
export function niceStep(raw: number): number {
  if (!(raw > STEP_MS)) return STEP_MS;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/** The span "Fit" shows: the presses' end rounded up to a nice step (about five ticks), at least 100 ms. */
export function fitSpan(endMs: number): number {
  const end = Math.max(100, endMs);
  const step = niceStep(end / 5);
  return Math.ceil(end / step) * step;
}

/** Pixels per millisecond for a lane width, a fitted span and a zoom level. */
export const pxPerMs = (width: number, spanMs: number, zoom: number) => (Math.max(1, width) / Math.max(1, spanMs)) * zoom;
export const msToPx = (ms: number, k: number) => ms * k;
export const pxToMs = (px: number, k: number) => px / k;

/** Tick times from 0 to `totalMs` with labels at least `minPx` apart. */
export function ticks(totalMs: number, k: number, minPx = 110): number[] {
  const step = niceStep(minPx / k);
  const out: number[] = [];
  for (let t = 0; t <= totalMs + 1e-6; t += step) out.push(t);
  return out;
}

export const zoomIn = (z: number) => Math.min(ZOOM_MAX, +(z * ZOOM_FACTOR).toFixed(4));
export const zoomOut = (z: number) => Math.max(ZOOM_MIN, +(z / ZOOM_FACTOR).toFixed(4));

/** The lanes: one per button, in the order the buttons first appear, each with the indices of its presses. */
export function lanes(ps: Press[]): { button: number; items: number[] }[] {
  const out: { button: number; items: number[] }[] = [];
  ps.forEach((p, i) => {
    const lane = out.find((l) => l.button === p.button);
    if (lane) lane.items.push(i);
    else out.push({ button: p.button, items: [i] });
  });
  return out;
}

/** The free room around press `i`: the end of the same button's press before it and the start of the one after. */
export function room(ps: Press[], i: number): { lo: number; hi: number } {
  const me = ps[i];
  let lo = 0, hi = MAX_MS;
  ps.forEach((p, j) => {
    if (j === i || p.button !== me.button) return;
    if (p.startMs < me.startMs || (p.startMs === me.startMs && j < i)) lo = Math.max(lo, endOf(p));
    else hi = Math.min(hi, p.startMs);
  });
  return { lo, hi };
}

/**
 * Press `i` after dragging `zone` by `deltaMs`: snapped to 10 ms, start ≥ 0, length ≥ 10 ms, and never across
 * another press of the same button (it stops at its neighbours instead).
 */
export function dragPress(ps: Press[], i: number, zone: Zone, deltaMs: number): Press {
  const p = ps[i];
  const { lo, hi } = room(ps, i);
  const d = snapMs(deltaMs);
  const end = endOf(p);
  if (zone === 'body') {
    const start = Math.min(Math.max(lo, p.startMs + d), Math.max(lo, hi - p.holdMs));
    return { ...p, startMs: start };
  }
  if (zone === 'start') {
    const start = Math.min(Math.max(lo, p.startMs + d), end - MIN_LEN);
    return { ...p, startMs: start, holdMs: end - start };
  }
  const e = Math.max(p.startMs + MIN_LEN, Math.min(hi, end + d));
  return { ...p, holdMs: e - p.startMs };
}

/** Press `i` placed at exactly `startMs` for `holdMs` (typed), clamped to the room left by its neighbours. */
export function placePress(ps: Press[], i: number, startMs: number, holdMs: number): Press | null {
  const p = ps[i];
  const others = ps.filter((q, j) => j !== i && q.button === p.button);
  // A start past the end is pulled back so the press keeps its length (it used to be squeezed to 10 ms).
  const hold = Math.min(MAX_MS, Math.max(MIN_LEN, snapMs(holdMs)));
  let start = Math.max(0, Math.min(MAX_MS - hold, snapMs(startMs)));
  for (const q of others) if (start >= q.startMs && start < endOf(q)) start = endOf(q);
  const next = others.filter((q) => q.startMs >= start).reduce((m, q) => Math.min(m, q.startMs), MAX_MS);
  const len = Math.min(hold, next - start);
  return len >= MIN_LEN ? { ...p, startMs: start, holdMs: len } : null;
}

/** A new press of `button`: after the last press plus 50 ms with the same length, or at the same time as it. */
export function newPress(ps: Press[], button: number, together: boolean): Press {
  const last = ps[ps.length - 1];
  const holdMs = last?.holdMs ?? 100;
  let startMs = !last ? 0 : together ? last.startMs : endOf(last) + GAP_MS;
  // Never on top of a press of the same button: move it past the overlap.
  let moved = true;
  while (moved) {
    moved = false;
    for (const q of ps) {
      if (q.button === button && startMs < endOf(q) && q.startMs < startMs + holdMs) {
        startMs = endOf(q);
        moved = true;
      }
    }
  }
  return { button, startMs, holdMs };
}

/** Which part of a bar `x` px from its left edge hits: a resize handle at either end, else the body. */
export function hitZone(x: number, widthPx: number, handlePx = 10): Zone {
  const h = Math.min(handlePx, widthPx / 3);
  if (x <= h) return 'start';
  if (x >= widthPx - h) return 'end';
  return 'body';
}

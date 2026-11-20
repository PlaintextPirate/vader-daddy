/** Geometry of the response graph (SVG user units = CSS px at the panel's width). Pure; tested in graph.test.ts. */
import { corners, sampleTable, TABLE_X, rawToPct, pctToRaw, type StickResponse, type Pt } from '../../protocol/response.ts';

export const W = 328, H = 240;
export const PLOT = { left: 24, right: 304, top: 34, bottom: 206 };
const PW = PLOT.right - PLOT.left, PH = PLOT.bottom - PLOT.top;

export const sx = (pct: number) => PLOT.left + (pct / 100) * PW;
export const sy = (pct: number) => PLOT.bottom - (pct / 100) * PH;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** SVG point → percent (0..100 on both axes). */
export const toPct = (x: number, y: number): Pt => ({
  x: clamp(((x - PLOT.left) / PW) * 100, 0, 100),
  y: clamp(((PLOT.bottom - y) / PH) * 100, 0, 100)
});

/** Polyline through the curve's corners, flat to full tilt. */
export function curvePath(r: StickResponse): string {
  const pts = corners(r);
  const all = [{ x: 0, y: pts[0].y }, ...pts, { x: 100, y: pts[3].y }];
  return all.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
}

/** The 9 table samples the controller will get, as SVG points. */
export const tableDots = (r: StickResponse) => sampleTable(r).map((v, i) => ({ x: sx(TABLE_X[i]), y: sy(v - 50) }));

/** A control point (raw) in percent, and nudged by a percent step on one axis (raw result). */
export const pointPct = (p: Pt): Pt => ({ x: rawToPct(p.x), y: rawToPct(p.y) });
export function nudge(p: Pt, dx: number, dy: number): Pt {
  const q = pointPct(p);
  return { x: pctToRaw(clamp(q.x + dx, 0, 100)), y: pctToRaw(clamp(q.y + dy, 0, 100)) };
}

/** Arrow keys: 1 % per press, 5 % with Shift. Null for other keys. */
export function keyStep(key: string, shift: boolean): [number, number] | null {
  const s = shift ? 5 : 1;
  return key === 'ArrowLeft' ? [-s, 0] : key === 'ArrowRight' ? [s, 0] : key === 'ArrowUp' ? [0, s] : key === 'ArrowDown' ? [0, -s] : null;
}

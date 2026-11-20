/**
 * Stick response curve (see docs/redesign/CURVE_NOTES.md). Pure; tested in response.test.ts.
 *
 * One curve per stick, stored twice, as Space Station 3.4.9.5 writes it for this pad ("V31" path):
 *   block A (left 109..115, right 116..122): type, deadzone (int8), P0x, P0y, P1x, P1y, end
 *   block B (left 790..801, right 802..813): type, 9 sampled outputs (output % + 50), round type, edge (int8)
 * Block B's table is derived from block A's points and the edge byte; the official app always writes both
 * together. All point / deadzone / edge values here are raw 0..127 (127 = 100 %); deadzone and edge are signed.
 */
export type Side = 'left' | 'right';
/** 0 Default (linear), 1 Fast ("Immediate"), 2 Delay, 3 Custom. */
export type CurveType = 0 | 1 | 2 | 3;
export const CURVE = { linear: 0, fast: 1, delay: 2, custom: 3 } as const;

/** Raw 0..127 on both axes. */
export interface Pt { x: number; y: number }

export interface StickResponse {
  type: CurveType;
  /** A+1, signed: > 0 inner dead zone, < 0 anti-dead zone. */
  deadzone: number;
  p0: Pt;
  p1: Pt;
  /** A+6, not touched by the official UI; preserved. */
  end: number;
  /** B+1..9 as stored (bytes 50..150). Read-only on decode; encode recomputes it. */
  table: number[];
  /** B+11, signed: > 0 outer dead zone (full output at 100 − edge), < 0 caps the output. */
  edge: number;
}

export const RAW_MAX = 127;
export const BLOCK_A: Record<Side, number> = { left: 109, right: 116 };
export const BLOCK_B: Record<Side, number> = { left: 790, right: 802 };
/** Input % at which the 9 table entries are sampled: ⌊100·i/8⌋. */
export const TABLE_X = Array.from({ length: 9 }, (_, i) => Math.floor((100 * i) / 8));

export const i8 = (b: number) => (b > 127 ? b - 256 : b);
export const u8 = (v: number) => (v < 0 ? v + 256 : v) & 0xff;
/** JoystickDataConvert.GamepadToShowData / ShowDataToGamepadData. */
export const rawToPct = (v: number) => Math.round((v * 100) / RAW_MAX);
export const pctToRaw = (p: number) => Math.round((p * RAW_MAX) / 100);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const bankers = (v: number) => {
  const f = Math.floor(v), d = v - f;
  return d > 0.5 || (d === 0.5 && f % 2 !== 0) ? f + 1 : f;
};
/** The app positions points in 250 px UI space (0.4 % per px, banker's rounding) before sampling. */
const pxQuantise = (pct: number) => bankers(pct * 2.5) / 2.5;

export function decodeResponse(raw: Uint8Array, side: Side): StickResponse {
  const a = BLOCK_A[side], b = BLOCK_B[side];
  return {
    type: raw[a] as CurveType,
    deadzone: i8(raw[a + 1]),
    p0: { x: raw[a + 2], y: raw[a + 3] },
    p1: { x: raw[a + 4], y: raw[a + 5] },
    end: raw[a + 6],
    table: Array.from(raw.subarray(b + 1, b + 10)),
    edge: i8(raw[b + 11])
  };
}

/** Curve corners in percent: start, P0, P1, end, then flat to the edge (official model, §3.2). */
export function corners(r: StickResponse, quantise = false): Pt[] {
  const c = rawToPct(r.deadzone), e = rawToPct(r.edge);
  const q = (p: Pt) => {
    const x = rawToPct(p.x), y = rawToPct(p.y);
    return quantise ? { x: pxQuantise(x), y: pxQuantise(y) } : { x, y };
  };
  return [
    { x: Math.max(c, 0), y: Math.max(-c, 0) },
    q(r.p0),
    q(r.p1),
    { x: e >= 0 ? 100 - e : 100, y: e >= 0 ? 100 : 100 + e }
  ];
}

const lerp = (a: Pt, b: Pt, x: number) => (a.x === b.x ? a.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x));

function evaluate(pts: Pt[], antiDz: number, x: number): number {
  const [s, p0, p1, e] = pts;
  if (x <= s.x) return antiDz;
  if (x <= p0.x) return lerp(s, p0, x);
  if (x <= p1.x) return lerp(p0, p1, x);
  if (x < e.x) return lerp(p1, e, x);
  return e.y;
}

/** Output % for an input tilt % (0..100), for drawing. */
export function sampleCurve(r: StickResponse, tiltPct: number): number {
  const pts = corners(r);
  return evaluate(pts, pts[0].y, clamp(tiltPct, 0, 100));
}

/** The 9-byte table exactly as BaseGamePadModel::CalculateCurvePoints computes it. */
export function sampleTable(r: StickResponse): number[] {
  const pts = corners(r, true);
  const anti = r.deadzone < 0 ? Math.round((-r.deadzone * 100) / RAW_MAX) : 0;
  return TABLE_X.map((x) => Math.trunc(evaluate(pts, anti, x) + 50));
}

/** Allowed box for a control point (raw), given the other point, dead zone and edge (CURVE_NOTES §5). */
export function pointBounds(r: StickResponse, which: 'p0' | 'p1') {
  const dz = Math.max(r.deadzone, 0), anti = Math.max(-r.deadzone, 0);
  const xMax = RAW_MAX - Math.max(r.edge, 0), yMax = RAW_MAX - Math.max(-r.edge, 0);
  return which === 'p0'
    ? { x0: dz, x1: Math.min(r.p1.x, xMax), y0: anti, y1: Math.min(r.p1.y, yMax) }
    : { x0: Math.max(r.p0.x, dz), x1: xMax, y0: Math.max(r.p0.y, anti), y1: yMax };
}

export function clampPoint(r: StickResponse, which: 'p0' | 'p1', p: Pt): Pt {
  const b = pointBounds(r, which);
  return { x: clamp(Math.round(p.x), b.x0, Math.max(b.x0, b.x1)), y: clamp(Math.round(p.y), b.y0, Math.max(b.y0, b.y1)) };
}

/** Enforces dead zone ≤ P0 ≤ P1 ≤ edge on both axes; keeps P0 inside the window first, then P1 after it. */
export function constrain(r: StickResponse): StickResponse {
  const deadzone = clamp(r.deadzone, -RAW_MAX, RAW_MAX), edge = clamp(r.edge, -RAW_MAX, RAW_MAX);
  const dz = Math.max(deadzone, 0), anti = Math.max(-deadzone, 0);
  const xMax = Math.max(dz, RAW_MAX - Math.max(edge, 0)), yMax = Math.max(anti, RAW_MAX - Math.max(-edge, 0));
  const p0 = { x: clamp(r.p0.x, dz, xMax), y: clamp(r.p0.y, anti, yMax) };
  const p1 = { x: clamp(r.p1.x, p0.x, xMax), y: clamp(r.p1.y, p0.y, yMax) };
  return { ...r, deadzone, edge, p0, p1 };
}

/** Writes both blocks of one stick into `out` (in place): A+0..6, B+0, B+1..9 (recomputed), B+11. B+10 untouched. */
export function writeResponse(out: Uint8Array, side: Side, input: StickResponse): void {
  const r = constrain(input), a = BLOCK_A[side], b = BLOCK_B[side];
  out.set([r.type, u8(r.deadzone), r.p0.x, r.p0.y, r.p1.x, r.p1.y, r.end & 0xff], a);
  out[b] = r.type;
  out.set(sampleTable(r), b + 1);
  out[b + 11] = u8(r.edge);
}

/** A copy of `raw` with this stick's curve written to both blocks, as the official app does. */
export function encodeResponse(raw: Uint8Array, side: Side, r: StickResponse): Uint8Array {
  const out = Uint8Array.from(raw);
  writeResponse(out, side, r);
  return out;
}

/** Same curve shape (what the user can edit); ignores the stored table and End. */
export const sameShape = (a: StickResponse, b: StickResponse) =>
  a.type === b.type && a.deadzone === b.deadzone && a.edge === b.edge &&
  a.p0.x === b.p0.x && a.p0.y === b.p0.y && a.p1.x === b.p1.x && a.p1.y === b.p1.y;

export type PresetKey = 'linear' | 'fast' | 'delay';
/** Official presets (CURVE_NOTES §4) with centre and edge 0; `table` is what Space Station writes. */
export const PRESETS: Record<PresetKey, { type: CurveType; p0: Pt; p1: Pt; table: number[] }> = {
  linear: { type: 0, p0: { x: 64, y: 64 }, p1: { x: 127, y: 127 }, table: [50, 62, 75, 87, 100, 112, 125, 137, 150] },
  fast: { type: 1, p0: { x: 64, y: 96 }, p1: { x: 127, y: 127 }, table: [50, 68, 88, 106, 126, 131, 138, 143, 150] },
  delay: { type: 2, p0: { x: 64, y: 32 }, p1: { x: 127, y: 127 }, table: [50, 55, 62, 68, 74, 92, 112, 130, 150] }
};

/**
 * Applies a preset's type and points. Unlike Space Station, the dead zone and edge are kept (they belong to the
 * Range tab here); the points are then clamped into that window.
 */
export function applyPreset(r: StickResponse, key: PresetKey): StickResponse {
  const p = PRESETS[key];
  return constrain({ ...r, type: p.type, p0: { ...p.p0 }, p1: { ...p.p1 } });
}

/** Which preset a type byte corresponds to (types outside 0..3 read as custom). */
export const presetOfType = (t: number): PresetKey | 'custom' =>
  t === 0 ? 'linear' : t === 1 ? 'fast' : t === 2 ? 'delay' : 'custom';

const PRESET_KEYS: PresetKey[] = ['linear', 'fast', 'delay'];
const near = (a: Pt, b: Pt) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;

/**
 * The preset a curve looks like, judged on its SHAPE only: the type byte is ignored (a dead-zone or outer-limit
 * edit sets it to Custom, as the official app does, without changing the shape). A preset matches when both
 * points are within one step of its points as applied to this curve's dead-zone / edge window (the factory
 * profile stores 63/63 where the Linear preset has 64/64); both points on the diagonal also read as Linear. Used by the change list and the Response
 * tab, so both always agree.
 */
export function presetOf(r: StickResponse): PresetKey | 'custom' {
  if (r.p0.x === r.p0.y && r.p1.x === r.p1.y) return 'linear';
  for (const key of PRESET_KEYS) {
    const p = applyPreset(r, key);
    if (near(p.p0, r.p0) && near(p.p1, r.p1)) return key;
  }
  return 'custom';
}

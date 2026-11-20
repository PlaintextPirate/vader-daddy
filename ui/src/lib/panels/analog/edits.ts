/**
 * What the stick and trigger panels do to a draft, as pure functions (tested in edits.test.ts). `curve` is
 * flags.responseCurve: with it off, edits touch exactly the fields they always did (block A dead zone / end);
 * with it on, a dead-zone or outer-limit change goes through the response curve like Space Station's sliders
 * (edge byte for the outer limit, points clamped into the new window, type := Custom).
 */
import { responseOf, setResponse, type ProfileConfig, type Curve } from '../../protocol/config.ts';
import { applyPreset, clampPoint, constrain, CURVE, type PresetKey, type Pt, type Side } from '../../protocol/response.ts';
import { stickPct, stickRaw, STICK_DEADZONE, STICK_OUTER, outerPctFromEdge, edgeFromOuterPct } from '../../stores/units.ts';

type Draft = Pick<ProfileConfig, 'sticks' | 'edge' | 'raw' | 'round' | 'triggers'>;
export const other = (s: Side): Side => (s === 'left' ? 'right' : 'left');

export const deadzonePct = (c: Draft, s: Side) => stickPct(Math.max(0, c.sticks[s].deadzone > 127 ? 0 : c.sticks[s].deadzone));
export const outerPct = (c: Draft, s: Side, curve: boolean) => (curve ? outerPctFromEdge(c.edge[s]) : stickPct(c.sticks[s].end));

export function setDeadzonePct(c: Draft, s: Side, pct: number, curve: boolean) {
  const raw = stickRaw(pct, STICK_DEADZONE);
  if (!curve) { c.sticks[s].deadzone = raw; return; }
  setResponse(c, s, constrain({ ...responseOf(c, s), deadzone: raw, type: CURVE.custom }));
}

export function setOuterPct(c: Draft, s: Side, pct: number, curve: boolean) {
  if (!curve) { c.sticks[s].end = stickRaw(pct, STICK_OUTER); return; }
  setResponse(c, s, constrain({ ...responseOf(c, s), edge: edgeFromOuterPct(pct), type: CURVE.custom }));
}

/** Moves one control point (raw), clamped to its allowed box; the curve becomes Custom. */
export function setPoint(c: Draft, s: Side, which: 'p0' | 'p1', p: Pt) {
  const r = responseOf(c, s);
  setResponse(c, s, { ...r, [which]: clampPoint(r, which, p), type: CURVE.custom });
}

export function setPreset(c: Draft, s: Side, key: PresetKey | 'custom') {
  const r = responseOf(c, s);
  setResponse(c, s, key === 'custom' ? { ...r, type: CURVE.custom } : applyPreset(r, key));
}

const STICK_KEYS = ['type', 'deadzone', 'p0x', 'p0y', 'p1x', 'p1y', 'end'] as const satisfies readonly (keyof Curve)[];
const sameCurve = (a: Curve, b: Curve) => STICK_KEYS.every((k) => a[k] === b[k]);
/** What the trigger panel edits and the change list shows; the other trigger curve bytes are never touched. */
const TRIGGER_KEYS = ['deadzone', 'end'] as const satisfies readonly (keyof Curve)[];

/**
 * `curve` is flags.responseCurve (the stick panel passes it): with it off the stick edge (flag-guarded bytes) is
 * neither compared nor copied.
 */
/** The sticks are the same in everything the encoder writes for them (the edge only with the curve on). */
export const sticksEqual = (c: Draft, curve = false) =>
  sameCurve(c.sticks.left, c.sticks.right) && (!curve || c.edge.left === c.edge.right) && c.round.left === c.round.right;
export const triggersEqual = (c: Draft) => TRIGGER_KEYS.every((k) => c.triggers.left[k] === c.triggers.right[k]);

/** Makes the `to` stick identical to `from` (curve, circularity, and with the curve on the edge). */
export function copyStick(c: Draft, from: Side, to: Side, curve = false) {
  Object.assign(c.sticks[to], { ...c.sticks[from] });
  if (curve) c.edge[to] = c.edge[from];
  c.round[to] = c.round[from];
}
/** Copies the dead zone and full-press point (what the trigger panel shows) to the other trigger. */
export function copyTrigger(c: Draft, from: Side, to: Side) {
  for (const k of TRIGGER_KEYS) c.triggers[to][k] = c.triggers[from][k];
}

/**
 * Settings profile ("mapping config") of the Vader 4 Pro: 84 parcels × 10 = 840 bytes.
 *
 * Bytes 3–224 follow the Vader 3 Pro layout from flydigictl (pkg/flydigi/config/unmarshal.go),
 * confirmed against a real Vader 4 Pro dump. Only the header differs (Vader 4 starts 01 03,
 * byte 2 = parcel count 0x54). Bytes 225–839 (macros + Vader 4-only fields) are kept as-is.
 *
 * Every edit is applied on top of `raw`, so fields we don't understand are never touched.
 */
import { decodeResponse, writeResponse, sameShape, i8, type Side, type StickResponse, type CurveType } from './response.ts';
import { keepGuarded } from './guards.ts';

export const CONFIG_BYTES = 840;

export const KEY_NAMES: Record<number, string> = {
  0: 'D-pad up', 1: 'D-pad right', 2: 'D-pad down', 3: 'D-pad left',
  4: 'A', 5: 'B', 6: 'Select', 7: 'X', 8: 'Y', 9: 'Start',
  10: 'LB', 11: 'RB', 12: 'LT', 13: 'RT', 14: 'L3', 15: 'R3',
  // Extra buttons as identified on a Vader 4 Pro by pressing each one; the older Flydigi numbering differs.
  16: 'C', 17: 'Z', 18: 'M2', 19: 'M1', 20: 'M4', 21: 'M3',
  24: 'Menu', 27: 'Home', 28: 'Back'
};
/** Buttons that are shown as remappable sources in the UI (front + back + extras). */
export const REMAPPABLE = [19, 18, 21, 20, 16, 17, 4, 5, 7, 8, 10, 11, 12, 13, 14, 15, 6, 9, 0, 1, 2, 3];
export const NO_REMAP = 0xff;

export interface ButtonMap { key: number; target: number; turboType: number; turbo: number }

/** Curve as stored: [type, deadzone, p0x, p0y, p1x, p1y, end]. Values 0–127 for sticks, 0–255 for triggers. */
export interface Curve { type: number; deadzone: number; p0x: number; p0y: number; p1x: number; p1y: number; end: number }

export interface Gyro {
  mapType: number; activationKey: number; activationMethod: number;
  deadzone: number; sensX: number; sensY: number; mode: number; extKey: number;
}

/** Grip motor: type, a/b = weakest/strongest motor output (0–255), scale = strength in percent (1–100). */
export interface Motor { type: number; a: number; b: number; scale: number }
/**
 * One trigger motor set (7 bytes; names from the official app): min/max = output range (0–255), filter (1–255),
 * scale = strength in percent (1–100). type, vibLimit and timeLimit are kept as read; the official app never
 * changes them.
 */
export interface TriggerMotorSet { type: number; min: number; max: number; filter: number; vibLimit: number; scale: number; timeLimit: number }
/** Per trigger: `line` is the set the official app edits; `micro` (the short-travel mode's set) it leaves alone. */
export interface TriggerMotor { line: TriggerMotorSet; micro: TriggerMotorSet }
export interface Rumble { enabled: boolean; left: Motor; right: Motor }

/**
 * Macros (verified on a Vader 4 Pro in XInput mode). Section at bytes 230..767:
 *   [count] [5 offsets] then per macro [trigger key] [step count lo, hi] [type 1..3] and 4-byte steps
 *   [time lo, hi in 10 ms units] [button key] [1 = press, 0 = release].
 * Offset k = total (steps + 1) of the macros before k, in 4-byte units. The trigger key's button entry holds the
 * marker 0x20. One byte per macro at 820.. is its repeat interval in 10 ms units.
 */
export const MACRO_OFFSET = 230;
export const MACRO_BYTES = 538;
export const MACRO_KEY = 0x20;
export const MAX_MACROS = 5;
export const MACRO_UNITS = (MACRO_BYTES - 6) / 4; // 133 four-byte units shared by all macros
const CYCLE_OFFSET = 820;
/** Buttons a macro step can press (the standard ones). */
export const MACRO_BUTTONS = [4, 5, 7, 8, 10, 11, 12, 13, 14, 15, 6, 9, 0, 1, 2, 3];

/** One button held from startMs for holdMs. */
export interface MacroAction { button: number; startMs: number; holdMs: number }
/**
 * type (measured on the controller): 1 = plays once per press, 2 = repeats while the trigger is held,
 * 3 = toggle (press starts a loop, press again stops it). cycleMs is the pause between repeats (0 = none).
 * hold: press steps only, no releases. With type 2 the buttons stay down exactly as long as the trigger is held;
 * with type 3 they latch: one press holds them down, the next press lets go. (Both measured.)
 */
export interface Macro { trigger: number; type: number; cycleMs: number; actions: MacroAction[]; hold?: boolean }

/** Units a set of macros uses: one header plus a press and a release per action. */
export const macroUnits = (macros: Macro[]) => macros.reduce((n, m) => n + 1 + m.actions.length * (m.hold ? 1 : 2), 0);

export function decodeMacros(b: Uint8Array): Macro[] {
  const n = b[MACRO_OFFSET];
  if (!n || n > MAX_MACROS) return [];
  const out: Macro[] = [];
  for (let k = 0; k < n; k++) {
    let o = MACRO_OFFSET + 6 + (k ? b[MACRO_OFFSET + 1 + k] : 0) * 4;
    const count = b[o + 1] | (b[o + 2] << 8);
    const macro: Macro = { trigger: b[o], type: b[o + 3], cycleMs: (b[CYCLE_OFFSET + k] === 0xff ? 3 : b[CYCLE_OFFSET + k]) * 10, actions: [] };
    const open = new Map<number, number>(); // button -> index of its unfinished action
    let releases = 0;
    for (let s = 0; s < count; s++) {
      o += 4;
      const t = (b[o] | (b[o + 1] << 8)) * 10, btn = b[o + 2], down = b[o + 3] === 1;
      if (down) { open.set(btn, macro.actions.length); macro.actions.push({ button: btn, startMs: t, holdMs: 10 }); }
      else { releases++; if (open.has(btn)) { const a = macro.actions[open.get(btn)!]; a.holdMs = Math.max(10, t - a.startMs); open.delete(btn); } }
    }
    if (macro.type !== 1 && count > 0 && releases === 0) { macro.hold = true; for (const a of macro.actions) a.holdMs = 100; }
    out.push(macro);
  }
  return out;
}

function putMacros(out: Uint8Array, macros: Macro[]) {
  if (macros.length > MAX_MACROS) throw new Error(`At most ${MAX_MACROS} macros.`);
  if (macroUnits(macros) > MACRO_UNITS) throw new Error('The macros are too long to fit on the controller.');
  // A cycle byte of 0xFF (never set) reads as the default 30 ms. Keep it as 0xFF for a macro on the same trigger
  // whose repeat pause was not changed, so a save does not rewrite it as 03.
  const unset = new Set(decodeMacros(out).filter((m, k) => out[CYCLE_OFFSET + k] === 0xff).map((m) => m.trigger));
  const sec = new Uint8Array(MACRO_BYTES).fill(0xff);
  sec.fill(0, 0, 6);
  sec[0] = macros.length;
  let o = 6, units = 0;
  macros.forEach((m, k) => {
    if (k) sec[1 + k] = units;
    const steps = m.actions
      .flatMap((a) => m.hold
        ? [[Math.round(a.startMs / 10), a.button, 1]]
        : [[Math.round(a.startMs / 10), a.button, 1], [Math.round((a.startMs + Math.max(10, a.holdMs)) / 10), a.button, 0]])
      .sort((x, y) => x[0] - y[0] || x[2] - y[2]);
    sec.set([m.trigger, steps.length & 0xff, steps.length >> 8, m.hold && m.type === 1 ? 2 : m.type], o);
    o += 4;
    for (const [t, btn, st] of steps) { sec.set([t & 0xff, t >> 8, btn, st], o); o += 4; }
    units += steps.length + 1;
    const cycle = Math.max(0, Math.min(254, Math.round(m.cycleMs / 10)));
    out[CYCLE_OFFSET + k] = cycle === 3 && unset.has(m.trigger) ? 0xff : cycle;
  });
  out.set(sec, MACRO_OFFSET);
  // A trigger key's button entry carries the macro marker; a key that lost its macro goes back to default.
  const triggers = new Set(macros.map((m) => m.trigger));
  for (let k = 0; k < 32; k++) {
    const e = 13 + k * 3;
    if (triggers.has(k)) out.set([MACRO_KEY, 0, 0], e);
    else if (out[e] === MACRO_KEY) out[e] = NO_REMAP;
  }
}

export interface ProfileConfig {
  raw: Uint8Array;
  version: string;
  parcelCount: number;
  buttons: ButtonMap[];
  sticks: { left: Curve; right: Curve };
  triggers: { left: Curve; right: Curve };
  gyro: Gyro;
  rumble: Rumble;
  triggerRumbleEnabled: boolean;
  triggerMotors: { left: TriggerMotor; right: TriggerMotor };
  /**
   * Signed outer edge per stick (block B +11, bytes 801 and 813): > 0 = full output at 100 − edge %. Together with
   * `sticks.*` (block A) this is the whole response curve; see `responseOf` / `setResponse` in response.ts.
   */
  edge: { left: number; right: number };
  /** Circular correction per stick (Space Station's JoyStickCurve.RoundType, bytes 800 and 812). */
  round: { left: boolean; right: boolean };
  macros: Macro[];
}

// Second stick block (790..813): per stick [curve type, 9 curve points, round type, edge].
const ROUND_LEFT = 800;
const ROUND_RIGHT = 812;
const EDGE_LEFT = 801;
const EDGE_RIGHT = 813;

export interface EncodeOptions {
  /** flags.responseCurve: also write the stick curve's second block (unverified on hardware). */
  responseCurve?: boolean;
}

/**
 * HARDWARE SAFETY SWITCH for the stick curve bytes. The only place that decides what is written for the sticks.
 *
 * - responseCurve OFF (default): today's verified behaviour, exactly. Block A only (109..115, 116..122), from
 *   `sticks.*`. Block B (790..799, 801, 802..811, 813) is never touched.
 * - responseCurve ON: block A as above, then for each stick whose curve shape differs from the bytes as read, both
 *   blocks are rewritten consistently, as Space Station does: A+0..5, B+0 (type), B+1..9 (table recomputed from the
 *   points) and B+11 (edge). An untouched stick keeps every byte, so a stale table survives a save unchanged.
 */
function writeSticks(out: Uint8Array, c: ProfileConfig, responseCurve: boolean) {
  putCurve(out, 109, c.sticks.left);
  putCurve(out, 116, c.sticks.right);
  if (!responseCurve) return;
  for (const side of ['left', 'right'] as const) {
    const r = responseOf(c, side);
    if (!sameShape(r, decodeResponse(c.raw, side))) writeResponse(out, side, r);
  }
}

const curveAt = (b: Uint8Array, o: number): Curve => ({
  type: b[o], deadzone: b[o + 1], p0x: b[o + 2], p0y: b[o + 3], p1x: b[o + 4], p1y: b[o + 5], end: b[o + 6]
});
const putCurve = (b: Uint8Array, o: number, c: Curve) => b.set([c.type, c.deadzone, c.p0x, c.p0y, c.p1x, c.p1y, c.end], o);
const motorAt = (b: Uint8Array, o: number): Motor => ({ type: b[o], a: b[o + 1], b: b[o + 2], scale: b[o + 3] });
/** Trigger motors: 155..168 left, 169..182 right; each a line set then a micro set of 7 bytes. */
export const TRIGGER_MOTOR_LEFT = 155, TRIGGER_MOTOR_RIGHT = 169;
const setAt = (b: Uint8Array, o: number): TriggerMotorSet =>
  ({ type: b[o], min: b[o + 1], max: b[o + 2], filter: b[o + 3], vibLimit: b[o + 4], scale: b[o + 5], timeLimit: b[o + 6] });
const triggerMotorAt = (b: Uint8Array, o: number): TriggerMotor => ({ line: setAt(b, o), micro: setAt(b, o + 7) });
const setBytes = (s: TriggerMotorSet) => [s.type, s.min, s.max, s.filter, s.vibLimit, s.scale, s.timeLimit];
const triggerMotorBytes = (m: TriggerMotor) => [...setBytes(m.line), ...setBytes(m.micro)];

export function decodeConfig(bytes: Uint8Array): ProfileConfig {
  const b = bytes;
  const buttons: ButtonMap[] = [];
  for (let k = 0; k < 32; k++) {
    const o = 13 + k * 3;
    buttons.push({ key: k, target: b[o], turboType: b[o + 1], turbo: b[o + 2] });
  }
  return {
    raw: Uint8Array.from(b),
    version: `${b[0]}.${b[1]}`,
    parcelCount: b[2],
    buttons,
    sticks: { left: curveAt(b, 109), right: curveAt(b, 116) },
    triggers: { left: curveAt(b, 123), right: curveAt(b, 130) },
    gyro: {
      mapType: b[137], activationKey: b[138], activationMethod: b[139], deadzone: b[140],
      sensX: b[141], sensY: b[142], mode: b[143], extKey: b[144]
    },
    rumble: { enabled: b[145] === 0, left: motorAt(b, 146), right: motorAt(b, 150) },
    triggerRumbleEnabled: b[154] === 0,
    triggerMotors: { left: triggerMotorAt(b, TRIGGER_MOTOR_LEFT), right: triggerMotorAt(b, TRIGGER_MOTOR_RIGHT) },
    edge: { left: i8(b[EDGE_LEFT]), right: i8(b[EDGE_RIGHT]) },
    round: { left: b[ROUND_LEFT] === 1, right: b[ROUND_RIGHT] === 1 },
    macros: decodeMacros(b)
  };
}

export function encodeConfig(c: ProfileConfig, opts: EncodeOptions = {}): Uint8Array {
  const out = Uint8Array.from(c.raw);
  for (const m of c.buttons) out.set([m.target, m.turboType, m.turbo], 13 + m.key * 3);
  writeSticks(out, c, opts.responseCurve === true);
  putCurve(out, 123, c.triggers.left);
  putCurve(out, 130, c.triggers.right);
  const g = c.gyro;
  out.set([g.mapType, g.activationKey, g.activationMethod, g.deadzone, g.sensX, g.sensY, g.mode, g.extKey], 137);
  out[145] = c.rumble.enabled ? 0 : 1;
  const { left: l, right: r } = c.rumble;
  out.set([l.type, l.a, l.b, l.scale, r.type, r.a, r.b, r.scale], 146);
  out[154] = c.triggerRumbleEnabled ? 0 : 1;
  if (c.triggerMotors) {
    out.set(triggerMotorBytes(c.triggerMotors.left), TRIGGER_MOTOR_LEFT);
    out.set(triggerMotorBytes(c.triggerMotors.right), TRIGGER_MOTOR_RIGHT);
  }
  if (c.round) { out[ROUND_LEFT] = c.round.left ? 1 : 0; out[ROUND_RIGHT] = c.round.right ? 1 : 0; }
  putMacros(out, c.macros ?? []);
  // The safety net for the switch above: whatever happened, flag-guarded bytes stay as read (guards.ts).
  return keepGuarded(out, c.raw, { responseCurve: opts.responseCurve === true, profileNames: false });
}

/** Remap target as the user sees it: a key id, or "default" when the slot holds 0xFF / its own id. */
export const effectiveTarget = (m: ButtonMap) => (m.target >= 32 ? m.key : m.target);

/** Byte ranges that changed between two configs, for showing a diff before saving. */
export function diffRanges(a: Uint8Array, b: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) out.push(i);
  return out;
}

/** The response curve of one stick as the codec sees it: block A from `sticks.*`, edge from `edge`. */
export function responseOf(c: Pick<ProfileConfig, 'sticks' | 'edge' | 'raw'>, side: Side): StickResponse {
  const s = c.sticks[side];
  const b = side === 'left' ? 790 : 802;
  return {
    type: s.type as CurveType, deadzone: i8(s.deadzone), p0: { x: s.p0x, y: s.p0y }, p1: { x: s.p1x, y: s.p1y },
    end: s.end, table: Array.from(c.raw.subarray(b + 1, b + 10)), edge: c.edge?.[side] ?? i8(c.raw[b + 11])
  };
}

/** Writes a response back into the draft fields (`sticks.*` and `edge`); bytes follow on encode. */
export function setResponse(c: Pick<ProfileConfig, 'sticks' | 'edge'>, side: Side, r: StickResponse): void {
  const s = c.sticks[side];
  s.type = r.type;
  s.deadzone = r.deadzone < 0 ? r.deadzone + 256 : r.deadzone;
  s.p0x = r.p0.x; s.p0y = r.p0.y; s.p1x = r.p1.x; s.p1y = r.p1.y;
  s.end = r.end;
  c.edge[side] = r.edge;
}

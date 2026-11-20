/**
 * Unit conversions between raw profile values and what the UI shows. Shared by the panels and the change list
 * so both always say the same thing.
 *
 * Sticks are on a 0–127 scale (dead zone raw 0–60, outer limit raw 64–127); triggers on 0–255 (dead zone raw
 * 0–120, full press raw 128–255). Percentages are whole numbers. `xRaw(xPct(r))` may differ from `r` (several raw
 * values share a percent), but `xPct(xRaw(p)) === p` for every reachable percent, so a slider that shows a
 * percent never drifts. Panels should only write a raw value when the user actually moves the control.
 */
export interface RawRange { min: number; max: number }

export const STICK_SCALE = 127;
export const TRIGGER_SCALE = 255;
export const STICK_DEADZONE: RawRange = { min: 0, max: 60 };
export const STICK_OUTER: RawRange = { min: 64, max: 127 };
export const TRIGGER_DEADZONE: RawRange = { min: 0, max: 120 };
export const TRIGGER_FULL: RawRange = { min: 128, max: 255 };

const clamp = (v: number, r: RawRange) => Math.min(r.max, Math.max(r.min, v));
const toPct = (raw: number, scale: number) => Math.round((raw * 100) / scale);
const fromPct = (pct: number, scale: number) => Math.round((pct * scale) / 100);

export const stickPct = (raw: number) => toPct(raw, STICK_SCALE);
export const stickRaw = (pct: number, range: RawRange = { min: 0, max: STICK_SCALE }) => clamp(fromPct(pct, STICK_SCALE), range);
export const triggerPct = (raw: number) => toPct(raw, TRIGGER_SCALE);
export const triggerRaw = (pct: number, range: RawRange = { min: 0, max: TRIGGER_SCALE }) => clamp(fromPct(pct, TRIGGER_SCALE), range);

/** Percent limits a slider should offer for a raw range. */
export const pctRange = (r: RawRange, scale: number): RawRange => ({ min: toPct(r.min, scale), max: toPct(r.max, scale) });
export const STICK_DEADZONE_PCT = pctRange(STICK_DEADZONE, STICK_SCALE);
export const STICK_OUTER_PCT = pctRange(STICK_OUTER, STICK_SCALE);
export const TRIGGER_DEADZONE_PCT = pctRange(TRIGGER_DEADZONE, TRIGGER_SCALE);
export const TRIGGER_FULL_PCT = pctRange(TRIGGER_FULL, TRIGGER_SCALE);

/** "8%" */
export const fmtPct = (n: number) => `${n}%`;
/** "100 ms" */
export const fmtMs = (n: number) => `${Math.round(n)} ms`;

/**
 * Outer limit stored as the curve's signed edge byte (block B +11; used with flags.responseCurve): full output is
 * reached at 100 − edge %. Shown on the same percent scale as the block A `end` byte, so the slider is unchanged:
 * edge = 127 − end.
 */
export const outerPctFromEdge = (edge: number) => stickPct(STICK_SCALE - Math.max(0, edge));
export const edgeFromOuterPct = (pct: number) => STICK_SCALE - stickRaw(pct, STICK_OUTER);

/**
 * Vibration motor strength (grip and trigger motors): stored as a percent, 0–100. The official app stops at 1;
 * 0 is allowed here because it silences the motor on the Vader 4 Pro (seen on hardware).
 * Values above 100 are presets on older controllers (241 off, 242 low, 243 high), never written from here; one
 * read from a controller shows as 100% and stays untouched until the slider is moved.
 */
export const MOTOR_MIN = 0;
/** A motor's output level (weakest / strongest): raw 0–255 shown as a percent, as the official app does. */
export const outputPct = (raw: number) => Math.round((Math.min(255, Math.max(0, raw)) / 255) * 100);
export const outputRaw = (pct: number) => Math.round((Math.min(100, Math.max(0, pct)) / 100) * 255);
export const MOTOR_SCALE = 100;
export const motorPct = (raw: number) => Math.min(MOTOR_SCALE, Math.max(0, Math.round(raw)));
export const motorRaw = (pct: number) => Math.min(MOTOR_SCALE, Math.max(MOTOR_MIN, Math.round(pct)));

/** Gyro values are plain numbers on the controller's own scale. */
export const GYRO_SPEED: RawRange = { min: 1, max: 60 };
export const GYRO_DEADZONE: RawRange = { min: 0, max: 40 };

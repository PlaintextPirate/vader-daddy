/**
 * The light bar draft and everything about it that is pure: LedConfig ↔ draft, the unsaved-change list, and the
 * step edits the panel makes. The store (lighting.svelte.ts) only holds state and talks to the device. Tested.
 */
import {
  makeSteady, makeAnimated, gridOf, rgbToHex, hexToRgb, hexToLed, ledToHex, LedMode, LED_COUNT, MAX_KEYFRAMES,
  PRESETS, type LedConfig, type Rgb
} from '../protocol/led.ts';
import { copy, fmt } from '../copy.ts';
import { FACTORY_SPEED, SPEED_MIN, SPEED_MAX, speedBand } from './speed.ts';

/** Classic's limits: an animation has 2–10 steps (makeAnimated clamps to the same). */
export const MIN_STEPS = 2;
export const MAX_STEPS = MAX_KEYFRAMES;

/**
 * Light bar draft in the panel's terms; colours are '#rrggbb' snapped to what the controller holds.
 * Steady colours and the animated grid are kept apart so switching mode never loses either.
 *   grid[led][step]  the animation (5 rows, 2–10 steps)
 *   steady[led]      steady colours; when `perLed` is false only steady[0] counts (edits write all five)
 *   brightness 0–100; speed = stored time per step 1–100, higher is slower.
 */
export interface LightDraft {
  mode: 'steady' | 'animated';
  brightness: number;
  speed: number;
  grid: string[][];
  steady: string[];
  perLed: boolean;
}

export interface LightChange { id: string; label: string; from: string; to: string; revert(draft: LightDraft, original: LightDraft): void }

const snap = (rgb255: Rgb) => ledToHex(hexToLed(rgbToHex(rgb255)));
const rainbow = () => PRESETS.rainbow.build([]).map((steps) => steps.map(snap));
const copyGrid = (g: string[][]) => g.map((r) => [...r]);

export function toDraft(c: LedConfig): LightDraft {
  const shown = gridOf(c).map((steps) => steps.map(rgbToHex));
  const steady = shown.map((steps) => steps[0]);
  const animated = c.mode !== LedMode.Steady;
  let grid = animated ? shown : rainbow();
  if (grid[0].length < MIN_STEPS) grid = grid.map((r) => [...r, ...Array(MIN_STEPS - r.length).fill(r[r.length - 1])]);
  return {
    mode: animated ? 'animated' : 'steady',
    brightness: c.brightness,
    speed: c.loopTime >= SPEED_MIN && c.loopTime <= SPEED_MAX ? c.loopTime : FACTORY_SPEED,
    grid,
    steady,
    perLed: steady.some((h) => h !== steady[0])
  };
}

/** The steady colours that will be written: five, one per LED. */
export const steadyColours = (d: LightDraft): string[] =>
  d.perLed ? d.steady.slice(0, LED_COUNT) : Array(LED_COUNT).fill(d.steady[0]);

/** What the draft shows: grid[led][step] (one step when steady). */
export const shownGrid = (d: LightDraft): string[][] => (d.mode === 'steady' ? steadyColours(d).map((h) => [h]) : d.grid);

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

/**
 * The config to write for a draft. `original` is the draft as read (toDraft(base)): every header field the user
 * did not change keeps the stored value, and only edited fields are clamped. Brightness or speed alone touch
 * only their byte. A mode change writes the verified layout (makeSteady / makeAnimated); a colour edit rebuilds
 * the colours and the loop end but keeps feedback and loop start.
 */
export function fromDraft(base: LedConfig, d: LightDraft, original: LightDraft = toDraft(base)): LedConfig {
  const o = original;
  const modeChanged = o.mode !== d.mode;
  const coloursChanged = !same(shownGrid(o), shownGrid(d));
  const brightness = d.brightness !== o.brightness ? clampInt(d.brightness, 0, 100) : base.brightness;
  const speedEdited = d.mode === 'animated' && d.speed !== o.speed;
  const loopTime = speedEdited ? clampInt(d.speed, SPEED_MIN, SPEED_MAX) : base.loopTime;
  if (!modeChanged && !coloursChanged) return { ...base, brightness, loopTime };
  const out = d.mode === 'steady'
    ? makeSteady(base, steadyColours(d).map(hexToRgb), brightness)
    : makeAnimated(base, d.grid.map((steps) => steps.map(hexToRgb)), modeChanged ? clampInt(d.speed, SPEED_MIN, SPEED_MAX) : loopTime, brightness);
  if (!modeChanged) {
    out.feedback = base.feedback;
    if (base.loopStart <= out.loopEnd) out.loopStart = base.loopStart;
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const modeWord = (m: LightDraft['mode']) => (m === 'steady' ? copy.light.steady : copy.light.animated);
const bandWord = (s: number) => copy.light.speeds[speedBand(s)];

function speedText(from: number, to: number): [string, string] {
  const a = bandWord(from), b = bandWord(to);
  if (a !== b) return [a, b];
  return [a, fmt(to < from ? copy.light.speedFaster : copy.light.speedSlower, { band: b })];
}

/**
 * Changes at the grain the user thinks in. A mode change stands for everything that differs because of it
 * (its undo restores the mode; the other mode's work is still in the draft). Colours and speed are compared
 * only within the same mode.
 */
export function describeLightChanges(o: LightDraft, d: LightDraft): LightChange[] {
  const out: LightChange[] = [];
  if (o.mode !== d.mode) {
    out.push({ id: 'mode', label: copy.light.changes.mode, from: modeWord(o.mode), to: modeWord(d.mode), revert: (x, y) => { x.mode = y.mode; } });
  } else {
    if (!same(shownGrid(o), shownGrid(d))) {
      const n = o.grid[0].length, m = d.grid[0].length;
      const counts = d.mode === 'animated' && n !== m;
      out.push({
        id: 'colours', label: copy.light.changes.colours,
        from: counts ? fmt(copy.light.steps, { n }) : '', to: counts ? fmt(copy.light.steps, { n: m }) : '',
        revert: (x, y) => { x.grid = copyGrid(y.grid); x.steady = [...y.steady]; x.perLed = y.perLed; }
      });
    }
    if (d.mode === 'animated' && o.speed !== d.speed) {
      const [from, to] = speedText(o.speed, d.speed);
      out.push({ id: 'speed', label: copy.light.changes.speed, from, to, revert: (x, y) => { x.speed = y.speed; } });
    }
  }
  if (o.brightness !== d.brightness)
    out.push({ id: 'brightness', label: copy.light.changes.brightness, from: `${o.brightness}%`, to: `${d.brightness}%`, revert: (x, y) => { x.brightness = y.brightness; } });
  return out;
}

// ---- Edits the panel makes. Each mutates the draft in place and returns the step to select afterwards.

export const stepCount = (d: LightDraft) => d.grid[0].length;

/** Sets one steady colour; with one colour for all LEDs, sets all five. */
export function setSteady(d: LightDraft, led: number, hex: string) {
  if (d.perLed) d.steady[led] = hex;
  else for (let l = 0; l < LED_COUNT; l++) d.steady[l] = hex;
}

/** "Copy to all LEDs": the colour on every LED of one step, or on all five steady LEDs (step null). */
export function copyToAll(d: LightDraft, step: number | null, hex: string) {
  for (let l = 0; l < LED_COUNT; l++) {
    if (step === null) d.steady[l] = hex;
    else d.grid[l][step] = hex;
  }
}

/** Duplicates step `at` right after itself. */
export function addStep(d: LightDraft, at: number): number {
  if (stepCount(d) >= MAX_STEPS) return at;
  for (const row of d.grid) row.splice(at + 1, 0, row[at]);
  return at + 1;
}

export function deleteStep(d: LightDraft, at: number): number {
  if (stepCount(d) <= MIN_STEPS) return at;
  for (const row of d.grid) row.splice(at, 1);
  return Math.min(at, stepCount(d) - 1);
}

/** Swaps step `at` with its neighbour (dir −1 earlier, +1 later). */
export function moveStep(d: LightDraft, at: number, dir: -1 | 1): number {
  const to = at + dir;
  if (to < 0 || to >= stepCount(d)) return at;
  for (const row of d.grid) [row[at], row[to]] = [row[to], row[at]];
  return to;
}

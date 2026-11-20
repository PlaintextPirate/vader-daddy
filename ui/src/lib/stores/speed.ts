/**
 * The controller stores animation speed as "time per step", 1–100, higher is slower (factory rainbow: 16).
 * The panel shows it reversed so right is faster, with three named bands for the label. The track is perceptual:
 * Slow, Medium and Fast each take a third of it, and within a band the position follows the logarithm of the
 * time per step, so the factory value sits near the middle (under "Medium") instead of far to the right.
 * Every stored value keeps its own position (round-trips exactly). Pure; tested.
 */
export const SPEED_MIN = 1;
export const SPEED_MAX = 100;
export const FACTORY_SPEED = 16;

/** Upper bounds (inclusive) of the fast and medium bands, in stored units. */
export const FAST_MAX = 10;
export const MEDIUM_MAX = 30;

/** Slider positions: 0 (slowest) … SLIDER_MAX (fastest); each band takes BAND positions. */
const BAND = 200;
export const SLIDER_MIN = 0;
export const SLIDER_MAX = 3 * BAND;

export type SpeedBand = 'fast' | 'medium' | 'slow';

const clamp = (v: number) => Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(v)));

/** Bands from the slow end of the track: stored time-per-step range [hi … lo] (continuous edges between bands). */
const SEGMENTS = [
  { hi: SPEED_MAX, lo: MEDIUM_MAX + 0.5 },
  { hi: MEDIUM_MAX + 0.5, lo: FAST_MAX + 0.5 },
  { hi: FAST_MAX + 0.5, lo: SPEED_MIN }
];

/** Stored time per step → slider position (0 = slowest, SLIDER_MAX = fastest). */
export function speedToSlider(stored: number): number {
  const s = clamp(stored);
  const i = s > MEDIUM_MAX ? 0 : s > FAST_MAX ? 1 : 2;
  const { hi, lo } = SEGMENTS[i];
  const f = (Math.log(hi) - Math.log(s)) / (Math.log(hi) - Math.log(lo));
  return Math.round(i * BAND + Math.min(1, Math.max(0, f)) * BAND);
}

/** Slider position → stored time per step. */
export function sliderToSpeed(pos: number): number {
  const p = Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, pos));
  const i = Math.min(2, Math.floor(p / BAND));
  const { hi, lo } = SEGMENTS[i];
  const f = (p - i * BAND) / BAND;
  return clamp(Math.exp(Math.log(hi) - f * (Math.log(hi) - Math.log(lo))));
}

export function speedBand(stored: number): SpeedBand {
  const s = clamp(stored);
  return s <= FAST_MAX ? 'fast' : s <= MEDIUM_MAX ? 'medium' : 'slow';
}

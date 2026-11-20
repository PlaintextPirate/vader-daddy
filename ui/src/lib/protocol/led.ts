/**
 * Lighting slot format (data version 2), Space Station's NewLedConfigBean.
 *
 *   [0..1]  version (00 02)
 *   [2]     type / click feedback
 *   [3]     loop start keyframe
 *   [4]     loop end keyframe (last keyframe index; 0 for steady)
 *   [5]     loop time (time per keyframe; factory rainbow uses 16)
 *   [6]     brightness 0–100
 *   [7]     number of LEDs (5 on the Vader 4 Pro)
 *   [8]     mode (1 = animated, 5 = steady)
 *   [9..19] reserved (0xFF)
 *   [20..]  15 blocks of 30 bytes. **Each block is one LED**: up to 10 keyframes × RGB, channels 0–100.
 *
 * So the factory rainbow is 5 LEDs × 6 keyframes (each LED walks the hue wheel, offset from its neighbour),
 * and steady is 5 LEDs × 1 keyframe. Unused cells hold 00 74 FF in the factory data.
 *
 * The controller sends 50 parcels (500 bytes) when read; Space Station writes 49 (490 bytes).
 */
export const LED_WRITE_BYTES = 490;
export const BLOCK_OFFSET = 20;
export const BLOCK_BYTES = 30;
export const MAX_BLOCKS = Math.floor((LED_WRITE_BYTES - BLOCK_OFFSET) / BLOCK_BYTES); // 15 LED blocks
export const MAX_KEYFRAMES = 10;
export const LED_COUNT = 5;
const FILLER: Rgb = [0, 116, 255]; // what the factory data has in unused cells

export type Rgb = [number, number, number];

export const LedMode = { Animated: 1, Steady: 5 } as const;

export interface LedConfig {
  raw: Uint8Array; // always kept, so unknown bytes survive edits
  version: number;
  feedback: number;
  loopStart: number;
  loopEnd: number;
  loopTime: number;
  brightness: number;
  ledCount: number;
  mode: number;
  leds: Rgb[][]; // leds[led][keyframe], 0–100 per channel
}

export function decodeLed(bytes: Uint8Array): LedConfig {
  const b = bytes;
  const leds: Rgb[][] = [];
  for (let l = 0; l < MAX_BLOCKS; l++) {
    const o = BLOCK_OFFSET + l * BLOCK_BYTES;
    const keys: Rgb[] = [];
    for (let k = 0; k < MAX_KEYFRAMES; k++) keys.push([b[o + k * 3], b[o + k * 3 + 1], b[o + k * 3 + 2]]);
    leds.push(keys);
  }
  return {
    raw: Uint8Array.from(b),
    version: (b[0] << 8) | b[1],
    feedback: b[2],
    loopStart: b[3],
    loopEnd: b[4],
    loopTime: b[5],
    brightness: b[6],
    ledCount: b[7] || LED_COUNT,
    mode: b[8],
    leds
  };
}

/** Header fields and their byte. */
const HEADER = [['feedback', 2], ['loopStart', 3], ['loopEnd', 4], ['loopTime', 5], ['brightness', 6], ['ledCount', 7], ['mode', 8]] as const;

/**
 * Bytes to write (490). A header byte is written only when its field differs from what `raw` decodes to, so a
 * field nobody changed keeps its stored byte exactly (e.g. an LED count of 0, which reads as 5).
 */
export function encodeLed(c: LedConfig): Uint8Array {
  const out = new Uint8Array(LED_WRITE_BYTES);
  out.set(c.raw.slice(0, LED_WRITE_BYTES));
  const was = decodeLed(c.raw);
  for (const [k, i] of HEADER) if (c[k] !== was[k]) out[i] = c[k] & 0xff;
  for (let l = 0; l < MAX_BLOCKS; l++) {
    const o = BLOCK_OFFSET + l * BLOCK_BYTES;
    for (let k = 0; k < MAX_KEYFRAMES; k++) out.set(c.leds[l][k], o + k * 3);
  }
  return out;
}

/** 0–255 sRGB (colour picker) → 0–100 per channel (what the controller stores). */
export const to100 = (rgb: Rgb): Rgb => rgb.map((v) => Math.round((v * 100) / 255)) as Rgb;
export const to255 = (rgb: Rgb): Rgb => rgb.map((v) => Math.round((Math.min(v, 100) * 255) / 100)) as Rgb;

export const hexToRgb = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
export const rgbToHex = (rgb: Rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

/** '#rrggbb' → what the controller stores (0–100 per channel). */
export const hexToLed = (hex: string): Rgb => to100(hexToRgb(hex));
/** Controller colour (0–100 per channel) → '#rrggbb'. ledToHex(hexToLed(h)) is h snapped to what the controller can hold. */
export const ledToHex = (rgb: Rgb): string => rgbToHex(to255(rgb));

const blank = (fill: Rgb): Rgb[][] => Array.from({ length: MAX_BLOCKS }, () => Array.from({ length: MAX_KEYFRAMES }, () => [...fill] as Rgb));

/**
 * Steady colours — the layout verified to persist on a Vader 4 Pro: mode 5, 5 LEDs, everything cleared,
 * each LED's colour in its first keyframe. Pass one colour for all LEDs or one per LED.
 */
export function makeSteady(base: LedConfig, colour255: Rgb | Rgb[], brightness: number): LedConfig {
  const per = (Array.isArray(colour255[0]) ? colour255 : Array(LED_COUNT).fill(colour255)) as Rgb[];
  const leds = blank([0, 0, 0]);
  for (let l = 0; l < LED_COUNT; l++) leds[l][0] = to100(per[l] ?? per[0]);
  return { ...base, feedback: 0, loopStart: 0, loopEnd: 0, brightness, ledCount: LED_COUNT, mode: LedMode.Steady, leds };
}

/** Animation: grid[led][keyframe] in 0–255, 2–10 keyframes, same count for every LED. */
export function makeAnimated(base: LedConfig, grid: Rgb[][], loopTime: number, brightness: number): LedConfig {
  const n = Math.max(2, Math.min(MAX_KEYFRAMES, grid[0]?.length ?? 2));
  const leds = blank(FILLER);
  for (let l = 0; l < LED_COUNT; l++) for (let k = 0; k < n; k++) leds[l][k] = to100(grid[l]?.[k] ?? [0, 0, 0]);
  return { ...base, feedback: 0, loopStart: 0, loopEnd: n - 1, loopTime, brightness, ledCount: LED_COUNT, mode: LedMode.Animated, leds };
}

/** Colours a config shows, as a 0–255 grid[led][keyframe] (one keyframe when steady). */
export function gridOf(c: LedConfig): Rgb[][] {
  const n = c.mode === LedMode.Steady ? 1 : Math.min(MAX_KEYFRAMES, Math.max(c.loopEnd, 0) + 1);
  return c.leds.slice(0, LED_COUNT).map((keys) => keys.slice(0, n).map(to255));
}

/** The colour of the first LED of a steady config (for the UI), in 0–255. */
export const steadyColour = (c: LedConfig): Rgb => to255(c.leds[0][0]);

export function hsv(h: number, s = 1, v = 1): Rgb {
  const f = (n: number) => { const k = (n + (((h % 360) + 360) % 360) / 60) % 6; return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))); };
  return [f(5), f(3), f(1)];
}

/** Starting points for the animation grid. Each returns grid[led][keyframe] in 0–255. */
export const PRESETS: Record<string, { name: string; colours: number; build: (c: Rgb[]) => Rgb[][] }> = {
  rainbow: { name: 'Rainbow wave', colours: 0, build: () => Array.from({ length: LED_COUNT }, (_, l) => Array.from({ length: 6 }, (_, k) => hsv(k * 60 + l * 36))) },
  cycle: { name: 'Colour cycle', colours: 3, build: (c) => Array.from({ length: LED_COUNT }, () => c.map((x) => [...x] as Rgb)) },
  breathe: { name: 'Breathing', colours: 1, build: (c) => Array.from({ length: LED_COUNT }, () => [[...c[0]] as Rgb, [0, 0, 0] as Rgb]) },
  chase: { name: 'Chase', colours: 2, build: (c) => Array.from({ length: LED_COUNT }, (_, l) => Array.from({ length: LED_COUNT }, (_, k) => [...(k === l ? c[0] : c[1])] as Rgb)) },
  wave: { name: 'Two-colour wave', colours: 2, build: (c) => Array.from({ length: LED_COUNT }, (_, l) => Array.from({ length: 4 }, (_, k) => [...((k + l) % 4 < 2 ? c[0] : c[1])] as Rgb)) }
};

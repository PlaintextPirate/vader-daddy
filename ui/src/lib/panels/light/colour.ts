/**
 * Colour helpers for the light panel. The controller stores 0–100 per channel, so every colour the panel keeps
 * is snapped to a value that survives hex → controller → hex unchanged (see `snapHex`). Pure; tested.
 */
import { hexToLed, ledToHex, type Rgb } from '../../protocol/led.ts';

export type PresetId = 'white' | 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'magenta';

/** Presets are defined in controller units, so each one round-trips exactly. */
const PRESET_LED: [PresetId, Rgb][] = [
  ['white', [100, 100, 100]],
  ['red', [100, 0, 0]],
  ['orange', [100, 50, 0]],
  ['yellow', [100, 100, 0]],
  ['green', [0, 100, 0]],
  ['cyan', [0, 100, 100]],
  ['blue', [0, 0, 100]],
  ['magenta', [100, 0, 100]]
];

export const PRESETS: { id: PresetId; hex: string }[] = PRESET_LED.map(([id, rgb]) => ({ id, hex: ledToHex(rgb) }));

/** Accepts "#RRGGBB" or "RRGGBB" (any case, surrounding spaces ignored); returns lower-case '#rrggbb' or null. */
export function parseHex(input: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(input.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

/** The nearest colour the controller can hold, as '#rrggbb'. Idempotent. */
export const snapHex = (hex: string): string => ledToHex(hexToLed(hex));

/** How a colour is shown and read out: "#CCFF00". */
export const showHex = (hex: string): string => hex.toUpperCase();

/** The preset a colour is (any case), or null: swatches announce "Red" instead of "#FF0000" when one matches. */
export function presetOf(hex: string): PresetId | null {
  const h = hex.toLowerCase();
  return PRESETS.find((p) => p.hex.toLowerCase() === h)?.id ?? null;
}

/**
 * The controller's clickable parts: names, labels, profile key ids, which inspector each opens and the names each
 * has in the live input stream. Pure data, shared by the drawing, the inspectors and press-to-select.
 */

export type PartId =
  | 'lt' | 'rt' | 'lb' | 'rb' | 'ls' | 'rs' | 'dpad'
  | 'a' | 'b' | 'x' | 'y' | 'c' | 'z'
  | 'select' | 'start' | 'home' | 'capture'
  | 'm1' | 'm2' | 'm3' | 'm4' | 'light';

export type Inspector = 'button' | 'stick' | 'trigger' | 'light' | 'none';

export interface Part {
  id: PartId;
  /** Display name, as in an inspector title. */
  name: string;
  /** Short label drawn on the part ('' when the part shows an icon or nothing). */
  label: string;
  /** Profile key ids (`KEY_NAMES` in protocol/config.ts). Sticks list their click (L3/R3); the D-pad lists up, right, down, left. */
  keys: number[];
  inspector: Inspector;
  /** Names in the live input stream (XInput; C and Z only arrive in DInput mode; M2–M4 come from the report's raw bytes). Triggers are analog (`lt`/`rt`). */
  stream: string[];
}

const P = (id: PartId, name: string, label: string, keys: number[], inspector: Inspector, stream: string[]): Part =>
  ({ id, name, label, keys, inspector, stream });

export const PARTS: Record<PartId, Part> = {
  lt: P('lt', 'Left trigger', 'LT', [12], 'trigger', []),
  rt: P('rt', 'Right trigger', 'RT', [13], 'trigger', []),
  lb: P('lb', 'Left bumper', 'LB', [10], 'button', ['LB']),
  rb: P('rb', 'Right bumper', 'RB', [11], 'button', ['RB']),
  ls: P('ls', 'Left stick', 'L3', [14], 'stick', ['L3']),
  rs: P('rs', 'Right stick', 'R3', [15], 'stick', ['R3']),
  dpad: P('dpad', 'D-pad', '', [0, 1, 2, 3], 'button', ['Up', 'Right', 'Down', 'Left']),
  a: P('a', 'A', 'A', [4], 'button', ['A']),
  b: P('b', 'B', 'B', [5], 'button', ['B']),
  x: P('x', 'X', 'X', [7], 'button', ['X']),
  y: P('y', 'Y', 'Y', [8], 'button', ['Y']),
  c: P('c', 'C', 'C', [16], 'button', ['C']),
  z: P('z', 'Z', 'Z', [17], 'button', ['Z']),
  select: P('select', 'Select', 'Select', [6], 'button', ['Select']),
  start: P('start', 'Start', 'Start', [9], 'button', ['Start']),
  home: P('home', 'Home', '', [], 'none', ['Home']),
  capture: P('capture', 'Capture', '', [], 'none', []),
  m1: P('m1', 'M1', 'M1', [19], 'button', []),
  m2: P('m2', 'M2', 'M2', [18], 'button', ['M2']),
  m3: P('m3', 'M3', 'M3', [21], 'button', ['M3']),
  m4: P('m4', 'M4', 'M4', [20], 'button', ['M4']),
  light: P('light', 'Light bar', '', [], 'light', [])
};

/** Reading order (left to right, top to bottom); also the drawing's keyboard tab order. */
export const PART_ORDER: PartId[] = [
  'lt', 'rt', 'lb', 'rb', 'light', 'ls', 'select', 'start', 'y', 'x', 'b', 'a', 'z',
  'dpad', 'rs', 'c', 'capture', 'home', 'm1', 'm3', 'm4', 'm2'
];

export const PART_IDS = Object.keys(PARTS) as PartId[];

export function isPartId(v: unknown): v is PartId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PARTS, v);
}

const byStream = new Map<string, PartId>();
const byKey = new Map<number, PartId>();
for (const p of Object.values(PARTS)) {
  for (const s of p.stream) byStream.set(s, p.id);
  for (const k of p.keys) byKey.set(k, p.id);
}

/** The part a live-stream button name belongs to ('Up' → 'dpad'), or null. */
export function partForStream(name: string): PartId | null {
  return byStream.get(name) ?? null;
}

/** The part a profile key id belongs to (19 → 'm1', 2 → 'dpad'), or null. */
export function partForKey(key: number): PartId | null {
  return byKey.get(key) ?? null;
}

/** The single profile key of a part, or null for the D-pad (four keys) and parts without one. */
export function keyOf(id: PartId): number | null {
  const k = PARTS[id].keys;
  return k.length === 1 ? k[0] : null;
}

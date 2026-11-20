/**
 * Button panel logic: which chips show as selected, what a chip click or a mode change turns the binding into,
 * and applying a binding to the draft without ever leaving it in a state that cannot be saved. Pure; tested.
 */
import { MACRO_UNITS, macroUnits, type ProfileConfig } from '../../protocol/config.ts';
import { setBinding, type Behaviour, type Binding } from '../../protocol/bindings.ts';

/** The 16 target buttons in the panel's order: A B X Y / LB RB LT RT / L3 R3 Select Start / up down left right. */
export const TARGETS = [4, 5, 7, 8, 10, 11, 12, 13, 14, 15, 6, 9, 0, 2, 3, 1];
export const ARROWS: Record<number, 'up' | 'down' | 'left' | 'right'> = { 0: 'up', 2: 'down', 3: 'left', 1: 'right' };

export const TURBO_ONE = { min: 1, max: 50, step: 1, def: 5 } as const;
export const TURBO_MANY = { min: 40, max: 2500, step: 10, def: 100 } as const;

export const NOT_SET: Binding = { kind: 'default', buttons: [], behaviour: 'hold', turbo: 5 };

const order = (a: number, b: number) => TARGETS.indexOf(a) - TARGETS.indexOf(b);

/** Chips shown as selected. A button left alone presses itself, so its own chip is lit. */
export function shownButtons(b: Binding, key: number): number[] {
  if (b.kind === 'buttons') return b.buttons;
  if (b.kind === 'default' && TARGETS.includes(key)) return [key];
  return [];
}

/** Turbo value for `n` buttons, kept from `prev` when the unit (speed vs ms) stays the same. */
export function turboFor(n: number, prevN: number, prev: number): number {
  const r = n === 1 ? TURBO_ONE : TURBO_MANY;
  if (prevN > 0 && (prevN === 1) === (n === 1)) return Math.min(r.max, Math.max(r.min, prev));
  return r.def;
}

/** Buttons whose turbo value `b.turbo` holds (0 when it is not on turbo, so the value means nothing). */
const turboCount = (b: Binding) => (b.kind === 'buttons' && b.behaviour === 'turbo' ? b.buttons.length : 0);

/**
 * The binding after clicking chip `t`. On a button left alone the click replaces it (a remap); otherwise it adds
 * or removes the chip (several = pressed together). Removing the last chip leaves the button not set.
 */
export function toggleTarget(b: Binding, key: number, t: number): Binding {
  const cur = b.kind === 'buttons' ? b.buttons : [];
  const next = b.kind === 'default' ? [t] : cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t].sort(order);
  if (!next.length) return { ...NOT_SET };
  const behaviour: Behaviour = b.kind === 'buttons' ? b.behaviour : 'hold';
  return { kind: 'buttons', buttons: next, behaviour, turbo: turboFor(next.length, turboCount(b), b.turbo) };
}

/** The binding with another behaviour, or null when no button is chosen (nothing to apply it to). */
export function withBehaviour(b: Binding, key: number, behaviour: Behaviour): Binding | null {
  const buttons = shownButtons(b, key);
  if (!buttons.length) return null;
  return { kind: 'buttons', buttons: [...buttons], behaviour, turbo: turboFor(buttons.length, turboCount(b), b.turbo) };
}

export type ApplyResult = 'ok' | 'tooMany' | 'tooLong';

/**
 * Applies `b` to `key` in the draft. When it would need a sixth macro, or makes the macros longer than the
 * controller holds, the draft is left exactly as it was and the reason is returned.
 */
export function tryBinding(c: ProfileConfig, key: number, b: Binding): ApplyResult {
  const macros = c.macros;
  const entry = { ...c.buttons[key] };
  const before = macroUnits(macros);
  try {
    setBinding(c, key, b);
  } catch {
    return 'tooMany';
  }
  const after = macroUnits(c.macros);
  if (after > MACRO_UNITS && after > before) {
    c.macros = macros;
    Object.assign(c.buttons[key], entry);
    return 'tooLong';
  }
  return 'ok';
}

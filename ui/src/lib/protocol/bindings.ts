import { MAX_MACROS, NO_REMAP, effectiveTarget, type Macro, type MacroAction, type ProfileConfig } from './config.ts';

/**
 * What a button does, in the terms the editor shows. Underneath it is one of:
 *   - a plain remap in the button table (one button, hold), optionally with the controller's own turbo
 *     (turboType 1; measured: value 5 pulses about five times a second);
 *   - a press-only macro: several buttons held (type 2) or latched (type 3);
 *   - a repeating macro for turbo on several buttons;
 *   - a script: a macro with timed steps.
 * The controller holds at most five macros, so only the first kind is free.
 */
export type Behaviour = 'hold' | 'toggle' | 'turbo';
export interface Script { id: string; name: string; mode: 'once' | 'repeat' | 'toggle'; cycleMs: number; actions: MacroAction[] }
export interface Binding {
  kind: 'default' | 'buttons' | 'script';
  buttons: number[];
  behaviour: Behaviour;
  /** One button: the controller's turbo value. Several buttons: milliseconds between presses. */
  turbo: number;
  script?: Script; // for kind 'script': the script as stored on the controller
}

const TURBO_PRESS_MS = 30;
const MODE_TYPE = { once: 1, repeat: 2, toggle: 3 } as const;
const sameActions = (a: MacroAction[], b: MacroAction[]) =>
  a.length === b.length && a.every((x, i) => x.button === b[i].button && x.startMs === b[i].startMs && x.holdMs === b[i].holdMs);

export const macroOfScript = (trigger: number, s: Script): Macro =>
  ({ trigger, type: MODE_TYPE[s.mode], cycleMs: s.cycleMs, actions: s.actions.map((a) => ({ ...a })) });

/** Does the macro on the controller have exactly this script's content? */
export const matches = (m: Macro, s: Script) => !m.hold && m.type === MODE_TYPE[s.mode] && (m.type === 1 || m.cycleMs === s.cycleMs) && sameActions(m.actions, s.actions);

/** A repeating macro the editor shows as turbo on several buttons (not a script). */
export const isTurboMacro = (m: Macro) => !m.hold && m.type === 2 && m.actions.every((a) => a.startMs === 0 && a.holdMs === TURBO_PRESS_MS);

export function bindingOf(c: ProfileConfig, key: number): Binding {
  const m = c.macros.find((x) => x.trigger === key);
  if (m) {
    const buttons = m.actions.map((a) => a.button);
    if (m.hold) return { kind: 'buttons', buttons, behaviour: m.type === 3 ? 'toggle' : 'hold', turbo: 5 };
    if (isTurboMacro(m)) return { kind: 'buttons', buttons, behaviour: 'turbo', turbo: m.cycleMs + TURBO_PRESS_MS };
    const mode = m.type === 3 ? 'toggle' : m.type === 2 ? 'repeat' : 'once';
    return { kind: 'script', buttons: [], behaviour: 'hold', turbo: 5, script: { id: '', name: 'Script on the controller', mode, cycleMs: m.cycleMs, actions: m.actions.map((a) => ({ ...a })) } };
  }
  const e = c.buttons[key];
  const target = effectiveTarget(e);
  if (target === key && e.turboType !== 1) return { kind: 'default', buttons: [key], behaviour: 'hold', turbo: 5 };
  return { kind: 'buttons', buttons: [target], behaviour: e.turboType === 1 ? 'turbo' : 'hold', turbo: e.turbo || 5 };
}

/** Applies a binding to the draft profile. Throws when it would need a sixth macro. */
export function setBinding(c: ProfileConfig, key: number, b: Binding) {
  const others = c.macros.filter((m) => m.trigger !== key);
  const e = c.buttons[key];
  let macro: Macro | null = null;
  let entry = { target: NO_REMAP, turboType: 0, turbo: 0 };
  if (b.kind === 'script' && b.script) macro = macroOfScript(key, b.script);
  else if (b.kind === 'buttons' && b.buttons.length) {
    const one = b.buttons.length === 1;
    const press = (holdMs: number) => b.buttons.map((button) => ({ button, startMs: 0, holdMs }));
    if (one && b.behaviour !== 'toggle') {
      entry = { target: b.buttons[0] === key ? NO_REMAP : b.buttons[0], turboType: b.behaviour === 'turbo' ? 1 : 0, turbo: b.behaviour === 'turbo' ? Math.max(1, Math.min(255, b.turbo)) : 0 };
    } else if (b.behaviour === 'turbo') {
      macro = { trigger: key, type: 2, cycleMs: Math.max(0, b.turbo - TURBO_PRESS_MS), actions: press(TURBO_PRESS_MS) };
    } else {
      macro = { trigger: key, type: b.behaviour === 'toggle' ? 3 : 2, hold: true, cycleMs: 30, actions: press(100) };
    }
  }
  if (macro && others.length >= MAX_MACROS) throw new Error(`The controller holds ${MAX_MACROS} macros at most. Free one up first: combos, toggles and scripts each use one.`);
  c.macros = macro ? [...others, macro] : others;
  e.target = entry.target; e.turboType = entry.turboType; e.turbo = entry.turbo;
}

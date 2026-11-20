import { DEMO } from '$lib/device/transport';

/**
 * Feature flags for things not yet verified on hardware. Read once at load from, in order:
 * defaults → `localStorage['vaderdaddy.flags']` (JSON object, e.g. {"profileNames": true}) → `?flags=a,b`
 * (switches those on; `-a` switches one off).
 */
export interface Flags {
  /** Stick response-curve tab: only once the curve bytes are decoded and verified. */
  responseCurve: boolean;
  /** Profile names (bytes 770..785). Written and read back on a Vader 4 Pro (fw 6.9.3.3, dongle XInput) on 2026-11-19. */
  profileNames: boolean;
  /** Pressing a button on the controller selects that part when nothing is open. */
  pressToSelect: boolean;
  /**
   * Clicking a profile re-reads it from the controller even when the app already holds it, which makes the
   * controller switch to that profile (lights and mappings; seen in XInput and DInput, 2026-11-19).
   */
  clickSwitches: boolean;
  /**
   * Settings > Paddle keys (a paddle presses a keyboard key on this Mac). Off: it needs the macOS Accessibility
   * permission. Never tried with a real key.
   */
  paddleKeys: boolean;
  /** Lighting edits go to the controller as you make them (not saved until Save). */
  liveLighting: boolean;
}

export const FLAGS_KEY = 'vaderdaddy.flags';

export function readFlags(demo: boolean, stored: string | null, query: string | null): Flags {
  const f: Flags = { responseCurve: demo, profileNames: true, pressToSelect: true, clickSwitches: true, paddleKeys: false, liveLighting: true };
  try {
    const s = stored ? JSON.parse(stored) : null;
    if (s && typeof s === 'object') for (const k of Object.keys(f) as (keyof Flags)[]) if (typeof s[k] === 'boolean') f[k] = s[k];
  } catch { /* bad JSON: defaults */ }
  for (const raw of (query ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const on = !raw.startsWith('-'), k = (on ? raw : raw.slice(1)) as keyof Flags;
    if (k in f) f[k] = on;
  }
  return f;
}

function load(): Flags {
  if (typeof location === 'undefined') return readFlags(false, null, null);
  let stored: string | null = null;
  try { stored = localStorage.getItem(FLAGS_KEY); } catch { /* storage blocked */ }
  return readFlags(DEMO, stored, new URLSearchParams(location.search).get('flags'));
}

export const flags: Flags = load();

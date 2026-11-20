/**
 * Which library script each button runs: an explicit link table per slot (key id → script id), set when a script
 * is assigned through the editor and dropped when the binding changes. Content matching is only used to
 * recognise scripts already on the controller (first library match wins, only for keys not already linked), so
 * two identical scripts, or a button that happens to hold a script's content, are never confused. A link counts
 * only while the key's macro still holds that script's content; stale entries are ignored. Pure; tested.
 */
import { matches, isTurboMacro, type Script } from '../protocol/bindings.ts';
import type { Macro } from '../protocol/config.ts';

export type SlotLinks = Record<number, string>;
export type Links = Record<number, SlotLinks>;

/** A macro the editor shows as a script (not a held combo, toggle or turbo). */
const isScript = (m: Macro) => !m.hold && !isTurboMacro(m);

/** The library script a key runs, by link only. */
export function linkedScript(links: SlotLinks | undefined, macros: Macro[], list: Script[], key: number): Script | undefined {
  const id = links?.[key];
  if (id === undefined) return undefined;
  const m = macros.find((x) => x.trigger === key);
  const s = list.find((x) => x.id === id);
  return m && s && isScript(m) && matches(m, s) ? s : undefined;
}

/** Keys whose valid link points at script `id`. */
export const keysLinked = (links: SlotLinks | undefined, macros: Macro[], list: Script[], id: string): number[] =>
  macros.filter((m) => linkedScript(links, macros, list, m.trigger)?.id === id).map((m) => m.trigger);

/**
 * The slot's links after reading it: valid links stay; every other script on a key gets the first library script
 * with the same content; keys without a script lose their entry.
 */
export function recognise(links: SlotLinks | undefined, macros: Macro[], list: Script[]): SlotLinks {
  const out: SlotLinks = {};
  for (const m of macros) {
    if (!isScript(m)) continue;
    const kept = linkedScript(links, macros, list, m.trigger);
    const s = kept ?? list.find((x) => matches(m, x));
    if (s) out[m.trigger] = s.id;
  }
  return out;
}

/** Sets (id) or drops (null) one key's link. */
export function setLink(links: SlotLinks | undefined, key: number, id: string | null): SlotLinks {
  const out = { ...(links ?? {}) };
  if (id === null) delete out[key];
  else out[key] = id;
  return out;
}

/** Reads the stored table, tolerating anything malformed (it is then simply rebuilt by recognition). */
export function parseLinks(json: string | null): Links {
  const out: Links = {};
  try {
    const v = json ? JSON.parse(json) : null;
    if (!v || typeof v !== 'object') return out;
    for (const [slot, m] of Object.entries(v as Record<string, unknown>)) {
      if (!/^[0-3]$/.test(slot) || !m || typeof m !== 'object') continue;
      const keys: SlotLinks = {};
      for (const [k, id] of Object.entries(m as Record<string, unknown>)) if (/^\d+$/.test(k) && typeof id === 'string') keys[+k] = id;
      out[+slot] = keys;
    }
  } catch { /* bad JSON: empty */ }
  return out;
}

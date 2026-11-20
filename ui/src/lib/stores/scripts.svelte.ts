import { KEY_NAMES, MACRO_UNITS, macroUnits, type Macro } from '$lib/protocol/config';
import { setBinding, bindingOf, type Script, type Binding } from '$lib/protocol/bindings';
import { toAppError } from '$lib/device/errors';
import { fmt, copy } from '$lib/copy';
import { storage } from './storage';
import { toasts } from './toasts.svelte';
import { profile } from './profile.svelte';
import { session } from './session.svelte';
import { linkedScript, keysLinked, recognise, setLink, parseLinks, type Links } from './scriptLinks';

/** Same key as the classic UI's script library. */
const SCRIPTS_KEY = 'vaderdaddy.scripts.v1';
const LINKS_KEY = 'vaderdaddy.scriptLinks.v1';
const DEFAULT: Binding = { kind: 'default', buttons: [], behaviour: 'hold', turbo: 5 };

/**
 * The script library: named timed sequences kept in the app, and which button runs which script (an explicit
 * link table per slot, see scriptLinks.ts). Editing a script re-applies it to the buttons linked to it in the
 * current draft; deleting it clears only those.
 */
class Scripts {
  list = $state<Script[]>(storage.json<Script[]>(SCRIPTS_KEY, []));
  links = $state<Links>(parseLinks(storage.get(LINKS_KEY)));

  private persist() { storage.set(SCRIPTS_KEY, JSON.stringify($state.snapshot(this.list))); }
  private persistLinks() { storage.set(LINKS_KEY, JSON.stringify($state.snapshot(this.links))); }

  get = (id: string) => this.list.find((s) => s.id === id);

  /** Adds a new script with one press of A. `from` copies another script's content (e.g. one found on a button). */
  create = (from?: Partial<Script>): Script => {
    const s: Script = {
      id: crypto.randomUUID(), name: fmt(copy.script.name, { n: this.list.length + 1 }), mode: 'once', cycleMs: 30,
      actions: [{ button: 4, startMs: 0, holdMs: 100 }], ...structuredClone(from ?? {})
    };
    s.id = crypto.randomUUID();
    this.list.push(s);
    this.persist();
    return this.list[this.list.length - 1];
  };

  /** Removes a library entry that no button uses yet (a "New script" the controller could not take). */
  discard = (id: string) => {
    const i = this.list.findIndex((s) => s.id === id);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.persist();
  };

  /** Records that `key` on the current slot now runs script `id` (null: no script). */
  link = (key: number, id: string | null) => {
    this.links[session.slot] = setLink($state.snapshot(this.links[session.slot]), key, id);
    this.persistLinks();
  };

  /** Re-checks a slot's links against what its draft holds, recognising scripts read from the controller. */
  recognise = (slot: number, macros: Macro[]) => {
    this.links[slot] = recognise($state.snapshot(this.links[slot]), macros, $state.snapshot(this.list) as Script[]);
    this.persistLinks();
  };

  /** The library script a key of the current draft runs (by link), if any. */
  linkedTo = (key: number): Script | undefined => {
    const d = profile.draft;
    return d ? linkedScript(this.links[session.slot], d.macros, this.list, key) : undefined;
  };

  /** Keys (profile key ids) in the current draft linked to this script. */
  keysUsing = (id: string): number[] => {
    const d = profile.draft;
    return d ? keysLinked(this.links[session.slot], d.macros, this.list, id) : [];
  };

  /** Button names running this script in the current draft ("M1", "M2"). */
  usedBy = (id: string): string[] => this.keysUsing(id).map((k) => KEY_NAMES[k] ?? String(k));

  /** Changes a script and carries the change to the buttons linked to it in the current draft. */
  update = (id: string, fn: (s: Script) => void) => {
    const s = this.get(id);
    if (!s) return;
    const keys = this.keysUsing(id);
    fn(s);
    this.persist();
    const d = profile.draft;
    if (!d) return;
    for (const k of keys) {
      try { setBinding(d, k, { kind: 'script', buttons: [], behaviour: 'hold', turbo: 5, script: s }); }
      catch (e) { toasts.error(toAppError(e).message); }
    }
  };

  /** Deletes a script and clears the buttons linked to it. Returns a closure that puts both back. */
  remove = (id: string): (() => void) => {
    const i = this.list.findIndex((s) => s.id === id);
    if (i < 0) return () => {};
    const script = $state.snapshot(this.list[i]) as Script;
    const d = profile.draft, slot = session.slot;
    const previous: [number, Binding][] = d ? this.keysUsing(id).map((k) => [k, bindingOf(d, k)]) : [];
    for (const [k] of previous) { setBinding(d!, k, DEFAULT); this.link(k, null); }
    this.list.splice(i, 1);
    this.persist();
    return () => {
      this.list.splice(Math.min(i, this.list.length), 0, script);
      this.persist();
      const now = profile.draft;
      if (now === d && now && session.slot === slot) for (const [k, b] of previous) {
        try { setBinding(now, k, b); this.link(k, script.id); } catch (e) { toasts.error(toAppError(e).message); }
      }
    };
  };

  /** Share of the controller's macro memory the current draft uses (can exceed 100 when it does not fit). */
  get memoryPercent() {
    const d = profile.draft;
    return d ? Math.round((macroUnits(d.macros) / MACRO_UNITS) * 100) : 0;
  }
}

export const scripts = new Scripts();

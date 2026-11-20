import { copy, fmt, slotLabel } from '$lib/copy';
import { profile, encodeDraft } from './profile.svelte';
import { lighting } from './lighting.svelte';
import { toasts } from './toasts.svelte';
import { log } from './debug';
import { parseEntries, offerFor, profileEntry, lightEntry, type Entries } from './unsavedModel';
import type { LightDraft } from './lightingModel';

const KEY = 'vaderdaddy.unsaved.v1';

function session(): Storage | null {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch { return null; }
}

/**
 * Unsaved edits across a reload or quit: a `beforeunload` prompt while anything is unsaved, and (because the Mac
 * app's web view may skip that prompt) the drafts kept in sessionStorage, offered back once per slot on the next
 * load when the controller still holds the same original.
 */
class Unsaved {
  /** What the previous page left behind; slots are removed once offered. */
  private left: Entries = parseEntries(session()?.getItem(KEY) ?? null);

  get any() {
    return Object.keys(profile.slots).some((s) => profile.hasChanges(+s)) || Object.keys(lighting.slots).some((s) => lighting.hasChanges(+s));
  }

  /** Offers a slot's kept draft back (an info toast with "Restore"), once, right after the slot is loaded. */
  offer = (slot: number) => {
    const e = this.left[slot];
    if (!e) return;
    delete this.left[slot];
    const o = offerFor(e, profile.slots[slot]?.original.raw ?? null, lighting.slots[slot]?.base.raw ?? null);
    if (!o) return;
    toasts.info(fmt(copy.unsaved.found, { profile: slotLabel(slot) }), {
      label: copy.unsaved.restore,
      run: () => {
        if (o.profile) profile.restoreDraft(slot, o.profile);
        if (o.light) lighting.restoreDraft(slot, o.light);
        log.add('info', `restored unsaved changes of profile ${slot + 1}`);
      }
    });
  };

  /** Keeps sessionStorage in step with the drafts and installs the unload guard. Call once from the shell. */
  init() {
    const stop = $effect.root(() => {
      $effect(() => {
        const out: Entries = { ...this.left };
        for (const k of Object.keys(profile.slots).map(Number)) {
          const s = profile.slots[k];
          if (!profile.hasChanges(k)) continue;
          try { out[k] = { ...out[k], profile: profileEntry(s.original.raw, encodeDraft(s.draft)) }; } catch { /* does not encode: not kept */ }
        }
        for (const k of Object.keys(lighting.slots).map(Number)) {
          const s = lighting.slots[k];
          if (lighting.hasChanges(k)) out[k] = { ...out[k], light: lightEntry(s.base.raw, $state.snapshot(s.draft) as LightDraft) };
        }
        try { session()?.setItem(KEY, JSON.stringify(out)); } catch { /* full or blocked */ }
      });
    });
    const onUnload = (e: BeforeUnloadEvent) => { if (this.any) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onUnload);
    return () => { stop(); window.removeEventListener('beforeunload', onUnload); };
  }
}

export const unsaved = new Unsaved();

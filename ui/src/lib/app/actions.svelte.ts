import { copy, fmt, slotLabel } from '$lib/copy';
import { device } from '$lib/device/device.svelte';
import { profile } from '$lib/stores/profile.svelte';
import { lighting } from '$lib/stores/lighting.svelte';
import { session } from '$lib/stores/session.svelte';
import { changeOrder } from '$lib/stores/order';
import { toasts } from '$lib/stores/toasts.svelte';
import { history } from '$lib/stores/history.svelte';
import { unsaved } from '$lib/stores/unsaved.svelte';
import { restoreFocus } from './focusTarget';
import { flags } from '$lib/flags';

/** App-level actions shared by the save bar, the shortcuts and the profile switcher. */

export const unsavedCount = () => profile.changes.length + lighting.changes.length;
export const slotDirty = (slot: number) => profile.hasChanges(slot) || lighting.hasChanges(slot);

/** Reads whatever of a slot is not loaded yet. True when its profile is available. */
export async function loadSlot(slot: number): Promise<boolean> {
  if (!profile.slots[slot]) await profile.read(slot);
  if (!profile.slots[slot]) return false;
  if (!lighting.slots[slot] && device.status === 'connected') await lighting.read(slot);
  unsaved.offer(slot);
  return true;
}

/**
 * Saves the profile and the lighting of the current slot (each only when it has changes), after one backup
 * snapshot for both. While it runs the editing regions are inert (session.writing), so no edit can be lost to the
 * read-back. A second Save while one runs does nothing. True when all saved.
 */
export async function saveAll(): Promise<boolean> {
  if (session.writing || profile.error) return false;
  if (device.busy) { toasts.info(copy.save.busy); return false; }
  if (!profile.changes.length && !lighting.changes.length) return false;
  // The editing regions go inert while writing, which drops focus: it comes back afterwards (see focusTarget).
  const before = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  session.writing = true;
  session.menu = null;
  session.palette = false;
  try {
    history.snapshot(fmt(copy.save.backupSave, { n: session.slot + 1 }));
    if (profile.changes.length) await profile.save({ backup: false });
    if (profile.changes.length) return false;
    if (lighting.changes.length) await lighting.save({ backup: false });
    if (lighting.changes.length) return false;
  } finally {
    session.writing = false;
    restoreFocus({ opener: before?.closest('.bar') ? null : before, sel: session.selection });
  }
  toasts.ok(copy.save.saved);
  return true;
}

export function discardAll() {
  if (session.writing || device.busy) return;
  profile.discard();
  lighting.discard();
  session.menu = null;
  toasts.info(copy.save.discarded);
  restoreFocus({ sel: session.selection });
}

/** ⌘Z: undoes the change that appeared most recently. */
export function undoLatest() {
  if (session.writing) return;
  const l = changeOrder.latest();
  if (!l) return;
  if (l.scope === 'profile') profile.undo(l.id);
  else lighting.undo(l.id);
}

/** A slot switch waiting for the user to choose Save / Discard / Cancel. */
export const pending = $state<{ slot: number | null }>({ slot: null });

/** Shows another slot once its profile is read; a slot that cannot be read keeps the current one on screen. */
async function switchNow(slot: number) {
  pending.slot = null;
  session.menu = null;
  const cached = !!profile.slots[slot];
  if (await loadSlot(slot)) {
    session.slot = slot;
    // Reading a slot (profile, then lighting) makes the controller switch to it: lights and mappings (Vader 4 Pro,
    // 2026-11-19). So a slot the app already holds is read once more on every switch; the answers are not used.
    if (cached && flags.clickSwitches) await device.run(slotLabel(slot), async () => { await device.t.readConfig(slot); await device.t.readLed(slot); }, { toast: false });
  }
  // Offline the no-controller screen says it all; a read error on top would contradict it.
  else if (device.status === 'connected') toasts.error(`${slotLabel(slot)}: ${copy.slots.readFailed}`);
}

/** Switches to a slot, asking first when the current one has unsaved changes. */
export function requestSwitch(slot: number) {
  if (slot === session.slot || device.busy || session.writing) return;
  if (slotDirty(session.slot)) pending.slot = slot;
  else switchNow(slot);
}

export async function resolveSwitch(choice: 'save' | 'discard' | 'cancel') {
  const slot = pending.slot;
  if (slot === null) return;
  if (choice === 'cancel') { pending.slot = null; return; }
  if (choice === 'save' && !(await saveAll())) { pending.slot = null; return; }
  // Discarded lighting was on the controller's LEDs as a preview: put the old lighting back before leaving the slot.
  if (choice === 'discard') { profile.discard(); lighting.discard(); await lighting.showLive(); }
  await switchNow(slot);
}

import { flags } from '$lib/flags';
import { partForStream, PARTS } from '$lib/controller/parts';
import type { InputBus } from '$lib/device/input';
import { device } from '$lib/device/device.svelte';
import { session } from '$lib/stores/session.svelte';
import { saveAll, undoLatest, requestSwitch } from './actions.svelte';

/** True while focus is in something the user types into. */
export function typing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName !== 'INPUT') return false;
  const t = (el as HTMLInputElement).type;
  return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color'].includes(t);
}

/**
 * The one global key handler: ⌘S save, ⌘Z undo the latest change, Esc close the top-most thing, ⌘K palette,
 * ⌘1–4 profiles. While typing in a field only ⌘S and Esc apply; while a save writes, ⌘Z and ⌘K are ignored. Also press-to-select from the input bus.
 * Returns an uninstall function.
 */
export function installShortcuts(bus: InputBus): () => void {
  const onKey = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); saveAll(); return; }
    if (e.key === 'Escape') {
      if (!e.defaultPrevented && session.close()) e.preventDefault();
      return;
    }
    if (typing() || !mod || e.altKey) return;
    // While a save or restore writes, nothing that edits or opens an editor runs (session.writing).
    if (session.writing && (k === 'z' || k === 'k')) { e.preventDefault(); return; }
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undoLatest(); }
    else if (k === 'k') { e.preventDefault(); session.palette = !session.palette; }
    else if (/^[1-4]$/.test(e.key) && device.status === 'connected') { e.preventDefault(); requestSwitch(+e.key - 1); }
  };
  window.addEventListener('keydown', onKey);

  const offPress = bus.onPress((name) => {
    if (!flags.pressToSelect || typing()) return;
    if (session.selection || session.sheet || session.palette || session.menu || session.view !== 'main') return;
    const part = partForStream(name);
    if (part && PARTS[part].inspector !== 'none') session.select(part);
  });

  return () => { window.removeEventListener('keydown', onKey); offPress(); };
}

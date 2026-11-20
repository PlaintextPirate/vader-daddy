import { replaceState } from '$app/navigation';
import { isPartId, PARTS, type PartId } from '$lib/controller/parts';

/** What the window is showing. Nothing here touches the controller. */
export type Selection = PartId | 'gyro' | 'vibration' | null;
export type View = 'main' | 'history' | 'settings';
export type SheetState = { kind: 'script'; id: string } | null;
export type Menu = 'profile' | 'changes' | null;

/** A hash names a selection only when it opens a panel ("#home" and "#capture" have none, "#bogus" is nothing). */
const isSelection = (v: string): v is Exclude<Selection, null> =>
  (isPartId(v) && PARTS[v].inspector !== 'none') || v === 'gyro' || v === 'vibration';

/**
 * Rewrites the hash without a navigation. SvelteKit's replaceState throws until its router has started (an early
 * load with an unknown hash did), so fall back to retrying once the current task is done.
 */
function writeHash(h: string, retry = true) {
  try {
    replaceState(location.pathname + location.search + h, {});
  } catch {
    if (retry) setTimeout(() => writeHash(h, false), 0);
  }
}

class Session {
  /** Profile slot shown (0–3). Switch with `profile.switchTo()` so unsaved changes are asked about. */
  slot = $state(0);
  selection = $state<Selection>(null);
  sheet = $state<SheetState>(null);
  view = $state<View>('main');
  palette = $state(false);
  menu = $state<Menu>(null);
  /**
   * True while a save or a restore writes to the controller. The stage, inspector and sheets are inert and edit
   * shortcuts are ignored meanwhile, because the read-back replaces the draft (edits made now would be lost).
   */
  writing = $state(false);

  /** Opens the inspector for a part (or the gyro / vibration panel); null closes it. */
  select = (s: Selection) => {
    this.menu = null;
    this.view = 'main';
    this.selection = s;
  };

  openSheet = (id: string) => { this.sheet = { kind: 'script', id }; };
  openView = (v: View) => { this.menu = null; this.palette = false; this.view = v; };

  /** Closes the top-most open thing: palette → sheet → menu → panel → view. Returns false when nothing was open. */
  close = (): boolean => {
    if (this.palette) this.palette = false;
    else if (this.sheet) this.sheet = null;
    else if (this.menu) this.menu = null;
    else if (this.selection) this.selection = null;
    else if (this.view !== 'main') this.view = 'main';
    else return false;
    return true;
  };

  /** The URL hash for the current state: "#m1", "#gyro", "#history", or "". */
  get hash() {
    if (this.view !== 'main') return `#${this.view}`;
    return this.selection ? `#${this.selection}` : '';
  }

  applyHash(hash: string) {
    const h = hash.replace(/^#/, '');
    if (h === 'history' || h === 'settings') { this.view = h; this.selection = null; }
    else if (isSelection(h)) { this.view = 'main'; this.selection = h; }
    else { this.view = 'main'; this.selection = null; }
  }

  /** Restores from the hash and keeps the hash in step from then on (so a reload returns to the same panel). */
  init() {
    this.applyHash(location.hash);
    const onHash = () => { if (location.hash !== this.hash) this.applyHash(location.hash); };
    window.addEventListener('hashchange', onHash);
    const stop = $effect.root(() => {
      $effect(() => {
        const h = this.hash;
        if (h !== location.hash && !(h === '' && location.hash === '')) writeHash(h);
      });
    });
    return () => { stop(); window.removeEventListener('hashchange', onHash); };
  }
}

export const session = new Session();

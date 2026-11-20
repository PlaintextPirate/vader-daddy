// Where keyboard focus goes when the thing that had it disappears (the save bar after Save or Discard, a panel
// after Done, a confirm row after Restore). The rule everywhere: the control that opened the thing, else the
// selected controller part (or its Gyro / Vibration chip), else the stage. Never <body>.
import type { Selection } from '$lib/stores/session.svelte';

/** The focusable element that stands for a selection on the stage, or null. */
export function selectionTarget(sel: Selection): HTMLElement | null {
  if (!sel) return null;
  if (sel === 'gyro' || sel === 'vibration') return document.querySelector<HTMLElement>(`[data-chip="${sel}"]`);
  return document.querySelector<HTMLElement>(`[data-part="${sel}"] .hit`);
}

/** The stage itself (tabindex −1), or the main region. */
const stage = () => document.querySelector<HTMLElement>('[data-stage]') ?? document.querySelector<HTMLElement>('main');

/** True when focus has nowhere sensible to be: lost to <body>, or inside something that is going away. */
export function focusLost(within?: Element | null): boolean {
  const a = document.activeElement;
  return !a || a === document.body || !a.isConnected || (!!within && within.contains(a)) || !!a.closest('[inert]');
}

/**
 * Puts focus on the first of `opener`, the element for `sel`, the stage, once the DOM has settled (after this
 * frame's updates). Only when focus is lost (or inside `within`), so a deliberate move elsewhere is respected.
 */
type Opener = HTMLElement | null | undefined | (() => HTMLElement | null);
export function restoreFocus(opts: { opener?: Opener; sel?: Selection; within?: Element | null } = {}) {
  let frames = 0;
  // A function is looked up again on every try (the view may have re-rendered the element meanwhile).
  const openerNow = () => (typeof opts.opener === 'function' ? opts.opener() : opts.opener);
  const ok = (el: HTMLElement | null | undefined): el is HTMLElement =>
    !!el && el.isConnected && !el.closest('[inert]') && !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0;
  const attempt = () => {
    if (!focusLost(opts.within)) return;
    // The opener may still be disabled or inert for a frame or two while the action finishes: wait for it briefly.
    const opener = openerNow();
    if (opts.opener && !ok(opener) && frames++ < 30) { requestAnimationFrame(attempt); return; }
    const pick = [opener, selectionTarget(opts.sel ?? null), stage()].find(ok);
    pick?.focus({ preventScroll: true });
  };
  requestAnimationFrame(attempt);
}

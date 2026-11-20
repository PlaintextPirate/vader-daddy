// Focus helpers shared by the overlay primitives. trapFocus keeps Tab inside a node and puts focus back where it
// was when the node goes away; portal moves a node to <body> so fixed positioning ignores transformed ancestors.
// Both are Svelte actions: use:trapFocus, use:portal.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Focusable, visible descendants of `root`, in DOM order. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest('[inert]') && el.getClientRects().length > 0
  );
}

export interface TrapOptions {
  /** Element to focus first; defaults to the first focusable descendant, else the node itself. */
  initial?: HTMLElement | null;
}

export function trapFocus(node: HTMLElement, opts: TrapOptions = {}) {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  queueMicrotask(() => {
    const first = opts.initial ?? focusables(node)[0] ?? node;
    if (first === node && !node.hasAttribute('tabindex')) node.tabIndex = -1;
    first.focus({ preventScroll: true });
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const items = focusables(node);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !node.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !node.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  node.addEventListener('keydown', onkeydown);
  return {
    destroy() {
      node.removeEventListener('keydown', onkeydown);
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    }
  };
}

export function portal(node: HTMLElement, target: HTMLElement | string = 'body') {
  const host = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  host?.appendChild(node);
  return {
    destroy() {
      node.remove();
    }
  };
}

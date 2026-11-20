<!-- Popover: a floating card anchored to `anchor`, rendered into <body> so transformed ancestors cannot clip it.
     Non-modal: nothing is trapped. It is a layer (layers.ts): when on top it closes on Esc (focus goes back to the
     anchor) and on a pointer press outside both the card and the anchor. Tab past its last control closes it and
     moves on from the anchor; Shift+Tab before its first returns to the anchor. `align` lines the card up with the
     start, centre or end of the anchor; it flips to the opposite side when it does not fit and stays 8 px inside
     `boundary` (default: the viewport). -->
<script lang="ts" module>
  import type { Snippet } from 'svelte';
  export type Placement = 'bottom' | 'top' | 'left' | 'right';
  export interface PopoverProps {
    open: boolean;
    anchor: HTMLElement | null;
    placement?: Placement;
    tone?: 'light' | 'dark';
    label: string;
    offset?: number;
    /** Which edge of the anchor the card lines up with (top/bottom placements; left/right centre vertically). */
    align?: 'start' | 'center' | 'end';
    /** Keep the card inside this element (and the viewport). */
    boundary?: HTMLElement | null;
    /** The control that opens it, when it is not `anchor` itself: focus returns here. */
    trigger?: HTMLElement | null;
    children: Snippet;
  }
  const FLIP: Record<Placement, Placement> = { bottom: 'top', top: 'bottom', left: 'right', right: 'left' };
  const M = 8;
</script>

<script lang="ts">
  import { portal, focusables } from './focus';
  import { pushLayer } from './layers';

  let {
    open = $bindable(false),
    anchor,
    placement = 'bottom',
    tone = 'light',
    label,
    offset = 10,
    align = 'center',
    boundary = null,
    trigger = null,
    children
  }: PopoverProps = $props();

  let card: HTMLDivElement | null = $state(null);
  let pos = $state({ x: 0, y: 0, side: 'bottom' as Placement });

  function place() {
    if (!card || !anchor) return;
    const a = anchor.getBoundingClientRect();
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    // The box the card must stay in: the boundary (if any) within the viewport, inset by M.
    const b = boundary?.getBoundingClientRect();
    const box = {
      l: Math.max(M, (b?.left ?? 0) + M),
      t: Math.max(M, (b?.top ?? 0) + M),
      r: Math.min(window.innerWidth - M, (b?.right ?? Infinity) - M),
      btm: Math.min(window.innerHeight - M, (b?.bottom ?? Infinity) - M)
    };
    const hx = align === 'start' ? a.left : align === 'end' ? a.right - w : a.left + a.width / 2 - w / 2;
    const at = (side: Placement) => {
      if (side === 'bottom') return { x: hx, y: a.bottom + offset };
      if (side === 'top') return { x: hx, y: a.top - offset - h };
      if (side === 'right') return { x: a.right + offset, y: a.top + a.height / 2 - h / 2 };
      return { x: a.left - offset - w, y: a.top + a.height / 2 - h / 2 };
    };
    const fits = (p: { x: number; y: number }) => p.x >= box.l && p.y >= box.t && p.x + w <= box.r && p.y + h <= box.btm;
    let side = placement;
    let p = at(side);
    if (!fits(p) && fits(at(FLIP[side]))) {
      side = FLIP[side];
      p = at(side);
    }
    pos = {
      x: Math.round(Math.max(box.l, Math.min(p.x, box.r - w))),
      y: Math.round(Math.max(box.t, Math.min(p.y, box.btm - h))),
      side
    };
  }

  function close(refocus: boolean) {
    open = false;
    if (refocus) (trigger ?? anchor)?.focus({ preventScroll: true });
  }

  /** Tab out of the (portalled) card continues from the anchor instead of falling off the end of the page. */
  function onTab(e: KeyboardEvent) {
    const from = trigger ?? anchor;
    if (e.key !== 'Tab' || !card || !from) return;
    const items = focusables(card);
    const first = items[0] ?? card;
    const last = items[items.length - 1] ?? card;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === card)) {
      e.preventDefault();
      close(true);
    } else if (!e.shiftKey && (active === last || items.length === 0)) {
      e.preventDefault();
      const page = focusables(document.body).filter((el) => !card?.contains(el) && (el.tabIndex >= 0 || el === from));
      const i = page.findIndex((el) => el === from || el.contains(from));
      const target = (i >= 0 ? page.slice(i + 1).find((el) => !from.contains(el)) : null) ?? from;
      open = false;
      target.focus({ preventScroll: true });
    }
  }

  $effect(() => {
    if (!open || !card) return;
    place();
    card.focus({ preventScroll: true });
    const ro = new ResizeObserver(place);
    ro.observe(card);
    if (anchor) ro.observe(anchor);
    const off = pushLayer({
      // Esc: focus goes back to the anchor unless it had already moved somewhere else on purpose.
      escape: () => {
        const a = document.activeElement;
        close(!a || a === document.body || !!card?.contains(a) || !!anchor?.contains(a) || !!trigger?.contains(a));
      },
      inside: (t) => !!(card?.contains(t) || anchor?.contains(t) || trigger?.contains(t)),
      outside: () => close(false)
    });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      off();
      ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  });
</script>

{#if open}
  <div
    bind:this={card}
    use:portal
    class="pop {tone} from-{pos.side}"
    role="dialog"
    aria-label={label}
    tabindex="-1"
    onkeydown={onTab}
    style:left="{pos.x}px"
    style:top="{pos.y}px"
  >
    {@render children()}
  </div>
{/if}

<style>
  .pop {
    position: fixed;
    z-index: 50;
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 16px);
    overflow: auto;
    padding: var(--s-5);
    border-radius: var(--r-20);
    box-shadow: var(--sh-popover);
    animation: pop var(--t-med) var(--ease-out) both;
  }
  .pop:focus { box-shadow: var(--sh-popover); }
  .light { background: var(--c-white); color: var(--c-ink); }
  .dark { background: var(--c-ink); color: var(--c-white); border-radius: var(--r-16); }
  .from-bottom { --dx: 0; --dy: -6px; }
  .from-top { --dx: 0; --dy: 6px; }
  .from-left { --dx: 6px; --dy: 0; }
  .from-right { --dx: -6px; --dy: 0; }
  @keyframes pop {
    from { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0.98); }
    to { opacity: 1; transform: none; }
  }
</style>

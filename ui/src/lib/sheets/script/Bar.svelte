<!-- Bar: one press on its lane. Drag the body to move it, an end to resize it. While dragging only CSS custom
     properties on this element change (no store writes), and the result is committed once on pointerup, so a drag
     is one undoable change. Keyboard: ←/→ move 10 ms, Shift+←/→ resize, Delete removes, Enter edits the start. -->
<script lang="ts">
  import { dragPress, hitZone, pxToMs, endOf, type Press, type Zone } from './timeline';
  import { barName, barRange } from '$lib/copy';

  let {
    presses,
    index,
    k,
    name,
    selected,
    onselect,
    oncommit,
    onremove,
    onenter
  }: {
    presses: Press[];
    index: number;
    k: number;
    name: string;
    selected: boolean;
    onselect: (i: number) => void;
    oncommit: (i: number, p: Press) => void;
    onremove: (i: number) => void;
    onenter: () => void;
  } = $props();

  const p = $derived(presses[index]);
  const wPx = $derived(p.holdMs * k);
  let el: HTMLButtonElement | null = $state(null);
  let live: HTMLSpanElement | null = $state(null);
  let drag: { zone: Zone; x0: number; next: Press; id: number } | null = null;

  const changed = (a: Press, b: Press) => a.startMs !== b.startMs || a.holdMs !== b.holdMs;

  function down(e: PointerEvent) {
    if (e.button !== 0 || !el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    drag = { zone: hitZone(e.clientX - r.left, r.width), x0: e.clientX, next: p, id: e.pointerId };
    el.setPointerCapture(e.pointerId);
    el.focus({ preventScroll: true });
    onselect(index);
  }
  function move(e: PointerEvent) {
    if (!drag || !el || e.pointerId !== drag.id) return;
    const next = dragPress(presses, index, drag.zone, pxToMs(e.clientX - drag.x0, k));
    drag.next = next;
    el.style.setProperty('--dx', `${(next.startMs - p.startMs) * k}px`);
    el.style.setProperty('--dw', `${(next.holdMs - p.holdMs) * k}px`);
    el.classList.add('dragging');
    if (live) live.textContent = barRange(next.startMs, endOf(next));
  }
  function up(e: PointerEvent) {
    if (!drag || !el || e.pointerId !== drag.id) return;
    const next = drag.next;
    drag = null;
    el.style.removeProperty('--dx');
    el.style.removeProperty('--dw');
    el.classList.remove('dragging');
    if (e.type === 'pointerup' && changed(next, p)) oncommit(index, next);
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const next = dragPress(presses, index, e.shiftKey ? 'end' : 'body', e.key === 'ArrowRight' ? 10 : -10);
      if (changed(next, p)) oncommit(index, next);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onremove(index);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onenter();
    }
  }
</script>

<button
  bind:this={el}
  type="button"
  class="bar"
  data-index={index}
  class:sel={selected}
  class:narrow={wPx < 84}
  style:--x="{p.startMs * k}px"
  style:--w="{wPx}px"
  aria-label={barName(name, p.startMs, endOf(p))}
  aria-pressed={selected}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  onfocus={() => onselect(index)}
  onkeydown={key}
>
  <span class="grip l" aria-hidden="true"></span>
  <span class="txt" aria-hidden="true">{barRange(p.startMs, endOf(p))}</span>
  <span class="live" aria-hidden="true" bind:this={live}></span>
  <span class="grip r" aria-hidden="true"></span>
</button>

<style>
  .bar {
    position: absolute;
    top: 5px;
    left: 0;
    height: 32px;
    width: max(4px, calc(var(--w) + var(--dw, 0px)));
    transform: translateX(calc(var(--x) + var(--dx, 0px)));
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: var(--r-8);
    background: var(--c-ink);
    color: var(--c-white);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    white-space: nowrap;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    user-select: none;
    will-change: transform;
  }
  .bar:global(.dragging) { cursor: grabbing; z-index: 2; }
  .bar.sel {
    background: var(--c-accent);
    color: var(--c-ink);
    box-shadow: inset 0 0 0 2px var(--c-ink);
  }
  .bar.sel:focus-visible { box-shadow: inset 0 0 0 2px var(--c-ink), var(--focus-ring); }
  .txt, .live { pointer-events: none; }
  .live, .bar:global(.dragging) .txt { display: none; }
  .bar:global(.dragging) .live { display: inline; }
  .narrow .txt, .narrow .live { display: none !important; }
  .grip {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 10px;
    cursor: ew-resize;
  }
  .grip.l { left: 0; }
  .grip.r { right: 0; }
  .sel .grip::after {
    content: '';
    position: absolute;
    top: 9px;
    bottom: 9px;
    left: 4px;
    width: 3px;
    border-radius: 2px;
    background: var(--c-ink);
  }
  .sel .grip.r::after { left: 3px; }
</style>

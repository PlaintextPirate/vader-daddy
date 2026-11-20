<!-- StepGrid: the animation as a grid of colour buttons, rows = LEDs, columns = steps. One tab stop (roving
     tabindex over the step numbers and the swatches; arrows / Home / End move). Hover and focus are handled once on
     the grid (delegated), never per cell. The selected-step outline is one element moved by transform. -->
<script lang="ts">
  import { copy, fmt } from '$lib/copy';
  import { lighting } from '$lib/stores/lighting.svelte';
  import { showHex, presetOf } from './colour';
  const colourName = (hex: string) => { const id = presetOf(hex); return id ? copy.light.presetNames[id] : showHex(hex); };

  let {
    grid,
    selected,
    active,
    onselect,
    onpick
  }: {
    grid: string[][];
    selected: number;
    /** The cell whose colour popover is open (gets the selection ring). */
    active: { led: number; step: number } | null;
    onselect: (step: number) => void;
    onpick: (el: HTMLElement, led: number, step: number) => void;
  } = $props();

  const n = $derived(grid[0]?.length ?? 0);
  const cols = $derived(Array.from({ length: n }, (_, i) => i));
  // Up to seven steps fit at 40 px; more steps narrow the columns (never below 28 px, and rows keep their
  // height), so the grid always fits the panel's 328 px body plus the outline's 4 px and nothing below moves.
  // The "LED" header needs ~27 px at 13 px; narrower cells pay for it with many steps.
  const head = $derived(n > 8 ? 28 : 24);
  const gap = $derived(n > 8 ? 3 : n > 6 ? 4 : 8);
  const cell = $derived(Math.min(40, Math.floor((332 - head - n * gap) / n)));

  // Roving focus position: row −1 is the step numbers.
  let fr = $state(0);
  let fc = $state(0);
  const fcc = $derived(Math.min(fc, n - 1));
  let root: HTMLElement;

  const posOf = (t: EventTarget | null) => {
    const el = (t as HTMLElement | null)?.closest<HTMLElement>('[data-r]');
    return el ? { r: Number(el.dataset.r), c: Number(el.dataset.c) } : null;
  };

  function keydown(e: KeyboardEvent) {
    const p = posOf(e.target);
    if (!p) return;
    let { r, c } = p;
    if (e.key === 'ArrowRight') c = Math.min(n - 1, c + 1);
    else if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
    else if (e.key === 'ArrowDown') r = Math.min(grid.length - 1, r + 1);
    else if (e.key === 'ArrowUp') r = Math.max(-1, r - 1);
    else if (e.key === 'Home') c = 0;
    else if (e.key === 'End') c = n - 1;
    else return;
    e.preventDefault();
    fr = r;
    fc = c;
    root.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)?.focus();
  }

  function focusin(e: FocusEvent) {
    const p = posOf(e.target);
    if (!p) return;
    fr = p.r;
    fc = p.c;
    lighting.hoverLed = p.r >= 0 ? p.r : null;
  }
  function pointerover(e: PointerEvent) {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-led]');
    lighting.hoverLed = row ? Number(row.dataset.led) : null;
  }
  function leave() {
    const p = root.contains(document.activeElement) ? posOf(document.activeElement) : null;
    lighting.hoverLed = p && p.r >= 0 ? p.r : null;
  }
</script>

<div class="wrap" style:--n={n} style:--cell="{cell}px" style:--gap="{gap}px" style:--head="{head}px">
  <div class="steplabel" aria-hidden="true">{copy.light.step}</div>
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div
    bind:this={root}
    class="grid"
    role="grid"
    aria-label={copy.light.grid}
    onkeydown={keydown}
    onfocusin={focusin}
    onfocusout={(e) => { if (!root.contains(e.relatedTarget as Node)) lighting.hoverLed = null; }}
    onpointerover={pointerover}
    onpointerleave={leave}
  >
    <div class="row" role="row">
      <span class="corner" role="columnheader">{copy.light.led}</span>
      {#each cols as c (c)}
        <span role="columnheader">
          <button
            type="button"
            class="num"
            class:sel={c === selected}
            data-r="-1"
            data-c={c}
            tabindex={fr === -1 && fcc === c ? 0 : -1}
            aria-label={fmt(copy.light.stepN, { n: c + 1 })}
            aria-pressed={c === selected}
            onclick={() => onselect(c)}
          >{c + 1}</button>
        </span>
      {/each}
    </div>
    {#each grid as steps, l (l)}
      <div class="row" role="row" data-led={l}>
        <span class="led" class:hot={lighting.hoverLed === l} role="rowheader" aria-label="{copy.light.led} {l + 1}">
          <span>{l + 1}</span>
        </span>
        {#each steps as hex, c (c)}
          <span role="gridcell" aria-selected={c === selected}>
            <button
              type="button"
              class="cell"
              class:active={active?.led === l && active.step === c}
              data-r={l}
              data-c={c}
              style:background={hex}
              tabindex={fr === l && fcc === c ? 0 : -1}
              aria-label={fmt(copy.light.cell, { led: l + 1, step: c + 1, hex: colourName(hex) })}
              aria-haspopup="dialog"
              onclick={(e) => onpick(e.currentTarget, l, c)}
            ></button>
          </span>
        {/each}
      </div>
    {/each}
    <span class="outline" style:--i={selected} aria-hidden="true"></span>
  </div>
</div>

<style>
  .steplabel {
    margin-left: calc(var(--head) + var(--gap));
    width: calc(var(--n) * var(--cell) + (var(--n) - 1) * var(--gap));
    text-align: center;
    font-size: var(--fs-sm);
    color: var(--c-mute);
    line-height: 16px;
  }
  .grid {
    position: relative;
    display: grid;
    grid-template-columns: var(--head) repeat(var(--n), var(--cell));
    column-gap: var(--gap);
    row-gap: 8px;
    width: max-content;
  }
  .row { display: contents; }
  .corner, .led, .num { font-size: var(--fs-sm); color: var(--c-mute); }
  .corner { display: flex; align-items: center; height: 24px; margin-bottom: -4px; white-space: nowrap; }
  .num {
    width: 100%;
    height: 28px;
    margin-bottom: -4px;
    padding: 0;
    border: 0;
    border-radius: var(--r-8);
    background: transparent;
    font-variant-numeric: tabular-nums;
  }
  .num:hover { color: var(--c-ink); }
  .num.sel { color: var(--c-ink); font-weight: var(--fw-semibold); }
  .led { display: flex; align-items: center; justify-content: center; height: 40px; }
  .led span {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    transition: background-color var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
  }
  .led.hot span { background: var(--c-ink); color: var(--c-white); font-weight: var(--fw-semibold); }
  .cell {
    display: block;
    width: var(--cell);
    height: 40px;
    padding: 0;
    border: 0;
    border-radius: 10px;
    box-shadow: inset 0 0 0 1px rgba(27, 35, 48, 0.12);
    transition: transform var(--t-fast) var(--ease-out);
  }
  .cell:hover { transform: scale(1.04); }
  .cell.active { box-shadow: 0 0 0 2px var(--c-white), 0 0 0 4px var(--c-ink); }
  /* The swatch's own inset edge and the focus ring together (one would otherwise replace the other). */
  .cell:focus-visible { box-shadow: inset 0 0 0 1px rgba(27, 35, 48, 0.12), var(--focus-ring); }
  .num:focus-visible { box-shadow: var(--focus-ring); }
  @media (forced-colors: active) {
    .cell { forced-color-adjust: none; border: 1px solid CanvasText; }
    .cell:focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
    .outline { border-color: Highlight; }
  }
  .outline {
    position: absolute;
    top: 28px; /* 4 px above the first swatch: numbers row 24 + gap 8 − 4 */
    left: calc(var(--head) + var(--gap) - 4px);
    width: calc(var(--cell) + 8px);
    height: calc(5 * 40px + 4 * 8px + 8px);
    border: 2px solid var(--c-ink);
    border-radius: 13px;
    pointer-events: none;
    transform: translateX(calc(var(--i) * (var(--cell) + var(--gap))));
    transition: transform var(--t-med) var(--ease-out);
  }
</style>

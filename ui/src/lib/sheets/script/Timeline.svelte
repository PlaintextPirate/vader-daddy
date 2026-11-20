<!-- Timeline: lane labels (fixed) beside a horizontally scrolling area with the time axis and one lane per button.
     Zooming keeps the time at the centre of the view in place. With no presses it shows "Add a press" centred. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { copy } from '$lib/copy';
  import { KEY_NAMES } from '$lib/protocol/config';
  import Bar from './Bar.svelte';
  import { lanes, ticks, type Press } from './timeline';

  let {
    presses,
    k,
    total,
    zoom,
    width = $bindable(800),
    selected,
    onselect,
    oncommit,
    onremove,
    onenter,
    empty
  }: {
    presses: Press[];
    k: number;
    total: number;
    zoom: number;
    width?: number;
    selected: number | null;
    onselect: (i: number) => void;
    oncommit: (i: number, p: Press) => void;
    onremove: (i: number) => void;
    onenter: () => void;
    empty: Snippet;
  } = $props();

  const SHORT: Record<number, string> = { 0: '↑', 1: '→', 2: '↓', 3: '←' };
  const groups = $derived(lanes(presses));
  const marks = $derived(ticks(total, k));
  const trackPx = $derived(Math.max(width, total * k));
  // Fixed height (axis + lanes + room for a scrollbar) so zooming in never makes the sheet grow.
  const heightPx = $derived(28 + (presses.length ? groups.length * 52 - 10 : 146) + 14);

  let scroller: HTMLDivElement | null = $state(null);
  // Keep the centre of the view on the same time when zooming.
  let centreMs = 0;
  let lastK = 0;
  $effect.pre(() => {
    void zoom;
    if (scroller && lastK) centreMs = (scroller.scrollLeft + scroller.clientWidth / 2) / lastK;
  });
  $effect(() => {
    void zoom;
    if (scroller && lastK && lastK !== k) scroller.scrollLeft = centreMs * k - scroller.clientWidth / 2;
    lastK = k;
  });
</script>

<div class="tl" aria-label={copy.script.timeline} role="group">
  <div class="labels" aria-hidden="true">
    <div class="axis-gap"></div>
    {#each groups as g (g.button)}
      <div class="lab">{SHORT[g.button] ?? KEY_NAMES[g.button]}</div>
    {/each}
  </div>
  <div class="scroller" style:height="{heightPx}px" bind:this={scroller} bind:clientWidth={width}>
    <div class="track" style:width="{trackPx}px">
      <div class="axis" aria-hidden="true">
        {#each marks as t, i (t)}
          <span class="tick" class:first={i === 0} class:last={i === marks.length - 1} style:--t="{t * k}px">
            {t}{i === marks.length - 1 ? ' ms' : ''}
          </span>
        {/each}
      </div>
      {#if presses.length === 0}
        <div class="empty">{@render empty()}</div>
      {/if}
      {#each groups as g (g.button)}
        <div class="lane">
          {#each g.items as i (i)}
            <Bar
              {presses}
              index={i}
              {k}
              name={KEY_NAMES[g.button]}
              selected={selected === i}
              {onselect}
              {oncommit}
              {onremove}
              {onenter}
            />
          {/each}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .tl { display: grid; grid-template-columns: 64px minmax(0, 1fr); }
  .labels { display: flex; flex-direction: column; gap: 10px; }
  .axis-gap { height: 28px; margin-bottom: -10px; }
  .lab {
    display: flex;
    align-items: center;
    height: 42px;
    font-size: var(--fs-lg);
    font-weight: var(--fw-medium);
  }
  .scroller { overflow-x: auto; overflow-y: hidden; }
  .track { display: flex; flex-direction: column; gap: 10px; min-width: 100%; }
  .axis { position: relative; height: 28px; margin-bottom: -10px; }
  .tick {
    position: absolute;
    top: 2px;
    left: 0;
    transform: translateX(calc(var(--t) - 50%));
    font-size: var(--fs-sm);
    color: var(--c-mute);
    white-space: nowrap;
  }
  .tick.first { transform: translateX(var(--t)); }
  .tick.last { transform: translateX(calc(var(--t) - 100%)); }
  .lane {
    position: relative;
    height: 42px;
    border-radius: var(--r-12);
    background: var(--c-well);
  }
  .empty {
    display: grid;
    place-items: center;
    height: 146px;
    border-radius: var(--r-12);
    background: var(--c-well);
  }
</style>

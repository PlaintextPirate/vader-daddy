<!-- StepTools: "Add step" with the step count, then the tools for the selected step (move earlier / later, delete).
     When a press disables the button that has focus (moved to an end, down to the minimum), focus moves to a
     neighbour instead of falling to <body>. -->
<script lang="ts">
  import { tick } from 'svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { Button } from '$lib/ui';
  import { copy, stepsOf, stepN } from '$lib/copy';
  import { MAX_STEPS, MIN_STEPS } from '$lib/stores/lightingModel';

  let {
    count,
    selected,
    onadd,
    onmove,
    ondelete
  }: { count: number; selected: number; onadd: () => void; onmove: (dir: -1 | 1) => void; ondelete: () => void } = $props();

  let addEl = $state<HTMLButtonElement | null>(null);
  let earlierEl = $state<HTMLButtonElement | null>(null);
  let laterEl = $state<HTMLButtonElement | null>(null);

  /** Runs `fn`, then moves focus to `fallback` if the pressed button ended up disabled. */
  async function keep(e: MouseEvent, fn: () => void, fallback: () => HTMLElement | null) {
    const el = e.currentTarget as HTMLButtonElement;
    fn();
    await tick();
    if (el.disabled && document.activeElement === el) fallback()?.focus();
  }
</script>

<div class="add">
  <Button variant="soft" bind:el={addEl} disabled={count >= MAX_STEPS} onclick={(e) => keep(e, onadd, () => earlierEl)}>
    {copy.light.addStep}
  </Button>
  <span class="count num">{stepsOf(count, MAX_STEPS)}</span>
</div>

<div class="tools" role="group" aria-label={copy.light.stepTools}>
  <span class="label num">{stepN(selected + 1)}</span>
  <span class="grow"></span>
  <button
    bind:this={earlierEl}
    type="button"
    class="round"
    aria-label={copy.light.earlier}
    title={copy.light.earlier}
    disabled={selected <= 0}
    onclick={(e) => keep(e, () => onmove(-1), () => laterEl)}
  ><ArrowLeft size={16} aria-hidden="true" /></button>
  <button
    bind:this={laterEl}
    type="button"
    class="round"
    aria-label={copy.light.later}
    title={copy.light.later}
    disabled={selected >= count - 1}
    onclick={(e) => keep(e, () => onmove(1), () => earlierEl)}
  ><ArrowRight size={16} aria-hidden="true" /></button>
  <Button variant="soft" size="sm" disabled={count <= MIN_STEPS} onclick={(e) => keep(e, ondelete, () => addEl)}>
    {copy.light.deleteStep}
  </Button>
</div>

<style>
  .add, .tools { display: flex; align-items: center; gap: var(--s-2); }
  .add { justify-content: space-between; margin-top: 14px; }
  .tools { margin-top: 12px; min-height: 28px; }
  .count, .label { font-size: var(--fs-md); color: var(--c-mute); }
  .grow { flex: 1; }
  .round {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--c-well);
    color: var(--c-ink);
    transition: transform var(--t-fast) var(--ease-out);
  }
  .round:hover:not(:disabled) { background: var(--c-well-hover); }
  .round:active:not(:disabled) { transform: scale(0.94); }
  .round:disabled { opacity: 0.45; }
</style>

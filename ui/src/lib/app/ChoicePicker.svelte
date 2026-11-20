<!-- A soft pill showing the current choice; opens a Popover with the choices as a radio list (for more than four
     options, where a segmented control would not fit). Arrow keys move inside the list, Enter/Space/click picks. -->
<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Check from '@lucide/svelte/icons/check';
  import { Popover } from '$lib/ui';

  let { label, value, choices, disabled = false, onpick }: {
    label: string;
    value: number;
    choices: { value: number; label: string }[];
    disabled?: boolean;
    onpick: (v: number) => void;
  } = $props();

  let open = $state(false);
  let anchor = $state<HTMLButtonElement | null>(null);
  let list = $state<HTMLDivElement | null>(null);
  const current = $derived(choices.find((c) => c.value === value)?.label ?? String(value));

  function pick(v: number) {
    open = false;
    anchor?.focus();
    if (v !== value) onpick(v);
  }
  function keys(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(list?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  }
  $effect(() => {
    if (open && list) queueMicrotask(() => list?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
  });
</script>

<button bind:this={anchor} type="button" class="pill" {disabled} aria-haspopup="dialog" aria-expanded={open}
  aria-label="{label}: {current}" onclick={() => (open = !open)}>
  <span>{current}</span><ChevronDown size={16} strokeWidth={2.2} />
</button>

<Popover bind:open {anchor} {label} placement="bottom">
  <div class="list" role="radiogroup" tabindex="-1" aria-label={label} bind:this={list} onkeydown={keys}>
    {#each choices as c (c.value)}
      <button type="button" role="radio" aria-checked={c.value === value} class:on={c.value === value} onclick={() => pick(c.value)}>
        <span>{c.label}</span>
        {#if c.value === value}<Check size={16} strokeWidth={2.4} />{/if}
      </button>
    {/each}
  </div>
</Popover>

<style>
  .pill {
    display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 var(--s-3) 0 var(--s-4);
    border: 0; border-radius: var(--r-pill); background: var(--c-well); font-weight: var(--fw-medium); white-space: nowrap;
  }
  .pill:hover:not(:disabled) { background: var(--c-well-hover); }
  .pill:disabled { opacity: 0.45; }
  .list { display: grid; min-width: 180px; margin: calc(-1 * var(--s-3)); }
  .list button {
    display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); min-height: 36px;
    padding: 0 var(--s-3); border: 0; border-radius: var(--r-8); background: none; text-align: left;
  }
  .list button:hover { background: var(--c-well); }
  .list button.on { font-weight: var(--fw-semibold); }
</style>

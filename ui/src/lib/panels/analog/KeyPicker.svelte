<!-- A soft pill showing the chosen button's name with a chevron; opens a popover of chips to pick another. -->
<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { Chip, Popover } from '$lib/ui';
  import { KEY_NAMES } from '$lib/protocol/config';

  let { label, value, keys, onchange }: { label: string; value: number; keys: number[]; onchange: (k: number) => void } = $props();

  let open = $state(false);
  let anchor: HTMLButtonElement | null = $state(null);
  const name = (k: number) => KEY_NAMES[k] ?? `Button ${k}`;

  function pick(e: MouseEvent, k: number) {
    e.preventDefault();
    open = false;
    anchor?.focus();
    if (k !== value) onchange(k);
  }
</script>

<button
  bind:this={anchor}
  type="button"
  class="pill"
  aria-haspopup="dialog"
  aria-expanded={open}
  aria-label="{label}: {name(value)}"
  onclick={() => (open = !open)}
>
  <span>{name(value)}</span>
  <ChevronDown size={16} strokeWidth={2.25} aria-hidden="true" />
</button>

<Popover bind:open {anchor} {label} placement="bottom">
  <div class="grid">
    {#each keys as k (k)}
      <Chip selected={k === value} onclick={(e) => pick(e, k)}>{name(k)}</Chip>
    {/each}
  </div>
</Popover>

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 12px 0 14px;
    border: 0;
    border-radius: var(--r-pill);
    background: var(--c-well);
    color: var(--c-ink);
    font-size: var(--fs-md);
    font-weight: var(--fw-semibold);
  }
  .pill:hover { background: var(--c-well-hover); }
  .grid { display: grid; grid-template-columns: repeat(4, minmax(56px, 1fr)); gap: var(--s-2); width: 280px; }
</style>

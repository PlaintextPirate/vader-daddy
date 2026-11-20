<!-- Chip: a toggle pill as in the button panel's key grid (well when off, ink when on). Toggles `selected` itself
     unless `onclick` calls preventDefault(). Stretches to fill a grid cell; put chips in a 4-column grid with 8 px gaps. -->
<script lang="ts" module>
  import type { Snippet } from 'svelte';
  export interface ChipProps {
    selected?: boolean;
    onclick?: (e: MouseEvent) => void;
    disabled?: boolean;
    ariaLabel?: string;
    title?: string;
    class?: string;
    /** Sets data-chip, so the app can find (and refocus) this chip. */
    dataChip?: string;
    children: Snippet;
  }
</script>

<script lang="ts">
  let {
    selected = $bindable(false),
    onclick,
    disabled = false,
    ariaLabel,
    title,
    class: cls = '',
    dataChip,
    children
  }: ChipProps = $props();

  function click(e: MouseEvent) {
    onclick?.(e);
    if (!e.defaultPrevented) selected = !selected;
  }
</script>

<button
  type="button"
  class="chip {cls}"
  class:on={selected}
  aria-pressed={selected}
  aria-label={ariaLabel}
  data-chip={dataChip}
  {title}
  {disabled}
  onclick={click}
>
  {@render children()}
</button>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    height: 38px;
    padding: 0 var(--s-3);
    border: 0;
    border-radius: var(--r-pill);
    background: var(--c-well);
    color: var(--c-ink);
    font-size: var(--fs-md);
    font-weight: var(--fw-semibold);
    line-height: 1;
    white-space: nowrap;
    transition: transform var(--t-fast) var(--ease-out);
  }
  .chip:hover:not(:disabled), .chip:global(.is-hover) { background: var(--c-well-hover); }
  .chip.on { background: var(--c-ink); color: var(--c-white); }
  .chip.on:hover:not(:disabled), .chip.on:global(.is-hover) { background: var(--c-ink-hover); }
  .chip:active:not(:disabled) { transform: scale(0.96); }
  .chip:disabled { color: var(--c-disabled); }
  .chip.on:disabled { background: var(--c-well); color: var(--c-disabled); box-shadow: inset 0 0 0 1.5px var(--c-disabled); }
  .chip:focus-visible { box-shadow: var(--focus-ring); }
  @media (forced-colors: active) {
    .chip { border: 1px solid ButtonText; }
    .chip.on { background: Highlight; color: HighlightText; border-color: Highlight; forced-color-adjust: none; }
    .chip:disabled { border-color: GrayText; color: GrayText; }
  }
</style>

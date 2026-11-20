<!-- Seg: segmented control with a sliding white thumb (moved by transform only). It is a radio group: one tab
     stop, arrow keys / Home / End move and select, Space or click selects. With `activation="manual"` (settings that
     write to the controller at once) arrows only move the preview; Space / Enter, a click, or leaving the group
     applies it. Options share the width equally;
     set `--seg-width` (or a width on the parent) to size it, it fills its container by default. -->
<script lang="ts" module>
  export interface SegOption {
    id: string;
    label: string;
  }
  export interface SegProps {
    options: SegOption[];
    value: string;
    label: string;
    onchange?: (id: string) => void;
    disabled?: boolean;
    activation?: 'auto' | 'manual';
  }
</script>

<script lang="ts">
  let { options, value = $bindable(), label, onchange, disabled = false, activation = 'auto' }: SegProps = $props();

  let buttons: HTMLButtonElement[] = $state([]);
  const chosen = $derived(Math.max(0, options.findIndex((o) => o.id === value)));
  /** Manual activation: the option the arrows moved to, not applied yet (null = none). */
  let preview = $state<number | null>(null);
  const index = $derived(preview ?? chosen);

  function pick(i: number, focus = false) {
    const o = options[i];
    preview = null;
    if (!o) return;
    if (o.id !== value) {
      value = o.id;
      onchange?.(o.id);
    }
    if (focus) buttons[i]?.focus();
  }

  function onkeydown(e: KeyboardEvent) {
    const n = options.length;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else if (activation === 'manual' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      pick(index);
      return;
    }
    if (next < 0) return;
    e.preventDefault();
    if (activation === 'manual') {
      preview = next === chosen ? null : next;
      buttons[next]?.focus();
    } else pick(next, true);
  }

  /** Leaving the group applies a previewed choice. */
  function onfocusout(e: FocusEvent) {
    const root = (e.currentTarget as HTMLElement);
    if (preview !== null && !root.contains(e.relatedTarget as Node)) pick(preview);
  }
</script>

<div
  class="seg"
  role="radiogroup"
  aria-label={label}
  aria-disabled={disabled || undefined}
  style:--n={options.length}
  style:--i={index}
  {onfocusout}
>
  <span class="thumb" aria-hidden="true"></span>
  {#each options as o, i (o.id)}
    <button
      bind:this={buttons[i]}
      type="button"
      role="radio"
      aria-checked={i === index}
      tabindex={i === index ? 0 : -1}
      class:on={i === index}
      {disabled}
      onclick={() => pick(i)}
      {onkeydown}
    >
      {o.label}
    </button>
  {/each}
</div>

<style>
  .seg {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    width: var(--seg-width, 100%);
    height: 46px;
    padding: 4px;
    border-radius: var(--r-pill);
    background: var(--c-well);
    isolation: isolate;
  }
  .thumb {
    position: absolute;
    z-index: -1;
    top: 4px;
    left: 4px;
    width: calc((100% - 8px) / var(--n));
    height: calc(100% - 8px);
    border-radius: var(--r-pill);
    background: var(--c-white);
    box-shadow: var(--sh-thumb), 0 0 0 1px var(--c-seg-edge);
    transform: translateX(calc(100% * var(--i)));
    transition: transform var(--t-slow) var(--ease-out);
  }
  button {
    min-width: 0;
    border: 0;
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--c-mute);
    font-size: var(--fs-md);
    font-weight: var(--fw-medium);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 var(--s-2);
  }
  button:hover:not(:disabled):not(.on) { color: var(--c-ink); }
  button.on { color: var(--c-ink); font-weight: var(--fw-semibold); }
  button:disabled { color: var(--c-disabled); }
  .seg[aria-disabled='true'] .thumb { box-shadow: 0 0 0 1px var(--c-disabled); }
  button:focus-visible { box-shadow: var(--focus-ring); }
  @media (forced-colors: active) {
    .seg { border: 1px solid ButtonText; }
    .thumb { display: none; }
    button.on { background: Highlight; color: HighlightText; forced-color-adjust: none; }
    button:disabled { color: GrayText; }
  }
</style>

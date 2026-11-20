<!-- Button: the one push button. primary = accent pill ("Save"), dark = ink pill ("Done"), soft = well pill
     ("Add a press"), ghost = transparent and inherits colour (works on the dark save bar), text = muted text
     button ("Clear mapping"). `kbd` adds a shortcut hint after the label; `el` exposes the element as an anchor.
     Extra attributes (aria-expanded, aria-haspopup, id, data-*) are passed to the <button>. -->
<script lang="ts" module>
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  export type ButtonVariant = 'primary' | 'dark' | 'soft' | 'ghost' | 'text';
  export interface ButtonProps extends Omit<HTMLButtonAttributes, 'children' | 'onclick' | 'type'> {
    variant?: ButtonVariant;
    size?: 'sm' | 'md';
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
    kbd?: string;
    title?: string;
    ariaLabel?: string;
    type?: 'button' | 'submit' | 'reset';
    el?: HTMLButtonElement | null;
    children: Snippet;
  }
</script>

<script lang="ts">
  let {
    variant = 'soft',
    size = 'md',
    disabled = false,
    onclick,
    kbd,
    title,
    ariaLabel,
    type = 'button',
    el = $bindable(null),
    children,
    class: cls = '',
    ...rest
  }: ButtonProps = $props();
</script>

<button
  bind:this={el}
  {...rest}
  {type}
  {title}
  {disabled}
  {onclick}
  aria-label={ariaLabel}
  aria-keyshortcuts={kbd ? kbd.replace('⌘', 'Meta+') : undefined}
  class="btn {variant} {size} {cls}"
>
  <span class="label">{@render children()}</span>
  {#if kbd}<span class="kbd" aria-hidden="true">{kbd}</span>{/if}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--s-2);
    flex: none;
    height: 36px;
    padding: 0 var(--s-4);
    border: 0;
    border-radius: var(--r-pill);
    font-size: var(--fs-md);
    font-weight: var(--fw-semibold);
    line-height: 1;
    white-space: nowrap;
    background: transparent;
    transition: transform var(--t-fast) var(--ease-out), opacity var(--t-fast) var(--ease-out);
  }
  .btn.sm { height: 28px; padding: 0 var(--s-3); }
  .btn:active:not(:disabled) { transform: scale(0.97); }
  /* Disabled: a quiet well with text that still reads (≥ 3:1), whatever the variant. */
  .btn:disabled:not(.text):not(.ghost) { background: var(--c-well); color: var(--c-disabled); }
  .btn.text:disabled, .btn.ghost:disabled { color: var(--c-disabled); }
  .btn.ghost:disabled { opacity: 0.7; }

  .primary { background: var(--c-accent); color: var(--c-accent-ink); }
  .primary:hover:not(:disabled), .primary:global(.is-hover) { background: var(--c-accent-hover); }

  .dark { background: var(--c-ink); color: var(--c-white); }
  .dark:hover:not(:disabled), .dark:global(.is-hover) { background: var(--c-ink-hover); }

  .soft { background: var(--c-well); color: var(--c-ink); }
  .soft:hover:not(:disabled), .soft:global(.is-hover) { background: var(--c-well-hover); }

  .ghost { color: inherit; font-weight: var(--fw-semibold); }
  .ghost:hover:not(:disabled), .ghost:global(.is-hover) {
    background: color-mix(in srgb, currentColor 10%, transparent);
  }

  .text {
    height: 28px;
    padding: 0 6px;
    margin: 0 -6px; /* text lines up with its column; the padding only gives the focus ring room */
    border-radius: var(--r-8);
    color: var(--c-mute);
    font-weight: var(--fw-medium);
  }
  .text:hover:not(:disabled), .text:global(.is-hover) { color: var(--c-ink); }
  .text:active:not(:disabled) { transform: none; }

  @media (forced-colors: active) {
    .btn:not(.text) { border: 1px solid ButtonText; }
    .btn:disabled { border-color: GrayText; color: GrayText; }
  }

  .label { display: inline-flex; align-items: center; gap: var(--s-1); }
  .kbd { font-weight: var(--fw-medium); letter-spacing: 0.04em; opacity: 0.9; }
</style>

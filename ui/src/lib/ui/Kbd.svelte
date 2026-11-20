<!-- Kbd: a small key cap for shortcut hints in text (⌘K, Esc). Inherits size from the surrounding text;
     `tone="dark"` for use on ink surfaces. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children, tone = 'light' }: { children: Snippet; tone?: 'light' | 'dark' } = $props();
</script>

<kbd class={tone}>{@render children()}</kbd>

<style>
  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.6em;
    height: 1.55em;
    padding: 0 0.4em;
    border-radius: 6px;
    font: inherit;
    font-size: 0.9em;
    font-weight: var(--fw-medium);
    line-height: 1;
    vertical-align: 0.05em;
    white-space: nowrap;
  }
  .light { background: var(--c-well); color: var(--c-ink); box-shadow: inset 0 -1px 0 var(--c-track); }
  .dark { background: rgba(255, 255, 255, 0.14); color: var(--c-white); }
</style>

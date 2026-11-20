<!-- Row: a label (and optional hint) on the left, any content on the right, on the panels' 48 px rhythm.
     Pass `for` to tie the label to a control in `children`; otherwise the label is plain text. -->
<script lang="ts" module>
  import type { Snippet } from 'svelte';
  export interface RowProps {
    label: string;
    hint?: string;
    for?: string;
    children?: Snippet;
  }
</script>

<script lang="ts">
  let { label, hint, for: htmlFor, children }: RowProps = $props();
</script>

<div class="row">
  <div class="text">
    {#if htmlFor}<label class="label" for={htmlFor}>{label}</label>{:else}<span class="label">{label}</span>{/if}
    {#if hint}<span class="hint">{hint}</span>{/if}
  </div>
  {#if children}<div class="end">{@render children()}</div>{/if}
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
    min-height: 48px;
  }
  .text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .label { font-size: var(--fs-lg); color: var(--c-ink); }
  .hint { font-size: var(--fs-sm); color: var(--c-mute); }
  .end { display: flex; align-items: center; gap: var(--s-2); flex: none; }
</style>

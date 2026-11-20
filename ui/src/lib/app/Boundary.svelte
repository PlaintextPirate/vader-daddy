<!-- An error boundary for one top-level region (stage, inspector, a view, the palette). A crash inside shows a calm
     message with "Try again" in its place and is recorded in the debug log with the region's name; the rest of
     the window keeps working. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Button } from '$lib/ui';
  import { copy } from '$lib/copy';
  import { log } from '$lib/stores/debug';

  let { name, children }: { name: string; children: Snippet } = $props();

  function report(e: unknown) {
    log.add('error', `${name}: ${e instanceof Error ? e.message : String(e)}`, e instanceof Error ? e.stack : e);
  }
</script>

<svelte:boundary onerror={report}>
  {@render children()}
  {#snippet failed(_error: unknown, reset: () => void)}
    <div class="failed" role="alert">
      <p>{copy.errors.region}</p>
      <Button variant="soft" onclick={reset}>{copy.errors.retry}</Button>
    </div>
  {/snippet}
</svelte:boundary>

<style>
  .failed {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 20;
    display: grid; justify-items: center; gap: var(--s-3); max-width: min(360px, calc(100vw - 32px));
    padding: var(--s-6); border-radius: var(--r-20); background: var(--c-panel); box-shadow: var(--sh-panel);
    color: var(--c-mute); text-align: center;
  }
</style>

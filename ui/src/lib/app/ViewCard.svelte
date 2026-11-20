<!-- The card History and Settings sit in: centred over the stage, same white glass as the inspector, a 28 px title
     row with optional actions and a Done button, and a scrolling body. Esc and Done go back to the controller. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Button } from '$lib/ui';
  import { copy } from '$lib/copy';
  import { session } from '$lib/stores/session.svelte';

  let { title, actions, children }: { title: string; actions?: Snippet; children: Snippet } = $props();
  const id = $props.id();
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
</script>

<div class="wrap">
  <section class="card" class:still={reduced} aria-labelledby="{id}-t">
    <header>
      <h1 id="{id}-t">{title}</h1>
      <div class="end">
        {#if actions}{@render actions()}{/if}
        <Button variant="dark" onclick={() => session.openView('main')}>{copy.button.done}</Button>
      </div>
    </header>
    <div class="body">{@render children()}</div>
  </section>
</div>

<style>
  .wrap { position: absolute; inset: 92px var(--gutter, 40px) 24px; display: flex; justify-content: center; align-items: flex-start; pointer-events: none; }
  .card {
    pointer-events: auto; display: flex; flex-direction: column; width: min(800px, 100%); max-height: 100%;
    border-radius: var(--r-28); background: var(--c-panel); box-shadow: var(--sh-panel);
    -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px);
    animation: rise var(--t-slow) var(--ease-out) both;
  }
  .card.still { animation: none; }
  header { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); flex-wrap: wrap; padding: 28px var(--s-8) var(--s-4); }
  h1 { font-size: var(--fs-xl); font-weight: var(--fw-bold); letter-spacing: -0.01em; }
  .end { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; }
  .body { min-height: 0; overflow: auto; padding: var(--s-2) var(--s-8) var(--s-8); }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  @media (max-width: 1000px) { .wrap { --gutter: 16px; } }
</style>

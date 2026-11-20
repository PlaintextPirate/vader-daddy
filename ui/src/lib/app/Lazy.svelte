<!-- Renders a component loaded on first use (its own chunk), so views the user may never open stay out of the
     first download. A failed load throws into the surrounding error boundary, which offers "Try again". -->
<script lang="ts" generics="P extends Record<string, unknown>">
  import type { Component } from 'svelte';

  let { load, props }: { load: () => Promise<{ default: Component<P> }>; props: P } = $props();
  let Comp = $state<Component<P> | null>(null);
  let failed = $state<unknown>(null);

  $effect(() => {
    let live = true;
    load().then((m) => { if (live) Comp = m.default; }, (e) => { if (live) failed = e; });
    return () => { live = false; };
  });
  $effect(() => { if (failed) throw failed; });
</script>

{#if Comp}<Comp {...props} />{/if}

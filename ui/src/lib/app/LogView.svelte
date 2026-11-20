<!-- The debug log, rendered cheaply: one <pre> with the newest 200 lines, refreshed at most once a frame. -->
<script lang="ts">
  import { log } from '$lib/stores/debug';
  import { copy } from '$lib/copy';

  const LINES = 200;
  let text = $state(log.text(LINES));
  let pre = $state<HTMLPreElement | null>(null);

  $effect(() => {
    let raf = 0;
    const off = log.subscribe(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        // Keep the view pinned to the end only when the reader is already there.
        const atEnd = !!pre && pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 8;
        text = log.text(LINES);
        if (atEnd) queueMicrotask(() => pre && (pre.scrollTop = pre.scrollHeight));
      });
    });
    return () => { off(); cancelAnimationFrame(raf); };
  });
  $effect(() => { if (pre) pre.scrollTop = pre.scrollHeight; });
</script>

{#if text}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrolling region must take focus to scroll by keyboard) -->
  <pre bind:this={pre} class="log selectable" tabindex="0" aria-label={copy.settings.log}>{text}</pre>
{:else}
  <p class="empty">{copy.settings.logEmpty}</p>
{/if}

<style>
  .log {
    height: 240px; margin: 0; padding: var(--s-3) var(--s-4); overflow: auto; border-radius: var(--r-12);
    background: var(--c-well); font: 12.5px/1.55 var(--font-mono); white-space: pre; color: var(--c-ink);
    contain: strict;
  }
  .empty { color: var(--c-mute); }
</style>

<!-- Panel: the inspector card (376 px, radius 28, translucent white, blurred backdrop). Title row with a 28 px
     bold heading and a dark "Done" button that calls `onclose`; optional `tabs` under the title; scrolling body.
     It enters with a short fade and 12 px slide (CSS, so reduced motion turns it off). Esc is the app's job. -->
<script lang="ts" module>
  import type { Snippet } from 'svelte';
  export interface PanelProps {
    title: string;
    onclose: () => void;
    children?: Snippet;
    tabs?: Snippet;
    /** Stays at the bottom of the panel while the body scrolls. */
    footer?: Snippet;
    doneLabel?: string;
  }
</script>

<script lang="ts">
  import { copy } from '$lib/copy';
  import Button from './Button.svelte';

  let { title, onclose, children, tabs, footer, doneLabel = copy.button.done }: PanelProps = $props();
  const id = $props.id();
  // A visible edge under the header once the body scrolls (content passes under it), and a fade at the bottom
  // while there is more below.
  let body = $state<HTMLElement | null>(null);
  let top = $state(false);
  let more = $state(false);
  function measure() {
    if (!body) return;
    top = body.scrollTop > 1;
    more = body.scrollTop + body.clientHeight < body.scrollHeight - 1;
  }
  $effect(() => {
    if (!body) return;
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    for (const c of body.children) ro.observe(c);
    measure();
    return () => ro.disconnect();
  });
</script>

<section class="panel" aria-labelledby="{id}-t">
  <header>
    <h2 id="{id}-t" tabindex="-1">{title}</h2>
    <Button variant="dark" onclick={onclose}>{doneLabel}</Button>
  </header>
  {#if tabs}<div class="tabs">{@render tabs()}</div>{/if}
  <div class="body" class:top class:more bind:this={body} onscroll={measure}>{@render children?.()}</div>
  {#if footer}<div class="foot">{@render footer()}</div>{/if}
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    width: 376px;
    max-width: 100%;
    max-height: 100%;
    border-radius: var(--r-28);
    background: var(--c-panel);
    -webkit-backdrop-filter: blur(24px) saturate(1.2);
    backdrop-filter: blur(24px) saturate(1.2);
    box-shadow: var(--sh-panel), inset 0 0 0 1px rgba(255, 255, 255, 0.7);
    animation: enter var(--t-slow) var(--ease-out) both;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    padding: 27px var(--s-6) 0;
    min-height: 63px;
  }
  h2 {
    min-width: 0;
    font-size: var(--fs-xl);
    font-weight: var(--fw-bold);
    letter-spacing: -0.01em;
    line-height: 36px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  h2:focus-visible { box-shadow: none; outline: 2px solid var(--c-ink); outline-offset: 2px; border-radius: 4px; }
  .tabs { padding: 21px var(--s-6) 0; }
  .body {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: 26px var(--s-6) var(--s-6);
    border-top: 1px solid transparent;
    transition: border-color var(--t-fast);
  }
  .body.top { border-top-color: var(--c-line); }
  .foot { flex: none; padding: var(--s-4) var(--s-6) var(--s-6); border-top: 1px solid var(--c-line); }
  .body.more { mask-image: linear-gradient(to bottom, #000 calc(100% - 28px), transparent); }
  /* Short windows: less air, so more of a panel fits before it scrolls. */
  @media (max-height: 760px) {
    header { padding-top: 18px; min-height: 54px; }
    .tabs { padding-top: 14px; }
    .body { padding-top: 16px; padding-bottom: 18px; }
  }
  @keyframes enter {
    from { opacity: 0; transform: translateX(12px); }
    to { opacity: 1; transform: none; }
  }
</style>

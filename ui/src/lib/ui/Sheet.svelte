<!-- Sheet: a modal card over a blurred scrim (the script editor). Title row: 28 px heading, the `header` snippet,
     then a dark Done button. Focus is trapped and restored on close; Esc, Done and a click on the scrim set
     `open = false` and call `onclose` (Esc through the layer stack, so a popover inside closes first). The card's top
     is pinned (`top`, default about a fifth of the window) and it grows downward, so editing never makes it jump.
     Making the rest of the page `inert` is the app's job. -->
<script lang="ts" module>
  import type { Snippet } from 'svelte';
  export interface SheetProps {
    open: boolean;
    title: string;
    onclose?: () => void;
    header?: Snippet;
    /** Replaces the plain title text inside the heading (e.g. a click-to-rename name); `title` stays the fallback. */
    titleContent?: Snippet;
    children: Snippet;
    doneLabel?: string;
    /** Distance from the window top to the card (CSS length). */
    top?: string;
  }
</script>

<script lang="ts">
  import { copy } from '$lib/copy';
  import Button from './Button.svelte';
  import { portal, trapFocus } from './focus';
  import { pushLayer } from './layers';

  let {
    open = $bindable(false), title, onclose, header, titleContent, children, doneLabel = copy.button.done,
    top = 'clamp(24px, 19vh, 170px)'
  }: SheetProps = $props();
  const id = $props.id();

  function close() {
    open = false;
    onclose?.();
  }
  $effect(() => {
    if (open) return pushLayer({ escape: close });
  });
</script>

{#if open}
  <div class="layer" use:portal style:padding-top={top}>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="scrim" onclick={close}></div>
    <div
      class="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="{id}-t"
      tabindex="-1"
      use:trapFocus
    >
      <header>
        <h2 id="{id}-t">{#if titleContent}{@render titleContent()}{:else}{title}{/if}</h2>
        <div class="end">
          {#if header}{@render header()}{/if}
          <Button variant="dark" onclick={close}>{doneLabel}</Button>
        </div>
      </header>
      <div class="body">{@render children()}</div>
    </div>
  </div>
{/if}

<style>
  .layer {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    justify-items: center;
    align-items: start;
    padding: var(--s-6);
  }
  .scrim {
    position: absolute;
    inset: 0;
    background: var(--c-scrim);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    animation: fade var(--t-med) var(--ease-out) both;
  }
  .sheet {
    position: relative;
    display: flex;
    flex-direction: column;
    width: min(960px, 100%);
    max-height: 100%;
    min-height: 0;
    border-radius: var(--r-28);
    background: var(--c-white);
    box-shadow: var(--sh-sheet);
    animation: rise var(--t-slow) var(--ease-out) both;
  }
  .sheet:focus-visible { box-shadow: var(--sh-sheet); }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
    padding: 34px var(--s-10) 0;
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
  .end { display: flex; align-items: center; gap: var(--s-3); flex: none; }
  .body { min-height: 0; overflow: auto; padding: var(--s-8) var(--s-10) var(--s-10); }
  @keyframes fade { from { opacity: 0; } }
  @keyframes rise {
    from { opacity: 0; transform: translateY(12px) scale(0.99); }
    to { opacity: 1; transform: none; }
  }
</style>

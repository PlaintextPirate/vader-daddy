<script lang="ts">
  import { fly } from 'svelte/transition';
  import { Panel, Button } from '$lib/ui';
  import { copy } from '$lib/copy';
  import { log } from '$lib/stores/debug';
  import { session } from '$lib/stores/session.svelte';
  import type { Component } from 'svelte';
  import { panelFor, type PanelProps } from './panels';
  import { unsavedCount } from './actions.svelte';
  import { profile } from '$lib/stores/profile.svelte';
  import { restoreFocus } from './focusTarget';

  // Hosts the panel for the current selection: lazy-loaded, inside an error boundary so a broken panel shows a
  // friendly message instead of taking the window down.
  const target = $derived(panelFor(session.selection));
  let attempt = $state(0);
  let Comp = $state<Component<PanelProps> | null>(null);
  let loadFailed = $state(false);

  $effect(() => {
    const t = target;
    void attempt;
    Comp = null;
    loadFailed = false;
    if (!t) return;
    let current = true;
    t.load().then(
      (m) => { if (current) Comp = m.default; },
      (e) => { if (current) { report(e); loadFailed = true; } }
    );
    return () => { current = false; };
  });
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const close = () => session.select(null);
  let aside = $state<HTMLElement | null>(null);
  // Below the overlay width the save bar docks under the inspector: the inspector ends above it.
  const barShown = $derived(unsavedCount() > 0 || !!profile.error);

  // Focus: a panel that opens takes it on its heading (its controls come next in tab order); when the panel
  // closes, focus goes back to the part (or chip) it belonged to, unless it already went somewhere on purpose.
  let prev: typeof session.selection = null;
  $effect(() => {
    const sel = session.selection;
    const was = prev;
    prev = sel;
    if (!sel && was) restoreFocus({ sel: was, within: aside });
  });
  $effect(() => {
    if (!Comp || !aside) return;
    void target?.key;
    const el = aside;
    requestAnimationFrame(() => el.querySelector<HTMLElement>('h2[tabindex]')?.focus({ preventScroll: true }));
  });
  function report(e: unknown) { log.add('error', `panel ${target?.key}: ${e instanceof Error ? e.message : String(e)}`, e); }
</script>

{#if target}
  <aside bind:this={aside} class="inspector" class:above-bar={barShown} transition:fly={{ x: 24, duration: reduced ? 0 : 220 }}>
    {#key target.key}
      <svelte:boundary onerror={report}>
        {#if Comp}
          <Comp {...target.props} />
        {:else if loadFailed}
          {@render failedPanel(() => attempt++)}
        {/if}
        {#snippet failed(_error: unknown, reset: () => void)}
          {@render failedPanel(reset)}
        {/snippet}
      </svelte:boundary>
    {/key}
  </aside>
{/if}

{#snippet failedPanel(retry: () => void)}
  <Panel title="" onclose={close}>
    <p class="msg">{copy.errors.panel}</p>
    <Button variant="soft" onclick={retry}>{copy.errors.retry}</Button>
  </Panel>
{/snippet}

<style>
  .inspector {
    position: fixed;
    top: 108px;
    right: var(--edge);
    bottom: 24px;
    width: 376px;
    max-width: calc(100vw - 32px);
    display: flex;
    align-items: flex-start;
    z-index: 10;
    pointer-events: none;
  }
  .inspector > :global(*) { pointer-events: auto; }
  @media (max-width: 1179px) { .inspector.above-bar { bottom: 92px; } }
  /* Short windows: start right under the top bar. */
  @media (max-height: 760px) { .inspector { top: 84px; } }
  .msg { margin-bottom: var(--s-4); color: var(--c-mute); }
</style>

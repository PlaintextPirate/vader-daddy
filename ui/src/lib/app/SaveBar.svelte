<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { Button } from '$lib/ui';
  import { copy, unsaved } from '$lib/copy';
  import { device } from '$lib/device/device.svelte';
  import { profile } from '$lib/stores/profile.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { unsavedCount, saveAll, discardAll } from './actions.svelte';
  import ChangesPopover from './ChangesPopover.svelte';

  const count = $derived(unsavedCount());
  const error = $derived(profile.error);
  const shown = $derived(count > 0 || !!error);
  const busy = $derived(!!device.busy);
  const saving = $derived(session.writing);
  let bar = $state<HTMLDivElement | null>(null);
  let countBtn = $state<HTMLButtonElement | null>(null);

  // While the bar leaves, its text stays as it was (never "0 unsaved changes").
  let label = $state(unsaved(0));
  $effect(() => { if (count > 0) label = unsaved(count); });

  const toggle = () => (session.menu = session.menu === 'changes' ? null : 'changes');

  // Toasts sit above the bar while it shows (they would cover Save otherwise), at the default height otherwise.
  $effect(() => {
    const root = document.documentElement;
    if (!shown || !bar) { root.style.removeProperty('--toast-bottom'); return; }
    const el = bar;
    const place = () => {
      const r = el.getBoundingClientRect();
      root.style.setProperty('--toast-bottom', `${Math.max(24, Math.round(window.innerHeight - r.top + 12))}px`);
    };
    // After the bar's entry transition has moved it into place.
    const t = setTimeout(place, 260);
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    window.addEventListener('resize', place);
    return () => { clearTimeout(t); ro.disconnect(); window.removeEventListener('resize', place); root.style.removeProperty('--toast-bottom'); };
  });
</script>

<div bind:this={bar} class="bar" class:shown inert={!shown} aria-hidden={!shown} role="region" aria-label={copy.save.header}>
  {#if busy}<i class="progress" aria-hidden="true"></i>{/if}
  <button bind:this={countBtn} class="count" onclick={toggle} disabled={!count}
    aria-expanded={session.menu === 'changes'} aria-haspopup="dialog">
    <span>{label}</span>
    <span class="chev" class:up={session.menu === 'changes'} aria-hidden="true"><ChevronDown size={16} strokeWidth={2.4} /></span>
  </button>
  <!-- The count, announced politely when it changes (the button's own name is its visible text). -->
  <span class="sr-only" role="status">{shown ? label : ''}</span>
  <span class="grow"></span>
  <Button variant="text" class="discard" onclick={discardAll} disabled={busy}>{copy.save.discard}</Button>
  {#if error}
    <span class="err" role="alert">{error.message}</span>
  {:else}
    <Button variant="primary" class={saving ? 'saving' : ''} onclick={saveAll} disabled={!saving && (busy || !count)}
      aria-disabled={saving || undefined} kbd={saving ? undefined : copy.save.cmdS}>
      {saving ? copy.save.savingButton : copy.save.save}
    </Button>
  {/if}
</div>

{#if count}<ChangesPopover anchor={bar} trigger={countBtn} />{/if}

<style>
  .bar {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    width: max-content;
    min-width: 420px;
    max-width: calc(100vw - 32px);
    min-height: 56px;
    padding: var(--s-2) var(--s-2) var(--s-2) var(--s-6);
    border-radius: var(--r-20);
    background: var(--c-ink);
    color: var(--c-white);
    box-shadow: var(--sh-bar);
    overflow: hidden;
    opacity: 0;
    transform: translateY(16px);
    transition: opacity var(--t-slow) var(--ease-out), transform var(--t-slow) var(--ease-out);
  }
  .bar.shown { opacity: 1; transform: none; }
  .count {
    display: inline-flex; align-items: center; gap: 6px; padding: 0 4px; margin-left: -4px; border: 0; background: none;
    color: inherit; font-weight: var(--fw-semibold); min-height: 32px; border-radius: var(--r-8); white-space: nowrap;
  }
  .count:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--c-ink), 0 0 0 4px var(--c-white); }
  .chev { display: inline-flex; transition: transform var(--t-med) var(--ease-out); }
  .chev.up { transform: rotate(180deg); }
  .grow { flex: 1; }
  /* 20 px between Discard and Save, as in the mock-up (the text button's own 6 px padding counts). */
  .bar :global(.discard) { color: var(--c-white); margin-right: 12px; }
  .bar :global(.discard:focus-visible), .bar :global(.btn.primary:focus-visible) { box-shadow: 0 0 0 2px var(--c-ink), 0 0 0 4px var(--c-white); }
  .bar :global(.discard:disabled) { color: rgba(255, 255, 255, 0.6); }
  /* Saving: still clearly the Save button, just not clickable. */
  .bar :global(.btn.primary.saving) { cursor: progress; }
  .bar.bar :global(.btn.primary:disabled) { background: rgba(255, 255, 255, 0.14); color: rgba(255, 255, 255, 0.72); }
  .err { color: #ffb4ab; font-size: var(--fs-sm); max-width: 220px; }
  .progress { position: absolute; left: 0; right: 0; top: 0; height: 2px; overflow: hidden; }
  .progress::after {
    content: ''; position: absolute; inset: 0; width: 40%; background: var(--c-accent);
    animation: slide 1.1s var(--ease-out) infinite;
  }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
  @media (prefers-reduced-motion: reduce) { .bar { transition: opacity var(--t-fast); transform: none; } .progress::after { animation: none; width: 100%; opacity: 0.6; } }
  @media (forced-colors: active) { .bar { border: 1px solid CanvasText; } }
</style>

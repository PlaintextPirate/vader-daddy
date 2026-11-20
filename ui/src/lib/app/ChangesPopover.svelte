<script lang="ts">
  import { Popover } from '$lib/ui';
  import { copy, fmt } from '$lib/copy';
  import { profile } from '$lib/stores/profile.svelte';
  import { lighting } from '$lib/stores/lighting.svelte';
  import { session } from '$lib/stores/session.svelte';

  import { restoreFocus } from './focusTarget';

  let { anchor, trigger }: { anchor: HTMLElement | null; trigger: HTMLElement | null } = $props();

  const items = $derived([
    ...profile.changes.map((c) => ({ ...c, undo: () => profile.undo(c.id), key: `p:${c.id}` })),
    ...lighting.changes.map((c) => ({ ...c, undo: () => lighting.undo(c.id), key: `l:${c.id}` }))
  ]);

  // Closes by itself once the last change is undone.
  $effect(() => {
    if (!items.length && session.menu === 'changes') { session.menu = null; restoreFocus({ sel: session.selection }); }
  });
</script>

<Popover
  bind:open={() => session.menu === 'changes', (v) => (session.menu = v ? 'changes' : null)}
  {anchor} {trigger} placement="top" tone="dark" label={copy.save.header}
>
  <div class="list">
    <h3>{copy.save.header}</h3>
    <ul>
      {#each items as c (c.key)}
        <li>
          <span class="what">
            <b>{c.label}</b>
            {#if c.from || c.to}<span class="num">{c.from} → {c.to}</span>{/if}
          </span>
          <button type="button" class="undo" onclick={c.undo} aria-label={fmt(copy.save.undoOne, { change: c.label })}>{copy.save.undo}</button>
        </li>
      {/each}
    </ul>
  </div>
</Popover>

<style>
  /* Same width as the save bar: cancel the popover's own padding. */
  .list { width: 420px; box-sizing: border-box; max-width: calc(100vw - 32px); margin: calc(-1 * var(--s-5)); padding: var(--s-4) var(--s-4) var(--s-2) var(--s-6); }
  h3 { font-size: var(--fs-sm); font-weight: var(--fw-medium); opacity: 0.75; margin-bottom: var(--s-2); }
  ul { max-height: 50vh; overflow-y: auto; }
  li { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); min-height: 44px; }
  li + li { border-top: 1px solid rgba(255, 255, 255, 0.08); }
  .what { display: flex; flex-wrap: wrap; gap: 0 var(--s-2); font-weight: var(--fw-semibold); }
  .what b { font-weight: var(--fw-semibold); }
  /* White text on a white-12% pill, as in the mock-up. */
  .undo {
    flex: none; height: 28px; padding: 0 var(--s-3); border: 0; border-radius: var(--r-pill);
    background: rgba(255, 255, 255, 0.12); color: var(--c-white); font-size: var(--fs-md); font-weight: var(--fw-semibold);
    transition: background var(--t-fast), transform var(--t-fast) var(--ease-out);
  }
  .undo:hover { background: rgba(255, 255, 255, 0.2); }
  .undo:active { transform: scale(0.97); }
  .undo:focus-visible { box-shadow: 0 0 0 2px var(--c-ink), 0 0 0 4px var(--c-white); }
</style>

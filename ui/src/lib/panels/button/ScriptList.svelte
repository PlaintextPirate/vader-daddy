<!-- ScriptList: the script library as rows (name, chevron). The row on this button is selected (ink text, a
     check, a subtle well background, inside the content column) with aria-current;
     clicking a row assigns it, clicking it again (or Enter twice) or its chevron opens the script sheet. A script on
     the controller that is not in the library gets its own row with "Keep in library". -->
<script lang="ts">
  import { Button } from '$lib/ui';
  import { copy, fmt } from '$lib/copy';
  import type { Script } from '$lib/protocol/bindings';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Check from '@lucide/svelte/icons/check';

  let {
    list,
    currentId,
    unknown,
    onassign,
    onopen,
    onkeep,
    onnew
  }: {
    list: Script[];
    currentId: string | null;
    unknown: boolean;
    onassign: (s: Script) => void;
    onopen: (id: string) => void;
    onkeep: () => void;
    onnew: () => void;
  } = $props();

  function choose(s: Script) {
    if (s.id === currentId) onopen(s.id);
    else onassign(s);
  }
</script>

<ul class="list" aria-label={copy.button.scripts}>
  {#if unknown}
    <li class="row on unknown" aria-current="true">
      <span class="name"><Check size={16} strokeWidth={2.5} aria-hidden="true" /><span class="t">{copy.button.scriptOnController}</span></span>
      <Button variant="text" size="sm" onclick={onkeep}>{copy.button.keep}</Button>
    </li>
  {/if}
  {#each list as s (s.id)}
    {@const on = s.id === currentId}
    <li class="row" class:on>
      <button type="button" class="name" aria-current={on ? 'true' : undefined} onclick={() => choose(s)}>
        {#if on}<Check size={16} strokeWidth={2.5} aria-hidden="true" />{/if}<span class="t">{s.name}</span>
      </button>
      <button
        type="button"
        class="open"
        aria-label={fmt(copy.button.openScript, { name: s.name })}
        onclick={() => onopen(s.id)}
      >
        <ChevronRight size={16} strokeWidth={2.25} aria-hidden="true" />
      </button>
    </li>
  {/each}
</ul>
<div class="new"><Button variant="soft" onclick={onnew}>{copy.button.newScript}</Button></div>

<style>
  .list { list-style: none; margin: 0; padding: 0; }
  .row {
    display: flex;
    align-items: center;
    min-height: 40px;
    border-radius: var(--r-12);
    transition: background-color var(--t-fast) var(--ease-out);
  }
  .row:hover:not(.on) { background: var(--c-well); }
  .row.on { background: var(--c-well); color: var(--c-ink); font-weight: var(--fw-semibold); }
  .name {
    flex: 1;
    min-width: 0;
    height: 40px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--r-12);
    background: transparent;
    color: inherit;
    font-size: var(--fs-lg);
    text-align: left;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name :global(svg) { flex: none; }
  .unknown { padding-right: 10px; }
  .unknown :global(.btn) { margin: 0; }
  .open {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    margin-right: 2px;
    border: 0;
    border-radius: var(--r-pill);
    background: transparent;
    color: inherit;
  }
  .open:hover { background: color-mix(in srgb, currentColor 12%, transparent); }
  .row:focus-within .name:focus-visible, .open:focus-visible { box-shadow: var(--focus-ring); }
  @media (forced-colors: active) { .row.on { outline: 2px solid Highlight; } }
  .new { margin-top: var(--s-2); }
</style>

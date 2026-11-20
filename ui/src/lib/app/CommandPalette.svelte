<!-- ⌘K: a centred search box over the window. Index: parts, gyro, vibration, scripts, controller-wide settings,
     views, profile slots and a few actions. ↑/↓ move, Enter runs, Esc closes. Matching lives in search.ts. -->
<script lang="ts">
  import SearchIcon from '@lucide/svelte/icons/search';
  import { trapFocus, portal } from '$lib/ui';
  import { pushLayer } from '$lib/ui/layers';
  import { copy, slotLabel } from '$lib/copy';
  import { PARTS, PART_ORDER } from '$lib/controller/parts';
  import { device } from '$lib/device/device.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { scripts } from '$lib/stores/scripts.svelte';
  import { history } from '$lib/stores/history.svelte';
  import { hardware } from './hardware.svelte';
  import { search } from './search';
  import { saveAll, discardAll, unsavedCount, requestSwitch } from './actions.svelte';

  interface Item { id: string; label: string; group: string; keywords?: string[]; run: () => void }
  const G = copy.search.groups;
  const id = $props.id();

  const items = $derived.by((): Item[] => {
    const connected = device.status === 'connected';
    const out: Item[] = [];
    for (const p of PART_ORDER) {
      const part = PARTS[p];
      if (part.inspector === 'none') continue;
      const keywords = [part.label, ...(p === 'light' ? ['LED', 'colour', 'lighting'] : [])].filter(Boolean);
      out.push({ id: `part-${p}`, label: part.name, group: G.parts, keywords, run: () => session.select(p) });
    }
    out.push({ id: 'gyro', label: copy.gyro.title, group: G.parts, keywords: ['motion', 'aim'], run: () => session.select('gyro') });
    out.push({ id: 'vibration', label: copy.vibration.title, group: G.parts, keywords: ['rumble', 'motors'], run: () => session.select('vibration') });
    for (const s of scripts.list) out.push({ id: `script-${s.id}`, label: s.name, group: G.scripts, keywords: ['combo'], run: () => session.openSheet(s.id) });
    const opts = Object.entries(copy.settings.options).map(([key, o]) => ({ key, name: o.name }));
    for (const s of hardware.settings ?? []) if (!opts.some((o) => o.key === s.key)) opts.push({ key: s.key, name: s.name });
    opts.push({ key: 'sleep', name: copy.settings.sleepAfter });
    for (const o of opts) out.push({ id: `set-${o.key}`, label: o.name, group: G.settings, run: () => { session.openView('settings'); hardware.focus = o.key; } });
    out.push({ id: 'history', label: copy.history.title, group: G.views, keywords: ['backup', 'restore'], run: () => session.openView('history') });
    out.push({ id: 'settings', label: copy.settings.title, group: G.views, keywords: ['diagnostics', 'log'], run: () => session.openView('settings') });
    if (connected) for (const s of [0, 1, 2, 3]) out.push({ id: `slot-${s}`, label: slotLabel(s), group: G.profiles, run: () => requestSwitch(s) });
    if (unsavedCount()) {
      out.push({ id: 'save', label: copy.save.save, group: G.actions, run: () => saveAll() });
      out.push({ id: 'discard', label: copy.save.discard, group: G.actions, run: discardAll });
    }
    if (connected) out.push({ id: 'backup', label: copy.history.backup, group: G.actions, run: () => history.backupNow() });
    return out;
  });

  let query = $state('');
  let active = $state(0);
  let list = $state<HTMLUListElement | null>(null);
  const results = $derived(search(items, query, 40));
  const optId = (i: number) => `${id}-o${i}`;

  $effect(() => { void query; active = 0; });
  $effect(() => { list?.querySelector(`#${CSS.escape(optId(active))}`)?.scrollIntoView({ block: 'nearest' }); });

  const close = () => (session.palette = false);
  // The top-most layer while open: Esc closes the palette before any menu or sheet under it.
  $effect(() => pushLayer({ escape: close }));
  function run(item: Item | undefined) {
    if (!item) return;
    close();
    item.run();
  }
  function onkeydown(e: KeyboardEvent) {
    const n = results.length;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); active = (active + 1) % n; }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); active = (active - 1 + n) % n; }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[active]); }
  }
</script>

<div class="layer" use:portal>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={close}></div>
  <div class="box" role="dialog" aria-modal="true" aria-label={copy.search.label} use:trapFocus>
    <div class="field">
      <SearchIcon size={18} strokeWidth={2.2} aria-hidden="true" />
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="text" bind:value={query} {onkeydown} autofocus spellcheck="false" autocomplete="off"
        placeholder={copy.search.placeholder} aria-label={copy.search.placeholder}
        role="combobox" aria-expanded={results.length > 0} aria-controls="{id}-list" aria-autocomplete="list"
        aria-activedescendant={results.length ? optId(active) : undefined}
      />
    </div>
    {#if results.length}
      <ul bind:this={list} id="{id}-list" role="listbox" aria-label={copy.search.label}>
        {#each results as r, i (r.id)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <li id={optId(i)} role="option" aria-selected={i === active} class:on={i === active}
            onclick={() => run(r)} onpointermove={() => (active = i)}>
            <span class="label">{r.label}</span><span class="group">{r.group}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty" role="status">{copy.search.empty}</p>
    {/if}
  </div>
</div>

<style>
  .layer { position: fixed; inset: 0; z-index: 45; display: flex; justify-content: center; align-items: flex-start; padding: max(12vh, 72px) 16px 16px; }
  .scrim { position: absolute; inset: 0; background: rgba(52, 63, 80, 0.18); animation: fade var(--t-med) var(--ease-out) both; }
  .box {
    position: relative; display: flex; flex-direction: column; width: min(560px, 100%); max-height: min(480px, 100%);
    border-radius: var(--r-20); background: var(--c-white); box-shadow: var(--sh-popover), var(--sh-sheet);
    overflow: hidden; animation: pop var(--t-med) var(--ease-out) both;
  }
  .field { display: flex; align-items: center; gap: var(--s-3); padding: 0 var(--s-5); color: var(--c-mute); border-bottom: 1px solid var(--c-well); }
  input { flex: 1; min-width: 0; height: 56px; border: 0; background: none; font-size: 17px; color: var(--c-ink); }
  input:focus, input:focus-visible { box-shadow: none; }
  input::placeholder { color: var(--c-mute); }
  ul { overflow-y: auto; padding: var(--s-2); }
  li {
    display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); min-height: 40px;
    padding: 0 var(--s-3); border-radius: var(--r-12); cursor: pointer;
  }
  li.on { background: var(--c-ink); color: var(--c-white); }
  .label { font-weight: var(--fw-medium); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .group { font-size: var(--fs-sm); color: var(--c-mute); flex: none; }
  li.on .group { color: rgba(255, 255, 255, 0.7); }
  .empty { padding: var(--s-5); color: var(--c-mute); }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .scrim, .box { animation: none; } }
</style>

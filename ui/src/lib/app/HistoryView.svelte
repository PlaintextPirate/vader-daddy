<script lang="ts">
  import { Button } from '$lib/ui';
  import { copy, fmt } from '$lib/copy';
  import { device } from '$lib/device/device.svelte';
  import { history, type Backup } from '$lib/stores/history.svelte';
  import { toasts } from '$lib/stores/toasts.svelte';
  import ViewCard from './ViewCard.svelte';
  import { relativeTime, slotList } from './time';
  import { restoreFocus } from './focusTarget';

  const list = $derived([...history.backups].reverse());
  const busy = $derived(!!device.busy);
  const connected = $derived(device.status === 'connected');
  let confirming = $state<string | null>(null);
  let file = $state<HTMLInputElement | null>(null);
  // Relative dates refresh once a minute while the view is open.
  let now = $state(Date.now());
  $effect(() => { const t = setInterval(() => (now = Date.now()), 60_000); return () => clearInterval(t); });

  const absolute = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  function holds(b: Backup) {
    const p = slotList(b.config), l = slotList(b.led);
    if (p === l && p === '1, 2, 3, 4') return copy.history.holdsAll;
    if (p === l && /^\d$/.test(p)) return fmt(copy.history.holdsOne, { n: p });
    return fmt(copy.history.holds, { profiles: p, lighting: l });
  }
  const named = (tpl: string, b: Backup) => fmt(tpl, { time: absolute(b.date) });

  async function restore(b: Backup) {
    const ok = await history.restore(b, { profilesOnly: history.lightingBlocked(b) });
    if (ok) confirming = null;
    // The confirm row (and the button that had focus) is gone: back to this backup's Restore button.
    restoreFocus({ opener: () => document.getElementById(`restore-${b.id}`) });
  }
  function remove(b: Backup) {
    if (confirming === b.id) confirming = null;
    const undo = history.remove(b.id);
    toasts.info(copy.history.deleted, { label: copy.common.undo, run: undo });
  }
  async function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) await history.importFile(f);
  }
</script>

<ViewCard title={copy.history.title}>
  {#snippet actions()}
    <Button variant="soft" onclick={() => file?.click()}>{copy.history.import}</Button>
    <Button variant="soft" onclick={() => history.backupNow()} disabled={busy || !connected}>{copy.history.backup}</Button>
  {/snippet}
  <input bind:this={file} type="file" accept="application/json,.json" hidden onchange={pick} />
  <p class="intro">{copy.history.intro}</p>

  {#if list.length}
    <ul>
      {#each list as b (b.id)}
        <li>
          <div class="row">
            <div class="text">
              <span class="label">{b.label}</span>
              <span class="meta">
                <time datetime={b.date} title={absolute(b.date)}>{relativeTime(b.date, now)}</time>
                · {absolute(b.date)} · {holds(b)}
              </span>
            </div>
            <div class="actions">
              <Button variant="text" size="sm" ariaLabel={named(copy.history.downloadFrom, b)} onclick={() => history.download(b)}>{copy.history.download}</Button>
              <Button variant="text" size="sm" ariaLabel={named(copy.history.deleteFrom, b)} onclick={() => remove(b)}>{copy.history.delete}</Button>
              <Button variant="soft" size="sm" id="restore-{b.id}" ariaLabel={named(copy.history.restoreFrom, b)} aria-expanded={confirming === b.id} disabled={busy || !connected}
                onclick={() => (confirming = confirming === b.id ? null : b.id)}>{copy.history.restore}</Button>
            </div>
          </div>
          {#if confirming === b.id}
            <div class="confirm" role="group" aria-label={copy.history.restore}>
              <p>
                {copy.history.restoreConfirm}
                {#if history.lightingBlocked(b)}<span class="warn">{copy.history.lightingSkipped}</span>{/if}
              </p>
              <div class="buttons">
                <Button variant="text" size="sm" onclick={() => { confirming = null; restoreFocus({ opener: () => document.getElementById(`restore-${b.id}`) }); }}>{copy.common.cancel}</Button>
                <Button variant="dark" size="sm" disabled={busy || !connected} onclick={() => restore(b)}>
                  {history.lightingBlocked(b) ? copy.history.restoreProfilesOnly : copy.history.restore}
                </Button>
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">{copy.history.empty}</p>
  {/if}
</ViewCard>

<style>
  .intro { color: var(--c-mute); margin-bottom: var(--s-3); }
  li { border-top: 1px solid rgba(201, 210, 222, 0.6); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); min-height: 64px; padding: var(--s-2) 0; }
  .text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .label { font-size: var(--fs-lg); font-weight: var(--fw-medium); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: var(--fs-sm); color: var(--c-mute); }
  .actions { display: flex; align-items: center; gap: var(--s-4); flex: none; }
  .confirm {
    display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); flex-wrap: wrap;
    margin: 0 0 var(--s-3); padding: var(--s-3) var(--s-4); border-radius: var(--r-16); background: var(--c-well);
  }
  .confirm p { font-size: var(--fs-sm); max-width: 52ch; }
  .warn { display: block; margin-top: 2px; color: var(--c-error); }
  .buttons { display: flex; gap: var(--s-3); align-items: center; }
  .empty { color: var(--c-mute); padding: var(--s-6) 0; }
  @media (max-width: 760px) { .row { flex-direction: column; align-items: flex-start; } }
</style>

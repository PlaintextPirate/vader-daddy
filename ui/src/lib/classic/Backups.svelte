<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade, fly } from 'svelte/transition';
  import { app, type Backup } from '$lib/classic/state.svelte';

  function download(b: Backup) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }));
    a.download = `vader4pro-${b.date.slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    try { app.importBackup(await f.text()); app.notice = `Imported ${f.name}`; }
    catch (err) { app.error = err instanceof Error ? err.message : String(err); }
  }
</script>

<div class="bar">
  <button class="primary" onclick={async () => { await app.readAll(); app.snapshot('Manual backup (all slots)'); }} disabled={!!app.busy}>
    Back up all slots now
  </button>
  <label class="file">Import… <input type="file" accept="application/json,.json" onchange={importFile} /></label>
</div>
<p class="hint">A backup is also made automatically before every save. They are kept inside this app; download them to keep them safe.</p>

<div class="list">
  {#each [...app.backups].reverse() as b (b.id)}
    <div class="card item" animate:flip={{ duration: 260 }} in:fly={{ y: -10, duration: 220 }} out:fade={{ duration: 140 }}>
      <div>
        <b>{b.label}</b>
        <div class="hint">{new Date(b.date).toLocaleString()} · profiles {Object.keys(b.config).join(', ') || '—'} · lighting {Object.keys(b.led).join(', ') || '—'}</div>
      </div>
      <div class="actions">
        <button onclick={() => download(b)}>Download</button>
        <button onclick={() => app.restore(b)} disabled={!!app.busy || !app.canSaveLighting}>Restore</button>
        <button class="ghost" onclick={() => app.deleteBackup(b.id)}>Delete</button>
      </div>
    </div>
  {:else}
    <p class="hint">No backups yet.</p>
  {/each}
</div>

<style>
  .bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
  .file { border: 1px solid var(--line2); background: var(--raised); border-radius: 8px; padding: 6px 12px; cursor: pointer; transition: border-color var(--fast) ease; }
  .file:hover { border-color: #465064; }
  .file input { display: none; }
  .list { display: grid; gap: 8px; margin-top: 16px; }
  .item { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; transition: border-color var(--fast) ease; }
  .item:hover { border-color: var(--line2); }
  .actions { display: flex; gap: 6px; flex: none; }
</style>

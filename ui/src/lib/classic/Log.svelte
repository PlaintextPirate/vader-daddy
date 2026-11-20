<script lang="ts">
  import { app } from '$lib/classic/state.svelte';
</script>

<div class="card log">
  {#each app.log as e}
    <div class={e.dir}><span>{new Date(e.t).toLocaleTimeString()}</span> <b>{e.dir}</b> {e.text}</div>
  {:else}
    <p class="hint">Nothing yet.</p>
  {/each}
</div>

<style>
  .log { user-select: text; -webkit-user-select: text; font: 12px/1.6 ui-monospace, 'SF Mono', Menlo, monospace; max-height: calc(100vh - 190px); overflow: auto; }
  span { color: var(--dim); }
  b { display: inline-block; width: 44px; font-weight: 500; }
  .tx b { color: var(--acc); }
  .rx b { color: var(--ok); }
  .error { color: var(--err); }
</style>

<!-- TitleEdit: the script name as the sheet heading. Click (or Enter) to rename; Enter commits, Esc cancels,
     blur commits. Names are 1–24 characters; an empty name is ignored. -->
<script lang="ts">
  import { copy } from '$lib/copy';

  let { name, onrename }: { name: string; onrename: (name: string) => void } = $props();

  const MAX = 24;
  let editing = $state(false);
  let draft = $state('');
  let opener: HTMLButtonElement | null = $state(null);

  function start() {
    draft = name;
    editing = true;
  }
  function finish(save: boolean) {
    if (!editing) return;
    editing = false;
    const v = draft.trim().slice(0, MAX);
    if (save && v && v !== name) onrename(v);
    queueMicrotask(() => opener?.focus({ preventScroll: true }));
  }
  function keydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    }
  }
  function focusSelect(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

{#if editing}
  <input
    class="edit"
    aria-label={copy.script.nameLabel}
    maxlength={MAX}
    bind:value={draft}
    onkeydown={keydown}
    onblur={() => finish(true)}
    use:focusSelect
  />
{:else}
  <button bind:this={opener} type="button" class="name" title={copy.script.rename} onclick={start}>{name}</button>
{/if}

<style>
  .name, .edit {
    display: block;
    max-width: min(520px, 50vw);
    height: 40px;
    margin: -2px 0 -2px -8px;
    padding: 0 8px;
    border: 1.5px solid transparent;
    border-radius: var(--r-12);
    background: transparent;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    cursor: text;
  }
  .name:hover { background: var(--c-well); }
  .edit { width: 24ch; border-color: var(--c-ink); background: var(--c-white); }
  .edit:focus { box-shadow: none; }
</style>

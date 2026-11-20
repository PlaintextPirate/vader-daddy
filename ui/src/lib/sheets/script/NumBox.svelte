<!-- NumBox: a label and a small 68×28 typeable millisecond field ("150 ms"). Enter or blur commits the typed
     number, Esc restores, ↑/↓ step by 10. Shows "—" when disabled (nothing selected). -->
<script lang="ts">
  import { parseTyped } from '$lib/ui';

  let {
    label,
    value,
    disabled = false,
    onchange,
    el = $bindable(null)
  }: {
    label: string;
    value: number | null;
    disabled?: boolean;
    onchange: (v: number) => void;
    el?: HTMLInputElement | null;
  } = $props();

  const id = $props.id();
  let focused = $state(false);
  let draft = $state('');
  const shown = $derived(focused ? draft : value === null ? '—' : `${value} ms`);

  function commit() {
    if (!focused) return;
    focused = false;
    const n = parseTyped(draft, { decimal: false, negative: false });
    if (n !== null && n !== value) onchange(n);
  }
  function keydown(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (e.key === 'Enter') {
      commit();
      draft = String(value ?? '');
      focused = true;
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      focused = false;
      e.currentTarget.blur();
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && value !== null) {
      e.preventDefault();
      onchange(value + (e.key === 'ArrowUp' ? 10 : -10));
      queueMicrotask(() => (draft = String(value ?? '')));
    }
  }
</script>

<span class="box" class:disabled>
  <label for={id}>{label}</label>
  <input
    bind:this={el}
    {id}
    class="num"
    type="text"
    inputmode="numeric"
    {disabled}
    value={shown}
    oninput={(e) => (draft = e.currentTarget.value)}
    onfocus={(e) => {
      draft = String(value ?? '');
      focused = true;
      const t = e.currentTarget;
      queueMicrotask(() => t.select());
    }}
    onblur={commit}
    onkeydown={keydown}
  />
</span>

<style>
  .box { display: inline-flex; align-items: center; gap: var(--s-2); }
  label { font-size: var(--fs-md); color: var(--c-mute); }
  input {
    /* Five digits and the unit ("60000 ms") fit without clipping. */
    width: 80px;
    height: 28px;
    padding: 0 4px;
    border: 1.5px solid var(--c-boundary);
    font-variant-numeric: tabular-nums;
    border-radius: var(--r-8);
    background: var(--c-white);
    font-size: var(--fs-md);
    text-align: center;
  }
  input:hover:not(:disabled) { border-color: var(--c-mute); }
  input:focus { border-color: var(--c-ink); box-shadow: none; }
  .disabled label, .disabled input { color: var(--c-disabled); }
  .disabled input { border-color: var(--c-track); background: var(--c-well); }
</style>

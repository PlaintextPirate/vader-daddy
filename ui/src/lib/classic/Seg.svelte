<script lang="ts" generics="T extends string | number">
  // Segmented control whose highlight slides to the chosen option.
  let { options, value = $bindable(), onchange, small = false }:
    { options: { id: T; name: string }[]; value: T; onchange?: (v: T) => void; small?: boolean } = $props();
  const index = $derived(Math.max(0, options.findIndex((o) => o.id === value)));
</script>

<div class="seg" class:small style="--n:{options.length}; --i:{index}" role="radiogroup">
  <i></i>
  {#each options as o}
    <button role="radio" aria-checked={o.id === value} class:active={o.id === value}
      onclick={() => { if (o.id !== value) { value = o.id; onchange?.(o.id); } }}>{o.name}</button>
  {/each}
</div>

<style>
  .seg {
    position: relative; display: inline-grid; grid-template-columns: repeat(var(--n), 1fr); padding: 3px;
    background: var(--bg); border: 1px solid var(--line2); border-radius: 10px;
  }
  i {
    position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / var(--n)); border-radius: 7px;
    background: var(--acc); transform: translateX(calc(var(--i) * 100%)); transition: transform var(--med) var(--ease);
  }
  button {
    position: relative; border: none; background: none; padding: 5px 14px; color: var(--dim); border-radius: 7px;
    transition: color var(--med) ease;
  }
  button:hover:not(:disabled) { background: none; color: var(--fg); }
  button.active, button.active:hover { color: var(--on-acc); font-weight: 600; }
  .small button { padding: 3px 10px; font-size: 12.5px; }
</style>

<script lang="ts">
  // A labelled slider with a filled track and its value on the right.
  let { label, value = $bindable(), min = 0, max = 100, hint = '' }:
    { label: string; value: number; min?: number; max?: number; hint?: string } = $props();
  const pct = $derived(((value - min) / (max - min)) * 100);
</script>

<label class="slider">
  <span class="name">{label}{#if hint}<small class="hint"> {hint}</small>{/if}</span>
  <input type="range" {min} {max} bind:value style="--p:{pct}%" />
  <code>{value}</code>
</label>

<style>
  .slider { display: grid; grid-template-columns: minmax(96px, 0.5fr) 1fr 34px; align-items: center; gap: 12px; min-height: 30px; }
  .name { color: var(--fg); }
  small { font-size: 12px; margin-left: 6px; }
  code { text-align: right; color: var(--fg); font-variant-numeric: tabular-nums; }
  input {
    appearance: none; -webkit-appearance: none; width: 100%; height: 18px; margin: 0; background: none; cursor: pointer;
  }
  input::-webkit-slider-runnable-track {
    height: 4px; border-radius: 99px;
    background: linear-gradient(to right, var(--acc) var(--p), var(--line2) var(--p));
  }
  input::-webkit-slider-thumb {
    -webkit-appearance: none; width: 16px; height: 16px; margin-top: -6px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5); transition: transform 120ms ease, box-shadow 120ms ease;
  }
  input:hover::-webkit-slider-thumb { transform: scale(1.12); }
  input:active::-webkit-slider-thumb { transform: scale(1.2); box-shadow: 0 0 0 6px var(--acc-soft); }
</style>

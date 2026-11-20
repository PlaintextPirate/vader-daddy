<!-- Slider: label left, value right (semi-bold, tabular), a 4 px track with an ink fill and a 22 px white thumb.
     Built on a native range input, so arrows / Page / Home / End and screen readers work as usual. Clicking the
     value swaps in a small numeric field for exact entry: Enter or blur commits (clamped and snapped), Esc cancels. -->
<script lang="ts" module>
  export interface SliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    format?: (v: number) => string;
    oninput?: (v: number) => void;
    marks?: number[];
    disabled?: boolean;
  }
</script>

<script lang="ts">
  import { copy } from '$lib/copy';
  import { parseTyped, snap } from './num';

  let {
    label,
    value = $bindable(),
    min,
    max,
    step = 1,
    format = (v: number) => String(v),
    oninput,
    marks = [],
    disabled = false
  }: SliderProps = $props();

  const id = $props.id();
  const pct = $derived(max > min ? (Math.min(max, Math.max(min, value)) - min) / (max - min) : 0);
  let editing = $state(false);
  let draft = $state('');

  function input(e: Event & { currentTarget: HTMLInputElement }) {
    value = Number(e.currentTarget.value);
    oninput?.(value);
  }

  function edit() {
    draft = String(value);
    editing = true;
  }
  function commit() {
    if (!editing) return;
    editing = false;
    const n = parseTyped(draft, { decimal: !Number.isInteger(step), negative: min < 0 });
    if (n !== null) {
      const v = snap(n, min, max, step);
      if (v !== value) {
        value = v;
        oninput?.(v);
      }
    }
  }
  function keydown(e: KeyboardEvent) {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') {
      e.stopPropagation();
      editing = false;
    }
  }
  function focusSelect(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<div class="slider" class:disabled style:--p={pct}>
  <div class="top">
    <label for={id}>{label}</label>
    {#if editing}
      <input
        class="exact num"
        type="text"
        inputmode="decimal"
        aria-label="{label}: {copy.a11y.editValue}"
        bind:value={draft}
        onkeydown={keydown}
        onblur={commit}
        use:focusSelect
      />
    {:else}
      <button type="button" class="value num" {disabled} onclick={edit} aria-label="{label}: {copy.a11y.editValue}">
        {format(value)}
      </button>
    {/if}
  </div>
  <div class="rail">
    {#each marks as m (m)}
      <span class="mark" style:--m={(m - min) / (max - min)} aria-hidden="true"></span>
    {/each}
    <input
      {id}
      type="range"
      {min}
      {max}
      {step}
      {disabled}
      value={value}
      aria-valuetext={format(value)}
      oninput={input}
    />
  </div>
</div>

<style>
  .slider { padding: 10px 0; }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    height: 24px;
    margin-bottom: 6px;
  }
  label { font-size: var(--fs-lg); color: var(--c-ink); }
  .value {
    min-width: 44px;
    height: 24px;
    margin-right: -4px;
    padding: 0 4px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
    text-align: right;
    cursor: text;
  }
  .value:hover:not(:disabled) { background: var(--c-well); }
  .exact {
    width: 64px;
    height: 24px;
    margin-right: -4px;
    padding: 0 6px;
    border: 1.5px solid var(--c-boundary);
    border-radius: 6px;
    background: var(--c-white);
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
    text-align: right;
  }
  .exact:focus { border-color: var(--c-ink); box-shadow: none; }

  .rail { position: relative; height: 24px; }
  .mark {
    position: absolute;
    top: 8px;
    left: calc(12px + (100% - 24px) * var(--m) - 1px);
    width: 2px;
    height: 8px;
    border-radius: 1px;
    background: var(--c-track);
  }
  input[type='range'] {
    position: relative;
    display: block;
    width: 100%;
    height: 24px;
    margin: 0;
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
  }
  input[type='range']:focus-visible { box-shadow: none; }
  input[type='range']::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(to right, var(--c-ink) calc(12px + (100% - 24px) * var(--p)), var(--c-boundary) 0);
  }
  input[type='range']::-moz-range-track { height: 4px; border-radius: 2px; background: var(--c-boundary); }
  input[type='range']::-moz-range-progress { height: 4px; border-radius: 2px; background: var(--c-ink); }
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 24px;
    height: 24px;
    margin-top: -10px;
    border: 2px solid var(--c-ink);
    border-radius: 50%;
    background: var(--c-white);
    transition: transform var(--t-fast) var(--ease-out);
  }
  input[type='range']::-moz-range-thumb {
    box-sizing: border-box;
    width: 24px;
    height: 24px;
    border: 2px solid var(--c-ink);
    border-radius: 50%;
    background: var(--c-white);
  }
  input[type='range']:active::-webkit-slider-thumb { transform: scale(1.08); }
  input[type='range']:focus-visible::-webkit-slider-thumb { box-shadow: var(--focus-ring); }
  input[type='range']:focus-visible::-moz-range-thumb { box-shadow: var(--focus-ring); }
  .disabled label, .disabled .value { color: var(--c-disabled); }
  .disabled input[type='range']::-webkit-slider-runnable-track { background: var(--c-track); }
  .disabled input[type='range']::-webkit-slider-thumb { border-color: var(--c-disabled); }
  .disabled input[type='range'] { cursor: default; }
  @media (forced-colors: active) {
    input[type='range'] { forced-color-adjust: none; }
    input[type='range']::-webkit-slider-runnable-track { background: ButtonText; }
    input[type='range']::-webkit-slider-thumb { background: Canvas; border-color: ButtonText; }
    input[type='range']:focus-visible::-webkit-slider-thumb { background: Highlight; }
    .disabled input[type='range']::-webkit-slider-runnable-track { background: GrayText; }
  }
</style>

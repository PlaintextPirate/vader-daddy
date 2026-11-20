<!-- Field: a labelled single-line text field (label above, 40 px field with a 1.5 px line border). Optional live
     counter ("7 / 8") needs `maxlength`. `invalid` shows a message under the field and marks it aria-invalid.
     `onchange` fires on commit (Enter, which keeps focus, or blur); `value` updates on every keystroke. -->
<script lang="ts" module>
  import type { HTMLInputAttributes } from 'svelte/elements';
  export interface FieldProps {
    label: string;
    value: string;
    maxlength?: number;
    counter?: boolean;
    placeholder?: string;
    inputmode?: HTMLInputAttributes['inputmode'];
    onchange?: (value: string) => void;
    invalid?: string;
    disabled?: boolean;
    el?: HTMLInputElement | null;
  }
</script>

<script lang="ts">
  let {
    label,
    value = $bindable(''),
    maxlength,
    counter = false,
    placeholder,
    inputmode,
    onchange,
    invalid,
    disabled = false,
    el = $bindable(null)
  }: FieldProps = $props();

  const id = $props.id();
  const showCounter = $derived(counter && maxlength !== undefined);
  // Enter commits and keeps focus here (it used to blur, which dropped focus to the page); blur commits too, once.
  let committed: string | null = null;
  function commit() {
    committed = value;
    onchange?.(value);
  }
</script>

<div class="field" class:bad={!!invalid} class:disabled>
  <label for={id}>{label}</label>
  <div class="box">
    <input
      bind:this={el}
      bind:value
      {id}
      type="text"
      {maxlength}
      {placeholder}
      {inputmode}
      {disabled}
      spellcheck="false"
      autocomplete="off"
      aria-invalid={invalid ? true : undefined}
      aria-describedby={invalid ? `${id}-err` : showCounter ? `${id}-count` : undefined}
      onchange={() => { if (value !== committed) commit(); }}
      onkeydown={(e) => { if (e.key === 'Enter') commit(); }}
      style:padding-right={showCounter ? '56px' : undefined}
    />
    {#if showCounter}
      <span id="{id}-count" class="count num">{value.length} / {maxlength}</span>
    {/if}
  </div>
  {#if invalid}<p id="{id}-err" class="err" role="alert">{invalid}</p>{/if}
</div>

<style>
  .field { display: flex; flex-direction: column; gap: 6px; }
  label { font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--c-mute); }
  .box { position: relative; }
  input {
    width: 100%;
    height: 40px;
    padding: 0 12px;
    border: 1.5px solid var(--c-boundary);
    border-radius: var(--r-12);
    background: var(--c-white);
    font-size: var(--fs-lg);
    color: var(--c-ink);
  }
  input::placeholder { color: var(--c-mute); opacity: 0.8; }
  input:hover:not(:disabled) { border-color: var(--c-mute); }
  input:focus { border-color: var(--c-ink); box-shadow: none; }
  .count {
    position: absolute;
    top: 50%;
    right: 12px;
    transform: translateY(-50%);
    font-size: var(--fs-sm);
    color: var(--c-mute);
    pointer-events: none;
  }
  .bad input, .bad input:focus { border-color: var(--c-error); }
  .err { font-size: var(--fs-sm); color: var(--c-error); }
  .disabled label, .disabled input { color: var(--c-disabled); }
  .disabled input { border-color: var(--c-track); background: var(--c-well); }
  @media (forced-colors: active) {
    input { border-color: ButtonText; }
    input:focus { outline: 2px solid Highlight; }
  }
</style>

<!-- Stepper: label left; on the right a round 28 px minus, a 68×28 typeable field showing the value with its unit,
     and a round plus. Holding a button repeats (after 400 ms, every 70 ms). Arrow Up/Down in the field step;
     typed text is clamped and snapped on Enter or blur, Esc restores. Set `label` to '' to hide it visually. -->
<script lang="ts" module>
  export interface StepperProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    disabled?: boolean;
    onchange?: (v: number) => void;
  }
</script>

<script lang="ts">
  import { copy } from '$lib/copy';
  import { parseTyped, snap } from './num';

  let { label, value = $bindable(), min, max, step = 1, unit, disabled = false, onchange }: StepperProps = $props();

  const id = $props.id();
  /** "Decrease exact time": the label reads on in sentence case after the verb. */
  const named = $derived(label ? label.charAt(0).toLowerCase() + label.slice(1) : '');
  let focused = $state(false);
  let draft = $state('');
  const shown = $derived(focused ? draft : unit ? `${value} ${unit}` : String(value));

  function set(v: number) {
    const next = snap(v, min, max, step);
    if (next !== value) {
      value = next;
      onchange?.(next);
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  function stop() {
    clearTimeout(timer);
    timer = undefined;
  }
  function hold(dir: 1 | -1, e: PointerEvent) {
    if (disabled || e.button !== 0) return;
    set(value + dir * step);
    const again = (delay: number) => {
      timer = setTimeout(() => {
        if ((dir < 0 && value <= min) || (dir > 0 && value >= max)) return stop();
        set(value + dir * step);
        again(70);
      }, delay);
    };
    stop();
    again(400);
  }
  function click(dir: 1 | -1, e: MouseEvent) {
    if (e.detail === 0) set(value + dir * step); // keyboard activation; pointer steps on pointerdown
  }
  $effect(() => stop);

  function focus() {
    draft = String(value);
    focused = true;
  }
  function commit() {
    const n = parseTyped(draft, { decimal: !Number.isInteger(step), negative: min < 0 });
    focused = false;
    if (n !== null) set(n);
  }
  function keydown(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (e.key === 'Enter') {
      commit();
      draft = String(value);
      focused = true;
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      draft = String(value);
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      set(value + (e.key === 'ArrowUp' ? step : -step));
      draft = String(value);
    }
  }
</script>

<div class="row" class:disabled>
  <label for={id} class:sr-only={!label}>{label}</label>
  <div class="ctl">
    <button
      type="button"
      class="round"
      aria-label="{copy.a11y.decrease} {named}"
      disabled={disabled || value <= min}
      onpointerdown={(e) => hold(-1, e)}
      onpointerup={stop}
      onpointerleave={stop}
      onpointercancel={stop}
      onclick={(e) => click(-1, e)}>–</button
    >
    <input
      {id}
      class="field num"
      type="text"
      inputmode="decimal"
      role="spinbutton"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={unit ? `${value} ${unit}` : undefined}
      {disabled}
      value={shown}
      oninput={(e) => (draft = e.currentTarget.value)}
      onfocus={focus}
      onblur={commit}
      onkeydown={keydown}
    />
    <button
      type="button"
      class="round"
      aria-label="{copy.a11y.increase} {named}"
      disabled={disabled || value >= max}
      onpointerdown={(e) => hold(1, e)}
      onpointerup={stop}
      onpointerleave={stop}
      onpointercancel={stop}
      onclick={(e) => click(1, e)}>+</button
    >
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
    min-height: 48px;
  }
  label { font-size: var(--fs-lg); color: var(--c-ink); }
  .ctl { display: flex; align-items: center; gap: 6px; flex: none; margin-left: auto; }
  .round {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--c-well);
    color: var(--c-ink);
    font-size: var(--fs-md);
    font-weight: var(--fw-bold);
    line-height: 1;
    touch-action: manipulation;
    transition: transform var(--t-fast) var(--ease-out);
  }
  .round:hover:not(:disabled) { background: var(--c-well-hover); }
  .round:active:not(:disabled) { transform: scale(0.92); }
  .round:disabled { color: var(--c-disabled); }
  .field {
    width: 68px;
    height: 28px;
    padding: 0 4px;
    border: 1.5px solid var(--c-boundary);
    border-radius: var(--r-8);
    background: var(--c-white);
    font-size: var(--fs-md);
    text-align: center;
  }
  .field:hover:not(:disabled) { border-color: var(--c-mute); }
  .field:focus { border-color: var(--c-ink); box-shadow: none; }
  .disabled label, .disabled .field { color: var(--c-disabled); }
  .disabled .field { border-color: var(--c-track); background: var(--c-well); }
  @media (forced-colors: active) {
    .round, .field { border: 1px solid ButtonText; }
    .round:disabled, .field:disabled { border-color: GrayText; color: GrayText; }
  }
</style>

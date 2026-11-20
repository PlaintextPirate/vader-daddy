<!-- Switch: a row with the label (and optional hint) on the left and a 48×28 switch on the right. The switch is a
     <button role="switch">; clicking the label toggles it too. The knob slides by transform only. -->
<script lang="ts" module>
  export interface SwitchProps {
    label: string;
    checked: boolean;
    disabled?: boolean;
    hint?: string;
    onchange?: (checked: boolean) => void;
  }
</script>

<script lang="ts">
  let { label, checked = $bindable(), disabled = false, hint, onchange }: SwitchProps = $props();
  const id = $props.id();

  function toggle() {
    if (disabled) return;
    checked = !checked;
    onchange?.(checked);
  }
</script>

<div class="row" class:disabled>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="text" onclick={toggle}>
    <span id="{id}-l" class="label">{label}</span>
    {#if hint}<span id="{id}-h" class="hint">{hint}</span>{/if}
  </div>
  <button
    type="button"
    role="switch"
    class="sw"
    class:on={checked}
    aria-checked={checked}
    aria-labelledby="{id}-l"
    aria-describedby={hint ? `${id}-h` : undefined}
    {disabled}
    onclick={toggle}
  >
    <span class="knob"></span>
  </button>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
    min-height: 50px;
  }
  .text { display: flex; flex-direction: column; gap: 2px; min-width: 0; cursor: pointer; }
  .label { font-size: var(--fs-lg); color: var(--c-ink); }
  .hint { font-size: var(--fs-sm); color: var(--c-mute); }
  .sw {
    position: relative;
    flex: none;
    width: 48px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--r-pill);
    background: var(--c-track);
    box-shadow: inset 0 0 0 1.5px var(--c-boundary);
  }
  .sw.on { background: var(--c-ink); box-shadow: none; }
  .sw:hover:not(:disabled):not(.on) { background: #bcc6d4; }
  .sw:focus-visible { box-shadow: inset 0 0 0 1.5px var(--c-boundary), var(--focus-ring); }
  .sw.on:focus-visible { box-shadow: var(--focus-ring); }
  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--c-white);
    box-shadow: 0 0 0 1px var(--c-boundary), 0 1px 2px rgba(27, 35, 48, 0.2);
    transition: transform var(--t-med) var(--ease-out);
  }
  .on .knob { transform: translateX(20px); }
  .on .knob { box-shadow: 0 1px 2px rgba(27, 35, 48, 0.2); }
  .disabled .label, .disabled .hint { color: var(--c-disabled); }
  .disabled .sw { background: var(--c-well); box-shadow: inset 0 0 0 1.5px var(--c-disabled); }
  .disabled .text { cursor: default; }
  @media (forced-colors: active) {
    .sw { border: 1px solid ButtonText; background: Canvas; }
    .knob { background: ButtonText; forced-color-adjust: none; }
    .sw.on { background: Highlight; border-color: Highlight; forced-color-adjust: none; }
    .sw.on .knob { background: HighlightText; }
    .sw:disabled { border-color: GrayText; }
  }
</style>

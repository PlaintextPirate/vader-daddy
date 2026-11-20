<!-- ModeControls: Hold / Toggle / Turbo ("Behaviour"), and under it one fixed-height slot: the turbo rate for
     Turbo (ms between presses for several buttons; the controller's own 1–50 speed, a plain number, for one), or a
     one-line explanation otherwise, so the panel never changes height when the mode changes. -->
<script lang="ts">
  import { Seg, Stepper, Slider } from '$lib/ui';
  import { copy } from '$lib/copy';
  import type { Behaviour, Binding } from '$lib/protocol/bindings';
  import { shownButtons, withBehaviour, TURBO_ONE, TURBO_MANY } from './logic';

  let { binding, keyId, apply }: { binding: Binding; keyId: number; apply: (b: Binding) => void } = $props();

  const buttons = $derived(shownButtons(binding, keyId));
  const active = $derived(binding.kind === 'buttons' || (binding.kind === 'default' && buttons.length > 0));
  const behaviour = $derived<Behaviour>(binding.kind === 'buttons' ? binding.behaviour : 'hold');
  const options = [
    { id: 'hold', label: copy.button.hold },
    { id: 'toggle', label: copy.button.toggle },
    { id: 'turbo', label: copy.button.turbo }
  ];

  function pick(id: string) {
    const next = withBehaviour(binding, keyId, id as Behaviour);
    if (next) apply(next);
  }
  function rate(v: number) {
    if (binding.kind === 'buttons') apply({ ...binding, turbo: v });
  }
</script>

<Seg {options} value={behaviour} label={copy.button.behaviour} disabled={!active} onchange={pick} />
<div class="slot">
  {#if active && behaviour === 'turbo'}
    {#if buttons.length > 1}
      <Stepper
        label={copy.button.repeatsEvery}
        value={binding.turbo}
        min={TURBO_MANY.min}
        max={TURBO_MANY.max}
        step={TURBO_MANY.step}
        unit="ms"
        onchange={rate}
      />
    {:else}
      <Slider
        label={copy.button.turboSpeed}
        value={binding.turbo}
        min={TURBO_ONE.min}
        max={TURBO_ONE.max}
        step={TURBO_ONE.step}
        oninput={rate}
      />
    {/if}
  {:else}
    <p class="hint">{copy.button.behaviourHint[!active ? 'none' : behaviour === 'toggle' ? 'toggle' : 'hold']}</p>
  {/if}
</div>

<style>
  .slot {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 76px;
    margin-top: 4px;
  }
  .slot > :global(*) { animation: fade var(--t-med) var(--ease-out) both; }
  .hint { font-size: var(--fs-sm); color: var(--c-mute); }
  @keyframes fade { from { opacity: 0; } }
</style>

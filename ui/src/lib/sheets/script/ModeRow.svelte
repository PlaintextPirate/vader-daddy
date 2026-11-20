<!-- ModeRow: Once / While held / Until pressed again, and "Pause between" repeats to the right. The pause is
     hidden for Once but keeps its place, so nothing moves. -->
<script lang="ts">
  import { Seg, Stepper } from '$lib/ui';
  import { copy } from '$lib/copy';
  import type { Script } from '$lib/protocol/bindings';

  let {
    mode,
    cycleMs,
    onmode,
    onpause
  }: { mode: Script['mode']; cycleMs: number; onmode: (m: Script['mode']) => void; onpause: (ms: number) => void } =
    $props();

  const options = [
    { id: 'once', label: copy.script.once },
    { id: 'repeat', label: copy.script.whileHeld },
    { id: 'toggle', label: copy.script.untilAgain }
  ];
</script>

<div class="row">
  <div class="seg">
    <Seg {options} value={mode} label={copy.script.mode} onchange={(id) => onmode(id as Script['mode'])} />
  </div>
  <div class="pause" class:gone={mode === 'once'} inert={mode === 'once'}>
    <Stepper label={copy.script.pause} value={cycleMs} min={10} max={2540} step={10} unit="ms" onchange={onpause} />
  </div>
</div>

<style>
  .row { display: flex; align-items: center; justify-content: space-between; gap: var(--s-6); }
  .seg { width: 540px; max-width: 60%; }
  .pause { transition: opacity var(--t-med) var(--ease-out), visibility var(--t-med); }
  .pause.gone { opacity: 0; visibility: hidden; }
</style>

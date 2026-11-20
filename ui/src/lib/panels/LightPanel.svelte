<!-- LightPanel: the light bar. Steady | Animated; both bodies stay mounted in one grid cell and cross-fade, so
     switching mode never moves Brightness or the note. Every edit goes to lighting.draft (the save bar picks it up).
     Publishes lighting.previewStep (the step being edited) and lighting.hoverLed for the stage. -->
<script lang="ts">
  import { Panel, Seg, Slider } from '$lib/ui';
  import { copy, fmt } from '$lib/copy';
  import type { PanelProps } from '$lib/app/panels';
  import { session } from '$lib/stores/session.svelte';
  import { lighting } from '$lib/stores/lighting.svelte';
  import { device } from '$lib/device/device.svelte';
  import { setSteady, copyToAll, addStep, deleteStep, moveStep, stepCount } from '$lib/stores/lightingModel';
  import StepGrid from './light/StepGrid.svelte';
  import StepTools from './light/StepTools.svelte';
  import SteadyColours from './light/SteadyColours.svelte';
  import ColourPopover from './light/ColourPopover.svelte';
  import { speedToSlider, sliderToSpeed, speedBand, SLIDER_MIN, SLIDER_MAX } from '$lib/stores/speed';

  let {}: PanelProps = $props();

  const d = $derived(lighting.draft);
  const animated = $derived(d?.mode === 'animated');
  let step = $state(0);
  const count = $derived(d ? stepCount(d) : 0);
  const sel = $derived(Math.max(0, Math.min(step, count - 1)));

  // The colour popover: one instance; `target.step` null means a steady swatch.
  let open = $state(false);
  let anchor = $state<HTMLElement | null>(null);
  let target = $state<{ led: number; step: number | null } | null>(null);
  let root = $state<HTMLElement | null>(null);

  const value = $derived.by(() => {
    if (!d || !target) return '#000000';
    if (target.step === null) return d.steady[d.perLed ? target.led : 0];
    return d.grid[target.led]?.[target.step] ?? '#000000';
  });
  const popLabel = $derived.by(() => {
    if (!target || !d) return '';
    const what = target.step !== null
      ? fmt(copy.light.whatCell, { led: target.led + 1, step: target.step + 1 })
      : d.perLed ? fmt(copy.light.whatLed, { led: target.led + 1 }) : copy.light.whatAll;
    return fmt(copy.light.colourOf, { what });
  });

  function select(i: number) {
    step = i;
    lighting.previewStep = i;
  }

  function pick(el: HTMLElement, led: number, at: number | null) {
    if (open && anchor === el) { open = false; return; }
    anchor = el;
    target = { led, step: at };
    open = true;
    if (at !== null) select(at);
  }

  function apply(hex: string) {
    if (!d || !target) return;
    if (target.step === null) setSteady(d, target.led, hex);
    else d.grid[target.led][target.step] = hex;
  }
  function applyAll() {
    if (d && target) copyToAll(d, target.step, value);
  }

  function setMode(m: string) {
    if (!d) return;
    open = false;
    d.mode = m === 'animated' ? 'animated' : 'steady';
    lighting.previewStep = null;
  }

  const edit = (fn: (at: number) => number) => () => { if (d) { open = false; select(fn(sel)); } };

  // While a colour popover is open the stage keeps pointing at its LED (and, animated, holds its step).
  $effect(() => {
    lighting.pickLed = open && target ? (target.step === null && !d?.perLed ? null : target.led) : null;
  });
  // The stage stops pointing at anything once the panel goes away.
  $effect(() => () => {
    lighting.previewStep = null;
    lighting.hoverLed = null;
    lighting.pickLed = null;
  });
</script>

<Panel title={copy.light.title} onclose={() => session.select(null)}>
  <div class="root" bind:this={root}>
  {#if d}
    <Seg
      label={copy.light.modeLabel}
      options={[{ id: 'steady', label: copy.light.steady }, { id: 'animated', label: copy.light.animated }]}
      value={d.mode}
      onchange={setMode}
    />
    <div class="modes">
      <div class="mode" class:on={animated} inert={!animated}>
        <StepGrid
          grid={d.grid}
          selected={sel}
          active={open && target?.step != null ? { led: target.led, step: target.step } : null}
          onselect={select}
          onpick={(el, l, c) => pick(el, l, c)}
        />
        <StepTools
          {count}
          selected={sel}
          onadd={edit((at) => addStep(d!, at))}
          onmove={(dir) => edit((at) => moveStep(d!, at, dir))()}
          ondelete={edit((at) => deleteStep(d!, at))}
        />
        <div class="gap"></div>
        <Slider
          label={copy.light.speed}
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          bind:value={() => speedToSlider(d.speed), (v) => (d.speed = sliderToSpeed(v))}
          format={(v) => copy.light.speeds[speedBand(sliderToSpeed(v))]}
        />
      </div>
      <div class="mode" class:on={!animated} inert={animated}>
        <SteadyColours
          draft={d}
          active={open && target?.step === null ? target.led : null}
          onpick={(el, l) => pick(el, l, null)}
          onperled={(v) => { open = false; d.perLed = v; }}
        />
      </div>
    </div>
    <Slider
      label={copy.light.brightness}
      min={0}
      max={100}
      bind:value={() => d.brightness, (v) => (d.brightness = v)}
      format={(v) => `${v}%`}
    />
    <p class="note">{device.canSaveLighting ? copy.light.keptNote : copy.light.lostWarning}</p>

    <ColourPopover
      bind:open
      {anchor}
      label={popLabel}
      {value}
      onpick={apply}
      oncopyall={target?.step === null && !d.perLed ? undefined : applyAll}
      boundary={root?.closest<HTMLElement>('.panel') ?? null}
    />
  {/if}
  </div>
</Panel>

<style>
  .modes { display: grid; margin-top: 18px; }
  .mode {
    grid-area: 1 / 1;
    min-width: 0;
    opacity: 0;
    visibility: hidden;
    transform: translateY(4px);
    transition: opacity var(--t-med) var(--ease-out), transform var(--t-med) var(--ease-out), visibility 0s linear var(--t-med);
  }
  .mode.on { opacity: 1; visibility: visible; transform: none; transition-delay: 0s; }
  .gap { height: 10px; }
  .note {
    min-height: calc(2 * 1.45em);
    margin-top: 10px;
    font-size: var(--fs-sm);
    line-height: 1.45;
    color: var(--c-mute);
  }
</style>

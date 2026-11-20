<!-- Stick panel, Response tab: the curve graph, preset chips (Linear / Precise / Fast / Custom), hint, mirror. -->
<script lang="ts">
  import { Chip, Divider } from '$lib/ui';
  import { copy } from '$lib/copy';
  import { responseOf } from '$lib/protocol/config';
  import { presetOf, type PresetKey, type Pt } from '$lib/protocol/response';
  import type { ProfileDraft } from '$lib/stores/changes';
  import { setPoint, setPreset } from './edits';
  import ResponseGraph from './ResponseGraph.svelte';
  import MirrorSwitch from './MirrorSwitch.svelte';

  type Side = 'left' | 'right';
  let { draft, side, edit, identical, oncopy }: {
    draft: ProfileDraft;
    side: Side;
    edit: (fn: (d: ProfileDraft, s: Side) => void) => void;
    identical: boolean;
    oncopy: () => void;
  } = $props();

  const response = $derived(responseOf(draft, side));
  // Judged on the shape only (same helper as the change list): a dead-zone edit does not make it Custom.
  const current = $derived(presetOf(response));
  // Precise is Space Station's "Delay" preset.
  const CHIPS: { key: PresetKey | 'custom'; label: string }[] = [
    { key: 'linear', label: copy.stick.presets.linear },
    { key: 'delay', label: copy.stick.presets.precise },
    { key: 'fast', label: copy.stick.presets.fast },
    { key: 'custom', label: copy.stick.presets.custom }
  ];

  function pick(e: MouseEvent, key: PresetKey) {
    e.preventDefault();
    if (key !== current) edit((d, s) => setPreset(d, s, key));
  }
  const point = (which: 'p0' | 'p1', p: Pt) => edit((d, s) => setPoint(d, s, which, p));
</script>

<ResponseGraph {response} {side} onpoint={point} />
<div class="chips" role="group" aria-label={copy.analog.presets}>
  {#each CHIPS as c (c.key)}
    {#if c.key === 'custom'}
      <!-- Not a button: a curve becomes Custom by dragging a point. It only shows the state. -->
      <span class="state" class:on={current === 'custom'} aria-current={current === 'custom' ? 'true' : undefined}>{c.label}</span>
    {:else}
      {@const k = c.key as PresetKey}
      <Chip selected={current === k} onclick={(e) => pick(e, k)}>{c.label}</Chip>
    {/if}
  {/each}
</div>
<p class="hint">{current === 'custom' ? copy.stick.dragHint : copy.stick.customHint}</p>
<Divider />
<MirrorSwitch kind="stick" {side} {identical} {oncopy} />

<style>
  .chips { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s-2); margin-top: 14px; }
  .chips :global(.chip) { padding: 0 var(--s-2); }
  .state {
    display: inline-flex; align-items: center; justify-content: center; height: 38px; border-radius: var(--r-pill);
    border: 1.5px dashed var(--c-boundary); color: var(--c-mute); font-weight: var(--fw-semibold); font-size: var(--fs-md);
  }
  .state.on { border-style: solid; border-color: var(--c-ink); color: var(--c-ink); }
  .hint { margin: 18px 0 4px; text-align: center; font-size: var(--fs-sm); color: var(--c-mute); }
</style>

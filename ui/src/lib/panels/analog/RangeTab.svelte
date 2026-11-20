<!-- Stick panel, Range tab: live plot, dead zone and outer limit (percent), circular range, mirror switch. -->
<script lang="ts">
  import { Slider, Switch, Divider } from '$lib/ui';
  import { copy } from '$lib/copy';
  import { fmtPct, STICK_DEADZONE_PCT, STICK_OUTER_PCT } from '$lib/stores/units';
  import type { ProfileDraft } from '$lib/stores/changes';
  import { deadzonePct, outerPct, setDeadzonePct, setOuterPct } from './edits';
  import StickPlot from './StickPlot.svelte';
  import MirrorSwitch from './MirrorSwitch.svelte';

  type Side = 'left' | 'right';
  let { draft, side, curve, edit, identical, oncopy }: {
    draft: ProfileDraft;
    side: Side;
    curve: boolean;
    edit: (fn: (d: ProfileDraft, s: Side) => void) => void;
    identical: boolean;
    oncopy: () => void;
  } = $props();

  const dz = $derived(deadzonePct(draft, side));
  const outer = $derived(outerPct(draft, side, curve));
  const round = $derived(draft.round[side]);
</script>

<StickPlot {side} deadzone={dz} {outer} circular={round} />
<Slider
  label={copy.stick.deadZone}
  value={dz}
  min={STICK_DEADZONE_PCT.min}
  max={STICK_DEADZONE_PCT.max}
  format={fmtPct}
  oninput={(v) => edit((d, s) => setDeadzonePct(d, s, v, curve))}
/>
<Slider
  label={copy.stick.outerLimit}
  value={outer}
  min={STICK_OUTER_PCT.min}
  max={STICK_OUTER_PCT.max}
  format={fmtPct}
  oninput={(v) => edit((d, s) => setOuterPct(d, s, v, curve))}
/>
<Divider />
<Switch label={copy.stick.circular} checked={round} onchange={(v) => edit((d, s) => { d.round[s] = v; })} />
<MirrorSwitch kind="stick" {side} {identical} {oncopy} />

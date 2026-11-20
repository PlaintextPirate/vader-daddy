<script lang="ts">
  // Trigger panel: live gauge, dead zone and full-press point in percent, and "Same for the other trigger".
  import { Panel, Slider, Divider } from '$lib/ui';
  import { copy } from '$lib/copy';
  import { profile } from '$lib/stores/profile.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { fmtPct, triggerPct, triggerRaw, TRIGGER_DEADZONE, TRIGGER_FULL, TRIGGER_DEADZONE_PCT, TRIGGER_FULL_PCT } from '$lib/stores/units';
  import type { PartId } from '$lib/controller/parts';
  import type { Curve } from '$lib/protocol/config';
  import { other, triggersEqual, copyTrigger } from './analog/edits';
  import { mirror } from './analog/mirror.svelte';
  import TriggerGauge from './analog/TriggerGauge.svelte';
  import MirrorSwitch from './analog/MirrorSwitch.svelte';

  let { side = 'left' }: { part?: PartId; side?: 'left' | 'right' } = $props();

  const draft = $derived(profile.draft);
  const t = $derived(draft?.triggers[side]);
  const dz = $derived(t ? triggerPct(t.deadzone) : 0);
  const full = $derived(t ? triggerPct(t.end) : 100);
  const identical = $derived(draft ? triggersEqual(draft) : false);

  function edit(fn: (c: Curve) => void) {
    const d = profile.draft;
    if (!d) return;
    const both = mirror.on('trigger', triggersEqual(d));
    fn(d.triggers[side]);
    if (both) fn(d.triggers[other(side)]);
  }
  const copyOver = () => { if (profile.draft) copyTrigger(profile.draft, side, other(side)); };
</script>

<Panel title={side === 'right' ? copy.trigger.right : copy.trigger.left} onclose={() => session.select(null)}>
  {#if t}
    <TriggerGauge {side} deadzone={dz} {full} />
    <Slider
      label={copy.trigger.deadZone}
      value={dz}
      min={TRIGGER_DEADZONE_PCT.min}
      max={TRIGGER_DEADZONE_PCT.max}
      format={fmtPct}
      oninput={(v) => edit((c) => { c.deadzone = triggerRaw(v, TRIGGER_DEADZONE); })}
    />
    <Slider
      label={copy.trigger.fullAt}
      value={full}
      min={TRIGGER_FULL_PCT.min}
      max={TRIGGER_FULL_PCT.max}
      format={fmtPct}
      oninput={(v) => edit((c) => { c.end = triggerRaw(v, TRIGGER_FULL); })}
    />
    <Divider />
    <MirrorSwitch kind="trigger" {side} {identical} oncopy={copyOver} />
  {/if}
</Panel>

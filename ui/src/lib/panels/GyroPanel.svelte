<script lang="ts">
  // Gyro panel: which button activates it, and its speeds and dead zone as plain numbers.
  import { Panel, Slider, Row } from '$lib/ui';
  import { copy } from '$lib/copy';
  import { profile } from '$lib/stores/profile.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { GYRO_SPEED, GYRO_DEADZONE } from '$lib/stores/units';
  import type { PartId } from '$lib/controller/parts';
  import KeyPicker from './analog/KeyPicker.svelte';

  let {}: { part?: PartId; side?: 'left' | 'right' } = $props();

  // Buttons offered for "Active while holding": triggers and bumpers first, then sticks, face and rear buttons.
  const KEYS = [12, 13, 10, 11, 14, 15, 4, 5, 7, 8, 16, 17, 19, 18, 21, 20];
  const g = $derived(profile.draft?.gyro);
</script>

<Panel title={copy.gyro.title} onclose={() => session.select(null)}>
  {#if g}
    <div class="first">
    <Row label={copy.gyro.activeWhile}>
      <KeyPicker
        label={copy.gyro.activeWhile}
        value={g.activationKey}
        keys={KEYS.includes(g.activationKey) ? KEYS : [g.activationKey, ...KEYS]}
        onchange={(k) => { if (profile.draft) profile.draft.gyro.activationKey = k; }}
      />
    </Row>
    </div>
    <Slider label={copy.gyro.lrSpeed} value={g.sensX} min={GYRO_SPEED.min} max={GYRO_SPEED.max}
      oninput={(v) => { if (profile.draft) profile.draft.gyro.sensX = v; }} />
    <Slider label={copy.gyro.udSpeed} value={g.sensY} min={GYRO_SPEED.min} max={GYRO_SPEED.max}
      oninput={(v) => { if (profile.draft) profile.draft.gyro.sensY = v; }} />
    <Slider label={copy.gyro.deadZone} value={g.deadzone} min={GYRO_DEADZONE.min} max={GYRO_DEADZONE.max}
      oninput={(v) => { if (profile.draft) profile.draft.gyro.deadzone = v; }} />
  {/if}
</Panel>

<style>
  /* As in the mock-up: the picker row a little higher, and 68 px from it to the first slider's label. */
  .first { margin: -6px 0 22px; }
</style>

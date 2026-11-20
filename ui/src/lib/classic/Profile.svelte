<script lang="ts">
  import { app } from '$lib/classic/state.svelte';
  import { KEY_NAMES, encodeConfig, diffRanges, type ProfileConfig } from '$lib/protocol/config';
  import { fly } from 'svelte/transition';
  import Bindings from './Bindings.svelte';
  import Slider from './Slider.svelte';
  import Icon, { type IconName } from './Icon.svelte';

  const SIDES = [['Left', 'left'], ['Right', 'right']] as const;
  const SECTIONS: [IconName, string][] = [['buttons', 'Buttons'], ['scripts', 'Scripts'], ['sticks', 'Sticks'], ['triggers', 'Triggers'], ['gyro', 'Gyro'], ['vibration', 'Vibration']];
  const jump = (id: IconName) => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  let slot = $state(0);
  const original = $derived(app.configs[slot]);
  let draft = $state<ProfileConfig | null>(null);
  let draftFor = -1;

  $effect(() => {
    if (original && draftFor !== slot) {
      draftFor = slot;
      draft = structuredClone($state.snapshot(original)) as ProfileConfig;
    }
  });

  // encodeConfig throws when the macros don't fit; show that instead of breaking the page.
  const encoded = $derived.by(() => { try { return draft ? encodeConfig(draft) : null; } catch { return null; } });
  const changed = $derived(encoded && original ? diffRanges(original.raw, encoded).length : 0);

  function reset() { if (original) draft = structuredClone($state.snapshot(original)) as ProfileConfig; }
</script>

<div class="bar">
  <label class="hint">Slot
    <select bind:value={slot} onchange={() => !app.configs[slot] && app.readSlot(slot)}>
      {#each [0, 1, 2, 3] as s}<option value={s}>{s}{s === 0 ? ' (active)' : ''}</option>{/each}
    </select>
  </label>
  <button class="ghost" onclick={() => { draftFor = -1; app.readSlot(slot); }} disabled={!!app.busy}>Re-read from controller</button>
</div>

<nav class="jump">
  {#each SECTIONS as [id, name]}<button class="ghost" onclick={() => jump(id)}><Icon name={id} />{name}</button>{/each}
</nav>

{#if draft}
  <div class="stack">
    <Bindings bind:draft />

    <div class="grid">
      <div class="card wide" id="sec-sticks">
        <h3><Icon name="sticks" />Sticks</h3>
        <div class="pair">
          {#each SIDES as [label, k]}
            <div class="group">
              <label class="line"><b>{label}</b><span class="hint sw">Circular range <input type="checkbox" bind:checked={draft.round[k]} /></span></label>
              <Slider label="Deadzone" min={0} max={60} bind:value={draft.sticks[k].deadzone} />
              <Slider label="Outer limit" min={64} max={127} bind:value={draft.sticks[k].end} />
            </div>
          {/each}
        </div>
      </div>

      <div class="card wide" id="sec-triggers">
        <h3><Icon name="triggers" />Triggers</h3>
        <div class="pair">
          {#each SIDES as [label, k]}
            <div class="group">
              <b class="line">{label}</b>
              <Slider label="Deadzone" min={0} max={120} bind:value={draft.triggers[k].deadzone} />
              <Slider label="Full press at" min={128} max={255} bind:value={draft.triggers[k].end} />
            </div>
          {/each}
        </div>
      </div>

      <div class="card" id="sec-gyro">
        <h3><Icon name="gyro" />Gyro</h3>
        <div class="group">
          <label class="line">Activated by
            <select bind:value={draft.gyro.activationKey}>
              {#each Object.entries(KEY_NAMES) as [id, name]}<option value={+id}>{name}</option>{/each}
            </select>
          </label>
          <Slider label="Sensitivity X" min={1} max={60} bind:value={draft.gyro.sensX} />
          <Slider label="Sensitivity Y" min={1} max={60} bind:value={draft.gyro.sensY} />
          <Slider label="Deadzone" min={0} max={40} bind:value={draft.gyro.deadzone} />
        </div>
      </div>

      <div class="card" id="sec-vibration">
        <h3><Icon name="vibration" />Vibration</h3>
        <div class="group">
          <label class="line">Handle motors <input type="checkbox" bind:checked={draft.rumble.enabled} /></label>
          <Slider label="Left strength" bind:value={draft.rumble.left.scale} />
          <Slider label="Right strength" bind:value={draft.rumble.right.scale} />
          <label class="line">Trigger motors <input type="checkbox" bind:checked={draft.triggerRumbleEnabled} /></label>
        </div>
      </div>
    </div>
  </div>

  {#if changed || !encoded}
    <div class="save" transition:fly={{ y: 24, duration: 260 }}>
      {#if encoded}
        <span><b>Unsaved changes</b> <span class="hint">· {changed} byte{changed === 1 ? '' : 's'} differ from the controller</span></span>
      {:else}
        <span class="error">These scripts are too long to fit on the controller. Shorten one or free a button.</span>
      {/if}
      <span class="grow"></span>
      <button onclick={reset}>Discard</button>
      <button class="primary" onclick={() => draft && app.saveConfig(slot, draft)} disabled={!changed || !!app.busy || !encoded}>Save profile</button>
    </div>
  {/if}
{:else}
  <p class="hint">Reading profile…</p>
{/if}

<style>
  .bar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
  .bar label { display: flex; align-items: center; gap: 8px; }
  .error { color: var(--err); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
  .wide { grid-column: 1 / -1; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; column-gap: 28px; }
  .pair .group + .group { margin-top: 0; padding-top: 0; border-top: none; padding-left: 28px; border-left: 1px solid var(--line); }
  @media (max-width: 720px) { .pair { grid-template-columns: 1fr; } .pair .group + .group { margin: 16px 0 0; padding: 14px 0 0; border-left: none; border-top: 1px solid var(--line); } }
  .jump {
    position: sticky; top: 0; z-index: 3; display: flex; gap: 2px; flex-wrap: wrap; margin: 0 -8px 14px; padding: 8px;
    background: rgba(11, 13, 17, 0.82); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  }
  .jump button { display: flex; align-items: center; gap: 7px; padding: 5px 10px; }
  :global([id^='sec-']) { scroll-margin-top: 64px; }
  .group { display: grid; gap: 6px; }
  .group + .group { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line); }
  .sw { display: flex; align-items: center; gap: 10px; white-space: nowrap; }
  .line { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 30px; }
  .save {
    position: sticky; bottom: 20px; z-index: 4; display: flex; align-items: center; gap: 10px; margin-top: 18px; padding: 10px 12px 10px 18px;
    border-radius: 14px; background: rgba(30, 36, 48, 0.86); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
    border: 1px solid var(--line2); box-shadow: 0 14px 36px rgba(0, 0, 0, 0.55);
  }
</style>

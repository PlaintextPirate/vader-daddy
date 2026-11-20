<script lang="ts">
  import Icon from './Icon.svelte';
  import { app } from '$lib/classic/state.svelte';

  // Short explanations in plain words; the option values themselves come from the controller service.
  const HELP: Record<string, string> = {
    polling_rate: 'How often the controller reports to the computer. Higher is more responsive and uses more battery.',
    stick_resolution: 'How many distinct positions the sticks report.',
    centre_sensitivity: 'How readily the sticks register small movements around the centre.',
    rebound: 'Filters the bounce when a stick snaps back to centre.',
    auto_centre: 'Re-centres the sticks automatically.',
    trigger_antishake: 'Smooths small trigger jitter.'
  };
</script>

<div class="stack">
  {#if app.settings}
    <div class="card">
      <h3><Icon name="sticks" />Sticks, triggers and response</h3>
      {#each app.settings as s (s.key)}
        <div class="line">
          <div>
            <b>{s.name}</b>
            <div class="hint">{HELP[s.key] ?? ''}</div>
          </div>
          <select value={s.value} onchange={(e) => app.setSetting(s, +e.currentTarget.value)} disabled={!!app.busy}>
            {#each s.choices as c}<option value={c.value}>{c.label}</option>{/each}
            {#if !s.choices.some((c) => c.value === s.value)}<option value={s.value}>{s.label}</option>{/if}
          </select>
        </div>
      {/each}
      <p class="hint foot">These apply to the whole controller, not to one profile, and take effect straight away.</p>
    </div>
  {:else}
    <div class="card"><p class="hint">These settings are available over the dongle in XInput mode.</p></div>
  {/if}

  {#if app.sleepMinutes !== null}
    <div class="card">
      <h3><Icon name="power" />Power</h3>
      <div class="line">
        <div>
          <b>Switch off when idle</b>
          <div class="hint">Only button and stick input counts as activity, so the controller can switch off while you're editing here. Press Home to wake it.</div>
        </div>
        <select value={app.sleepMinutes} onchange={(e) => app.setSleep(+e.currentTarget.value)} disabled={!!app.busy}>
          {#each [...new Set([5, 10, 15, 30, 60, 120, app.sleepMinutes])].filter((m) => m > 0).sort((a, b) => a - b) as m}
            <option value={m}>{m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''}` : `${m} minutes`}</option>
          {/each}
          <option value={0}>Never</option>
        </select>
      </div>
    </div>
  {/if}
</div>

<style>
  .line { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 11px 0; border-top: 1px solid var(--line); }
  h3 + .line { border-top: none; padding-top: 0; }
  .foot { margin-top: 6px; }
  select { min-width: 130px; flex: none; }
</style>

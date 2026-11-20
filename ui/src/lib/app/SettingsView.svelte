<script lang="ts">
  import { getContext, tick } from 'svelte';
  import { Seg, Stepper, Button } from '$lib/ui';
  import { copy } from '$lib/copy';
  import { device } from '$lib/device/device.svelte';
  import type { InputBus } from '$lib/device/input';
  import type { HardwareSetting, PaddleKeys } from '$lib/device/transport';
  import { fmt } from '$lib/copy';
  import { Kbd } from '$lib/ui';
  import { keyLabel } from './keyLabel';
  import { log } from '$lib/stores/debug';
  import { toasts } from '$lib/stores/toasts.svelte';
  import { hardware } from './hardware.svelte';
  import { flags } from '$lib/flags';
  import { prefs } from '$lib/stores/prefs.svelte';
  import ChoicePicker from './ChoicePicker.svelte';
  import LogView from './LogView.svelte';
  import ViewCard from './ViewCard.svelte';
  import { focusLost } from './focusTarget';

  const bus = getContext<InputBus | undefined>('vader.inputBus');
  const connected = $derived(device.status === 'connected');
  const busy = $derived(!!device.busy);
  const SLEEP = [0, 5, 10, 15, 30, 60];

  // Read once the view opens (and again after a reconnect).
  $effect(() => { if (connected && hardware.settings === undefined && !device.busy) hardware.load(); });

  /**
   * A write re-renders the controls from the controller's answer ({#key hardware.rev}), which drops focus: put it
   * back on the chosen option (or the picker) of the setting just written.
   */
  async function apply(key: string, write: () => Promise<void>) {
    await write();
    await tick();
    requestAnimationFrame(() => {
      const row = document.getElementById(`setting-${key}`);
      if (focusLost(row)) row?.querySelector<HTMLElement>('[role=radio][aria-checked="true"], .pill')?.focus({ preventScroll: true });
    });
  }

  // Scroll to a setting the palette asked for.
  $effect(() => {
    const k = hardware.focus;
    // Not while the read still runs: the controls are disabled then and cannot take focus.
    if (!k || !hardware.settings || busy) return;
    hardware.focus = null;
    // After the palette has closed and handed focus back, so this focus is the one that stays.
    tick().then(() => setTimeout(() => {
      const el = document.getElementById(`setting-${k}`);
      el?.scrollIntoView({ block: 'center' });
      el?.querySelector<HTMLElement>('[role=radio][aria-checked="true"], button:not([tabindex])')?.focus({ preventScroll: true });
    }, 50));
  });

  // Exact sleep time: typed or stepped, sent once the user pauses.
  let exact = $state(0);
  $effect(() => { void hardware.rev; exact = hardware.sleep ?? 0; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  function sleepTyped(v: number) {
    clearTimeout(timer);
    timer = setTimeout(() => { if (v !== hardware.sleep) hardware.setSleep(v); }, 700);
  }
  $effect(() => () => clearTimeout(timer));

  // Live-input status is not reactive (the bus is plain): sample it while the view is open.
  let inputStatus = $state<string>(bus?.status ?? 'idle');
  $effect(() => {
    const t = setInterval(() => (inputStatus = bus?.transport === 'poll' && bus.status === 'live' ? 'polling' : bus?.status ?? 'idle'), 1000);
    return () => clearInterval(t);
  });

  const sleepChoices = $derived(
    [...new Set([...SLEEP, hardware.sleep ?? 0])].sort((a, b) => (a || 1e9) - (b || 1e9)).map((m) => ({ value: m, label: hardware.sleepLabel(m) }))
  );

  // Paddle keys: sent by the app on this Mac, so they need no controller and are saved as soon as they are picked.
  let pk = $state<PaddleKeys | null>(null);
  let capturing = $state<string | null>(null);
  $effect(() => { if (flags.paddleKeys) device.t.getKeys().then((k) => (pk = k), () => {}); });
  async function setKey(paddle: string, code: string | null) {
    const r = await device.run(copy.settings.sections.keys, () => device.t.setKey(paddle, code));
    if (!r) return;
    pk = r;
    toasts.ok(code ? fmt(copy.settings.keysSaved, { paddle, key: keyLabel(code) }) : fmt(copy.settings.keysCleared, { paddle }));
  }
  async function askPermission() {
    const r = await device.run(copy.settings.sections.keys, () => device.t.askKeyPermission());
    if (r) pk = r;
  }
  // While a paddle waits for its key, the next key press is taken here and reaches nothing else (not the
  // app's shortcuts either). Esc cancels.
  $effect(() => {
    const paddle = capturing;
    if (!paddle) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      capturing = null;
      if (e.code === 'Escape') return;
      if (pk?.codes.length && !pk.codes.includes(e.code)) { toasts.error(copy.settings.keysUnsupported); return; }
      setKey(paddle, e.code);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  async function copyLog() {
    try { await navigator.clipboard.writeText(log.text()); toasts.ok(copy.settings.logCopied); }
    catch { toasts.error(copy.errors.region); }
  }
  const segOptions = (s: HardwareSetting) => s.choices.map((c) => ({ id: String(c.value), label: hardware.choiceLabel(c.label) }));
  const pickerChoices = (s: HardwareSetting) =>
    (s.choices.some((c) => c.value === s.value) ? s.choices : [...s.choices, { value: s.value, label: s.label }])
      .map((c) => ({ value: c.value, label: hardware.choiceLabel(c.label) }));
</script>

<ViewCard title={copy.settings.title}>
  <section aria-labelledby="set-controller">
    <h2 id="set-controller">{copy.settings.sections.controller}</h2>
    {#if !connected}
      <p class="note">{copy.settings.noController}</p>
    {:else if hardware.settings === null}
      <p class="note">{copy.settings.dongleOnly}</p>
    {:else if hardware.settings}
      <p class="note">{copy.settings.intro}</p>
      {#key hardware.rev}
        {#each hardware.settings as s (s.key)}
          {@const d = hardware.describe(s)}
          <div class="row" id="setting-{s.key}">
            <div class="text"><span class="label">{d.name}</span>{#if d.help}<span class="help">{d.help}</span>{/if}</div>
            <div class="end">
              {#if s.choices.length <= 4}
                <div class="seg" style:--seg-width="{s.choices.length * 84}px">
                  <Seg options={segOptions(s)} value={String(s.value)} label={d.name} disabled={busy} activation="manual"
                    onchange={(id) => apply(s.key, () => hardware.set(s, +id))} />
                </div>
              {:else}
                <ChoicePicker label={d.name} value={s.value} disabled={busy}
                  choices={pickerChoices(s)}
                  onpick={(v) => apply(s.key, () => hardware.set(s, v))} />
              {/if}
            </div>
          </div>
        {/each}
      {/key}
    {/if}
  </section>

  <section aria-labelledby="set-power">
    <h2 id="set-power">{copy.settings.sections.power}</h2>
    {#if !connected}
      <p class="note">{copy.settings.noController}</p>
    {/if}
    {#if !connected || hardware.sleep === undefined}
      <!-- nothing: no controller, or the timer is not read yet -->
    {:else if hardware.sleep === null}
      <p class="note">{copy.settings.sleepDongleOnly}</p>
    {:else}
      <div class="row" id="setting-sleep">
        <div class="text"><span class="label">{copy.settings.sleepAfter}</span><span class="help">{copy.settings.sleepHelp}</span></div>
        <div class="end">
          {#key hardware.rev}
            <ChoicePicker label={copy.settings.sleepAfter} value={hardware.sleep} choices={sleepChoices} disabled={busy}
              onpick={(v) => apply('sleep', () => hardware.setSleep(v))} />
          {/key}
        </div>
      </div>
      <Stepper label={copy.settings.sleepExact} bind:value={exact} min={0} max={254} unit={copy.settings.minUnit}
        disabled={busy} onchange={sleepTyped} />
    {/if}
  </section>

  {#if prefs.hasDock}
  <section aria-labelledby="set-app">
    <h2 id="set-app">{copy.settings.sections.app}</h2>
    <div class="row" id="setting-dock">
      <div class="text"><span class="label">{copy.settings.dockAnimated}</span><span class="help">{copy.settings.dockAnimatedHelp}</span></div>
      <div class="end">
        <div class="seg" style:--seg-width="168px">
          <Seg options={[{ id: '0', label: copy.common.off }, { id: '1', label: copy.common.on }]} value={prefs.dockAnimated ? '1' : '0'}
            label={copy.settings.dockAnimated} onchange={(id) => (prefs.dockAnimated = id === '1')} />
        </div>
      </div>
    </div>
  </section>
  {/if}

  {#if flags.paddleKeys}
  <section aria-labelledby="set-keys">
    <h2 id="set-keys">{copy.settings.sections.keys}</h2>
    <p class="note">{copy.settings.keysIntro}</p>
    {#if pk}
      {#if !pk.allowed}
        <div class="row">
          <div class="text"><span class="label">{copy.settings.keysPermission}</span><span class="help">{copy.settings.keysPermissionHelp}</span></div>
          <div class="end"><Button variant="primary" size="sm" onclick={askPermission}>{copy.settings.keysAllow}</Button></div>
        </div>
      {/if}
      {#each pk.paddles as p (p)}
        {@const code = pk.keys[p]}
        <div class="row" id="setting-key-{p}">
          <div class="text">
            <span class="label">{p}</span>
            <span class="help" aria-live="polite">
              {#if capturing === p}{copy.settings.keysPress}{:else if code}<Kbd>{keyLabel(code)}</Kbd>{:else}{copy.settings.keysNone}{/if}
            </span>
          </div>
          <div class="end keys">
            {#if code && capturing !== p}<Button variant="text" size="sm" onclick={() => setKey(p, null)}>{copy.settings.keysClear}</Button>{/if}
            <Button variant="soft" size="sm" disabled={capturing === p} onclick={() => (capturing = p)}>{code ? copy.settings.keysChange : copy.settings.keysSet}</Button>
          </div>
        </div>
      {/each}
    {/if}
  </section>
  {/if}

  <section aria-labelledby="set-diag">
    <h2 id="set-diag">{copy.settings.sections.diagnostics}</h2>
    <dl>
      <dt>{copy.settings.connection}</dt><dd>{device.info?.modeName ?? (device.lastError?.message ?? copy.top.none)}</dd>
      <dt>{copy.settings.firmware}</dt><dd class="num">{device.info?.firmware ?? copy.common.none}</dd>
      <dt>{copy.settings.deviceId}</dt><dd class="num">{device.info?.deviceId ?? copy.common.none}</dd>
      <dt>{copy.settings.liveInput}</dt><dd>{copy.settings.inputStatus[inputStatus] ?? inputStatus}</dd>
    </dl>
    <div class="loghead">
      <h3>{copy.settings.log}</h3>
      <Button variant="soft" size="sm" onclick={copyLog}>{copy.settings.copyLog}</Button>
    </div>
    <LogView />
    <!-- Full page load so the classic and new stylesheets never mix. -->
    <a class="classic" href="/classic{location.search}" data-sveltekit-reload>{copy.settings.classic}</a>
  </section>
</ViewCard>

<style>
  section + section { margin-top: var(--s-8); padding-top: var(--s-6); border-top: 1px solid var(--c-well); }
  h2 { font-size: 20px; font-weight: var(--fw-bold); margin-bottom: var(--s-1); }
  h3 { font-size: var(--fs-md); font-weight: var(--fw-semibold); }
  .note { color: var(--c-mute); margin-bottom: var(--s-2); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: var(--s-6); min-height: 64px; padding: var(--s-2) 0; }
  .row + .row { border-top: 1px solid rgba(201, 210, 222, 0.5); }
  .text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .label { font-size: var(--fs-lg); }
  .help { font-size: var(--fs-sm); color: var(--c-mute); }
  .end { flex: none; }
  .seg :global(.seg) { height: 38px; }
  .keys { display: flex; gap: var(--s-2); }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: var(--s-2) var(--s-6); margin: var(--s-3) 0 var(--s-5); }
  dt { color: var(--c-mute); }
  dd { margin: 0; }
  .loghead { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--s-2); }
  .classic {
    display: inline-flex; align-items: center; min-height: 28px; padding: 0 6px; margin: var(--s-5) 0 0 -6px;
    color: var(--c-ink); font-weight: var(--fw-medium); border-radius: var(--r-8);
  }
  @media (max-width: 760px) { .row { flex-direction: column; align-items: flex-start; } }
</style>

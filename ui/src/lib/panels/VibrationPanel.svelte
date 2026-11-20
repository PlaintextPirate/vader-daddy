<script lang="ts">
  // Vibration panel: pick one of the four motors on a small map of the controller, tune that motor, and try it
  // with the tester pinned to the bottom of the panel. One motor on screen at a time, so it is always clear what
  // is being changed. Strength is a percent (0–100); floor, ceiling and threshold are 0–255 shown as percent.
  import { Panel, Slider, Switch, Button } from '$lib/ui';
  import { copy } from '$lib/copy';
  import { profile } from '$lib/stores/profile.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { device } from '$lib/device/device.svelte';
  import { fmtPct, motorPct, motorRaw, outputPct, outputRaw, MOTOR_MIN, MOTOR_SCALE } from '$lib/stores/units';
  import type { PartId } from '$lib/controller/parts';
  import type { ProfileDraft } from '$lib/stores/changes';

  let {}: { part?: PartId; side?: 'left' | 'right' } = $props();

  type LR = 'left' | 'right';
  type MotorId = 'lt' | 'rt' | 'lg' | 'rg';
  interface Motor { id: MotorId; kind: 'trig' | 'grip'; side: LR; other: MotorId }
  const MOTORS: Record<MotorId, Motor> = {
    lt: { id: 'lt', kind: 'trig', side: 'left', other: 'rt' }, rt: { id: 'rt', kind: 'trig', side: 'right', other: 'lt' },
    lg: { id: 'lg', kind: 'grip', side: 'left', other: 'rg' }, rg: { id: 'rg', kind: 'grip', side: 'right', other: 'lg' }
  };
  const v = copy.vibration;
  let sel = $state<MotorId>('lg');
  /** Apply edits to the opposite motor of the same kind too. */
  const linked = $state({ trig: false, grip: false });

  const d = $derived(profile.draft);
  const m = $derived(MOTORS[sel]);
  const enabled = (c: ProfileDraft, kind: Motor['kind']) => (kind === 'trig' ? c.triggerRumbleEnabled : c.rumble.enabled);

  // One motor's values, whichever kind it is (grip: scale / a / b; trigger: the "line" set's scale / min / max / filter).
  type Field = 'scale' | 'floor' | 'ceiling' | 'filter';
  function read(c: ProfileDraft, id: MotorId, f: Field): number {
    const k = MOTORS[id];
    if (k.kind === 'grip') { const g = c.rumble[k.side]; return f === 'scale' ? g.scale : f === 'floor' ? g.a : g.b; }
    const t = c.triggerMotors[k.side].line;
    return f === 'scale' ? t.scale : f === 'floor' ? t.min : f === 'ceiling' ? t.max : t.filter;
  }
  function write(c: ProfileDraft, id: MotorId, f: Field, x: number) {
    const k = MOTORS[id];
    if (k.kind === 'grip') { const g = c.rumble[k.side]; if (f === 'scale') g.scale = x; else if (f === 'floor') g.a = x; else if (f === 'ceiling') g.b = x; return; }
    const t = c.triggerMotors[k.side].line;
    if (f === 'scale') t.scale = x; else if (f === 'floor') t.min = x; else if (f === 'ceiling') t.max = x; else t.filter = x;
  }
  /** Sets a value on the selected motor (and its twin while linked). The controller rejects a floor above the
      ceiling, so each stops at the other. */
  function edit(f: Field, x: number) {
    const c = profile.draft;
    if (!c) return;
    for (const id of linked[m.kind] ? [sel, m.other] : [sel]) {
      const val = f === 'floor' ? Math.min(x, read(c, id, 'ceiling')) : f === 'ceiling' ? Math.max(x, read(c, id, 'floor')) : x;
      write(c, id, f, val);
    }
  }
  function link(on: boolean) {
    linked[m.kind] = on;
    const c = profile.draft;
    if (!on || !c) return;
    for (const f of ['scale', 'floor', 'ceiling', ...(m.kind === 'trig' ? ['filter' as const] : [])] as Field[]) write(c, m.other, f, read(c, sel, f));
  }
  const strengthLabel = $derived(m.kind === 'grip' ? (m.side === 'left' ? v.leftStrength : v.rightStrength) : m.side === 'left' ? v.leftTrigger : v.rightTrigger);

  // The tester: one toggle for an ordinary rumble on the left side, the right side or both. It is the only signal
  // the controller takes; grip motors answer it whenever they are on, trigger motors while their trigger is pulled.
  // The service only ever rumbles for HOLD_MS and the panel asks again every RENEW_MS, so closing the panel, the
  // window or losing the page always ends the rumble by itself.
  type Side = 'left' | 'both' | 'right';
  const SIDES: Side[] = ['left', 'both', 'right'];
  const HOLD_MS = 2000, RENEW_MS = 1200;
  // The test goes through the ordinary gamepad connection, which only the XInput dongle offers.
  const canTest = $derived(device.info?.mode === 'dongle-xinput');
  let on = $state<Side | null>(null);
  /** How hard the pretend game asks for (percent of full rumble). Not a profile value: never saved. */
  let sent = $state(100);
  let timer: ReturnType<typeof setInterval> | undefined;
  const running = (side: LR) => on === 'both' || on === side;

  function send() {
    const level = Math.round((sent / 100) * 255);
    return device.t.buzz(running('left') ? level : 0, running('right') ? level : 0, HOLD_MS);
  }
  function stop() {
    clearInterval(timer);
    timer = undefined;
    if (on) device.t.buzz(0, 0, 50).catch(() => {});
    on = null;
  }
  // Moving the slider while a rumble is on changes it straight away (at most ~8 times a second).
  let last = 0;
  function setSent(p: number) {
    sent = p;
    const now = Date.now();
    if (on && !device.busy && now - last > 120) { last = now; send().catch(() => {}); }
  }
  async function toggle(side: Side) {
    if (on === side) return stop();
    const before = on;
    on = side;
    // Through the action runner, so a failure is reported; renewals stay quiet and are skipped while another
    // action (a save) has the controller.
    const ok = await device.run(v.test, async () => { await send(); return true; });
    if (!ok) { on = before; if (!on) stop(); return; }
    timer ??= setInterval(() => {
      if (!canTest || !on) return stop();
      if (!device.busy) send().catch(() => stop());
    }, RENEW_MS);
  }
  $effect(() => () => stop());
</script>

{#snippet tile(id: MotorId)}
  {@const k = MOTORS[id]}
  {@const live = !!d && enabled(d, k.kind)}
  <button type="button" class="tile {k.kind}" class:sel={sel === id} class:off={!live} aria-pressed={sel === id} aria-label={v.motors[id]} onclick={() => (sel = id)}>
    <span class="name">{v.short[id]}</span>
    <span class="val num">{d && live ? fmtPct(motorPct(read(d, id, 'scale'))) : v.off}</span>
    {#if live && running(k.side)}<span class="dot" aria-hidden="true"></span>{/if}
  </button>
{/snippet}

{#snippet tester()}
  <div class="test" class:live={!!on}>
    <div class="row">
      <h3>{v.testShort}</h3>
      <div class="sides">
        {#each SIDES as s (s)}
          <Button size="sm" variant={on === s ? 'primary' : 'soft'} onclick={() => toggle(s)} disabled={!canTest} aria-pressed={on === s} aria-label="{v.test}: {v.testSides[s]}">
            {on === s ? v.testing : v.testSides[s]}
          </Button>
        {/each}
      </div>
    </div>
    <Slider label={v.testLevel} value={sent} min={0} max={100} format={fmtPct} disabled={!canTest} oninput={setSent} />
    <p class="note">{canTest ? v.testFoot : v.testXinput}</p>
  </div>
{/snippet}

<Panel title={v.title} onclose={() => session.select(null)} footer={tester}>
  {#if d}
    <div class="map" role="group" aria-label={v.pick}>
      <Switch label={v.triggers} checked={d.triggerRumbleEnabled} onchange={(x) => { if (profile.draft) profile.draft.triggerRumbleEnabled = x; }} />
      <div class="pair">{@render tile('lt')}{@render tile('rt')}</div>
      <Switch label={v.handle} checked={d.rumble.enabled} onchange={(x) => { if (profile.draft) profile.draft.rumble.enabled = x; }} />
      <div class="pair">{@render tile('lg')}{@render tile('rg')}</div>
    </div>

    {@const live = enabled(d, m.kind)}
    <section class="detail" aria-label={v.motors[sel]}>
      <h3>{v.motors[sel]}</h3>
      <p class="note">{m.kind === 'trig' ? v.triggersNote : v.gripNote}</p>
      <Slider label={strengthLabel} value={motorPct(read(d, sel, 'scale'))} min={MOTOR_MIN} max={MOTOR_SCALE} format={fmtPct} disabled={!live}
        oninput={(x) => edit('scale', motorRaw(x))} />
      <details class="adv">
        <summary>{v.advancedShort}</summary>
        <p class="note">{m.kind === 'trig' ? v.advancedNote : v.gripAdvancedNote}</p>
        <!-- Floor / ceiling: felt on the trigger motors; on the grips by the official code only. -->
        <Slider label={v.floor} value={outputPct(read(d, sel, 'floor'))} min={0} max={100} format={fmtPct} disabled={!live} oninput={(x) => edit('floor', outputRaw(x))} />
        <Slider label={v.ceiling} value={outputPct(read(d, sel, 'ceiling'))} min={0} max={100} format={fmtPct} disabled={!live} oninput={(x) => edit('ceiling', outputRaw(x))} />
        {#if m.kind === 'trig'}
          <!-- "Filter" in the official app: seems to be a threshold on the incoming rumble (its exact scale is not
               pinned down). Stored 1–255; shown as a percent of full rumble. -->
          <Slider label={v.threshold} value={outputPct(read(d, sel, 'filter'))} min={0} max={100} format={fmtPct} disabled={!live} oninput={(x) => edit('filter', Math.max(1, outputRaw(x)))} />
        {/if}
      </details>
      <Switch label={v.sameOther[sel]} checked={linked[m.kind]} disabled={!live} onchange={link} />
    </section>
  {/if}
</Panel>

<style>
  .note { margin: 0; font-size: var(--fs-sm); line-height: 1.45; color: var(--c-mute); }

  /* The map: triggers above, grips below, left and right as on the controller. */
  .map { padding: var(--s-1) var(--s-4) var(--s-4); border-radius: var(--r-20); background: var(--c-well); }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2); margin-bottom: var(--s-2); }
  .tile {
    position: relative; display: grid; gap: 2px; justify-items: start; padding: 10px var(--s-3); border: 1.5px solid transparent;
    background: var(--c-white); color: var(--c-ink); text-align: left; cursor: pointer;
    transition: background var(--t-fast), color var(--t-fast), border-color var(--t-fast);
  }
  /* Trigger tiles are wide and low with the outer top corner cut round; grip tiles are taller: a hint of the shapes. */
  .tile.trig { border-radius: var(--r-12); }
  .tile.trig:first-child { border-top-left-radius: var(--r-28); }
  .tile.trig:last-child { border-top-right-radius: var(--r-28); padding-left: var(--s-3); }
  .tile.grip { padding-bottom: var(--s-4); border-radius: var(--r-12) var(--r-12) var(--r-28) var(--r-28); }
  .tile:hover { border-color: var(--c-boundary); }
  .tile.sel { background: var(--c-ink); color: var(--c-white); }
  .tile:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .name { font-size: var(--fs-sm); font-weight: var(--fw-medium); opacity: 0.75; }
  .val { font-size: 20px; line-height: 1.1; font-weight: var(--fw-bold); letter-spacing: -0.01em; }
  .tile.off .val { font-weight: var(--fw-medium); opacity: 0.6; }
  .dot { position: absolute; top: 10px; right: 12px; width: 8px; height: 8px; border-radius: 50%; background: var(--c-accent); animation: pulse 0.9s ease-in-out infinite alternate; }
  @keyframes pulse { from { opacity: 0.35; transform: scale(0.8); } to { opacity: 1; transform: scale(1.15); } }
  @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }

  .detail { margin-top: var(--s-5); }
  .detail h3 { margin: 0 0 2px; font-size: 20px; font-weight: var(--fw-bold); letter-spacing: -0.01em; }
  .detail > .note { margin-bottom: var(--s-2); }
  .adv summary {
    display: inline-flex; align-items: center; gap: 6px; cursor: pointer; padding: var(--s-2) 0; list-style: none;
    font-size: var(--fs-md); font-weight: var(--fw-medium); color: var(--c-mute); border-radius: var(--r-8);
  }
  .adv summary::-webkit-details-marker { display: none; }
  .adv summary::after {
    content: ''; width: 7px; height: 7px; margin-top: -3px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor;
    transform: rotate(45deg); transition: transform var(--t-fast);
  }
  .adv[open] summary::after { transform: rotate(-135deg); margin-top: 3px; }
  .adv summary:hover { color: var(--c-ink); }
  .adv summary:focus-visible { outline: none; box-shadow: var(--focus-ring); }

  /* The tester, pinned under the scrolling part. */
  .row { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); }
  .row h3 { margin: 0; font-size: var(--fs-md); font-weight: var(--fw-semibold); }
  .sides { display: flex; gap: 6px; }
  .sides :global(.btn) { min-width: 64px; }
</style>

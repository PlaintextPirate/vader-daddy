<!-- /kit: QA gallery of every design-system primitive in every state, on the cloudy page background. Hover and
     focus states are forced with classes so they can be compared side by side with the mock-ups. -->
<script lang="ts">
  import '$lib/theme/tokens.css';
  import '$lib/theme/base.css';
  import { copy, unsaved, tilt, stepsOf } from '$lib/copy';
  import {
    Button, Chip, Seg, Slider, Switch, Stepper, Field, Panel, Popover, Sheet, Toasts, Divider, Row, Kbd
  } from '$lib/ui';
  import type { ToastItem } from '$lib/ui';

  const keys = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'L3', 'R3', 'Select', 'Start', '↑', '↓', '←', '→'];
  let picked = $state<Record<string, boolean>>({ A: true, X: true });
  let mode = $state('turbo');
  let tab = $state('range');
  let script = $state('held');
  let repeat = $state(100);
  let pause = $state(30);
  let dead = $state(8);
  let outer = $state(94);
  let speed = $state(1);
  let bright = $state(50);
  let circular = $state(true);
  let same = $state(false);
  let name = $state('Shooter');
  let bad = $state('');

  let menuOpen = $state(false);
  let menuAnchor: HTMLButtonElement | null = $state(null);
  let darkOpen = $state(false);
  let darkAnchor: HTMLButtonElement | null = $state(null);
  let sheetOpen = $state(false);

  // ?open=menu|dark|sheet opens an overlay on load, for screenshots.
  $effect(() => {
    const o = new URLSearchParams(location.search).get('open');
    if (o === 'menu') menuOpen = true;
    if (o === 'dark') darkOpen = true;
    if (o === 'sheet') sheetOpen = true;
  });

  let toasts = $state<ToastItem[]>([
    { id: '1', kind: 'ok', text: copy.save.saved },
    { id: '2', kind: 'info', text: copy.script.deleted, action: { label: copy.script.undo, run: () => {} } },
    { id: '3', kind: 'error', text: copy.errors.lost }
  ]);
  let n = 4;
  function addToast(kind: ToastItem['kind']) {
    const text = kind === 'error' ? copy.errors.service : kind === 'ok' ? copy.save.saved : copy.save.discarded;
    toasts = [...toasts, { id: String(n++), kind, text }];
  }
  const speeds = [copy.light.speeds.slow, copy.light.speeds.medium, copy.light.speeds.fast];
</script>

<svelte:head><title>VaderDaddy kit</title></svelte:head>

<main>
  <h1>Kit</h1>

  <section>
    <h3>Button</h3>
    {#each [['default', ''], ['hover', 'is-hover']] as [state, cls] (state)}
      <div class="line">
        <span class="tag">{state}</span>
        <Button variant="primary" class={cls} kbd="⌘S">{copy.save.save}</Button>
        <Button variant="dark" class={cls}>{copy.button.done}</Button>
        <Button variant="soft" class={cls}>{copy.script.addPress}</Button>
        <Button variant="ghost" class={cls}>{copy.top.history}</Button>
        <Button variant="text" class={cls}>{copy.button.clear}</Button>
        <Button variant="soft" size="sm" class={cls}>{copy.script.fit}</Button>
      </div>
    {/each}
    <div class="line ff">
      <span class="tag">focus</span>
      <Button variant="primary" kbd="⌘S">{copy.save.save}</Button>
      <Button variant="dark">{copy.button.done}</Button>
      <Button variant="soft">{copy.button.newScript}</Button>
      <Button variant="text">{copy.button.clear}</Button>
    </div>
    <div class="line">
      <span class="tag">disabled</span>
      <Button variant="primary" disabled kbd="⌘S">{copy.save.save}</Button>
      <Button variant="dark" disabled>{copy.button.done}</Button>
      <Button variant="soft" disabled>{copy.script.addPress}</Button>
      <Button variant="text" disabled>{copy.button.clear}</Button>
    </div>
    <div class="savebar">
      <Button variant="ghost">{unsaved(2)}</Button>
      <span class="spacer"></span>
      <Button variant="ghost">{copy.save.discard}</Button>
      <Button variant="primary" kbd="⌘S">{copy.save.save}</Button>
    </div>
  </section>

  <section class="cols">
    <Panel title="M1" onclose={() => {}}>
      <div class="cap"><span>{copy.button.presses}</span><span>{copy.button.hint}</span></div>
      <div class="grid">
        {#each keys as k (k)}
          <Chip bind:selected={() => picked[k] ?? false, (v) => (picked[k] = v)}>{k}</Chip>
        {/each}
      </div>
      <div style:height="24px"></div>
      <Seg
        label={copy.button.presses}
        bind:value={mode}
        options={[
          { id: 'hold', label: copy.button.hold },
          { id: 'toggle', label: copy.button.toggle },
          { id: 'turbo', label: copy.button.turbo }
        ]}
      />
      <Stepper label={copy.button.repeatsEvery} bind:value={repeat} min={10} max={1000} step={10} unit="ms" />
      <Divider />
      <div class="cap"><span>{copy.button.orScript}</span></div>
      <Row label="Jump + shoot"><span class="mute">›</span></Row>
      <Button variant="soft">{copy.button.newScript}</Button>
      <div style:height="20px"></div>
      <Button variant="text">{copy.button.clear}</Button>
    </Panel>

    <Panel title={copy.stick.left} onclose={() => {}}>
      {#snippet tabs()}
        <Seg
          label={copy.stick.left}
          bind:value={tab}
          options={[
            { id: 'range', label: copy.stick.tabs.range },
            { id: 'response', label: copy.stick.tabs.response }
          ]}
        />
      {/snippet}
      <p class="mute center">{tilt(70)}</p>
      <Slider label={copy.stick.deadZone} bind:value={dead} min={0} max={30} format={(v) => `${v}%`} />
      <Slider label={copy.stick.outerLimit} bind:value={outer} min={50} max={100} format={(v) => `${v}%`} />
      <Divider />
      <Switch label={copy.stick.circular} bind:checked={circular} />
      <Switch label={copy.stick.sameRight} bind:checked={same} />
    </Panel>

    <Panel title={copy.light.title} onclose={() => {}}>
      <Slider label={copy.light.speed} bind:value={speed} min={0} max={2} marks={[0, 1, 2]} format={(v) => speeds[v]} />
      <Slider label={copy.light.brightness} bind:value={bright} min={0} max={100} format={(v) => `${v}%`} />
      <Slider label="Disabled" value={40} min={0} max={100} disabled />
      <Switch label={copy.light.oneColour} checked={false} hint={copy.light.keptNote} />
      <Switch label="Disabled switch" checked={true} disabled />
      <Stepper label="Disabled stepper" value={5} min={0} max={10} disabled />
      <Row label={stepsOf(6, 10)} hint="Row with a hint"><Kbd>⌘K</Kbd></Row>
      <div class="grid">
        <Chip selected={false} class="is-hover">Hover</Chip>
        <Chip selected={true} disabled>Off</Chip>
        <Chip selected={false} disabled>Off</Chip>
        <span class="ff"><Chip selected={false}>Focus</Chip></span>
      </div>
    </Panel>
  </section>

  <section class="cols">
    <div class="card">
      <Field label={copy.profile.name} bind:value={name} maxlength={8} counter />
      <div style:height="16px"></div>
      <Field label="Invalid" bind:value={bad} placeholder={copy.search.placeholder} invalid="Too long." />
      <div style:height="16px"></div>
      <Seg
        label="Script mode"
        bind:value={script}
        options={[
          { id: 'once', label: copy.script.once },
          { id: 'held', label: copy.script.whileHeld },
          { id: 'again', label: copy.script.untilAgain }
        ]}
      />
      <Stepper label={copy.script.pause} bind:value={pause} min={0} max={500} step={10} unit="ms" />
      <Seg label="Disabled" value="a" disabled options={[{ id: 'a', label: 'One' }, { id: 'b', label: 'Two' }]} />
    </div>

    <div class="card">
      <h3>Overlays</h3>
      <div class="line">
        <Button variant="dark" bind:el={menuAnchor} aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
          1 Shooter
        </Button>
        <Button variant="soft" bind:el={darkAnchor} aria-expanded={darkOpen} onclick={() => (darkOpen = !darkOpen)}>
          {copy.save.header}
        </Button>
        <Button variant="soft" onclick={() => (sheetOpen = true)}>Open sheet</Button>
      </div>
      <div class="line">
        <Button variant="soft" size="sm" onclick={() => addToast('ok')}>Toast ok</Button>
        <Button variant="soft" size="sm" onclick={() => addToast('info')}>Toast info</Button>
        <Button variant="soft" size="sm" onclick={() => addToast('error')}>Toast error</Button>
      </div>
      <p class="mute">{copy.main.hint} <Kbd>⌘K</Kbd> <Kbd>Esc</Kbd></p>
    </div>
  </section>
</main>

<Popover bind:open={menuOpen} anchor={menuAnchor} label={copy.profile.title}>
  <div style:width="280px">
    <Field label={copy.profile.name} bind:value={name} maxlength={8} counter />
    <Divider space={16} />
    <Row label={copy.profile.copyTo}><Button variant="soft" size="sm">2</Button></Row>
    <Row label={copy.profile.export} />
    <Divider space={0} />
    <Button variant="text">{copy.profile.reset}</Button>
  </div>
</Popover>

<Popover bind:open={darkOpen} anchor={darkAnchor} placement="top" tone="dark" label={copy.save.header}>
  <div style:width="380px">
    <p class="small">{copy.save.header}</p>
    <div class="line between"><b>Left stick dead zone 0% → 8%</b><Button variant="ghost" size="sm">{copy.save.undo}</Button></div>
  </div>
</Popover>

<Sheet bind:open={sheetOpen} title="Jump + shoot">
  {#snippet header()}
    <span class="mute">5% of script memory used</span>
    <Button variant="soft">On M2</Button>
  {/snippet}
  <Seg label="Mode" bind:value={script} options={[{ id: 'once', label: copy.script.once }, { id: 'held', label: copy.script.whileHeld }, { id: 'again', label: copy.script.untilAgain }]} />
  <Stepper label={copy.script.pause} bind:value={pause} min={0} max={500} step={10} unit="ms" />
  <Divider space={24} />
  <div class="line between"><Button variant="text">{copy.script.delete}</Button><span class="mute">{copy.script.dragHint}</span></div>
</Sheet>

<Toasts items={toasts} ondismiss={(id) => (toasts = toasts.filter((t) => t.id !== id))} />

<style>
  main { height: 100vh; overflow: auto; padding: 40px 40px 200px; }
  h1 { font-size: var(--fs-xl); margin-bottom: 24px; }
  h3 { font-size: var(--fs-sm); color: var(--c-mute); font-weight: var(--fw-medium); margin-bottom: 12px; }
  section { margin-bottom: 40px; }
  .cols { display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start; }
  .line { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
  .between { justify-content: space-between; flex-wrap: nowrap; }
  .tag { width: 72px; font-size: var(--fs-sm); color: var(--c-mute); }
  .ff :global(button) { box-shadow: var(--focus-ring); }
  .savebar {
    display: flex; align-items: center; gap: 4px; width: 420px; height: 56px; padding: 0 10px 0 8px;
    border-radius: var(--r-pill); background: var(--c-ink); color: var(--c-white); box-shadow: var(--sh-bar);
  }
  .spacer { flex: 1; }
  .cap { display: flex; justify-content: space-between; font-size: var(--fs-sm); color: var(--c-mute); margin-bottom: 10px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .center { text-align: center; margin-bottom: 8px; }
  .card {
    width: 420px; padding: 24px; border-radius: var(--r-28); background: var(--c-panel); box-shadow: var(--sh-panel);
  }
  .small { font-size: var(--fs-sm); color: rgba(255, 255, 255, 0.7); margin-bottom: 8px; }
</style>

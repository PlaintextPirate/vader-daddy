<script lang="ts">
  import '$lib/theme/tokens.css';
  import Controller from '$lib/controller/Controller.svelte';
  import { PARTS, PART_ORDER, type PartId } from '$lib/controller/parts';
  import { attachLive, demoBus, type LiveHandle } from '$lib/controller/live';

  let selected = $state<PartId | null>('a');
  let dim = $state(false);
  let running = $state(false);
  let paused = $state(false);
  let ledHover = $state<number | null>(null);
  let leds = $state(['#FF7A2F', '#FF7A2F', '#FF7A2F', '#FF7A2F', '#FF7A2F']);
  let svg = $state<SVGSVGElement>();
  let stats = $state({ updates: 0, frames: 0, work: 0 });

  const captions = {
    m1: { line1: 'A + X', line2: 'Turbo' },
    m3: { line1: 'A', line2: 'Toggle' },
    m4: { line1: 'Not set', muted: true },
    m2: { line1: 'Jump + shoot', line2: 'Script' }
  };
  const RAINBOW = ['#FF0000', '#FF9900', '#CCFF00', '#33FF00', '#00FF66'];

  // Query hooks for screenshots: ?sel=lt&dim=1&demo=1&still=1&press=A,LB&hover=2&rainbow=1
  const q = new URLSearchParams(location.search);
  if (q.has('sel')) selected = (q.get('sel') || null) as PartId | null;
  if (q.has('dim')) dim = true;
  if (q.has('demo')) running = true;
  if (q.has('still')) paused = true;
  if (q.has('hover')) ledHover = Number(q.get('hover'));
  if (q.has('rainbow')) leds = [...RAINBOW];
  const press = q.get('press')?.split(',') ?? [];
  $effect(() => {
    if (!press.length || !svg) return;
    const h = attachLive(svg, { subscribe: () => () => {}, latest: () => ({ connected: true, buttons: press, lx: 0.5, ly: 0.5, lt: 0.6 }) });
    return () => h.detach();
  });

  const bus = demoBus();
  $effect(() => { bus.pause(paused); });

  $effect(() => {
    if (!running || !svg) return;
    const h: LiveHandle = attachLive(svg, bus);
    const t = setInterval(() => {
      stats = h.stats();
      if (import.meta.env.DEV) console.debug('[live]', stats);
    }, 1000);
    return () => { clearInterval(t); h.detach(); };
  });
</script>

<svelte:head><title>Controller kit</title></svelte:head>

<main>
  <div class="stage">
    <Controller {selected} onselect={(p) => (selected = p)} {dim} {leds} {ledHover} {captions} bind:svg />
  </div>

  <section class="controls">
    <div class="row">
      {#each PART_ORDER as id (id)}
        <button class:on={selected === id} onclick={() => (selected = selected === id ? null : id)}>{PARTS[id].name}</button>
      {/each}
    </div>
    <div class="row">
      <label><input type="checkbox" bind:checked={dim} /> Dim (no controller)</label>
      <label><input type="checkbox" bind:checked={running} /> Demo input</label>
      <label><input type="checkbox" bind:checked={paused} disabled={!running} /> Hold still</label>
      <span class="num">updates {stats.updates} · frames {stats.frames} · frames with work {stats.work}</span>
    </div>
    <div class="row">
      LEDs
      {#each leds as _, i (i)}
        <input type="color" bind:value={leds[i]} onfocus={() => (ledHover = i)} onblur={() => (ledHover = null)} />
      {/each}
      <button onclick={() => (leds = [...RAINBOW])}>Rainbow</button>
      <button onclick={() => (leds = Array(5).fill('#FF7A2F'))}>Accent</button>
      <label>Hover
        <select bind:value={ledHover}>
          <option value={null}>none</option>
          {#each [0, 1, 2, 3, 4] as i (i)}<option value={i}>LED {i + 1}</option>{/each}
        </select>
      </label>
    </div>
  </section>
</main>

<style>
  :global(body) { margin: 0; }
  main {
    min-height: 100vh;
    font-family: var(--font, Inter, system-ui, sans-serif);
    color: var(--c-ink, #1B2330);
    background:
      radial-gradient(40% 35% at 15% 15%, rgba(255, 255, 255, 0.9), transparent 70%),
      radial-gradient(35% 30% at 70% 10%, rgba(255, 255, 255, 0.75), transparent 70%),
      radial-gradient(30% 30% at 82% 85%, rgba(255, 255, 255, 0.8), transparent 70%),
      #E6EBF2;
    padding: 180px 0 40px;
  }
  .stage { width: 720px; margin: 0 auto; }
  .controls { width: 720px; margin: 72px auto 0; display: grid; gap: 10px; font-size: 13px; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  button { font: inherit; color: inherit; border: 0; border-radius: 999px; padding: 4px 10px; background: #fff; cursor: pointer; }
  button.on { background: var(--c-ink, #1B2330); color: #fff; }
  input[type='color'] { width: 28px; height: 24px; border: 0; padding: 0; background: none; }
</style>

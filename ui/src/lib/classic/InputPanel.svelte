<script lang="ts">
  import Icon from './Icon.svelte';
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { DEMO } from '$lib/device/transport';

  // Live view of what the Mac receives from the controller. The local service pushes every change; this panel
  // keeps only the newest one and paints it once per screen refresh, writing straight to the canvas and the
  // elements so nothing else on the page re-renders while the sticks move.
  type Input = { connected: boolean; mode?: string; lx?: number; ly?: number; rx?: number; ry?: number; raw?: number[]; lt?: number; rt?: number; buttons?: string[]; rates?: Record<string, number> };
  const DRAWN = new Set(['Up', 'Down', 'Left', 'Right', 'A', 'B', 'X', 'Y', 'LB', 'RB', 'Select', 'Start', 'Home', 'L3', 'R3']);
  const TRAIL = 26;

  let live = $state(false);       // false dims the panel; the last picture stays so the layout never jumps
  let mode = $state('');
  let extras = $state<{ name: string; rate?: number }[]>([]);

  let latest: Input = { connected: false };
  let pending = 0;                // frames still to paint (new data, or a trail that hasn't faded yet)
  let lastGood = 0;
  const buttons = new Map<string, HTMLElement>();
  const reg = (node: HTMLElement, name: string) => { buttons.set(name, node); return { destroy: () => { buttons.delete(name); } }; };
  let canvasL: HTMLCanvasElement, canvasR: HTMLCanvasElement;
  let barL: HTMLElement, barR: HTMLElement;
  const text: Record<string, HTMLElement> = {};
  const txt = (node: HTMLElement, name: string) => { text[name] = node; };
  const trailL: number[] = [], trailR: number[] = [];

  function put(name: string, value: string) { const n = text[name]; if (n && n.textContent !== value) n.textContent = value; }

  function drawStick(c: HTMLCanvasElement, trail: number[], x: number, y: number, pressed: boolean) {
    const dpr = window.devicePixelRatio || 1, size = c.clientWidth;
    if (c.width !== size * dpr) { c.width = c.height = size * dpr; }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    const mid = size / 2, r = mid - 5, X = (v: number) => mid + v * r, Y = (v: number) => mid - v * r;
    g.lineWidth = 1;
    g.strokeStyle = '#242a36'; g.setLineDash([2, 3]); g.strokeRect(mid - r, mid - r, 2 * r, 2 * r); g.setLineDash([]);
    g.beginPath(); g.moveTo(mid, mid - r); g.lineTo(mid, mid + r); g.moveTo(mid - r, mid); g.lineTo(mid + r, mid); g.stroke();
    g.strokeStyle = pressed ? '#ff7a2f' : '#4a5468'; g.lineWidth = pressed ? 2 : 1;
    g.beginPath(); g.arc(mid, mid, r, 0, Math.PI * 2); g.stroke();
    g.lineCap = 'round'; g.lineWidth = 1.6; g.strokeStyle = '#ff7a2f';
    for (let i = 2; i < trail.length; i += 2) {
      g.globalAlpha = (i / trail.length) * 0.6;
      g.beginPath(); g.moveTo(X(trail[i - 2]), Y(trail[i - 1])); g.lineTo(X(trail[i]), Y(trail[i + 1])); g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#ff7a2f'; g.shadowColor = '#ff7a2f'; g.shadowBlur = 10;
    g.beginPath(); g.arc(X(x), Y(y), pressed ? 6 : 4.5, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
  }

  function paint() {
    const s = latest, now = performance.now();
    if (s.connected) lastGood = now;
    // The device vanishes for a moment whenever a setting is being saved; don't flicker for that.
    const isLive = !!s.connected || now - lastGood < 700;
    if (isLive !== live) live = isLive;
    if (s.connected && s.mode && s.mode !== mode) mode = s.mode;
    if (!s.connected) { if (isLive) pending = Math.max(pending, 2); return; } // keep ticking until the grace period ends

    const lx = s.lx ?? 0, ly = s.ly ?? 0, rx = s.rx ?? 0, ry = s.ry ?? 0;
    trailL.push(lx, ly); trailR.push(rx, ry);
    if (trailL.length > TRAIL * 2) { trailL.splice(0, 2); trailR.splice(0, 2); }
    const down = new Set(s.buttons ?? []), rates = s.rates ?? {};
    drawStick(canvasL, trailL, lx, ly, down.has('L3'));
    drawStick(canvasR, trailR, rx, ry, down.has('R3'));
    put('l', `${Math.round(Math.hypot(lx, ly) * 100)}%`); put('r', `${Math.round(Math.hypot(rx, ry) * 100)}%`);
    put('lraw', `${s.raw?.[0] ?? 0}, ${s.raw?.[1] ?? 0}`); put('rraw', `${s.raw?.[2] ?? 0}, ${s.raw?.[3] ?? 0}`);
    barL.style.transform = `scaleX(${s.lt ?? 0})`; barR.style.transform = `scaleX(${s.rt ?? 0})`;
    put('lt', `${Math.round((s.lt ?? 0) * 100)}%`); put('rt', `${Math.round((s.rt ?? 0) * 100)}%`);
    for (const [name, el] of buttons) {
      el.classList.toggle('on', down.has(name));
      const rate = rates[name] ? `${rates[name]}/s` : '';
      if (el.dataset.rate !== rate) el.dataset.rate = rate;
    }
    const other = [...new Set([...down, ...Object.keys(rates)])].filter((n) => !DRAWN.has(n)).map((name) => ({ name, rate: rates[name] }));
    if (JSON.stringify(other) !== JSON.stringify(extras)) extras = other;
  }

  onMount(() => {
    let raf = 0, stream: EventSource | undefined, t0 = performance.now();
    const receive = (s: Input) => { latest = s; pending = TRAIL; };
    const open = () => {
      if (DEMO || stream) return;
      stream = new EventSource('/api/input/stream');
      stream.onmessage = (e) => receive(JSON.parse(e.data));
      stream.onerror = () => receive({ connected: false }); // the browser reconnects by itself
    };
    const close = () => { stream?.close(); stream = undefined; };
    const visibility = () => (document.hidden ? close() : open());
    document.addEventListener('visibilitychange', visibility);
    open();
    (function frame(t: number) {
      raf = requestAnimationFrame(frame);
      if (DEMO) { // sticks tracing circles, triggers breathing, a button now and then
        const a = (t - t0) / 700;
        receive({ connected: true, mode: 'XInput', lx: Math.cos(a) * 0.8, ly: Math.sin(a) * 0.8, rx: Math.sin(a * 0.6) * 0.5, ry: 0.2,
          raw: [Math.round(Math.cos(a) * 26000), Math.round(Math.sin(a) * 26000), Math.round(Math.sin(a * 0.6) * 16000), 6500],
          lt: (Math.sin(a) + 1) / 2, rt: 0.25, buttons: Math.floor(a) % 3 === 0 ? ['A', 'LB'] : Math.floor(a) % 3 === 1 ? ['Up'] : [], rates: {} });
      }
      if (pending > 0) { pending--; paint(); }
    })(t0);
    return () => { cancelAnimationFrame(raf); close(); document.removeEventListener('visibilitychange', visibility); };
  });
</script>

<div class="head"><h3><Icon name="input" />Live input</h3>{#if mode}<span class="badge" in:fade>{mode}</span>{/if}</div>

<div class="body" class:idle={!live}>
  <div class="sticks">
    <div><canvas bind:this={canvasL} aria-label="Left stick"></canvas><b use:txt={'l'}>0%</b><small use:txt={'lraw'}>0, 0</small></div>
    <div><canvas bind:this={canvasR} aria-label="Right stick"></canvas><b use:txt={'r'}>0%</b><small use:txt={'rraw'}>0, 0</small></div>
  </div>

  <div class="trig"><span>LT</span><div class="bar"><i bind:this={barL}></i></div><code use:txt={'lt'}>0%</code></div>
  <div class="trig"><span>RT</span><div class="bar"><i bind:this={barR}></i></div><code use:txt={'rt'}>0%</code></div>

  <div class="pad">
    <span class="btn wide lb" use:reg={'LB'}>LB</span>
    <span class="btn wide rb" use:reg={'RB'}>RB</span>
    <div class="cluster">
      <span class="btn u" use:reg={'Up'}>▲</span><span class="btn l" use:reg={'Left'}>◀</span>
      <span class="btn r" use:reg={'Right'}>▶</span><span class="btn d" use:reg={'Down'}>▼</span>
    </div>
    <div class="mid">
      <span class="btn pill" use:reg={'Select'}>Select</span>
      <span class="btn pill" use:reg={'Home'}>Home</span>
      <span class="btn pill" use:reg={'Start'}>Start</span>
    </div>
    <div class="cluster round">
      <span class="btn u" use:reg={'Y'}>Y</span><span class="btn l" use:reg={'X'}>X</span>
      <span class="btn r" use:reg={'B'}>B</span><span class="btn d" use:reg={'A'}>A</span>
    </div>
    <span class="btn wide lb" use:reg={'L3'}>L3</span>
    <span class="btn wide rb" use:reg={'R3'}>R3</span>
  </div>

  <div class="extras">
    {#each extras as e (e.name)}
      <span class="chip" transition:fade={{ duration: 120 }}>{e.name}{#if e.rate}<small> {e.rate}/s</small>{/if}</span>
    {/each}
  </div>
</div>

<p class="hint">
  {#if !live}Waiting for the controller…
  {:else if mode === 'XInput'}The circle is full tilt; the dashed square is what a stick could reach without circular correction. In XInput, M1–M4, C and Z show up as whatever they are mapped to.
  {:else}The circle is full tilt; the dashed square is what a stick could reach without circular correction.{/if}
</p>

<style>
  .head { display: flex; align-items: center; justify-content: space-between; height: 28px; margin-bottom: 12px; }
  h3 { display: flex; align-items: center; gap: 8px; font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: var(--dim); }
  .badge { font-size: 11.5px; padding: 2px 9px; border-radius: 99px; color: var(--ok); background: color-mix(in srgb, var(--ok) 14%, transparent); }
  .body { display: grid; gap: 10px; transition: opacity 300ms ease, filter 300ms ease; }
  .body.idle { opacity: 0.35; filter: saturate(0.3); }

  .sticks { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 4px; }
  .sticks div { display: grid; justify-items: center; gap: 1px; }
  canvas { width: 100%; aspect-ratio: 1; display: block; margin-bottom: 4px; }
  .sticks b, code { font-variant-numeric: tabular-nums; }
  small { color: var(--faint); font-size: 11px; font-variant-numeric: tabular-nums; }

  .trig { display: grid; grid-template-columns: 22px 1fr 36px; gap: 8px; align-items: center; color: var(--dim); font-size: 12px; }
  .trig code { text-align: right; color: var(--fg); }
  .bar { height: 6px; background: var(--line); border-radius: 99px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--acc); border-radius: 99px; transform-origin: left; transform: scaleX(0); will-change: transform; }

  .pad { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px 6px; align-items: center; margin-top: 8px; padding: 12px 10px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }
  .btn {
    display: grid; place-items: center; position: relative; font-size: 11px; font-weight: 600; color: var(--dim);
    background: var(--raised); border: 1px solid var(--line2); border-radius: 7px;
    transition: background 60ms linear, color 60ms linear, box-shadow 120ms ease, transform 60ms ease;
  }
  .pad :global(.btn.on) { background: var(--acc); border-color: var(--acc); color: var(--on-acc); box-shadow: 0 0 12px rgba(255, 122, 47, 0.55); transform: scale(0.94); }
  .btn::after { content: attr(data-rate); position: absolute; top: -9px; right: -8px; font-size: 9.5px; font-weight: 600; color: var(--acc); background: var(--bg); border-radius: 99px; padding: 0 4px; }
  .btn:not([data-rate])::after, .pad :global(.btn[data-rate=''])::after { display: none; }
  .wide { height: 22px; width: 62px; }
  .lb { justify-self: start; grid-column: 1; }
  .rb { justify-self: end; grid-column: 3; }
  .cluster { display: grid; grid-template: repeat(3, 24px) / repeat(3, 24px); gap: 2px; justify-self: center; }
  .cluster .btn { font-size: 9px; }
  .cluster.round .btn { border-radius: 50%; font-size: 11px; }
  .u { grid-area: 1 / 2; } .l { grid-area: 2 / 1; } .r { grid-area: 2 / 3; } .d { grid-area: 3 / 2; }
  .mid { display: grid; gap: 4px; }
  .pill { font-size: 9.5px; padding: 2px 6px; border-radius: 99px; }

  .extras { display: flex; gap: 6px; flex-wrap: wrap; min-height: 24px; }
  .chip { padding: 2px 9px; border-radius: 99px; background: var(--acc); color: var(--on-acc); font-weight: 600; font-size: 12px; }
  .chip small { color: inherit; font-weight: 500; }
  .hint { margin-top: 10px; font-size: 12px; }
</style>

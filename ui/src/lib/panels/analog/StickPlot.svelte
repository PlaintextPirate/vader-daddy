<!-- Range tab plot: the stick's area (circle, or rounded square when circular range is off), axes, the dead-zone
     disc and the dashed outer-limit ring on a static canvas; the live stick position with a short fading trail
     on a second canvas painted from the input bus. The "{n}% tilt" readout is written with textContent. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { copy, tilt } from '$lib/copy';
  import { useBus } from './bus';
  import { sizeCanvas, liveLoop, stickOf, tiltOf, reducedMotion, type Sized } from './LiveCanvas';

  let { side, deadzone, outer, circular }: { side: 'left' | 'right'; deadzone: number; outer: number; circular: boolean } = $props();

  const bus = useBus();
  let base: HTMLCanvasElement;
  let live: HTMLCanvasElement;
  let readout: HTMLSpanElement;
  let baseSize: Sized | null = $state.raw(null);
  let liveSize: Sized | null = null;
  const TRAIL_MS = 320;
  let trail: { x: number; y: number; t: number }[] = [];
  let loop: ReturnType<typeof liveLoop> | null = null;

  const geom = (s: Sized) => ({ cx: s.w / 2, cy: s.h / 2, r: Math.min(s.w, s.h) / 2 - 4 });
  const token = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim() || '#1b2330';

  function outline(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    ctx.beginPath();
    if (circular) ctx.arc(cx, cy, r, 0, Math.PI * 2);
    else ctx.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.26);
  }

  function drawBase(s: Sized) {
    const { ctx, w, h } = s, { cx, cy, r } = geom(s);
    const ink = token(base, '--c-ink'), track = token(base, '--c-track'), well = token(base, '--c-well');
    ctx.clearRect(0, 0, w, h);
    outline(ctx, cx, cy, r);
    ctx.fillStyle = well;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = track;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
    ctx.lineWidth = 1;
    ctx.stroke();
    // outer limit
    ctx.setLineDash([5, 4]);
    outline(ctx, cx, cy, r * (outer / 100));
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // dead zone
    if (deadzone > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, r * (deadzone / 100)), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(27, 35, 48, 0.12)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(27, 35, 48, 0.5)';
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function paint([x, y]: number[], now: number): boolean {
    const s = liveSize;
    if (!s) return false;
    const { ctx, w, h } = s, { cx, cy, r } = geom(s);
    const px = cx + x * r, py = cy - y * r;
    const last = trail[trail.length - 1];
    if (!last || last.x !== px || last.y !== py) trail.push({ x: px, y: py, t: now });
    const keep = reducedMotion() ? 1 : TRAIL_MS;
    while (trail.length > 1 && now - trail[0].t > keep) trail.shift();
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.5;
    for (let i = 1; i < trail.length; i++) {
      ctx.globalAlpha = Math.max(0, 1 - (now - trail[i].t) / TRAIL_MS) * 0.9;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.strokeStyle = '#1b2330';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1b2330';
    ctx.stroke();
    // Text changes cost a layout: write only when the shown percent changes.
    const t = tilt(tiltOf(x, y) * 100);
    if (t !== readout.textContent) readout.textContent = t;
    return trail.length > 1;
  }

  onMount(() => {
    const offBase = sizeCanvas(base, (s) => { baseSize = s; });
    const offLive = sizeCanvas(live, (s) => { liveSize = s; trail = []; loop?.kick(); });
    loop = liveLoop(bus, (st) => stickOf(st, side), paint);
    return () => { offBase(); offLive(); loop?.stop(); };
  });

  // Static layer: redrawn on resize and whenever a setting changes.
  $effect(() => {
    void deadzone; void outer; void circular;
    if (baseSize) drawBase(baseSize);
  });
</script>

<figure class="plot">
  <div class="stage" role="img" aria-label={copy.analog.plot}>
    <canvas bind:this={base}></canvas>
    <canvas bind:this={live}></canvas>
  </div>
  <figcaption><span bind:this={readout} class="num">{tilt(0)}</span></figcaption>
</figure>

<style>
  .plot { margin: 0; }
  .stage { position: relative; width: 216px; height: 216px; margin: 0 auto; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  figcaption { height: 24px; margin-top: 8px; text-align: center; font-size: var(--fs-md); color: var(--c-mute); }
  .num { font-variant-numeric: tabular-nums; }
</style>

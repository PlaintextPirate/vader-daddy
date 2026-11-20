<!-- Response tab graph: output against tilt. Faint grid, the 4-corner curve, the 9 table samples (read-only dots),
     two draggable control points (focusable sliders: arrows 1 %, Shift 5 %), and a live tilt marker painted from
     the input bus with setAttribute. Dragging previews locally and commits once, on pointerup. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { copy, gives } from '$lib/copy';
  import { clampPoint, sampleCurve, type Pt, type StickResponse } from '$lib/protocol/response';
  import { useBus } from './bus';
  import { liveLoop, stickOf, tiltOf } from './LiveCanvas';
  import { W, H, PLOT, sx, sy, toPct, curvePath, tableDots, pointPct, nudge, keyStep } from './graph';

  type Which = 'p0' | 'p1';
  let { response, side, onpoint }: {
    response: StickResponse;
    side: 'left' | 'right';
    onpoint: (which: Which, p: Pt) => void;
  } = $props();

  const bus = useBus();
  let svg: SVGSVGElement;
  let marker: SVGGElement;
  let markerLine: SVGLineElement;
  let markerDot: SVGCircleElement;
  let selected = $state<Which>('p0');
  let drag = $state<{ which: Which; p: Pt } | null>(null);

  const shown = $derived(drag ? { ...response, [drag.which]: drag.p } : response);
  const sel = $derived(pointPct(shown[selected]));
  const text = (w: Which) => { const p = pointPct(shown[w]); return gives(p.x, p.y); };
  // For the live marker, which paints outside Svelte's update cycle.
  let curveNow: StickResponse | null = null;
  let loop: ReturnType<typeof liveLoop> | null = null;
  $effect(() => { curveNow = shown; loop?.kick(); });

  function svgPoint(e: PointerEvent): Pt {
    const b = svg.getBoundingClientRect();
    const pct = toPct(((e.clientX - b.left) / b.width) * W, ((e.clientY - b.top) / b.height) * H);
    return { x: Math.round((pct.x * 127) / 100), y: Math.round((pct.y * 127) / 100) };
  }

  function down(e: PointerEvent, which: Which) {
    if (e.button !== 0) return;
    e.preventDefault();
    selected = which;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    (e.currentTarget as SVGElement).focus();
    drag = { which, p: response[which] };
  }
  function move(e: PointerEvent) {
    if (drag) drag = { which: drag.which, p: clampPoint(response, drag.which, svgPoint(e)) };
  }
  function up() {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.p.x !== response[d.which].x || d.p.y !== response[d.which].y) onpoint(d.which, d.p);
  }
  function key(e: KeyboardEvent, which: Which) {
    const step = keyStep(e.key, e.shiftKey);
    if (!step) return;
    e.preventDefault();
    selected = which;
    const p = clampPoint(response, which, nudge(response[which], step[0], step[1]));
    if (p.x !== response[which].x || p.y !== response[which].y) onpoint(which, p);
  }

  onMount(() => {
    loop = liveLoop(bus, (s) => { const [x, y] = stickOf(s, side); return [tiltOf(x, y) * 100]; }, ([t]) => {
      if (!curveNow) return false;
      const x = sx(t), y = sy(sampleCurve(curveNow, t));
      marker.style.opacity = t > 0.5 ? '1' : '0';
      markerLine.setAttribute('x1', String(x));
      markerLine.setAttribute('x2', String(x));
      markerDot.setAttribute('cx', String(x));
      markerDot.setAttribute('cy', String(y));
      return false;
    });
    return () => loop?.stop();
  });
</script>

<div class="graph">
  <svg bind:this={svg} viewBox="0 0 {W} {H}" role="group" aria-label={copy.analog.graph}>
    <rect width={W} height={H} rx="16" class="bg" />
    {#each [0, 25, 50, 75, 100] as g (g)}
      <line class="grid" x1={sx(g)} x2={sx(g)} y1={PLOT.top} y2={PLOT.bottom} />
      <line class="grid" x1={PLOT.left} x2={PLOT.right} y1={sy(g)} y2={sy(g)} />
    {/each}
    <text x="16" y="22" class="axis">{copy.stick.axes.output}</text>
    <text x={W - 16} y={H - 12} class="axis" text-anchor="end">{copy.stick.axes.tilt}</text>
    <g bind:this={marker} class="marker" style="opacity: 0">
      <line bind:this={markerLine} y1={PLOT.top} y2={PLOT.bottom} />
      <circle bind:this={markerDot} r="4" />
    </g>
    <path class="curve" d={curvePath(shown)} />
    {#each tableDots(shown) as d, i (i)}
      <circle class="dot" cx={d.x} cy={d.y} r="3.5" />
    {/each}
    {#each ['p0', 'p1'] as const as w (w)}
      {@const p = pointPct(shown[w])}
      <g
        class="handle"
        class:on={selected === w}
        role="slider"
        tabindex="0"
        aria-label={copy.analog.points[w]}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(p.y)}
        aria-valuetext={text(w)}
        onpointerdown={(e) => down(e, w)}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={up}
        onkeydown={(e) => key(e, w)}
        onfocus={() => (selected = w)}
      >
        <circle class="hit" cx={sx(p.x)} cy={sy(p.y)} r="15" />
        <circle class="point" cx={sx(p.x)} cy={sy(p.y)} r="7" />
      </g>
    {/each}
  </svg>
  <p class="readout num" aria-live="polite">{gives(sel.x, sel.y)}</p>
</div>

<style>
  .graph { user-select: none; }
  svg { display: block; width: 100%; height: auto; aspect-ratio: 328 / 240; overflow: visible; touch-action: none; }
  .bg { fill: var(--c-well); }
  .grid { stroke: var(--c-white); stroke-opacity: 0.7; stroke-width: 1; }
  .axis { font-size: 13px; fill: var(--c-mute); }
  .curve { fill: none; stroke: var(--c-ink); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
  .dot { fill: var(--c-white); stroke: var(--c-ink); stroke-width: 1.5; pointer-events: none; }
  .marker { transition: opacity var(--t-fast) var(--ease-out); pointer-events: none; }
  .marker line { stroke: var(--c-accent); stroke-width: 1.5; stroke-dasharray: 3 3; }
  .marker circle { fill: var(--c-accent); }
  .handle { cursor: grab; outline: none; }
  .handle:active { cursor: grabbing; }
  .hit { fill: transparent; }
  .point { fill: var(--c-white); stroke: var(--c-ink); stroke-width: 2; }
  .on .point { fill: var(--c-accent); }
  .handle:focus-visible .hit { fill: none; stroke: var(--c-ink); stroke-width: 2; stroke-opacity: 0.9; }
  .readout {
    height: 24px;
    margin: 18px 0 0;
    text-align: center;
    font-size: var(--fs-md);
    color: var(--c-mute);
    font-variant-numeric: tabular-nums;
  }
  @media (prefers-reduced-motion: reduce) {
    .marker { transition: none; }
  }
</style>

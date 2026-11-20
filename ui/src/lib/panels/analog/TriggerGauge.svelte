<!-- Live trigger gauge: an arc from released to fully pulled. The darker band is the range that counts (dead zone
     to full-press point); the pull is drawn grey where it does not count and ink where it does, with a knob at
     its end. The number and the status line are written with textContent; everything is painted from the input
     bus, never through Svelte state. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { copy } from '$lib/copy';
  import { useBus } from './bus';
  import { liveLoop, triggerOf } from './LiveCanvas';

  let { side, deadzone, full }: { side: 'left' | 'right'; deadzone: number; full: number } = $props();

  // Geometry (user units): a 220° arc around (CX, CY), from lower left over the top to lower right.
  const CX = 140, CY = 128, R = 104, SWEEP = 220;
  const ARC = 'M42.27 163.57A104 104 0 1 1 237.73 163.57';
  const turn = (pct: number) => `rotate(${(Math.min(100, Math.max(0, pct)) / 100) * SWEEP} ${CX} ${CY})`;
  /** Dash pattern showing the arc from a to b (path length is 100). */
  const seg = (a: number, b: number) => `stroke-dasharray:${Math.max(0, b - a)} 200;stroke-dashoffset:${-a}`;

  const bus = useBus();
  let root: HTMLDivElement;
  let raw: SVGPathElement;
  let live: SVGPathElement;
  let knob: SVGGElement;
  let num: HTMLSpanElement;
  let status: HTMLSpanElement;
  let kick = () => {};

  onMount(() => {
    const loop = liveLoop(bus, (s) => [triggerOf(s, side)], ([v]) => {
      const p = Math.min(1, Math.max(0, v ?? 0)) * 100;
      const hi = Math.max(deadzone, full);
      raw.style.cssText = seg(0, p) + `;opacity:${p > 0.3 ? 1 : 0}`;
      const counted = Math.min(p, hi);
      live.style.cssText = seg(deadzone, counted) + `;opacity:${counted - deadzone > 0.3 ? 1 : 0}`;
      knob.setAttribute('transform', turn(p));
      const state = p <= 0 ? 'idle' : p < deadzone ? 'dead' : p >= hi ? 'full' : 'live';
      if (root.dataset.state !== state) root.dataset.state = state;
      const n = String(Math.round(p));
      if (n !== num.textContent) num.textContent = n; // text writes cost a layout
      const t = state === 'dead' ? copy.trigger.inDeadZone : state === 'full' ? copy.trigger.fullPressLive : copy.trigger.pressedWord;
      if (t !== status.textContent) status.textContent = t;
      return false;
    });
    kick = loop.kick;
    return loop.stop;
  });

  // The thresholds moved: repaint the live parts against them.
  $effect(() => { void deadzone; void full; kick(); });
</script>

<div class="gauge" bind:this={root} data-state="idle" aria-hidden="true">
  <svg viewBox="0 0 280 176">
    <path class="track" d={ARC} pathLength="100" />
    <path class="range" d={ARC} pathLength="100" style={seg(deadzone, Math.max(deadzone, full))} />
    <path class="raw" d={ARC} pathLength="100" bind:this={raw} />
    <path class="live" d={ARC} pathLength="100" bind:this={live} />
    <!-- Threshold pins sit outside the arc, so nothing flat cuts across its rounded ends. -->
    <g transform={turn(deadzone)}><circle class="pin" cx="28.2" cy="168.7" r="4" /></g>
    <g transform={turn(full)}><circle class="pin end" cx="28.2" cy="168.7" r="4" /></g>
    <g bind:this={knob}><circle class="knob" cx="42.27" cy="163.57" r="5" /></g>
  </svg>
  <div class="readout">
    <div class="value"><span bind:this={num}>0</span><span class="unit">%</span></div>
    <span class="status" bind:this={status}>{copy.trigger.pressedWord}</span>
  </div>
</div>

<style>
  .gauge { position: relative; width: 100%; max-width: 280px; margin: 0 auto var(--s-3); aspect-ratio: 280 / 176; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  path { fill: none; stroke-width: 16; stroke-linecap: round; }
  .track { stroke: var(--c-well); }
  .range { stroke: var(--c-track); }
  .raw { stroke: var(--c-boundary); opacity: 0; }
  .live { stroke: var(--c-ink); opacity: 0; }
  .pin { fill: var(--c-white); stroke: var(--c-mute); stroke-width: 2; }
  .pin.end { fill: var(--c-mute); }
  .knob { fill: var(--c-white); stroke: var(--c-ink); stroke-width: 2; filter: drop-shadow(0 1px 2px rgba(27, 35, 48, 0.3)); }

  .readout {
    position: absolute; left: 0; right: 0; top: 42%; display: grid; justify-items: center; gap: 6px;
    font-variant-numeric: tabular-nums; pointer-events: none;
  }
  .value { font-size: 56px; line-height: 1; font-weight: var(--fw-bold); letter-spacing: -0.03em; color: var(--c-ink); }
  .unit { font-size: 24px; font-weight: var(--fw-semibold); letter-spacing: 0; color: var(--c-mute); margin-left: 2px; }
  .status {
    padding: 3px 12px; border-radius: var(--r-pill); font-size: var(--fs-sm); font-weight: var(--fw-semibold);
    color: var(--c-mute); background: transparent;
    transition: background var(--t-fast), color var(--t-fast);
  }
  .gauge:global([data-state='idle']) .value { color: var(--c-mute); }
  .gauge:global([data-state='dead']) .status { background: var(--c-well); }
  .gauge:global([data-state='full']) .status { background: var(--c-ink); color: var(--c-white); }
  .gauge:global([data-state='full']) .live { filter: drop-shadow(0 0 6px rgba(27, 35, 48, 0.45)); }
  @media (forced-colors: active) {
    .track { stroke: GrayText; } .range { stroke: CanvasText; opacity: 0.5; } .raw { stroke: GrayText; }
    .live { stroke: Highlight; } .knob, .pin { stroke: CanvasText; }
  }
</style>

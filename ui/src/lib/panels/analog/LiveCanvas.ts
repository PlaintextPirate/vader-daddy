/**
 * Small helpers for the analog panels' live drawings. No Svelte state: values go straight to canvas/DOM.
 *
 * - `sizeCanvas` keeps a canvas's backing store at CSS size × devicePixelRatio (ResizeObserver; only on resize).
 * - `liveLoop` runs ONE requestAnimationFrame chain fed by the input bus. It schedules a frame only when the
 *   sampled values changed (quantised), or while `paint` asks for more frames (a fading trail), and never while
 *   the page is hidden. So it idles when the stick is still; unmounting the tab stops it.
 */
import type { InputState } from '$lib/device/input';

export interface Sized { ctx: CanvasRenderingContext2D; w: number; h: number; dpr: number }

export function sizeCanvas(canvas: HTMLCanvasElement, onResize: (s: Sized) => void): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  let lastW = -1, lastH = -1, lastDpr = -1;
  const apply = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = window.devicePixelRatio || 1;
    if (w === lastW && h === lastH && dpr === lastDpr) return;
    lastW = w; lastH = h; lastDpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    onResize({ ctx, w, h, dpr });
  };
  const ro = new ResizeObserver(apply);
  ro.observe(canvas);
  apply();
  return () => ro.disconnect();
}

export interface Source { subscribe(fn: (s: InputState) => void): () => void }

/**
 * `sample` turns an input frame into numbers; `paint` draws them and returns true while it wants another frame
 * even without new input (animations settling). Values are compared after rounding to 1/500.
 */
export function liveLoop(bus: Source, sample: (s: InputState) => number[], paint: (v: number[], now: number) => boolean) {
  let current: number[] = [];
  let shown = '';
  let raf = 0;
  let settling = false;
  const frame = (now: number) => {
    raf = 0;
    shown = key(current);
    settling = paint(current, now);
    if (settling) schedule();
  };
  const schedule = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); };
  const key = (v: number[]) => v.map((x) => Math.round(x * 500)).join(',');
  const off = bus.subscribe((s) => {
    current = sample(s);
    if (settling || key(current) !== shown) schedule();
  });
  const onVis = () => { if (!document.hidden) { shown = ''; schedule(); } };
  document.addEventListener('visibilitychange', onVis);
  return {
    /** Repaint once (after a static change, e.g. a resize). */
    kick() { shown = ''; schedule(); },
    stop() { off(); document.removeEventListener('visibilitychange', onVis); cancelAnimationFrame(raf); raf = 0; }
  };
}

const finite = (v: number | undefined) => (Number.isFinite(v) ? (v as number) : 0);
export const stickOf = (s: InputState, side: 'left' | 'right'): [number, number] =>
  s.connected ? (side === 'left' ? [finite(s.lx), finite(s.ly)] : [finite(s.rx), finite(s.ry)]) : [0, 0];
export const triggerOf = (s: InputState, side: 'left' | 'right') => (s.connected ? finite(side === 'left' ? s.lt : s.rt) : 0);
export const tiltOf = (x: number, y: number) => Math.min(1, Math.hypot(x, y));

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

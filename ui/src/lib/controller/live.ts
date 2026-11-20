/**
 * Paints live controller input onto the drawing without Svelte state: one requestAnimationFrame chain that only
 * runs while something changed, and only while the page is visible.
 *
 * Hooks in the drawing (Controller.svelte):
 *   [data-btn="A"]        gets `.is-pressed` while that stream name is down (space-separated list allowed)
 *   [data-stick="l|r"]    stick cap group, moved with a CSS transform (max travel MAX_TRAVEL user units)
 *   [data-pull="l|r"]     trigger fill overlay, scaled vertically from its bottom edge by the pull (0..1); the
 *                         bottom PULL_HIDDEN of it sits behind the bumper, so any pull starts above that
 */

/** Structural copy of lib/device/input.ts InputState (axes −1..1 with y up positive, triggers 0..1). */
export interface InputState {
  connected: boolean;
  mode?: string;
  lx?: number; ly?: number; rx?: number; ry?: number;
  lt?: number; rt?: number;
  buttons?: string[];
}

export interface InputSource {
  subscribe(fn: (s: InputState) => void): () => void;
  latest(): InputState;
}

export const MAX_TRAVEL = 20;
/** Share of the trigger shape the bumper covers (the fill rect spans the whole shape). */
export const PULL_HIDDEN = 0.45;
const pullScale = (v: number) => (v > 0 ? PULL_HIDDEN + (1 - PULL_HIDDEN) * v : 0);

export interface LiveHandle {
  detach(): void;
  /** frames: animation frames run; work: frames that wrote to the DOM. */
  stats(): { updates: number; frames: number; work: number };
}

const clamp = (v: number | undefined, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v! : 0));
/** Quantise so sub-pixel jitter does not cost DOM writes. */
const q = (v: number) => Math.round(v * 200) / 200;

export function attachLive(root: SVGSVGElement, bus: InputSource): LiveHandle {
  const btnEls = new Map<string, Element[]>();
  for (const el of root.querySelectorAll('[data-btn]')) {
    for (const n of (el.getAttribute('data-btn') ?? '').split(/\s+/)) if (n) {
      const list = btnEls.get(n) ?? [];
      list.push(el);
      btnEls.set(n, list);
    }
  }
  const stickL = root.querySelector<SVGGElement>('[data-stick="l"]');
  const stickR = root.querySelector<SVGGElement>('[data-stick="r"]');
  const pullL = root.querySelector<SVGElement>('[data-pull="l"]');
  const pullR = root.querySelector<SVGElement>('[data-pull="r"]');

  let state: InputState = bus.latest();
  let dirty = true;
  let raf = 0;
  let updates = 0, frames = 0, work = 0;
  // What is on screen now.
  let down = new Set<string>();
  let shown = { lx: NaN, ly: NaN, rx: NaN, ry: NaN, lt: NaN, rt: NaN };

  function schedule() {
    if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function frame() {
    raf = 0;
    frames++;
    if (!dirty || document.hidden) return;
    dirty = false;
    const s = state;
    const on = s.connected;
    const next = {
      lx: on ? q(clamp(s.lx, -1, 1)) : 0, ly: on ? q(clamp(s.ly, -1, 1)) : 0,
      rx: on ? q(clamp(s.rx, -1, 1)) : 0, ry: on ? q(clamp(s.ry, -1, 1)) : 0,
      lt: on ? q(clamp(s.lt, 0, 1)) : 0, rt: on ? q(clamp(s.rt, 0, 1)) : 0
    };
    const nowDown = new Set(on ? s.buttons ?? [] : []);
    let wrote = false;

    for (const n of down) if (!nowDown.has(n)) { for (const el of btnEls.get(n) ?? []) el.classList.remove('is-pressed'); wrote = true; }
    for (const n of nowDown) if (!down.has(n)) { for (const el of btnEls.get(n) ?? []) el.classList.add('is-pressed'); wrote = true; }
    down = nowDown;

    if (next.lx !== shown.lx || next.ly !== shown.ly) {
      if (stickL) stickL.style.transform = `translate(${next.lx * MAX_TRAVEL}px, ${-next.ly * MAX_TRAVEL}px)`;
      wrote = true;
    }
    if (next.rx !== shown.rx || next.ry !== shown.ry) {
      if (stickR) stickR.style.transform = `translate(${next.rx * MAX_TRAVEL}px, ${-next.ry * MAX_TRAVEL}px)`;
      wrote = true;
    }
    if (next.lt !== shown.lt) { if (pullL) pullL.style.transform = `scaleY(${pullScale(next.lt)})`; wrote = true; }
    if (next.rt !== shown.rt) { if (pullR) pullR.style.transform = `scaleY(${pullScale(next.rt)})`; wrote = true; }
    shown = next;
    if (wrote) work++;
  }

  const unsub = bus.subscribe((s) => {
    state = s;
    updates++;
    dirty = true;
    schedule();
  });
  const onVis = () => { if (dirty) schedule(); };
  document.addEventListener('visibilitychange', onVis);
  schedule();

  return {
    detach() {
      unsub();
      document.removeEventListener('visibilitychange', onVis);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      for (const n of down) for (const el of btnEls.get(n) ?? []) el.classList.remove('is-pressed');
      for (const el of [stickL, stickR, pullL, pullR]) el?.style.removeProperty('transform');
    },
    stats: () => ({ updates, frames, work })
  };
}

export interface DemoBus extends InputSource {
  /** While paused the bus keeps emitting the same state (to show that the painter idles). */
  pause(p: boolean): void;
}

/** Synthetic input for demos: circling sticks, breathing triggers, face buttons taking turns. */
export function demoBus(): DemoBus {
  const subs = new Set<(s: InputState) => void>();
  let state: InputState = { connected: true, mode: 'xinput', buttons: [] };
  let timer: ReturnType<typeof setInterval> | undefined;
  let paused = false;
  const t0 = performance.now();
  const cycle = ['A', 'B', 'Y', 'X', 'Up', 'Right', 'Down', 'Left', 'LB', 'RB', 'Start', 'Select', 'L3', 'R3', 'Home', 'C', 'Z'];

  function tick() {
    if (!paused) {
      const t = (performance.now() - t0) / 1000;
      const step = Math.floor(t / 0.6);
      state = {
        connected: true, mode: 'xinput',
        lx: 0.7 * Math.cos(t * 1.6), ly: 0.7 * Math.sin(t * 1.6),
        rx: Math.sin(t * 0.9) * 0.9, ry: Math.sin(t * 1.8) * 0.5,
        lt: (1 - Math.cos(t * 1.3)) / 2, rt: (1 - Math.cos(t * 0.8 + 1)) / 2,
        buttons: t % 0.6 < 0.35 ? [cycle[step % cycle.length]] : []
      };
    } else {
      state = { ...state };
    }
    for (const fn of subs) fn(state);
  }

  return {
    subscribe(fn) {
      subs.add(fn);
      if (!timer) timer = setInterval(tick, 1000 / 60);
      return () => {
        subs.delete(fn);
        if (!subs.size && timer) { clearInterval(timer); timer = undefined; }
      };
    },
    latest: () => state,
    pause(p) { paused = p; }
  };
}

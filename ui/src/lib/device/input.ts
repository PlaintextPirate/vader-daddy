import { DEMO } from './transport';

/**
 * Live input bus: what the Mac receives from the controller (sticks −1..1, triggers 0..1, pressed button names as
 * `vader/inputs.py` names them: A B X Y LB RB L3 R3 Start Select Home Up Down Left Right C Z …).
 *
 * Non-reactive on purpose: plain callbacks, no Svelte state per frame. Subscribers paint straight to the DOM.
 * Source: `GET /api/input/stream` (server-sent events). Reconnects with backoff (0.5 s doubling to 5 s, reset on
 * a message); after three failed attempts in a row it polls `GET /api/input` every 100 ms instead. Pauses while
 * the window is hidden. In demo mode it makes up smooth input. A failing stream only means "no live input": it
 * never raises errors.
 */
export interface InputState {
  connected: boolean;
  mode?: string;
  lx?: number; ly?: number; rx?: number; ry?: number;
  raw?: number[];
  lt?: number; rt?: number;
  buttons?: string[];
  /** Presses per second per button (turbo shows as a rate, not as a steady press). */
  rates?: Record<string, number>;
}
export type InputStatus = 'idle' | 'live' | 'retrying';

export interface InputBus {
  subscribe(fn: (s: InputState) => void): () => void;
  /** Fires once per button going down (edge), with the button's stream name. */
  onPress(fn: (name: string) => void): () => void;
  latest(): InputState;
  start(): void;
  stop(): void;
  readonly status: InputStatus;
  /** Where input comes from: the event stream, polling (after the stream failed three times), or the demo. */
  readonly transport: 'stream' | 'poll' | 'demo';
  /** Debug/demo helper: behave as if this button had just been pressed. */
  press(name: string): void;
}

const MIN_BACKOFF = 500, MAX_BACKOFF = 5000, POLL_MS = 100, FAILS_BEFORE_POLLING = 3;
const OFF: InputState = { connected: false };

export function createInputBus(opts: { demo?: boolean; url?: string; pollUrl?: string } = {}): InputBus {
  const demo = opts.demo ?? DEMO;
  const url = opts.url ?? '/api/input/stream', pollUrl = opts.pollUrl ?? '/api/input';
  const subs = new Set<(s: InputState) => void>();
  const pressSubs = new Set<(name: string) => void>();
  let state: InputState = OFF;
  let down = new Set<string>();
  let status: InputStatus = 'idle';
  let running = false;
  let es: EventSource | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let raf = 0;
  let backoff = MIN_BACKOFF, fails = 0, polling = false;

  function emit(s: InputState, edges = true) {
    state = s;
    const now = new Set(s.connected ? s.buttons ?? [] : []);
    if (edges) for (const b of now) if (!down.has(b)) for (const fn of pressSubs) safe(() => fn(b));
    down = now;
    for (const fn of subs) safe(() => fn(s));
  }
  const safe = (fn: () => void) => { try { fn(); } catch { /* a painter bug must not stop the stream */ } };

  function fail() {
    if (state.connected) emit(OFF);
    status = 'retrying';
    fails++;
    if (fails >= FAILS_BEFORE_POLLING) polling = true;
    timer = setTimeout(open, backoff);
    backoff = Math.min(MAX_BACKOFF, backoff * 2);
  }
  const ok = () => { status = 'live'; fails = 0; backoff = MIN_BACKOFF; };

  function openStream() {
    try { es = new EventSource(url); } catch { fail(); return; }
    es.onmessage = (e) => {
      ok();
      try { emit(JSON.parse(e.data) as InputState); } catch { /* malformed frame: skip */ }
    };
    es.onerror = () => { es?.close(); es = undefined; fail(); };
  }

  async function poll() {
    try {
      const r = await fetch(pollUrl, { signal: AbortSignal.timeout(2000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const s = (await r.json()) as InputState;
      if (!running || document.hidden) return;
      ok();
      emit(s);
      timer = setTimeout(poll, POLL_MS);
    } catch {
      if (running && !document.hidden) fail();
    }
  }

  function demoFrame(t: number) {
    raf = requestAnimationFrame(demoFrame);
    const a = t / 700, beat = Math.floor(a) % 3;
    // Triggers rest at 0 and pull now and then (one short pulse each, at different times), so screenshots never
    // show a standing pull. pulse(phase) is 0 except for one 1.4 s hump in every 8.4 s.
    const pulse = (phase: number) => { const x = (a + phase) % 12; return x < 2 ? Math.sin((x / 2) * Math.PI) : 0; };
    // Sticks tracing circles, a button now and then (no press edges: see `press`).
    emit({
      connected: true, mode: 'XInput',
      lx: Math.cos(a) * 0.8, ly: Math.sin(a) * 0.8, rx: Math.sin(a * 0.6) * 0.5, ry: 0.2,
      lt: pulse(0), rt: pulse(6),
      buttons: beat === 0 ? ['A', 'LB'] : beat === 1 ? ['Up'] : [], rates: {}
    }, false);
    status = 'live';
  }

  function open() {
    timer = undefined;
    if (!running || document.hidden) return;
    if (demo) { if (!raf) raf = requestAnimationFrame(demoFrame); return; }
    if (polling) poll(); else openStream();
  }

  function close() {
    es?.close(); es = undefined;
    clearTimeout(timer); timer = undefined;
    cancelAnimationFrame(raf); raf = 0;
    status = 'idle';
    if (state.connected) emit(OFF);
  }

  const visibility = () => {
    if (document.hidden) close();
    else if (running) { backoff = MIN_BACKOFF; open(); }
  };

  return {
    subscribe(fn) { subs.add(fn); fn(state); return () => { subs.delete(fn); }; },
    onPress(fn) { pressSubs.add(fn); return () => { pressSubs.delete(fn); }; },
    latest: () => state,
    get status() { return status; },
    get transport() { return demo ? 'demo' : polling ? 'poll' : 'stream'; },
    start() {
      if (running || typeof window === 'undefined') return;
      running = true;
      document.addEventListener('visibilitychange', visibility);
      open();
    },
    stop() {
      running = false;
      document.removeEventListener('visibilitychange', visibility);
      close();
    },
    press(name) { for (const fn of pressSubs) safe(() => fn(name)); }
  };
}

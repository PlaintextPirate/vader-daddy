/**
 * Debug log: a ring buffer of the last 500 things that happened (transport tx/rx, errors, saves). Silent unless
 * looked at: Settings shows it, and in dev or with `?debug` in the URL it is on `window.__vader.log`.
 */
export type LogKind = 'tx' | 'rx' | 'info' | 'error' | 'save';
export interface DebugEntry { t: number; kind: LogKind; text: string; detail?: unknown }

const MAX = 500;
const buf: DebugEntry[] = [];
const listeners = new Set<(e: DebugEntry) => void>();

export const log = {
  add(kind: LogKind, text: string, detail?: unknown) {
    const e: DebugEntry = { t: Date.now(), kind, text, detail };
    buf.push(e);
    if (buf.length > MAX) buf.splice(0, buf.length - MAX);
    for (const fn of listeners) fn(e);
  },
  /** Oldest first. A copy, safe to keep. */
  entries: (): DebugEntry[] => buf.slice(),
  clear() { buf.length = 0; },
  subscribe(fn: (e: DebugEntry) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  /** The log as text, for copying into a bug report; `last` limits it to the newest lines. */
  text: (last = MAX) => buf.slice(-last).map(line).join('\n'),
  /** Number of entries ever added (cheap change detection for views). */
  get count() { return added; }
};

let added = 0;
listeners.add(() => { added++; });
/** Local wall-clock time (as History shows dates), with milliseconds: "14:03:27.512". */
const clock = (t: number) => {
  const d = new Date(t);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
};
const line = (e: DebugEntry) => `${clock(e.t)} ${e.kind.padEnd(5)} ${e.text}`;

export const debugEnabled = (): boolean =>
  typeof location !== 'undefined' && (import.meta.env?.DEV || new URLSearchParams(location.search).has('debug'));

/** Puts the stores on `window.__vader` (dev builds and `?debug` only). */
export function exposeDebug(objects: Record<string, unknown>) {
  if (!debugEnabled()) return;
  (window as unknown as { __vader: unknown }).__vader = { ...objects, log };
}

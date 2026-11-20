/**
 * Runs actions one at a time, in the order they were asked for. `busy` is the label of the action running now
 * (null once the queue is empty), so the UI reflects the whole queue, not just the last action to finish.
 * A `quiet` action waits its turn like any other but never shows as busy (background work the user did not ask for).
 * Never call `run` from inside a queued action: it would wait for itself. Pure; tested in queue.test.ts.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private labels: { label: string; quiet: boolean }[] = [];

  private onChange: (busy: string | null) => void;
  constructor(onChange: (busy: string | null) => void = () => {}) { this.onChange = onChange; }

  get busy(): string | null { return this.labels.find((l) => !l.quiet)?.label ?? null; }
  get size(): number { return this.labels.length; }

  /** Queues `fn`; its result (or rejection) is passed through. A failed action does not stop the queue. */
  run<T>(label: string, fn: () => Promise<T>, quiet = false): Promise<T> {
    const entry = { label, quiet };
    this.labels.push(entry);
    this.onChange(this.busy);
    const p = this.tail.then(fn);
    const done = () => { this.labels.splice(this.labels.indexOf(entry), 1); this.onChange(this.busy); };
    this.tail = p.then(done, done);
    return p;
  }
}

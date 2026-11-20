import { VaderTransport, DEMO, type DeviceInfo } from './transport';
import { AppError, toAppError, rawText } from './errors';
import { SerialQueue } from './queue';
import { log } from '$lib/stores/debug';
import { toasts } from '$lib/stores/toasts.svelte';

const RECONNECT_MS = 5000;

/**
 * The connection to the controller (through the local service). `run()` is the only place that sets `busy`,
 * catches errors, logs them and raises an error toast; everything that talks to the controller goes through it.
 */
class Device {
  readonly t = new VaderTransport();
  readonly demo = DEMO;
  status = $state<'connecting' | 'connected' | 'disconnected'>('connecting');
  info = $state<DeviceInfo | null>(null);
  /** Label of the action running now; null when nothing runs or waits. */
  busy = $state<string | null>(null);
  private queue = new SerialQueue((b) => { this.busy = b; });
  /** Last connection failure, shown on the no-controller screen. */
  lastError = $state<AppError | null>(null);

  private listeners = new Set<(info: DeviceInfo) => void | Promise<void>>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    this.t.onLog = (e) => log.add(e.dir, e.text);
    this.t.onDisconnect = () => this.lost();
  }

  /** Called after every successful (re)connect, e.g. to read the current slot. Returns an unsubscribe. */
  onConnect(fn: (info: DeviceInfo) => void | Promise<void>) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /** Starts the reconnect loop and the first connection attempt. Returns a stop function. */
  start() {
    if (!this.timer) this.timer = setInterval(() => {
      if (this.status === 'disconnected' && !this.busy && !document.hidden) this.connect(true);
    }, RECONNECT_MS);
    this.connect(true);
    return () => { clearInterval(this.timer); this.timer = undefined; };
  }

  /** Looks for the controller. `quiet` (the background loop) only toasts when the kind of failure changes. */
  async connect(quiet = false): Promise<boolean> {
    if (this.status === 'connected') return true;
    const firstTry = this.status === 'connecting';
    // The background loop retries silently, so the no-controller screen does not flicker every 5 s.
    if (!quiet) this.status = 'connecting';
    try {
      const info = await this.t.deviceInfo();
      this.info = info;
      this.status = 'connected';
      this.lastError = null;
      log.add('info', `connected: ${info.modeName}, firmware ${info.firmware}`);
      for (const fn of this.listeners) await fn(info);
      return true;
    } catch (e) {
      const err = toAppError(e);
      const changed = this.lastError?.code !== err.code;
      this.lastError = err;
      this.status = 'disconnected';
      this.info = null;
      if (changed || !quiet) log.add('error', `connect: ${rawText(err)}`, err.detail);
      // "No controller", a missing helper and another model each have their own empty screen: no toast.
      if (!['no_device', 'no_helper', 'unsupported'].includes(err.code) && (!quiet || changed) && !firstTry) toasts.error(err.message);
      return false;
    }
  }

  private modeCheck = false;
  /**
   * The live-input stream names the mode it sees ("XInput" / "DInput") without talking to the controller. When
   * that disagrees with how we connected (FN + A switches mode; the dongle re-appears as another USB device and
   * the service quietly reconnects), read the connection again and tell the listeners, as after a reconnect.
   */
  noteInputMode(streamMode: string | undefined) {
    if (this.demo || this.modeCheck || this.status !== 'connected' || !this.info || !streamMode) return;
    if (streamMode === (this.info.mode === 'dongle-xinput' ? 'XInput' : 'DInput')) return;
    this.modeCheck = true;
    this.run('connection', () => this.t.deviceInfo(), { toast: false })
      .then((info) => info && this.modeChanged(info))
      .finally(() => setTimeout(() => { this.modeCheck = false; }, 2000));  // not more than one check every 2 s
  }

  /** The same controller is now connected another way (XInput <-> DInput): tell the listeners, as after a reconnect. */
  async modeChanged(info: DeviceInfo) {
    if (info.mode === this.info?.mode) return;
    this.info = info;
    log.add('info', `connection changed: ${info.modeName}`);
    for (const fn of this.listeners) await fn(info);
  }

  /** The controller (or the service) went away: show the no-controller screen; the loop reconnects. */
  private lost(err?: AppError) {
    if (err) this.lastError = err;
    if (this.status === 'disconnected') return;
    log.add('info', err?.code === 'service_down' ? 'service gone' : 'controller gone');
    this.status = 'disconnected';
    this.info = null;
  }

  /**
   * Runs one action against the controller: actions are queued and run one at a time (`busy` stays set while
   * any is running or waiting); errors become a toast and `undefined`. `onError` sees the AppError first (e.g. to
   * mark a slot as unreadable); `toast: false` keeps it quiet. The raw text of a failure goes to the log only.
   */
  run<T>(label: string, fn: () => Promise<T>, opts: { toast?: boolean; onError?: (e: AppError) => void } = {}): Promise<T | undefined> {
    return this.queue.run(label, async () => {
      log.add('info', `${label}…`);
      try {
        return await fn();
      } catch (e) {
        const err = toAppError(e);
        log.add('error', `${label}: ${rawText(err)}`, err.detail);
        if (err.code === 'no_device' || err.code === 'service_down' || err.code === 'timeout') this.lost(err);
        opts.onError?.(err);
        // A lost controller shows as the no-controller screen; a toast on top would only repeat it.
        if (opts.toast !== false && err.code !== 'no_device') toasts.error(err.message);
        return undefined;
      }
    });
  }

  get canSaveLighting() { return !!this.info?.canSaveLighting; }
}

export const device = new Device();
export { AppError };

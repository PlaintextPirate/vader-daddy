import { compactHex, parseHex } from '$lib/protocol/bytes';
import { CONFIG_BYTES } from '$lib/protocol/config';
import { LED_WRITE_BYTES } from '$lib/protocol/led';
import { FACTORY_CONFIG_HEX, FACTORY_RAINBOW_LED_HEX } from '$lib/protocol/fixtures';
import { AppError } from './errors';
import { copy } from '$lib/copy';

/** No single call may take longer than this, so a hung service cannot freeze the UI. */
export const CALL_TIMEOUT_MS = 15_000;

/** Open the page with ?demo to try the interface with no controller: a stand-in device held in memory. */
export const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');
/**
 * Demo-only switches for trying failure states from the console (`__vader.demo`):
 *   offline      every call answers "no controller" (the no-controller screen; reconnects when set back)
 *   serviceDown  every call fails as if the local service were not running
 *   hang         calls never answer, so the call timeout fires (after `timeoutMs`, default 15 s)
 *   failSlots    reads of these slots fail (warning dot on the profile switcher)
 *   lighting     false = the connection cannot save lighting (as the dongle in DInput mode)
 *   dropWrites   writes keep all but one byte (a read-back mismatch): profile byte 110, lighting byte 6
 */
export const demoControls = { offline: false, serviceDown: false, hang: false, timeoutMs: CALL_TIMEOUT_MS, failSlots: [] as number[], lighting: true, dropWrites: false };
/** In demo mode: flips one byte of hex data (at byte `i`), as a controller that did not take every change. */
const dropOne = (h: string, i: number) => h.slice(0, i * 2) + ((parseInt(h.slice(i * 2, i * 2 + 2), 16) + 1) & 0xff).toString(16).padStart(2, '0') + h.slice(i * 2 + 2);
const demo = {
  profile: {} as Record<number, string>,
  led: {} as Record<number, string>,
  sleep: 15,
  keys: { M1: null, M2: null, M3: null, M4: null } as Record<string, string | null>,
  keysAllowed: false,
  settings: [
    ['polling_rate', 'Polling rate', 1, [[1, '1000 Hz'], [2, '500 Hz'], [4, '250 Hz'], [8, '125 Hz']]],
    ['stick_resolution', 'Stick resolution', 3, [[3, '12 bit'], [5, '11 bit'], [2, '10 bit'], [4, '9 bit'], [1, '8 bit']]],
    ['centre_sensitivity', 'Stick centre sensitivity', 17, [[14, 'high'], [17, 'medium'], [20, 'low']]],
    ['rebound', 'Stick rebound filter', 1, [[0, 'off'], [1, 'on']]],
    ['auto_centre', 'Stick automatic calibration', 0, [[0, 'off'], [1, 'on']]],
    ['trigger_antishake', 'Trigger anti-shake', 0, [[0, 'off'], [1, 'on']]]
  ] as [string, string, number, [number, string][]][]
};
const demoSettings = () => demo.settings.map(([key, name, value, c]) => ({
  key, name, value, label: c.find((x) => x[0] === value)?.[1] ?? String(value), choices: c.map(([v, label]) => ({ value: v, label }))
}));
async function demoCall(op: string, b: Record<string, any>): Promise<Record<string, any>> {
  await new Promise((r) => setTimeout(r, op.startsWith('write') || op === 'save' ? 500 : 60));
  const strip = (h: string) => h.replaceAll(' ', '');
  switch (op) {
    case 'info': return demoControls.lighting
      ? { device_id: 85, firmware: '6.9.3.3', connection: 'dongle-xinput', name: 'Dongle · XInput (demo)', can_save_lighting: true }
      : { device_id: 85, firmware: '6.9.3.3', connection: 'dongle-dinput', name: 'Dongle · DInput (demo)', can_save_lighting: false };
    case 'read_profile': return { data: demo.profile[b.slot] ?? strip(FACTORY_CONFIG_HEX) };
    case 'read_led': return { data: demo.led[b.slot] ?? strip(FACTORY_RAINBOW_LED_HEX) };
    case 'write_profile': demo.profile[b.slot] = demoControls.dropWrites ? dropOne(b.data, 110) : b.data; return {};
    case 'write_led': demo.led[b.slot] = (demoControls.dropWrites ? dropOne(b.data, 6) : b.data).padEnd(1000, '0'); return {};
    case 'keys_set': if (b.paddle in demo.keys) demo.keys[b.paddle] = b.code ?? null; // falls through
    case 'keys_permission': if (op === 'keys_permission') demo.keysAllowed = true; // falls through
    case 'keys_get': return { keys: { ...demo.keys }, allowed: demo.keysAllowed, paddles: ['M2', 'M3', 'M4'], codes: [] };
    case 'sleep_set': demo.sleep = b.minutes; // falls through
    case 'sleep_get': return { minutes: demo.sleep };
    case 'func_set': { const s = demo.settings.find((x) => x[0] === b.key); if (s) s[2] = b.value; } // falls through
    case 'func_get': return { settings: demoSettings() };
    case 'switch_mode': demoControls.lighting = !demoControls.lighting; return demoCall('info', b);
    default: return { status: 1 };
  }
}

/**
 * Transport for the VaderDaddy Mac app: talks to the local `vader serve` API (same origin), which reaches the
 * controller over the cable, the dongle in DInput mode, or the dongle in XInput mode through the root helper.
 *
 * It keeps the method names of the original WebHID transport (see git history) so the UI code is unchanged.
 */
export interface DeviceInfo {
  deviceId: number;
  firmware: string;
  /** How the controller is reached right now. */
  mode: 'cable' | 'dongle-xinput' | 'dongle-dinput';
  modeName: string;
  /** False on the dongle in DInput mode: lighting applies but is lost at power-off. */
  canSaveLighting: boolean;
  connection: 'wired' | 'dongle';
}

export interface HardwareSetting {
  key: string;
  name: string;
  value: number;
  label: string;
  choices: { value: number; label: string }[];
}

/** Keyboard keys the paddles send on this Mac (done by the app, not by the controller). */
export interface PaddleKeys {
  /** Paddle name ('M2') -> KeyboardEvent.code ('Space'), or null for none. */
  keys: Record<string, string | null>;
  /** False until macOS allows the app to send keys (Privacy & Security > Accessibility). */
  allowed: boolean;
  /** Paddles the app can see in the input stream. */
  paddles: string[];
  /** Key codes that can be sent (empty when unknown). */
  codes: string[];
}

export type LogEntry = { t: number; dir: 'tx' | 'rx' | 'info' | 'error'; text: string };

export class VaderTransport {
  onLog: (e: LogEntry) => void = () => {};
  onDisconnect: () => void = () => {};

  static get supported() {
    return typeof fetch !== 'undefined';
  }

  private log(dir: LogEntry['dir'], text: string) {
    this.onLog({ t: Date.now(), dir, text });
  }

  private async call(op: string, body: Record<string, unknown> = {}, timeoutMs = CALL_TIMEOUT_MS): Promise<Record<string, any>> {
    this.log('tx', `${op} ${Object.entries(body).map(([k, v]) => `${k}=${typeof v === 'string' && v.length > 24 ? v.slice(0, 24) + '…' : v}`).join(' ')}`);
    let r: Record<string, any>;
    if (DEMO) {
      if (demoControls.offline) { this.onDisconnect(); throw new AppError('no_device', copy.errors.noDevice, 'offline (demo)'); }
      if (demoControls.serviceDown) throw new AppError('service_down', copy.errors.service);
      if (op.startsWith('read') && demoControls.failSlots.includes(body.slot as number)) throw new AppError('controller', copy.errors.controller, { error: `slot ${body.slot} did not answer (demo)` });
      // Same timeout as a real call, so a hung service can be tried without one.
      const out = await Promise.race([
        demoControls.hang ? new Promise<never>(() => {}) : demoCall(op, body),
        new Promise<never>((_, no) => setTimeout(() => no(new AppError('service_down', copy.errors.timeout)), demoControls.timeoutMs))
      ]);
      this.log('rx', `${op} ok (demo)`);
      return out;
    }
    try {
      const res = await fetch('/api/call', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, ...body }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      r = await res.json();
    } catch (e) {
      const timedOut = e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError');
      throw new AppError('service_down', timedOut ? copy.errors.timeout : copy.errors.service, e);
    }
    if (!r.ok) {
      // The service's own text (r.error) goes to the log through `detail`, never to the user.
      if (r.code === 'no_device') { this.onDisconnect(); throw new AppError('no_device', copy.errors.noDevice, r); }
      if (r.code === 'unsupported_model') throw new AppError('unsupported', copy.errors.otherModel, r);
      if (r.code === 'no_helper') throw new AppError('no_helper', copy.errors.noHelper, r);
      throw new AppError('controller', copy.errors.controller, r);
    }
    this.log('rx', `${op} ok`);
    return r;
  }

  /** True when a controller is reachable. */
  async reconnect(): Promise<boolean> {
    await this.deviceInfo();
    return true;
  }
  pick = () => this.reconnect();
  async close() {}

  deviceInfo = async (): Promise<DeviceInfo> => this.asInfo(await this.call('info'));
  private asInfo(r: Record<string, any>): DeviceInfo {
    return {
      deviceId: r.device_id,
      firmware: r.firmware,
      mode: r.connection,
      modeName: r.name,
      canSaveLighting: r.can_save_lighting,
      connection: r.connection === 'cable' ? 'wired' : 'dongle'
    };
  }

  /** Hex from the service as bytes; anything malformed or of an unexpected length is a typed error. */
  private bytes(op: string, h: unknown, lengths: number[]): Uint8Array {
    const b = typeof h === 'string' ? parseHex(h) : null;
    if (!b || !lengths.includes(b.length))
      throw new AppError('bad_reply', copy.errors.badReply, { error: `${op}: ${b ? `${b.length} bytes, expected ${lengths.join(' or ')}` : 'malformed data'}` });
    return b;
  }

  readConfig = async (slot: number) => this.bytes('read_profile', (await this.call('read_profile', { slot })).data, [CONFIG_BYTES]);
  /** 500 bytes as read (50 parcels); some paths answer with the 490 that are written. */
  readLed = async (slot: number) => this.bytes('read_led', (await this.call('read_led', { slot })).data, [500, LED_WRITE_BYTES]);
  writeLed = async (slot: number, data: Uint8Array) => { await this.call('write_led', { slot, data: compactHex(data) }); };
  writeConfig = async (slot: number, data: Uint8Array) => { await this.call('write_profile', { slot, data: compactHex(data) }); };

  /** Idle minutes before the controller switches itself off (0 = never); null when this connection can't read it. */
  getSleep = async (): Promise<number | null> => (await this.call('sleep_get')).minutes ?? null;
  setSleep = async (minutes: number): Promise<number> => (await this.call('sleep_set', { minutes })).minutes;

  /** Switches the controller off now. It goes away; Home wakes it. */
  sleepNow = async () => { await this.call('sleep_now'); };
  /** Flips the dongle between XInput and DInput. It leaves USB and comes back as the other device. */
  /** Answers once it is back (the service waits for it, up to ~20 s), with the connection in the new mode. */
  switchMode = async (): Promise<DeviceInfo> => this.asInfo(await this.call('switch_mode', {}, 30_000));

  /** Controller-wide hardware options (polling rate, stick resolution, …); null when unavailable on this connection. */
  getSettings = async (): Promise<HardwareSetting[] | null> => (await this.call('func_get')).settings ?? null;
  setSetting = async (key: string, value: number): Promise<HardwareSetting[]> => (await this.call('func_set', { key, value })).settings;

  private paddleKeys = (r: Record<string, any>): PaddleKeys => ({ keys: r.keys ?? {}, allowed: !!r.allowed, paddles: r.paddles ?? [], codes: r.codes ?? [] });
  getKeys = async () => this.paddleKeys(await this.call('keys_get'));
  setKey = async (paddle: string, code: string | null) => this.paddleKeys(await this.call('keys_set', { paddle, code }));
  /** Shows macOS's permission prompt for sending keys. */
  askKeyPermission = async () => this.paddleKeys(await this.call('keys_permission'));

  /** Run both grip motors briefly (0..255 each). Only over the dongle in XInput mode. */
  buzz = async (left: number, right: number, ms: number) => { await this.call('buzz', { left, right, ms }); };

  /** Commit to flash. Returns 1 on success (also when the mode needs no separate save). */
  async save(): Promise<number> {
    const r = await this.call('save');
    return r.status ?? 1;
  }
}

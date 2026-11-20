import { VaderTransport, type DeviceInfo, type HardwareSetting, type LogEntry } from '$lib/device/transport';
import { decodeConfig, encodeConfig, type ProfileConfig } from '$lib/protocol/config';
import { decodeLed, encodeLed, LED_WRITE_BYTES, type LedConfig } from '$lib/protocol/led';
import { fromHex, hex } from '$lib/protocol/bytes';

export const SLOTS = [0, 1, 2, 3];

export interface Backup {
  id: string;
  date: string;
  label: string;
  config: Record<number, string>; // hex per slot
  led: Record<number, string>;
}

const BACKUP_KEY = 'vaderdaddy.backups.v1';
const OLD_BACKUP_KEY = 'vaderctl.backups.v1'; // from the proof-of-concept; read once so nothing is lost

function loadBackups(): Backup[] {
  try { return JSON.parse(localStorage.getItem(BACKUP_KEY) ?? localStorage.getItem(OLD_BACKUP_KEY) ?? '[]'); } catch { return []; }
}

class AppState {
  t = new VaderTransport();
  status = $state<'unsupported' | 'disconnected' | 'connected'>(VaderTransport.supported ? 'disconnected' : 'unsupported');
  info = $state<DeviceInfo | null>(null);
  busy = $state<string | null>(null);
  error = $state<string | null>(null);
  notice = $state<string | null>(null);
  log = $state<LogEntry[]>([]);
  configs = $state<Record<number, ProfileConfig>>({});
  leds = $state<Record<number, LedConfig>>({});
  backups = $state<Backup[]>(loadBackups());
  /** Auto-sleep timeout in minutes (0 = never), or null when it can't be read on this connection. */
  sleepMinutes = $state<number | null>(null);
  /** Hardware options that live outside the profile; null when this connection can't read them. */
  settings = $state<HardwareSetting[] | null>(null);

  constructor() {
    this.t.onLog = (e) => { this.log = [...this.log.slice(-400), e]; };
    this.t.onDisconnect = () => { this.status = 'disconnected'; this.info = null; };
  }

  get wired() { return this.info?.connection === 'wired'; }
  /** Profiles can be saved on every connection; lighting can't on the dongle in DInput mode. */
  get canSaveLighting() { return !!this.info?.canSaveLighting; }

  private async run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    this.busy = label; this.error = null; this.notice = null;
    try { return await fn(); }
    catch (e) { this.error = e instanceof Error ? e.message : String(e); this.t.onLog({ t: Date.now(), dir: 'error', text: this.error }); }
    finally { this.busy = null; }
  }

  async tryReconnect() {
    if (this.status === 'unsupported') return;
    if (await this.t.reconnect().catch(() => false)) await this.afterConnect();
    else this.status = 'disconnected';
  }

  pick = () => this.run('Connecting', async () => {
    if (await this.t.pick()) await this.afterConnect();
  });

  private async afterConnect() {
    this.status = 'connected';
    this.info = await this.t.deviceInfo();
    this.sleepMinutes = await this.t.getSleep().catch(() => null);
    this.settings = await this.t.getSettings().catch(() => null);
    await this.readSlot(0);
  }

  refreshInfo = () => this.run('Reading device info', async () => { this.info = await this.t.deviceInfo(); });

  readSlot = (slot: number) => this.run(`Reading slot ${slot}`, async () => {
    this.configs[slot] = decodeConfig(await this.t.readConfig(slot));
    this.leds[slot] = decodeLed(await this.t.readLed(slot));
  });

  readAll = () => this.run('Reading all slots', async () => {
    for (const s of SLOTS) {
      // Not every slot answers on every connection (slot 3 has failed before); back up what can be read.
      try {
        this.configs[s] = decodeConfig(await this.t.readConfig(s));
        this.leds[s] = decodeLed(await this.t.readLed(s));
      } catch (e) { if (s === 0) throw e; }
    }
  });

  setSetting = (s: HardwareSetting, value: number) => this.run(`Setting ${s.name.toLowerCase()}`, async () => {
    this.settings = await this.t.setSetting(s.key, value);
    const now = this.settings.find((x) => x.key === s.key);
    if (now?.value !== value) throw new Error(`The controller kept ${s.name.toLowerCase()} at ${now?.label}.`);
    this.notice = `${s.name}: ${now.label}.`;
  });

  setSleep = (minutes: number) => this.run('Setting sleep timer', async () => {
    this.sleepMinutes = await this.t.setSleep(minutes);
    this.notice = minutes ? `The controller now switches off after ${minutes} idle minutes.` : 'The controller will no longer switch off by itself.';
  });

  // ------------------------------------------------------------ backups

  private persistBackups() {
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(this.backups.slice(-30))); } catch { /* storage full or blocked */ }
  }

  snapshot(label: string): Backup {
    const b: Backup = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      label,
      config: Object.fromEntries(Object.entries(this.configs).map(([k, v]) => [k, hex(v.raw)])),
      led: Object.fromEntries(Object.entries(this.leds).map(([k, v]) => [k, hex(v.raw)]))
    };
    this.backups = [...this.backups, b];
    this.persistBackups();
    return b;
  }

  deleteBackup(id: string) {
    this.backups = this.backups.filter((b) => b.id !== id);
    this.persistBackups();
  }

  importBackup(json: string) {
    const b = JSON.parse(json) as Backup;
    if (!b.config && !b.led) throw new Error('Not a VaderDaddy backup');
    b.id = crypto.randomUUID();
    this.backups = [...this.backups, b];
    this.persistBackups();
  }

  // ------------------------------------------------------------ saving

  private requireLightingSave() {
    if (!this.canSaveLighting) throw new Error("Lighting can't be saved over the dongle in DInput mode. Switch the controller to XInput mode, or plug in the cable.");
  }

  /** Write a lighting slot, verify by reading back, then commit to flash. Verified flow. */
  saveLed = (slot: number, cfg: LedConfig) => this.run('Saving lighting', async () => {
    this.requireLightingSave();
    this.snapshot(`Before lighting change (slot ${slot})`);
    const data = encodeLed(cfg);
    await this.t.writeLed(slot, data);
    const back = await this.t.readLed(slot);
    const bad = [...data.keys()].filter((i) => back[i] !== data[i]);
    if (bad.length) throw new Error(`Lighting read-back differs at ${bad.length} bytes — not saved.`);
    const status = await this.t.save();
    this.leds[slot] = decodeLed(back);
    this.notice = status === 1 ? 'Lighting saved to the controller.' : `Saved, but the controller returned status ${status}.`;
  });

  /** Profile write (verified on a Vader 4 Pro, fw 6.9.3.3: cable, dongle DInput, dongle XInput). */
  saveConfig = (slot: number, cfg: ProfileConfig) => this.run('Saving profile', async () => {
    this.snapshot(`Before profile change (slot ${slot})`);
    const data = encodeConfig(cfg);
    await this.t.writeConfig(slot, data);
    const back = await this.t.readConfig(slot);
    const bad = [...data.keys()].filter((i) => i !== 225 && i !== 226 && back[i] !== data[i]); // 225-226 = save version
    if (bad.length) throw new Error(`Profile read-back differs at ${bad.length} bytes (first: ${bad.slice(0, 8).join(', ')}) — not saved. Restore from Backups if needed.`);
    const status = await this.t.save();
    this.configs[slot] = decodeConfig(back);
    this.notice = status === 1 ? 'Profile saved to the controller.' : `Saved, but the controller returned status ${status}.`;
  });

  restore = (b: Backup) => this.run('Restoring backup', async () => {
    this.requireLightingSave();
    for (const [slot, h] of Object.entries(b.led)) await this.t.writeLed(+slot, fromHex(h).slice(0, LED_WRITE_BYTES));
    for (const [slot, h] of Object.entries(b.config)) await this.t.writeConfig(+slot, fromHex(h));
    await this.t.save();
    for (const s of Object.keys(b.led)) this.leds[+s] = decodeLed(await this.t.readLed(+s));
    for (const s of Object.keys(b.config)) this.configs[+s] = decodeConfig(await this.t.readConfig(+s));
    this.notice = 'Backup restored (lighting + profiles).';
  });

}

export const app = new AppState();

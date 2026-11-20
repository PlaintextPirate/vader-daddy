import type { HardwareSetting } from '$lib/device/transport';
import { device } from '$lib/device/device.svelte';
import { copy, fmt, minutes as minutesText } from '$lib/copy';
import { toasts } from '$lib/stores/toasts.svelte';

/**
 * Controller-wide options (Settings view): read on demand, applied immediately (the one exception to "nothing is
 * written until Save"). `null` means this connection cannot read them; `undefined` means not read yet.
 */
class Hardware {
  settings = $state<HardwareSetting[] | null | undefined>(undefined);
  sleep = $state<number | null | undefined>(undefined);
  /** Bumped whenever a write ends, so controls re-render from the controller's answer (reverting a refusal). */
  rev = $state(0);
  /** A setting the palette asked to show; the Settings view scrolls to it and clears this. */
  focus = $state<string | null>(null);

  /** Display name and one-line help for a setting key (our copy first, the service's name otherwise). */
  describe = (s: Pick<HardwareSetting, 'key' | 'name'>) => copy.settings.options[s.key] ?? { name: s.name, help: '' };

  load = async () => {
    if (device.status !== 'connected') return;
    await device.run(copy.settings.title, async () => {
      this.settings = await device.t.getSettings().catch(() => null);
      this.sleep = await device.t.getSleep().catch(() => null);
    }, { toast: false });
  };

  /** Applies one option; when the controller keeps the old value, says so and shows what it kept. */
  set = async (s: HardwareSetting, value: number) => {
    const name = this.describe(s).name;
    await device.run(`${name}…`, async () => {
      const all = await device.t.setSetting(s.key, value);
      this.settings = all;
      const now = all.find((x) => x.key === s.key);
      if (now?.value !== value) toasts.error(fmt(copy.settings.kept, { name: name.toLowerCase(), value: this.choiceLabel(now?.label ?? '?') }));
      else toasts.ok(fmt(copy.settings.changed, { name, value: this.choiceLabel(now.label) }));
    });
    this.rev++;
  };

  setSleep = async (minutes: number) => {
    await device.run(copy.settings.sleepAfter, async () => {
      this.sleep = await device.t.setSleep(minutes);
      toasts.ok(this.sleep ? fmt(copy.settings.sleepSet, { n: this.sleep }) : copy.settings.sleepNever);
    });
    this.rev++;
  };

  // Both make the controller go away (off, or back as the other USB device), so look again afterwards: a
  // missing controller shows the empty screen, a changed mode is picked up from the live-input stream.
  turnOff = async () => {
    await device.run(copy.settings.offLabel, async () => { await device.t.sleepNow(); toasts.ok(copy.settings.offDone); });
    setTimeout(() => device.run('connection', () => device.t.deviceInfo(), { toast: false }), 1500);
  };
  switchMode = async () => {
    toasts.ok(copy.settings.modeSwitching);
    const info = await device.run(copy.settings.modeLabel, () => device.t.switchMode());
    if (info) await device.modeChanged(info);
  };

  /** The service's choice labels are lower case ("on", "medium"); the UI uses sentence case. */
  choiceLabel = (l: string) => (l.charAt(0).toUpperCase() + l.slice(1)).replace(/\b(\d+) bit\b/, '$1-bit');

  /** "Never", "15 minutes". */
  sleepLabel = (m: number) => (m === 0 ? copy.settings.never : minutesText(m));

  /** Forget everything read (the controller went away). */
  reset = () => { this.settings = undefined; this.sleep = undefined; };
}

export const hardware = new Hardware();

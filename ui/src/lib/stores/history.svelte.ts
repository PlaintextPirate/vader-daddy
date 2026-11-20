import { decodeLed, LED_WRITE_BYTES } from '$lib/protocol/led';
import { fromHex, hex } from '$lib/protocol/bytes';
import { AppError, toAppError } from '$lib/device/errors';
import { device } from '$lib/device/device.svelte';
import { copy, fmt, slotLabel } from '$lib/copy';
import { storage } from './storage';
import { toasts } from './toasts.svelte';
import { log } from './debug';
import { profile } from './profile.svelte';
import { lighting } from './lighting.svelte';
import { session } from './session.svelte';
import { parseBackup, backupProblem, planRestore, restoreWrites, type Backup } from './backupFile';

export { parseBackup, type Backup };

const BACKUP_KEY = 'vaderdaddy.backups.v1';
const OLD_BACKUP_KEY = 'vaderctl.backups.v1'; // from the proof of concept; read once so nothing is lost
const KEEP = 30;
const SLOTS = [0, 1, 2, 3];

function load(): Backup[] {
  const v = storage.get(BACKUP_KEY) ?? storage.get(OLD_BACKUP_KEY);
  try { return v ? (JSON.parse(v) as Backup[]) : []; } catch { return []; }
}

/** "profile 2", "profiles 2 and 3". */
const slotList = (slots: number[]) => slots.map((s) => slotLabel(s)).join(', ');

/** Backups of the profiles and lighting as last read from the controller. Newest last. */
class History {
  backups = $state<Backup[]>(load());

  private persist() { storage.set(BACKUP_KEY, JSON.stringify(this.backups.slice(-KEEP))); }

  /** Records every slot read so far (the originals, never the drafts). */
  snapshot = (label: string): Backup => {
    const config: Record<number, string> = {}, led: Record<number, string> = {};
    for (const [k, s] of Object.entries(profile.slots)) config[+k] = hex(s.original.raw);
    for (const [k, s] of Object.entries(lighting.slots)) led[+k] = hex(s.base.raw);
    const b: Backup = { id: crypto.randomUUID(), date: new Date().toISOString(), label, config, led };
    this.backups = [...this.backups, b].slice(-KEEP);
    this.persist();
    log.add('save', `backup: ${label}`);
    return b;
  };

  /**
   * Reads the slots not read yet, then snapshots. Slots already loaded are not re-read, so unsaved edits in
   * them survive; their originals are what the controller holds.
   */
  backupNow = async (label: string = copy.history.manual) => {
    for (const s of SLOTS) {
      if (device.status !== 'connected') break;
      if (!profile.slots[s]) await profile.read(s);
      if (!lighting.slots[s] && profile.slots[s]) await lighting.read(s);
    }
    if (!Object.keys(profile.slots).length) return null;
    const b = this.snapshot(label);
    toasts.ok(copy.history.backedUp);
    return b;
  };

  /** Removes a backup; returns a closure that puts it back where it was. */
  remove = (id: string): (() => void) => {
    const i = this.backups.findIndex((b) => b.id === id);
    if (i < 0) return () => {};
    const b = $state.snapshot(this.backups[i]) as Backup;
    this.backups = this.backups.filter((x) => x.id !== id);
    this.persist();
    return () => {
      if (this.backups.some((x) => x.id === b.id)) return;
      const next = [...this.backups];
      next.splice(Math.min(i, next.length), 0, b);
      this.backups = next;
      this.persist();
    };
  };

  importJson = (json: string) => {
    const b = parseBackup(json);
    this.backups = [...this.backups, b].slice(-KEEP);
    this.persist();
    return b;
  };

  importFile = async (file: File) => {
    try { this.importJson(await file.text()); toasts.ok(fmt(copy.history.imported, { file: file.name })); }
    catch (e) { toasts.error(e instanceof AppError ? e.message : copy.history.notBackup); }
  };

  download = (b: Backup) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }));
    a.download = `vader4pro-${b.date.slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  /** True when restoring this backup would need a lighting save the connection cannot do. */
  lightingBlocked = (b: Backup) => Object.keys(b.led).length > 0 && !device.canSaveLighting;

  /**
   * Writes every slot in the backup, reads each back and compares it with what was written, then commits.
   * Before writing, the slots it will overwrite that are not loaded yet are read, so the backup taken first
   * ("Before restoring a backup") covers every one of them. A slot that cannot be read is left alone unless
   * `overwriteUnread` (the toast's "Restore anyway"). Lighting cannot be saved over the dongle in DInput mode:
   * there, `profilesOnly` restores the profiles and leaves the lighting alone. Returns true on full success.
   */
  restore = async (b: Backup, opts: { profilesOnly?: boolean; overwriteUnread?: boolean } = {}): Promise<boolean> => {
    const withLight = !opts.profilesOnly && Object.keys(b.led).length > 0;
    if (withLight && !device.canSaveLighting) { toasts.error(copy.light.dinputNoSave); return false; }
    if (backupProblem(b)) { toasts.error(copy.history.damagedRestore); return false; }
    const plan = planRestore(b, withLight, { profiles: Object.keys(profile.slots).map(Number), leds: Object.keys(lighting.slots).map(Number) });
    session.writing = true;
    const result = await device.run(copy.history.restore, async () => {
      // 1. Read what is not loaded, so the safety backup covers every slot about to be overwritten.
      const unreadable: number[] = [];
      for (const s of plan.readProfiles) {
        try { profile.adoptRead(s, await device.t.readConfig(s)); } catch (e) { unreadable.push(s); log.add('error', `restore: read profile ${s}`, toAppError(e).detail); }
      }
      for (const s of plan.readLeds) {
        try { lighting.adoptRead(s, decodeLed(await device.t.readLed(s))); } catch (e) { unreadable.push(s); log.add('error', `restore: read lighting ${s}`, toAppError(e).detail); }
      }
      const w = restoreWrites(plan, unreadable, !!opts.overwriteUnread);
      if (!w.profiles.length && !w.leds.length) return { notTaken: [] as number[], skipped: w.skipped };
      // 2. Keep what is there now, in case the backup turns out to be the wrong one.
      this.snapshot(copy.history.beforeRestore);
      // 3. Write, read back, compare; the read-back becomes what the app shows either way.
      const led = Object.fromEntries(w.leds.map((s) => [s, fromHex(b.led[s]).slice(0, LED_WRITE_BYTES)]));
      const cfg = Object.fromEntries(w.profiles.map((s) => [s, fromHex(b.config[s])]));
      for (const s of w.leds) await device.t.writeLed(s, led[s]);
      for (const s of w.profiles) await device.t.writeConfig(s, cfg[s]);
      const notTaken = new Set<number>();
      for (const s of w.leds) if (lighting.settleRestore(s, led[s], await device.t.readLed(s)).length) notTaken.add(s);
      for (const s of w.profiles) if (profile.settleRestore(s, cfg[s], await device.t.readConfig(s)).length) notTaken.add(s);
      // 4. Commit only what was verified in full (as Save does).
      if (!notTaken.size) await device.t.save();
      log.add('save', `restored backup ${b.label}${withLight ? '' : ' (profiles only)'}; not taken: [${[...notTaken]}], skipped: [${w.skipped}]`);
      return { notTaken: [...notTaken].sort(), skipped: w.skipped };
    }).finally(() => { session.writing = false; });
    if (!result) return false;
    if (result.notTaken.length) toasts.error(fmt(copy.history.notTaken, { profiles: slotList(result.notTaken) }));
    if (result.skipped.length) {
      toasts.info(fmt(copy.history.unreadable, { profiles: slotList(result.skipped) }),
        { label: copy.history.restoreAnyway, run: () => { this.restore(b, { ...opts, overwriteUnread: true }); } });
    }
    const ok = !result.notTaken.length && !result.skipped.length;
    if (ok) toasts.ok(withLight || !Object.keys(b.led).length ? copy.history.restored : copy.history.restoredProfiles);
    return ok;
  };
}

export const history = new History();

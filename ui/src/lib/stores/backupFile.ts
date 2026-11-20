/**
 * Backups as data: the file format, its checks, and the plan for restoring one. Pure; tested in backupFile.test.ts.
 */
import { CONFIG_BYTES } from '../protocol/config.ts';
import { LED_WRITE_BYTES } from '../protocol/led.ts';
import { parseHex } from '../protocol/bytes.ts';
import { hasProfileHeader } from '../app/profileFile.ts';
import { AppError } from '../device/errors.ts';
import { copy } from '../copy.ts';

/** Same shape and storage keys as the classic UI, so existing backups survive. */
export interface Backup {
  id: string;
  date: string;
  label: string;
  config: Record<number, string>; // hex per slot
  led: Record<number, string>;
}

/** Lighting as read is 500 bytes; 490 of them are written. */
export const LED_LENGTHS = [500, LED_WRITE_BYTES];

export type BackupProblem = 'shape' | 'slot' | 'hex' | 'profileLength' | 'profileHeader' | 'ledLength';

/** The first thing wrong with a backup's slot maps, or null when every slot is well formed. */
export function backupProblem(b: { config?: unknown; led?: unknown }): BackupProblem | null {
  for (const [m, kind] of [[b.config, 'config'], [b.led, 'led']] as const) {
    if (m == null) continue;
    if (typeof m !== 'object' || Array.isArray(m)) return 'shape';
    for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
      if (!/^[0-3]$/.test(k)) return 'slot';
      const bytes = typeof v === 'string' ? parseHex(v) : null;
      if (!bytes) return 'hex';
      if (kind === 'config' && bytes.length !== CONFIG_BYTES) return 'profileLength';
      if (kind === 'config' && !hasProfileHeader(bytes)) return 'profileHeader';
      if (kind === 'led' && !LED_LENGTHS.includes(bytes.length)) return 'ledLength';
    }
  }
  return null;
}

/** Parses and checks a backup file. Throws an AppError with a friendly message. */
export function parseBackup(json: string): Backup {
  let b: Partial<Backup>;
  try { b = JSON.parse(json); } catch { throw new AppError('unsupported', copy.history.notBackup); }
  if (!b || typeof b !== 'object' || (!b.config && !b.led)) throw new AppError('unsupported', copy.history.notBackup);
  const problem = backupProblem(b);
  if (problem) throw new AppError('unsupported', copy.history.damaged, { error: `backup: ${problem}` });
  const date = typeof b.date === 'string' && !Number.isNaN(Date.parse(b.date)) ? b.date : new Date().toISOString();
  return { id: crypto.randomUUID(), date, label: typeof b.label === 'string' ? b.label : copy.history.manual, config: b.config ?? {}, led: b.led ?? {} };
}

export interface RestorePlan {
  /** Slots whose profile / lighting the backup will overwrite. */
  profiles: number[];
  leds: number[];
  /** Of those, the ones not read yet: read them first so the backup taken before restoring covers them. */
  readProfiles: number[];
  readLeds: number[];
}

const slotsOf = (m: Record<number, string>) => Object.keys(m).map(Number).sort();

export function planRestore(b: Pick<Backup, 'config' | 'led'>, withLight: boolean, loaded: { profiles: number[]; leds: number[] }): RestorePlan {
  const profiles = slotsOf(b.config), leds = withLight ? slotsOf(b.led) : [];
  return {
    profiles, leds,
    readProfiles: profiles.filter((s) => !loaded.profiles.includes(s)),
    readLeds: leds.filter((s) => !loaded.leds.includes(s))
  };
}

/**
 * What to write once the reads are done. A slot that could not be read (`unreadable`) is left alone, profile and
 * lighting, unless the user confirmed (`overwriteUnread`), because the backup taken first cannot cover it.
 */
export function restoreWrites(p: RestorePlan, unreadable: number[], overwriteUnread: boolean): { profiles: number[]; leds: number[]; skipped: number[] } {
  const skip = overwriteUnread ? [] : unreadable;
  return {
    profiles: p.profiles.filter((s) => !skip.includes(s)),
    leds: p.leds.filter((s) => !skip.includes(s)),
    skipped: [...new Set(skip)].filter((s) => p.profiles.includes(s) || p.leds.includes(s)).sort()
  };
}

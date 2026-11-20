import { fromHex } from '$lib/protocol/bytes';
import { FACTORY_CONFIG_HEX } from '$lib/protocol/fixtures';
import type { GuardFlags } from '$lib/protocol/guards';
import { AppError, toAppError } from '$lib/device/errors';
import { device } from '$lib/device/device.svelte';
import { flags } from '$lib/flags';
import { copy, fmt } from '$lib/copy';
import { toProfileFile, parseProfileFile, exportName } from '$lib/app/profileFile';
import type { Change, ProfileDraft } from './changes';
import { changeOrder } from './order';
import { session } from './session.svelte';
import { scripts } from './scripts.svelte';
import { history } from './history.svelte';
import { toasts } from './toasts.svelte';
import { log } from './debug';
import {
  REPLACED, encodeDraft as encodeWith, slotChanges, readSlot, replaceSlot, settleProfileWrite, type SlotState
} from './profileSlot';

/** The flags that decide which bytes the app may change (guards.ts). Read once at load, like the flags. */
const guard: GuardFlags = { profileNames: flags.profileNames, responseCurve: flags.responseCurve };

const snap = <T>(x: T): T => $state.snapshot(x) as T;

/** Encodes a draft with the app's flags (profileSlot.encodeDraft). */
export const encodeDraft = (d: ProfileDraft): Uint8Array => encodeWith(snap(d), guard);

/**
 * Profiles: for each slot the profile as read (`original`) and the edited copy (`draft`). Panels read and write
 * `profile.draft` directly; nothing reaches the controller until `save()`. The write logic is in profileSlot.ts.
 */
class Profile {
  slots = $state<Record<number, SlotState>>({});
  /** Slots that could not be read, with the reason. */
  readErrors = $state<Record<number, string>>({});

  get original(): ProfileDraft | null { return this.slots[session.slot]?.original ?? null; }
  get draft(): ProfileDraft | null { return this.slots[session.slot]?.draft ?? null; }

  /** The draft's bytes, or the reason it cannot be encoded (scripts that do not fit). */
  #encoding = $derived.by((): { bytes: Uint8Array | null; error: AppError | null } => {
    const d = this.draft;
    if (!d) return { bytes: null, error: null };
    try { return { bytes: encodeDraft(d), error: null }; } catch (e) { return { bytes: null, error: toAppError(e) }; }
  });
  get encoded() { return this.#encoding.bytes; }
  get error() { return this.#encoding.error; }

  #changes = $derived.by((): Change[] => {
    const s = this.slots[session.slot];
    return s ? slotChanges(s, scripts.list, guard) : [];
  });
  get changes() { return this.#changes; }

  hasChanges(slot: number) {
    const s = this.slots[slot];
    return !!s && slotChanges(s, scripts.list, guard).length > 0;
  }

  /** Reads a slot from the controller, replacing its original and draft. */
  read = (slot: number) => device.run(fmt(copy.save.reading, { n: slot + 1 }), async () => {
    return this.adoptRead(slot, await device.t.readConfig(slot));
  }, {
    toast: slot === 0,
    // Offline, a read error would contradict the no-controller screen: only a connected controller's refusal counts.
    onError: (e) => { if (e.code !== 'no_device' && e.code !== 'service_down' && device.status === 'connected') this.readErrors[slot] = e.message; }
  });

  /** Takes bytes just read from the controller as the slot's original, dropping its draft. */
  adoptRead(slot: number, raw: Uint8Array): ProfileDraft {
    this.slots[slot] = readSlot(raw, guard);
    delete this.readErrors[slot];
    scripts.recognise(slot, this.slots[slot].draft.macros);
    return this.slots[slot].original;
  }

  /** Puts a slot state computed by profileSlot.ts in place and re-checks its script links. */
  private put(slot: number, s: SlotState) {
    this.slots[slot] = s;
    scripts.recognise(slot, s.draft.macros);
  }

  undo = (changeId: string) => {
    const s = this.slots[session.slot];
    const c = this.changes.find((x) => x.id === changeId);
    if (!c || !s) return;
    if (changeId === REPLACED) { this.put(session.slot, readSlot(snap(s.original).raw, guard)); return; }
    try { c.revert(s.draft, s.replaced?.base ?? s.original); } catch (e) { toasts.error(toAppError(e).message); }
    if (changeId.startsWith('button.')) scripts.recognise(session.slot, s.draft.macros);
  };

  discard = () => {
    const s = this.slots[session.slot];
    if (s) this.put(session.slot, readSlot(snap(s.original).raw, guard));
  };

  /** Replaces a slot's draft with a whole profile; one entry in the change list (none when nothing differs). */
  private replace(slot: number, bytes: Uint8Array, label: string, opts: { keepName?: boolean } = {}) {
    const s = this.slots[slot];
    if (s) this.put(slot, replaceSlot(snap(s), bytes, label, guard, opts));
  }

  /**
   * Compares a read-back with what was written and settles the slot (profileSlot.settleProfileWrite): the
   * read-back becomes the original; on a mismatch the user's draft stays so the change list shows what did not
   * land. Returns the differing byte indices.
   */
  settleRestore(slot: number, written: Uint8Array, back: Uint8Array): number[] {
    const s = this.slots[slot] ?? readSlot(back, guard);
    const r = settleProfileWrite(snap(s), written, back, guard, copy.save.notTaken);
    this.put(slot, r.state);
    delete this.readErrors[slot];
    return r.bad;
  }

  /**
   * Verified flow: backup snapshot → encode → write → read back → compare (ignoring 225–226) → commit to flash.
   * `backup: false` when the caller (saveAll) already took one snapshot for the whole save.
   */
  save = (opts: { backup?: boolean } = {}) => {
    const slot = session.slot;
    return device.run(copy.save.saving, async () => {
      const s = this.slots[slot];
      if (!s) return;
      if (opts.backup !== false) history.snapshot(fmt(copy.save.backupProfile, { n: slot + 1 }));
      const data = encodeDraft(s.draft);
      await device.t.writeConfig(slot, data);
      const back = await device.t.readConfig(slot);
      const bad = this.settleRestore(slot, data, back);
      // Over the dongle a write sticks without the save command, so the controller may now hold part of it: the
      // app shows what it holds and keeps what did not land as unsaved changes.
      if (bad.length) throw new AppError('verify_failed', copy.save.readBackProfile, { bad: bad.slice(0, 32) });
      const status = await device.t.save();
      log.add('save', `profile ${slot} saved, status ${status}`);
      return status;
    });
  };

  /**
   * Copies the current draft into another slot's draft (read first if needed). Not saved until that slot is.
   * The target keeps its save version and, with their flags off, its name and stick-curve bytes. True when copied.
   */
  copyTo = async (slot: number): Promise<boolean> => {
    const from = this.draft;
    if (!from || slot === session.slot) return false;
    const bytes = encodeDraft(from);
    if (!this.slots[slot] && !(await this.read(slot))) return false;
    this.replace(slot, bytes, fmt(copy.profile.replacedCopy, { n: session.slot + 1 }));
    return true;
  };

  /** Downloads the current draft as `{ app, kind: 'profile', version: 1, name?, config }`. */
  exportFile = () => {
    const d = this.draft;
    if (!d || !this.encoded) return;
    const body = JSON.stringify(toProfileFile(this.encoded, d.name || undefined), null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    a.download = exportName(d.name || `profile-${session.slot + 1}`);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    log.add('info', `exported ${a.download}`);
    toasts.ok(fmt(copy.profile.exported, { file: a.download }));
  };

  /** Loads a profile file into the current draft (not saved). */
  importFile = async (file: File) => {
    if (!this.slots[session.slot]) return;
    const r = parseProfileFile(await file.text().catch(() => ''));
    if (!r.ok) { log.add('error', `import ${file.name}: ${r.reason}`); toasts.error(copy.profile.fileErrors[r.reason]); return; }
    this.replace(session.slot, r.bytes, copy.profile.replacedFile);
    toasts.ok(fmt(copy.profile.imported, { file: file.name }));
  };

  /** Factory settings, keeping this slot's name (slot 1's factory name must not land on another slot). */
  resetToDefaults = () => {
    this.replace(session.slot, fromHex(FACTORY_CONFIG_HEX), copy.profile.replacedReset, { keepName: true });
    toasts.ok(copy.profile.resetDone);
  };

  /** Brings back a draft kept from before a reload (unsaved.svelte.ts): `bytes` is that draft encoded. */
  restoreDraft(slot: number, bytes: Uint8Array) {
    const s = this.slots[slot];
    if (!s) return;
    const next = replaceSlot(snap(s), bytes, copy.unsaved.label, guard);
    // Field by field when the list can show the changes; as one entry when it cannot (unlisted bytes only).
    this.put(slot, slotChanges({ original: next.original, draft: next.draft }, [], guard).length ? { original: next.original, draft: next.draft } : next);
  }

  /** Keeps the ⌘Z order in step with the change list. Call once from the shell. */
  init() {
    return $effect.root(() => {
      $effect(() => changeOrder.sync('profile', this.changes.map((c) => ({ id: c.id, value: `${c.from}→${c.to}` }))));
    });
  }
}

export const profile = new Profile();

/**
 * The unsaved-change list: compares the semantic fields of a draft profile with the profile as read. One table
 * of descriptors drives the unsaved count, the changes popover and "undo one change". Pure; tested.
 */
import { KEY_NAMES, REMAPPABLE, responseOf, type ProfileConfig } from '../protocol/config.ts';
import { bindingOf, setBinding, matches, type Binding, type Script } from '../protocol/bindings.ts';
import { copy, fmt } from '../copy.ts';
import { stickPct, triggerPct, fmtPct, motorPct, outputPct, outerPctFromEdge } from './units.ts';
import { presetOf, rawToPct, type Side } from '../protocol/response.ts';

/** A profile draft; `name` is present only while profile names are switched on (flags.profileNames). */
export type ProfileDraft = ProfileConfig & { name?: string };

export interface Change {
  id: string;
  label: string;
  from: string;
  to: string;
  /** Puts this one field of `draft` back to its value in `original`. */
  revert(draft: ProfileDraft, original: ProfileDraft): void;
}

const PADDLES = new Set([18, 19, 20, 21]);
const keyName = (k: number) => KEY_NAMES[k] ?? `Button ${k}`;

/** What a button does, split for the paddle captions: main line ("A + X", "Jump + shoot") and the mode word. */
export function describeBinding(c: ProfileConfig, key: number, scripts: Script[] = []): { line1: string; line2: string; muted: boolean } {
  const b = bindingOf(c, key);
  if (b.kind === 'default') return PADDLES.has(key) ? { line1: copy.main.unmapped, line2: '', muted: true } : { line1: keyName(key), line2: '', muted: true };
  if (b.kind === 'script') {
    const m = c.macros.find((x) => x.trigger === key);
    const lib = m ? scripts.find((s) => matches(m, s)) : undefined;
    return { line1: lib?.name ?? copy.main.scriptOnController, line2: copy.main.mode.script, muted: false };
  }
  return { line1: b.buttons.map(keyName).join(' + '), line2: copy.main.mode[b.behaviour], muted: false };
}

/**
 * "A + X · Turbo, every 100 ms", "A · Turbo, speed 5", "Jump + shoot · Script", "Not set". The turbo rate is in
 * the change list so a rate change reads as one (the panel shows the same number: ms for several buttons, the
 * controller's plain 1–50 speed for one).
 */
export function formatBinding(c: ProfileConfig, key: number, scripts: Script[] = []): string {
  const d = describeBinding(c, key, scripts);
  const b = bindingOf(c, key);
  const rate = b.kind === 'buttons' && b.behaviour === 'turbo'
    ? `, ${fmt(b.buttons.length > 1 ? copy.button.turboEvery : copy.button.turboAt, { n: b.turbo })}` : '';
  return d.line2 ? `${d.line1} · ${d.line2}${rate}` : d.line1;
}

/** Semantic identity of a binding (ignores the library id/name a script happens to have). */
const bindingKey = (b: Binding) => JSON.stringify({
  k: b.kind, b: b.kind === 'default' ? [] : b.buttons, h: b.kind === 'buttons' ? b.behaviour : '',
  t: b.kind === 'buttons' && b.behaviour === 'turbo' ? b.turbo : 0,
  s: b.script ? { m: b.script.mode, c: b.script.mode === 'once' ? 0 : b.script.cycleMs, a: b.script.actions } : null
});

type Path = (c: ProfileDraft) => { get(): number | boolean | string; set(v: any): void };
interface Field { id: string; label: string; at: Path; format: (v: any) => string }

const onOff = (v: boolean) => (v ? copy.common.on : copy.common.off);
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const num = (v: number) => String(v);
// Accessor for one field of the draft: `field((c) => c.sticks.left, 'deadzone')`.
const field = <T>(obj: (c: ProfileDraft) => T, k: keyof T & string) =>
  (c: ProfileDraft) => ({ get: () => obj(c)[k] as any, set: (v: any) => { obj(c)[k] = v; } });

const SIDES = ['left', 'right'] as const;

// ---- Sticks. The response entry is judged on the curve's SHAPE (presetOf: the two points relative to the preset),
// not on the type byte: a dead-zone / outer-limit edit sets the type to Custom (as the official app does) and may
// clamp the points into the new window, and that is folded into the range entry (its undo restores them).
const POINTS = ['p0x', 'p0y', 'p1x', 'p1y'] as const;
type RangeKey = 'deadzone' | 'end' | 'edge';
const PRESET_NAME = { linear: copy.stick.presets.linear, fast: copy.stick.presets.fast, delay: copy.stick.presets.precise, custom: copy.stick.presets.custom };

const pointsOf = (c: ProfileDraft, s: Side) => POINTS.map((k) => c.sticks[s][k]).join(',');
const shapeOf = (c: ProfileDraft, s: Side) => presetOf(responseOf(c, s));
/** The range fields the encoder writes: the edge only with the response curve on (flag-guarded bytes). */
const rangeKeys = (curve: boolean): RangeKey[] => (curve ? ['deadzone', 'end', 'edge'] : ['deadzone', 'end']);
const rangeAt = (c: ProfileDraft, s: Side, k: RangeKey) => (k === 'edge' ? c.edge[s] : c.sticks[s][k]);
const rangeSame = (o: ProfileDraft, d: ProfileDraft, s: Side, curve: boolean) => rangeKeys(curve).every((k) => rangeAt(o, s, k) === rangeAt(d, s, k));
function shapeDiffers(o: ProfileDraft, d: ProfileDraft, s: Side) {
  const a = shapeOf(o, s), b = shapeOf(d, s);
  return a !== b || (a === 'custom' && pointsOf(o, s) !== pointsOf(d, s));
}
/** Listed when the shape changed, or when type / points differ with no range change to explain them. */
function responseListed(o: ProfileDraft, d: ProfileDraft, s: Side, curve: boolean) {
  if (shapeDiffers(o, d, s)) return true;
  return rangeSame(o, d, s, curve) && (o.sticks[s].type !== d.sticks[s].type || pointsOf(o, s) !== pointsOf(d, s));
}
function restoreShape(d: ProfileDraft, o: ProfileDraft, s: Side) {
  d.sticks[s].type = o.sticks[s].type;
  for (const k of POINTS) d.sticks[s][k] = o.sticks[s][k];
}
/** Custom → Custom: say where the points went ("Custom (50% → 76%, 100% → 100%)"). */
const formatPoints = (c: ProfileDraft, s: Side) => {
  const [a, b, x, y] = POINTS.map((k) => fmtPct(rawToPct(c.sticks[s][k])));
  return `${PRESET_NAME.custom} (${a} → ${b}, ${x} → ${y})`;
};
const RANGE_FORMAT: Record<RangeKey, (v: number) => string> = {
  deadzone: (v) => fmtPct(stickPct(v)), end: (v) => fmtPct(stickPct(v)), edge: (v) => fmtPct(outerPctFromEdge(v))
};
const RANGE_LABEL: Record<RangeKey, string> = {
  deadzone: copy.stick.deadZone.toLowerCase(), end: copy.stick.outerLimit.toLowerCase(),
  // Same control as `end` when the response curve is on (the curve's edge byte); only one of them ever changes.
  edge: copy.stick.outerLimit.toLowerCase()
};

function stickChanges(o: ProfileDraft, d: ProfileDraft, s: Side, curve: boolean): Change[] {
  const out: Change[] = [];
  for (const k of rangeKeys(curve)) {
    if (k === 'edge' && (!o.edge || !d.edge)) continue; // drafts from before the edge field
    const a = rangeAt(o, s, k), b = rangeAt(d, s, k);
    if (a === b) continue;
    out.push({
      id: `stick.${s}.${k}`, label: `${copy.stick[s]} ${RANGE_LABEL[k]}`, from: RANGE_FORMAT[k](a), to: RANGE_FORMAT[k](b),
      revert: (x, y) => {
        const folded = !responseListed(y, x, s, curve);
        if (k === 'edge') x.edge[s] = y.edge[s];
        else x.sticks[s][k] = y.sticks[s][k];
        if (folded) restoreShape(x, y, s);
      }
    });
  }
  if (responseListed(o, d, s, curve)) {
    const a = shapeOf(o, s), b = shapeOf(d, s);
    out.push({
      id: `stick.${s}.response`, label: `${copy.stick[s]} ${copy.analog.response}`,
      from: a === b ? (a === 'custom' ? formatPoints(o, s) : PRESET_NAME[a]) : PRESET_NAME[a],
      to: a === b ? (b === 'custom' ? formatPoints(d, s) : PRESET_NAME[b]) : PRESET_NAME[b],
      revert: (x, y) => restoreShape(x, y, s)
    });
  }
  return out;
}

const FIELDS: Field[] = [
  ...SIDES.flatMap((s) => [
    { id: `stick.${s}.round`, label: `${copy.stick[s]} ${copy.stick.circular.toLowerCase()}`, at: field((c) => c.round, s), format: onOff },
    { id: `trigger.${s}.deadzone`, label: `${copy.trigger[s]} ${copy.trigger.deadZone.toLowerCase()}`, at: field((c) => c.triggers[s], 'deadzone'), format: (v: number) => fmtPct(triggerPct(v)) },
    { id: `trigger.${s}.end`, label: `${copy.trigger[s]} ${lower(copy.trigger.fullAt)}`, at: field((c) => c.triggers[s], 'end'), format: (v: number) => fmtPct(triggerPct(v)) }
  ]),
  { id: 'gyro.activationKey', label: copy.gyro.activeWhileChange, at: field((c) => c.gyro, 'activationKey'), format: keyName },
  { id: 'gyro.sensX', label: `${copy.gyro.title} ${copy.gyro.lrSpeed.toLowerCase()}`, at: field((c) => c.gyro, 'sensX'), format: num },
  { id: 'gyro.sensY', label: `${copy.gyro.title} ${copy.gyro.udSpeed.toLowerCase()}`, at: field((c) => c.gyro, 'sensY'), format: num },
  { id: 'gyro.deadzone', label: `${copy.gyro.title} ${copy.gyro.deadZone.toLowerCase()}`, at: field((c) => c.gyro, 'deadzone'), format: num },
  // Not listed: gyro output / activation / mode / extra key and the motors' type. Their meaning is not
  // decoded and no panel edits them, so only a whole-profile replacement (its own entry) or a save the controller
  // did not take (the "not taken" entry) can change them; a raw-number line here would only leak internals.
  { id: 'rumble.enabled', label: copy.vibration.handle, at: field((c) => c.rumble, 'enabled'), format: onOff },
  ...SIDES.flatMap((s) => [
    { id: `rumble.${s}.scale`, label: `${copy.vibration.title} ${copy.vibration[s === 'left' ? 'leftStrength' : 'rightStrength'].toLowerCase()}`, at: field((c) => c.rumble[s], 'scale'), format: (v: number) => fmtPct(motorPct(v)) },
    { id: `rumble.${s}.floor`, label: `${copy.vibration.gripSide[s]} ${copy.vibration.low}`, at: field((c) => c.rumble[s], 'a'), format: (v: number) => fmtPct(outputPct(v)) },
    { id: `rumble.${s}.ceiling`, label: `${copy.vibration.gripSide[s]} ${copy.vibration.high}`, at: field((c) => c.rumble[s], 'b'), format: (v: number) => fmtPct(outputPct(v)) }
  ]),
  { id: 'rumble.triggers', label: copy.vibration.triggers, at: field((c) => c, 'triggerRumbleEnabled'), format: onOff },
  ...SIDES.flatMap((s) => [
    { id: `rumble.trigger.${s}.scale`, label: copy.vibration[s === 'left' ? 'leftTrigger' : 'rightTrigger'], at: field((c) => c.triggerMotors[s].line, 'scale'), format: (v: number) => fmtPct(motorPct(v)) },
    { id: `rumble.trigger.${s}.min`, label: `${copy.vibration.side[s]} ${copy.vibration.low}`, at: field((c) => c.triggerMotors[s].line, 'min'), format: (v: number) => fmtPct(outputPct(v)) },
    { id: `rumble.trigger.${s}.max`, label: `${copy.vibration.side[s]} ${copy.vibration.high}`, at: field((c) => c.triggerMotors[s].line, 'max'), format: (v: number) => fmtPct(outputPct(v)) },
    { id: `rumble.trigger.${s}.filter`, label: `${copy.vibration.side[s]} ${copy.vibration.filter}`, at: field((c) => c.triggerMotors[s].line, 'filter'), format: (v: number) => fmtPct(outputPct(v)) }
  ])
];

export interface ChangeOptions {
  /** flags.responseCurve: whether the encoder writes the stick edge (the list must match what is written). */
  responseCurve?: boolean;
}

/**
 * Every unsaved change between `original` and `draft`, in a stable order (buttons, sticks, …, name). Invariant
 * (tested for both flag states): the list is empty exactly when the draft encodes to the original's bytes, and
 * reverting every listed change gives the original's bytes.
 */
export function describeChanges(original: ProfileDraft, draft: ProfileDraft, scripts: Script[] = [], opts: ChangeOptions = {}): Change[] {
  const curve = opts.responseCurve === true;
  const out: Change[] = [];
  for (const key of REMAPPABLE) {
    if (bindingKey(bindingOf(original, key)) === bindingKey(bindingOf(draft, key))) continue;
    out.push({
      id: `button.${key}`, label: keyName(key), from: formatBinding(original, key, scripts), to: formatBinding(draft, key, scripts),
      revert: (d, o) => setBinding(d, key, bindingOf(o, key))
    });
  }
  for (const s of SIDES) out.push(...stickChanges(original, draft, s, curve));
  for (const f of FIELDS) {
    const a = f.at(original).get(), b = f.at(draft).get();
    if (a === b) continue;
    out.push({ id: f.id, label: f.label, from: f.format(a), to: f.format(b), revert: (d, o) => f.at(d).set(f.at(o).get()) });
  }
  if (original.name !== undefined && draft.name !== undefined && original.name !== draft.name) {
    out.push({ id: 'name', label: copy.profile.nameChange, from: original.name || '—', to: draft.name || '—', revert: (d, o) => { d.name = o.name; } });
  }
  return out;
}

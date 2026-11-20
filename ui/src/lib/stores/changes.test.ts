import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHex } from '../protocol/bytes.ts';
import { decodeConfig, encodeConfig } from '../protocol/config.ts';
import { bindingOf, setBinding, type Script } from '../protocol/bindings.ts';
import { FACTORY_CONFIG_HEX } from '../protocol/fixtures.ts';
import { describeChanges, formatBinding, describeBinding, type ProfileDraft } from './changes.ts';

const factory = (): ProfileDraft => decodeConfig(fromHex(FACTORY_CONFIG_HEX));
const clone = (c: ProfileDraft): ProfileDraft => structuredClone(c);
const M1 = 19, M2 = 18, A = 4, X = 7;

test('no changes on an untouched clone', () => {
  const o = factory();
  assert.deepEqual(describeChanges(o, clone(o)), []);
});

test('stick dead zone and outer limit, in percent', () => {
  const o = factory(), d = clone(o);
  d.sticks.left.deadzone = 10;
  d.sticks.left.end = 119;
  const c = describeChanges(o, d);
  assert.deepEqual(c.map((x) => [x.label, x.from, x.to]), [
    ['Left stick dead zone', '0%', '8%'],
    ['Left stick outer limit', '100%', '94%']
  ]);
});

test('undo one change reverts only that field and restores the bytes', () => {
  const o = factory(), d = clone(o);
  d.sticks.left.deadzone = 10;
  d.triggers.right.end = 200;
  const [first] = describeChanges(o, d);
  first.revert(d, o);
  const rest = describeChanges(o, d);
  assert.equal(rest.length, 1);
  assert.equal(rest[0].id, 'trigger.right.end');
  rest[0].revert(d, o);
  assert.deepEqual(encodeConfig(d), encodeConfig(o));
});

test('button bindings are described with the shared formatter', () => {
  const o = factory(), d = clone(o);
  setBinding(d, M1, { kind: 'buttons', buttons: [A, X], behaviour: 'turbo', turbo: 100 });
  setBinding(d, M2, { kind: 'buttons', buttons: [A], behaviour: 'toggle', turbo: 5 });
  const c = describeChanges(o, d);
  const m1 = c.find((x) => x.id === `button.${M1}`)!;
  assert.deepEqual([m1.label, m1.from, m1.to], ['M1', 'Not set', 'A + X · Turbo, every 100 ms']);
  assert.equal(c.find((x) => x.id === `button.${M2}`)!.to, 'A · Toggle');
  m1.revert(d, o);
  assert.equal(bindingOf(d, M1).kind, 'default');
  assert.equal(describeChanges(o, d).length, 1);
});

test('scripts show their library name', () => {
  const o = factory(), d = clone(o);
  const s: Script = { id: 's1', name: 'Jump + shoot', mode: 'once', cycleMs: 30, actions: [{ button: A, startMs: 0, holdMs: 100 }, { button: X, startMs: 150, holdMs: 100 }] };
  setBinding(d, M2, { kind: 'script', buttons: [], behaviour: 'hold', turbo: 5, script: s });
  assert.equal(formatBinding(d, M2, [s]), 'Jump + shoot · Script');
  assert.deepEqual(describeBinding(d, M2, [s]), { line1: 'Jump + shoot', line2: 'Script', muted: false });
  assert.equal(formatBinding(d, M2), 'Script on the controller · Script');
  const c = describeChanges(o, d, [s]);
  c[0].revert(d, o);
  assert.deepEqual(encodeConfig(d), encodeConfig(o));
});

test('factory C → L3 shows as a remap; a standard button at default shows its own name', () => {
  const o = factory();
  assert.equal(formatBinding(o, 16), 'L3');
  assert.equal(formatBinding(o, A), 'A');
});

test('gyro, vibration and toggles', () => {
  const o = factory(), d = clone(o);
  d.gyro.sensX += 3;
  d.rumble.enabled = false;
  d.rumble.left.scale = 80;
  d.round.right = !o.round.right;
  d.triggerRumbleEnabled = !o.triggerRumbleEnabled;
  const ids = describeChanges(o, d).map((x) => x.id);
  assert.deepEqual(ids, ['stick.right.round', 'gyro.sensX', 'rumble.enabled', 'rumble.left.scale', 'rumble.triggers']);
  const v = describeChanges(o, d).find((x) => x.id === 'rumble.enabled')!;
  assert.deepEqual([v.from, v.to], ['On', 'Off']);
  for (const c of describeChanges(o, d)) c.revert(d, o);
  assert.deepEqual(describeChanges(o, d), []);
});

test('profile name only when both sides carry it', () => {
  const o = { ...factory(), name: 'Shooter' }, d = clone(o);
  d.name = 'Racing';
  const c = describeChanges(o, d);
  assert.deepEqual([c[0].id, c[0].from, c[0].to], ['name', 'Shooter', 'Racing']);
  c[0].revert(d, o);
  assert.equal(d.name, 'Shooter');
  const plain = factory(), p2 = clone(plain);
  assert.deepEqual(describeChanges(plain, p2), []);
});

test('response curve, edge and trigger wording', () => {
  const o = factory(), d = clone(o);
  d.sticks.left.type = 3;
  d.sticks.left.p0y = 96;
  d.edge.left = 8;
  d.triggers.left.end = 230;
  d.rumble.right.scale = 80;
  d.triggerMotors.left.line.scale = 70;
  const c = describeChanges(o, d, [], { responseCurve: true });
  assert.deepEqual(c.map((x) => [x.label, x.from, x.to]), [
    ['Left stick outer limit', '100%', '94%'],
    ['Left stick response', 'Linear', 'Custom'],
    ['Left trigger counts as fully pressed at', '100%', '90%'],
    ['Vibration right strength', '50%', '80%'],
    ['Left trigger strength', '50%', '70%']
  ]);
  for (const x of c) x.revert(d, o);
  assert.deepEqual(describeChanges(o, d, [], { responseCurve: true }), []);
  assert.deepEqual(encodeConfig(d, { responseCurve: true }), encodeConfig(o, { responseCurve: true }));
});

test('with the response curve off the edge is never listed (it is not written)', () => {
  const o = factory(), d = clone(o);
  d.edge.left = 8;
  assert.deepEqual(describeChanges(o, d), []);
  assert.deepEqual(encodeConfig(d), encodeConfig(o));
});

test('the response entry is judged on the shape; presets use the panel names', () => {
  const o = factory();
  o.sticks.right.type = 3; // linear points, custom type byte: still looks linear
  const d = clone(o);
  d.sticks.right.p0y = 96;
  const [x] = describeChanges(o, d);
  assert.deepEqual([x.label, x.from, x.to], ['Right stick response', 'Linear', 'Fast']);
  d.sticks.right.p0y = 32;
  assert.equal(describeChanges(o, d)[0].to, 'Precise');
  d.sticks.right.p0y = 90;
  assert.equal(describeChanges(o, d)[0].to, 'Custom');
  const e = clone(d); e.sticks.right.p0y = 80;
  const [y] = describeChanges(d, e);
  assert.deepEqual([y.from, y.to], ['Custom (50% → 71%, 100% → 100%)', 'Custom (50% → 63%, 100% → 100%)']);
});

test('fields the UI does not decode or edit are not listed as their own change', () => {
  const o = factory(), d = clone(o);
  d.gyro.mapType ^= 1; d.gyro.activationMethod ^= 1; d.gyro.mode ^= 1; d.gyro.extKey ^= 1;
  d.rumble.left.type ^= 1; d.triggerMotors.left.line.type ^= 1; d.triggerMotors.right.micro.scale ^= 1;
  assert.deepEqual(describeChanges(o, d), []);
});

test('grip floor and ceiling are listed in percent', () => {
  const o = factory(), d = clone(o);
  d.rumble.left.a = 0; d.rumble.right.b = 128;
  assert.deepEqual(describeChanges(o, d).map((x) => [x.label, x.from, x.to]), [
    ['Left grip floor', '37%', '0%'],
    ['Right grip ceiling', '100%', '50%']
  ]);
});

test('turbo rate shows in the change list as the panel shows it; gyro labels have no colon', () => {
  const o = factory(), d = clone(o);
  setBinding(d, M2, { kind: 'buttons', buttons: [A], behaviour: 'turbo', turbo: 7 });
  d.gyro.activationKey = 13;
  const c = describeChanges(o, d);
  assert.equal(c.find((x) => x.id === `button.${M2}`)!.to, 'A · Turbo, speed 7');
  assert.equal(c.find((x) => x.id === 'gyro.activationKey')!.label, 'Gyro active while holding');
});

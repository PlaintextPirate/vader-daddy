import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHex } from '../../protocol/bytes.ts';
import { decodeConfig, MACRO_UNITS, macroUnits } from '../../protocol/config.ts';
import { bindingOf, type Binding, type Script } from '../../protocol/bindings.ts';
import { FACTORY_CONFIG_HEX } from '../../protocol/fixtures.ts';
import { TARGETS, shownButtons, toggleTarget, withBehaviour, turboFor, tryBinding, NOT_SET } from './logic.ts';

const fresh = () => decodeConfig(fromHex(FACTORY_CONFIG_HEX));
const M1 = 19, A = 4, B = 5, X = 7;
const btns = (buttons: number[], behaviour: Binding['behaviour'] = 'hold', turbo = 5): Binding => ({ kind: 'buttons', buttons, behaviour, turbo });

test('targets are the 16 standard buttons once each', () => {
  assert.equal(TARGETS.length, 16);
  assert.equal(new Set(TARGETS).size, 16);
});

test('a button left alone shows itself; a paddle shows nothing', () => {
  assert.deepEqual(shownButtons({ ...NOT_SET, buttons: [A] }, A), [A]);
  assert.deepEqual(shownButtons({ ...NOT_SET, buttons: [M1] }, M1), []);
});

test('chip on a default button remaps; then chips add and remove in grid order', () => {
  const b1 = toggleTarget({ ...NOT_SET, buttons: [M1] }, M1, X);
  assert.deepEqual(b1.buttons, [X]);
  const b2 = toggleTarget(b1, M1, A);
  assert.deepEqual(b2.buttons, [A, X]);
  const b3 = toggleTarget(b2, M1, X);
  assert.deepEqual(b3.buttons, [A]);
  assert.equal(toggleTarget(b3, M1, A).kind, 'default');
});

test('choosing a chip while a script runs replaces the script', () => {
  const s: Binding = { kind: 'script', buttons: [], behaviour: 'hold', turbo: 5, script: { id: '', name: '', mode: 'once', cycleMs: 30, actions: [] } };
  const b = toggleTarget(s, M1, B);
  assert.equal(b.kind, 'buttons');
  assert.deepEqual(b.buttons, [B]);
});

test('turbo value keeps its unit, resets when switching between one and several buttons', () => {
  assert.equal(turboFor(1, 1, 20), 20);
  assert.equal(turboFor(2, 1, 20), 100);
  assert.equal(turboFor(1, 2, 300), 5);
  assert.equal(turboFor(3, 2, 9999), 2500);
  const t = toggleTarget(btns([A], 'turbo', 12), M1, X);
  assert.equal(t.behaviour, 'turbo');
  assert.equal(t.turbo, 100);
});

test('switching to turbo starts from the default rate, not a leftover value', () => {
  const c = fresh();
  tryBinding(c, M1, btns([A, X]));
  const b = withBehaviour(bindingOf(c, M1), M1, 'turbo');
  assert.equal(b?.turbo, 100);
});

test('behaviour needs a button', () => {
  assert.equal(withBehaviour({ ...NOT_SET }, M1, 'turbo'), null);
  const b = withBehaviour({ ...NOT_SET, buttons: [A] }, A, 'turbo');
  assert.deepEqual(b, btns([A], 'turbo', 5));
});

test('A + X turbo on M1 round-trips through the draft', () => {
  const c = fresh();
  assert.equal(tryBinding(c, M1, btns([A, X], 'turbo', 120)), 'ok');
  assert.deepEqual(bindingOf(c, M1), btns([A, X], 'turbo', 120));
});

test('a sixth macro is refused and the draft is unchanged', () => {
  const c = fresh();
  for (const k of [19, 18, 21, 20, 16]) assert.equal(tryBinding(c, k, btns([A, B])), 'ok');
  const before = JSON.stringify({ m: c.macros, b: c.buttons });
  assert.equal(tryBinding(c, 17, btns([A, B])), 'tooMany');
  assert.equal(JSON.stringify({ m: c.macros, b: c.buttons }), before);
});

test('a script too long for the controller is refused and the draft is unchanged', () => {
  const c = fresh();
  const actions = Array.from({ length: 70 }, (_, i) => ({ button: A, startMs: i * 200, holdMs: 100 }));
  const script: Script = { id: 's', name: 's', mode: 'once', cycleMs: 30, actions };
  const before = JSON.stringify({ m: c.macros, b: c.buttons });
  assert.equal(tryBinding(c, M1, { ...NOT_SET, kind: 'script', script }), 'tooLong');
  assert.equal(JSON.stringify({ m: c.macros, b: c.buttons }), before);
  assert.ok(macroUnits(c.macros) <= MACRO_UNITS);
});

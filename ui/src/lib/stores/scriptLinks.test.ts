import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHex } from '../protocol/bytes.ts';
import { FACTORY_CONFIG_HEX } from '../protocol/fixtures.ts';
import { decodeConfig } from '../protocol/config.ts';
import { setBinding, type Script, type Binding } from '../protocol/bindings.ts';
import { linkedScript, keysLinked, recognise, setLink, parseLinks } from './scriptLinks.ts';

const M1 = 19, M2 = 18, M3 = 21;
const script = (id: string, button = 4): Script => ({ id, name: id, mode: 'once', cycleMs: 30, actions: [{ button, startMs: 0, holdMs: 100 }] });
const assign = (s: Script): Binding => ({ kind: 'script', buttons: [], behaviour: 'hold', turbo: 5, script: s });
const draft = () => decodeConfig(fromHex(FACTORY_CONFIG_HEX));

test('two identical library scripts stay apart: each button follows its own link', () => {
  const a = script('a'), b = script('b'), list = [a, b];
  const d = draft();
  setBinding(d, M1, assign(a)); setBinding(d, M2, assign(b));
  let links = setLink(undefined, M1, 'a'); links = setLink(links, M2, 'b');
  assert.deepEqual(keysLinked(links, d.macros, list, 'a'), [M1]);
  assert.deepEqual(keysLinked(links, d.macros, list, 'b'), [M2]);
  assert.equal(linkedScript(links, d.macros, list, M2)?.id, 'b');
});

test('a failed "New script" leaves another button with the same content alone', () => {
  const x = script('x'), fresh = script('new'); // identical default content
  const d = draft();
  setBinding(d, M2, assign(x));
  const links = setLink(undefined, M2, 'x');
  // The new script was never linked (its assignment failed), so nothing is linked to it…
  assert.deepEqual(keysLinked(links, d.macros, [x, fresh], 'new'), []);
  // …and M2 still follows x.
  assert.deepEqual(keysLinked(links, d.macros, [x, fresh], 'x'), [M2]);
});

test('recognition on read: first match wins, existing valid links are kept, combos are not scripts', () => {
  const a = script('a'), b = script('b'), list = [a, b];
  const d = draft();
  setBinding(d, M1, assign(a)); setBinding(d, M2, assign(b));
  setBinding(d, M3, { kind: 'buttons', buttons: [4, 5], behaviour: 'hold', turbo: 5 });
  const fresh = recognise(undefined, d.macros, list);
  assert.deepEqual(fresh, { [M1]: 'a', [M2]: 'a' }, 'same content: the first library script');
  const kept = recognise({ [M2]: 'b' }, d.macros, list);
  assert.deepEqual(kept, { [M1]: 'a', [M2]: 'b' }, 'a valid link is not overridden');
});

test('stale links are ignored and dropped: deleted script, cleared key, other content on the key', () => {
  const a = script('a'), c = script('c', 5);
  const d = draft();
  setBinding(d, M1, assign(c)); // M1 now holds c's content but is linked to a
  const links = { [M1]: 'a', [M2]: 'gone' };
  assert.equal(linkedScript(links, d.macros, [a, c], M1), undefined);
  assert.equal(linkedScript(links, d.macros, [a, c], M2), undefined);
  assert.deepEqual(recognise(links, d.macros, [a, c]), { [M1]: 'c' });
});

test('setLink and tolerant parsing', () => {
  assert.deepEqual(setLink({ 1: 'a' }, 1, null), {});
  assert.deepEqual(parseLinks('{"0":{"19":"a","x":"b","18":3},"7":{"1":"c"}}'), { 0: { 19: 'a' } });
  assert.deepEqual(parseLinks('not json'), {});
  assert.deepEqual(parseLinks(null), {});
});

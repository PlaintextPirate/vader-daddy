import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashBytes, profileEntry, lightEntry, offerFor, parseEntries } from './unsavedModel.ts';
import type { LightDraft } from './lightingModel.ts';

const orig = Uint8Array.from([1, 2, 3]), draft = Uint8Array.from([1, 9, 3]), base = Uint8Array.from([7, 7]);
const light: LightDraft = { mode: 'steady', brightness: 40, speed: 16, grid: [['#000000', '#ffffff']], steady: ['#ff0000'], perLed: false };

test('a kept draft is offered back only against the same original', () => {
  const e = { profile: profileEntry(orig, draft), light: lightEntry(base, light) };
  assert.deepEqual(offerFor(e, orig, base), { profile: draft, light });
  assert.deepEqual(offerFor(e, Uint8Array.from([1, 2, 4]), base), { light }, 'the controller changed meanwhile');
  assert.equal(offerFor(e, Uint8Array.from([0]), null), null);
  assert.equal(offerFor(undefined, orig, base), null);
});

test('hash and tolerant parsing', () => {
  assert.equal(hashBytes(orig), hashBytes(Uint8Array.from([1, 2, 3])));
  assert.notEqual(hashBytes(orig), hashBytes(draft));
  assert.deepEqual(parseEntries('{"0":{"profile":{"of":"x","bytes":"00"}},"9":{}}'), { 0: { profile: { of: 'x', bytes: '00' } } });
  assert.deepEqual(parseEntries('nope'), {});
  const broken = { light: { of: hashBytes(base), draft: { mode: 'disco' } as unknown as LightDraft } };
  assert.equal(offerFor(broken, null, base), null, 'a malformed light draft is not offered');
});

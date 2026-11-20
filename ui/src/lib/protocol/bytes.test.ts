import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hex, compactHex, parseHex, fromHex } from './bytes.ts';

test('hex helpers round-trip, spaced and compact', () => {
  const b = Uint8Array.from([0, 1, 0xab, 0xff]);
  assert.equal(hex(b), '00 01 ab ff');
  assert.equal(compactHex(b), '0001abff');
  assert.deepEqual(parseHex(hex(b)), b);
  assert.deepEqual(parseHex(compactHex(b)), b);
  assert.deepEqual(parseHex('  00\n01  AB ff '), b, 'any whitespace, either case');
  assert.deepEqual(parseHex(''), new Uint8Array(0));
});

test('parsing is strict: exactly two digits per byte', () => {
  for (const bad of ['1 2 3', '0 01', '001 02', 'abc', 'zz', '0x01', '01,02', '01 0g']) assert.equal(parseHex(bad), null, bad);
  assert.throws(() => fromHex('1 2'));
});

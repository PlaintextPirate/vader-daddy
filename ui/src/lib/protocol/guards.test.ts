import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUARDED, guardedBytes, keepGuarded } from './guards.ts';

test('the guarded ranges: name 770–785; stick block B except circularity (800, 812)', () => {
  assert.deepEqual(GUARDED.profileNames, [[770, 786]]);
  const curve = guardedBytes({ profileNames: true, responseCurve: false });
  assert.equal(curve.length, 22);
  assert.ok(!curve.includes(800) && !curve.includes(812));
  assert.ok([790, 799, 801, 802, 811, 813].every((i) => curve.includes(i)));
  assert.deepEqual(guardedBytes({ profileNames: true, responseCurve: true }), []);
  assert.equal(guardedBytes({ profileNames: false, responseCurve: false }).length, 38);
});

test('keepGuarded restores exactly the ranges whose flag is off', () => {
  const keep = new Uint8Array(840).fill(1);
  for (const names of [false, true]) for (const curve of [false, true]) {
    const out = keepGuarded(new Uint8Array(840).fill(2), keep, { profileNames: names, responseCurve: curve });
    const ones = [...out.keys()].filter((i) => out[i] === 1);
    assert.deepEqual(ones, guardedBytes({ profileNames: names, responseCurve: curve }).sort((a, b) => a - b));
  }
});

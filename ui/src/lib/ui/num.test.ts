import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, parseTyped, snap } from './num.ts';

test('clamp keeps values inside the range', () => {
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
  assert.equal(clamp(5, 0, 10), 5);
});

test('snap rounds to the step grid from min and clamps', () => {
  assert.equal(snap(103, 0, 1000, 10), 100);
  assert.equal(snap(105, 0, 1000, 10), 110);
  assert.equal(snap(7, 5, 100, 5), 5);
  assert.equal(snap(0.30000000004, 0, 1, 0.1), 0.3);
  assert.equal(snap(2000, 0, 1000, 10), 1000);
});

test('parseTyped reads the first number in typed text', () => {
  assert.equal(parseTyped('100 ms'), 100);
  assert.equal(parseTyped('8%'), 8);
  assert.equal(parseTyped('0,5'), 0.5);
  assert.equal(parseTyped('-3'), -3);
  assert.equal(parseTyped('abc'), null);
  assert.equal(parseTyped(' 60000 ms '), 60000);
  assert.equal(parseTyped('15 min'), 15);
});

test('parseTyped rejects anything that is not a plain number', () => {
  for (const t of ['1e3', '12abc', '1-2', '--3', '', '  ', '1.2.3', 'Infinity', '0x10']) assert.equal(parseTyped(t), null, t);
  assert.equal(parseTyped('-3', { negative: false }), null);
  assert.equal(parseTyped('2.5', { decimal: false }), null);
  assert.equal(parseTyped('25', { decimal: false, negative: false }), 25);
});

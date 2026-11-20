import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search, score, normalise } from './search.ts';

const items = [
  { label: 'Left stick' },
  { label: 'Right stick' },
  { label: 'M1' },
  { label: 'Light bar', keywords: ['LED', 'colour'] },
  { label: 'Stick resolution' },
  { label: 'Café combo' },
  { label: 'Profile 2' }
];
const labels = (q: string) => search(items, q).map((x) => x.label);

test('case and diacritics do not matter', () => {
  assert.equal(normalise('  CAFÉ '), 'cafe');
  assert.deepEqual(labels('cafe'), ['Café combo']);
  assert.deepEqual(labels('m1'), ['M1']);
});

test('prefix beats substring', () => {
  // "stick" starts "Stick resolution", starts a later word in the two sticks.
  assert.deepEqual(labels('stick'), ['Stick resolution', 'Left stick', 'Right stick']);
  assert.ok(score({ label: 'Left stick' }, 'lef') > score({ label: 'Left stick' }, 'ef'));
});

test('every word must match', () => {
  assert.deepEqual(labels('left st'), ['Left stick']);
  assert.deepEqual(labels('left bar'), []);
});

test('keywords match, below the label', () => {
  assert.deepEqual(labels('led'), ['Light bar']);
  assert.ok(score({ label: 'LED test' }, 'led') > score({ label: 'Light bar', keywords: ['LED'] }, 'led'));
});

test('empty query keeps the order; exact match first', () => {
  assert.deepEqual(labels(''), items.map((i) => i.label));
  assert.equal(labels('profile 2')[0], 'Profile 2');
});

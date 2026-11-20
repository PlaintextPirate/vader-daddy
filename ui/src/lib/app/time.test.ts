import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relativeTime, slotList } from './time.ts';

const now = Date.parse('2026-11-18T12:00:00Z');
const ago = (s: number) => new Date(now - s * 1000).toISOString();

test('relative times', () => {
  assert.equal(relativeTime(ago(10), now), 'just now');
  assert.equal(relativeTime(ago(5 * 60), now), '5 minutes ago');
  assert.equal(relativeTime(ago(3 * 3600), now), '3 hours ago');
  assert.equal(relativeTime(ago(26 * 3600), now), 'yesterday');
  assert.equal(relativeTime(ago(15 * 86400), now), '2 weeks ago');
});

test('slot lists are 1-based and sorted', () => {
  assert.equal(slotList({ 2: 'x', 0: 'y' }), '1, 3');
  assert.equal(slotList({}), '—');
});

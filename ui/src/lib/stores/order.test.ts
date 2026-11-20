import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChangeOrder } from './order.ts';

test('the latest is the change edited most recently, not the one that appeared last', () => {
  const o = createChangeOrder();
  o.sync('profile', [{ id: 'a', value: '1' }]);
  o.sync('profile', [{ id: 'a', value: '1' }, { id: 'b', value: '1' }]);
  assert.deepEqual(o.latest(), { scope: 'profile', id: 'b' });
  o.sync('profile', [{ id: 'a', value: '2' }, { id: 'b', value: '1' }]); // a edited again
  assert.deepEqual(o.latest(), { scope: 'profile', id: 'a' });
});

test('across scopes, and changes that go away leave the order', () => {
  const o = createChangeOrder();
  o.sync('profile', [{ id: 'a', value: '1' }]);
  o.sync('lighting', [{ id: 'speed', value: '3' }]);
  assert.deepEqual(o.latest(), { scope: 'lighting', id: 'speed' });
  o.sync('lighting', []);
  assert.deepEqual(o.latest(), { scope: 'profile', id: 'a' });
  o.sync('profile', [{ id: 'a', value: '1' }]); // unchanged value: not a new edit
  assert.deepEqual(o.latest(), { scope: 'profile', id: 'a' });
  o.sync('profile', []);
  assert.equal(o.latest(), null);
});

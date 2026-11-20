import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SerialQueue } from './queue.ts';

const later = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('actions run one at a time, in order; busy reflects the whole queue', async () => {
  const seen: (string | null)[] = [], order: string[] = [];
  const q = new SerialQueue((b) => seen.push(b));
  const a = q.run('a', async () => { order.push('a start'); await later(20); order.push('a end'); return 1; });
  const b = q.run('b', async () => { order.push('b start'); await later(5); order.push('b end'); return 2; });
  assert.equal(q.busy, 'a');
  assert.equal(q.size, 2);
  await a;
  assert.equal(await b, 2);
  assert.deepEqual(order, ['a start', 'a end', 'b start', 'b end']);
  assert.equal(q.busy, null);
  assert.deepEqual(seen, ['a', 'a', 'b', null], 'never null while b waits');
});

test('a failing action does not block the next one', async () => {
  const q = new SerialQueue();
  const a = q.run('a', async () => { throw new Error('x'); });
  const b = q.run('b', async () => 'ok');
  await assert.rejects(a);
  assert.equal(await b, 'ok');
  assert.equal(q.busy, null);
});

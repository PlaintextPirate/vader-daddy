import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sx, sy, toPct, nudge, keyStep, curvePath, tableDots, PLOT } from './graph.ts';
import { PRESETS, type StickResponse } from '../../protocol/response.ts';

const linear: StickResponse = { type: 0, deadzone: 0, p0: { x: 64, y: 64 }, p1: { x: 127, y: 127 }, end: 127, table: [], edge: 0 };

test('axes map both ways', () => {
  assert.deepEqual([sx(0), sx(100), sy(0), sy(100)], [PLOT.left, PLOT.right, PLOT.bottom, PLOT.top]);
  const p = toPct(sx(37), sy(62));
  assert.ok(Math.abs(p.x - 37) < 1e-9 && Math.abs(p.y - 62) < 1e-9);
  assert.deepEqual(toPct(-50, 999), { x: 0, y: 0 });
});

test('keyboard steps', () => {
  assert.deepEqual(keyStep('ArrowUp', false), [0, 1]);
  assert.deepEqual(keyStep('ArrowLeft', true), [-5, 0]);
  assert.equal(keyStep('a', false), null);
  assert.deepEqual(nudge({ x: 64, y: 64 }, 1, 0), { x: 65, y: 64 });
  assert.deepEqual(nudge({ x: 127, y: 0 }, 5, -5), { x: 127, y: 0 });
});

test('linear curve path and dots lie on the diagonal', () => {
  assert.ok(curvePath(linear).startsWith(`M${PLOT.left.toFixed(1)} ${PLOT.bottom.toFixed(1)}`));
  const dots = tableDots(linear);
  assert.equal(dots.length, 9);
  assert.equal(dots[8].y, PLOT.top);
  assert.deepEqual(PRESETS.linear.table.length, 9);
});

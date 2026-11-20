import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushLayer, escapeTop, pointerDown, layerCount } from './layers.ts';

test('Esc closes only the top-most layer, in stack order', () => {
  const closed: string[] = [];
  const offMenu = pushLayer({ escape: () => closed.push('menu') });
  const offPalette = pushLayer({ escape: () => closed.push('palette') });
  assert.equal(escapeTop(), true);
  assert.deepEqual(closed, ['palette']);
  offPalette();
  assert.equal(escapeTop(), true);
  assert.deepEqual(closed, ['palette', 'menu']);
  offMenu();
  assert.equal(escapeTop(), false, 'nothing open: the app handles Esc');
  assert.equal(layerCount(), 0);
});

test('removing a lower layer keeps the top one on top; removing twice is harmless', () => {
  const closed: string[] = [];
  const offA = pushLayer({ escape: () => closed.push('a') });
  const offB = pushLayer({ escape: () => closed.push('b') });
  offA();
  offA();
  escapeTop();
  assert.deepEqual(closed, ['b']);
  offB();
});

test('outside presses reach only the top-most layer, and not when inside it', () => {
  const out: string[] = [];
  const inner = {} as Node;
  const offLow = pushLayer({ outside: () => out.push('low') });
  const offTop = pushLayer({ inside: (t) => t === inner, outside: () => out.push('top') });
  pointerDown(inner);
  assert.deepEqual(out, []);
  pointerDown({} as Node);
  assert.deepEqual(out, ['top']);
  offTop();
  offLow();
});

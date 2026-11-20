import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyLabel } from './keyLabel.ts';

test('key labels', () => {
  assert.equal(keyLabel('KeyA'), 'A');
  assert.equal(keyLabel('Digit7'), '7');
  assert.equal(keyLabel('Space'), 'Space');
  assert.equal(keyLabel('ArrowUp'), '↑');
  assert.equal(keyLabel('ShiftLeft'), 'Left Shift');
  assert.equal(keyLabel('MetaRight'), 'Right Command');
  assert.equal(keyLabel('F13'), 'F13');
});

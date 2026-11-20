import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, PART_IDS, PART_ORDER, isPartId, keyOf, partForKey, partForStream } from './parts.ts';
import { KEY_NAMES } from '../protocol/config.ts';

test('every part is in the tab order exactly once', () => {
  assert.equal(PART_ORDER.length, PART_IDS.length);
  assert.deepEqual([...PART_ORDER].sort(), [...PART_IDS].sort());
});

test('ids match their table keys and names are set', () => {
  for (const [k, p] of Object.entries(PARTS)) {
    assert.equal(p.id, k);
    assert.ok(p.name.length > 0);
  }
});

test('key ids agree with KEY_NAMES', () => {
  const expect: Record<string, string> = {
    a: 'A', b: 'B', x: 'X', y: 'Y', select: 'Select', start: 'Start', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT',
    ls: 'L3', rs: 'R3', c: 'C', z: 'Z', m1: 'M1', m2: 'M2', m3: 'M3', m4: 'M4'
  };
  for (const [id, name] of Object.entries(expect)) {
    const k = keyOf(id as keyof typeof PARTS);
    assert.ok(k !== null, id);
    assert.equal(KEY_NAMES[k], name, id);
  }
  assert.deepEqual(PARTS.dpad.keys.map((k) => KEY_NAMES[k]), ['D-pad up', 'D-pad right', 'D-pad down', 'D-pad left']);
  assert.equal(keyOf('dpad'), null);
  assert.equal(keyOf('light'), null);
});

test('lookups', () => {
  assert.equal(partForStream('Up'), 'dpad');
  assert.equal(partForStream('L3'), 'ls');
  assert.equal(partForStream('Home'), 'home');
  assert.equal(partForStream('Nope'), null);
  assert.equal(partForKey(19), 'm1');
  assert.equal(partForKey(2), 'dpad');
  assert.equal(partForKey(99), null);
  assert.ok(isPartId('light'));
  assert.ok(!isPartId('toString'));
  assert.ok(!isPartId(3));
});

test('inspectors', () => {
  assert.equal(PARTS.ls.inspector, 'stick');
  assert.equal(PARTS.lt.inspector, 'trigger');
  assert.equal(PARTS.light.inspector, 'light');
  assert.equal(PARTS.m2.inspector, 'button');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHex } from '../../protocol/bytes.ts';
import { FACTORY_CONFIG_HEX } from '../../protocol/fixtures.ts';
import { decodeConfig, encodeConfig } from '../../protocol/config.ts';
import { setDeadzonePct, setOuterPct, setPoint, setPreset, deadzonePct, outerPct, copyStick, sticksEqual, triggersEqual, copyTrigger } from './edits.ts';

const raw = () => fromHex(FACTORY_CONFIG_HEX);
const diff = (a: Uint8Array, b: Uint8Array) => [...a.keys()].filter((i) => a[i] !== b[i]);

test('flag off: dead zone and outer limit write block A only, as before', () => {
  const c = decodeConfig(raw());
  setDeadzonePct(c, 'left', 8, false);
  setOuterPct(c, 'left', 94, false);
  assert.deepEqual([c.sticks.left.deadzone, c.sticks.left.end, c.sticks.left.type], [10, 119, 0]);
  assert.deepEqual([deadzonePct(c, 'left'), outerPct(c, 'left', false)], [8, 94]);
  assert.deepEqual(diff(raw(), encodeConfig(c)), [110, 115]);
  assert.deepEqual(diff(raw(), encodeConfig(c, { responseCurve: false })), [110, 115]);
});

test('flag on: dead zone and outer limit rewrite both blocks consistently', () => {
  const c = decodeConfig(raw());
  setDeadzonePct(c, 'left', 8, true);
  setOuterPct(c, 'left', 94, true);
  assert.equal(outerPct(c, 'left', true), 94);
  assert.equal(c.sticks.left.end, 127, 'End byte preserved');
  const out = encodeConfig(c, { responseCurve: true });
  // P1.x is clamped to 100 − edge (127 − 8 = 119), as Space Station does
  assert.deepEqual(diff(raw(), out), [109, 110, 113, 790, 792, 793, 794, 796, 797, 798, 801]);
  assert.deepEqual([...out.subarray(109, 116)], [3, 10, 63, 63, 119, 127, 127]);
  assert.deepEqual([...out.subarray(790, 802)], [3, 50, 54, 70, 84, 100, 113, 128, 142, 150, 0, 8]);
  // the same draft with the flag off writes only block A (the type and P1 land there too; block B never)
  assert.ok(diff(raw(), encodeConfig(c)).every((i) => i >= 109 && i <= 115));
});

test('points and presets', () => {
  const c = decodeConfig(raw());
  setPoint(c, 'right', 'p0', { x: 64, y: 96 });
  assert.equal(c.sticks.right.type, 3);
  setPreset(c, 'right', 'delay');
  assert.deepEqual([c.sticks.right.type, c.sticks.right.p0x, c.sticks.right.p0y], [2, 64, 32]);
  const out = encodeConfig(c, { responseCurve: true });
  assert.deepEqual([...out.subarray(803, 812)], [50, 55, 62, 68, 74, 92, 112, 130, 150]);
  setPoint(c, 'right', 'p1', { x: 10, y: 10 });
  assert.deepEqual([c.sticks.right.p1x, c.sticks.right.p1y], [64, 32], 'P1 cannot pass P0');
});

test('mirroring', () => {
  const c = decodeConfig(raw());
  assert.ok(sticksEqual(c) && triggersEqual(c));
  setPreset(c, 'left', 'fast');
  c.round.left = !c.round.left;
  assert.ok(!sticksEqual(c));
  copyStick(c, 'left', 'right');
  assert.ok(sticksEqual(c));
  c.triggers.left.deadzone = 20;
  copyTrigger(c, 'left', 'right');
  assert.equal(c.triggers.right.deadzone, 20);
});

test('mirroring touches only what is written and listed', () => {
  const c = decodeConfig(raw());
  c.triggers.left.type = 3; c.triggers.left.p0x = 90; c.triggers.left.deadzone = 20;
  copyTrigger(c, 'left', 'right');
  assert.deepEqual([c.triggers.right.deadzone, c.triggers.right.type, c.triggers.right.p0x], [20, 0, raw()[132]]);
  assert.ok(triggersEqual(c), 'equal in what the panel shows');
  c.edge.left = 9;
  copyStick(c, 'left', 'right', false);
  assert.equal(c.edge.right, 0, 'curve off: the edge (not written) is not copied');
  assert.ok(sticksEqual(c, false) && !sticksEqual(c, true));
  copyStick(c, 'left', 'right', true);
  assert.equal(c.edge.right, 9);
});

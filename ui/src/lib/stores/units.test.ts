import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stickPct, stickRaw, triggerPct, triggerRaw, STICK_DEADZONE, STICK_OUTER, TRIGGER_DEADZONE, TRIGGER_FULL,
  STICK_DEADZONE_PCT, STICK_OUTER_PCT, TRIGGER_DEADZONE_PCT, TRIGGER_FULL_PCT, fmtPct,
  outerPctFromEdge, edgeFromOuterPct, motorPct, motorRaw
} from './units.ts';

test('stick ends of the scale', () => {
  assert.equal(stickPct(0), 0);
  assert.equal(stickPct(127), 100);
  assert.equal(stickPct(10), 8);
  assert.equal(stickPct(119), 94);
});

test('trigger ends of the scale', () => {
  assert.equal(triggerPct(0), 0);
  assert.equal(triggerPct(255), 100);
});

test('percent → raw → percent is the identity over every reachable percent', () => {
  for (const [r, R] of [[STICK_DEADZONE, STICK_DEADZONE_PCT], [STICK_OUTER, STICK_OUTER_PCT]] as const)
    for (let p = R.min; p <= R.max; p++) assert.equal(stickPct(stickRaw(p, r)), p, `stick ${p}%`);
  for (const [r, R] of [[TRIGGER_DEADZONE, TRIGGER_DEADZONE_PCT], [TRIGGER_FULL, TRIGGER_FULL_PCT]] as const)
    for (let p = R.min; p <= R.max; p++) assert.equal(triggerPct(triggerRaw(p, r)), p, `trigger ${p}%`);
});

test('raw values clamp to their ranges', () => {
  assert.equal(stickRaw(90, STICK_DEADZONE), 60);
  assert.equal(stickRaw(10, STICK_OUTER), 64);
  assert.equal(triggerRaw(0, TRIGGER_FULL), 128);
});

test('percent limits for the sliders', () => {
  assert.deepEqual(STICK_DEADZONE_PCT, { min: 0, max: 47 });
  assert.deepEqual(STICK_OUTER_PCT, { min: 50, max: 100 });
  assert.deepEqual(TRIGGER_FULL_PCT, { min: 50, max: 100 });
  assert.equal(fmtPct(8), '8%');
});

test('outer limit via the edge byte matches the end byte scale', () => {
  for (let p = STICK_OUTER_PCT.min; p <= STICK_OUTER_PCT.max; p++) {
    const e = edgeFromOuterPct(p);
    assert.equal(outerPctFromEdge(e), p, `outer ${p}%`);
    assert.equal(e, 127 - stickRaw(p, STICK_OUTER));
  }
  assert.equal(outerPctFromEdge(0), 100);
});

test('motor strength is stored as a percent, 0–100', () => {
  assert.equal(motorPct(50), 50);
  assert.equal(motorPct(243), 100); // a preset from an older controller shows as full
  assert.equal(motorRaw(0), 0);
  assert.equal(motorRaw(-5), 0);
  assert.equal(motorRaw(250), 100);
  for (let p = 0; p <= 100; p++) assert.equal(motorPct(motorRaw(p)), p);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hex } from '../protocol/bytes.ts';
import { FACTORY_CONFIG_HEX, FACTORY_RAINBOW_LED_HEX } from '../protocol/fixtures.ts';
import { parseBackup, backupProblem, planRestore, restoreWrites } from './backupFile.ts';
import { copy } from '../copy.ts';

const cfg = FACTORY_CONFIG_HEX, led = FACTORY_RAINBOW_LED_HEX;
const file = (o: object) => JSON.stringify({ date: '2026-11-18T10:00:00Z', label: 'x', ...o });

test('a good backup parses; compact hex is fine too', () => {
  const b = parseBackup(file({ config: { 0: cfg, 2: cfg.replaceAll(' ', '') }, led: { 0: led } }));
  assert.deepEqual(Object.keys(b.config), ['0', '2']);
  assert.equal(b.label, 'x');
});

test('damaged backups are refused with friendly reasons', () => {
  const bad = (o: object) => backupProblem(o as never);
  assert.equal(bad({ config: { 0: cfg.slice(3) } }), 'profileLength');
  assert.equal(bad({ config: { 0: '02' + cfg.slice(2) } }), 'profileHeader');
  assert.equal(bad({ config: { 0: cfg.replace('01 03', '1 003') } }), 'hex');
  assert.equal(bad({ config: { 5: cfg } }), 'slot');
  assert.equal(bad({ led: { 0: hex(new Uint8Array(100)) } }), 'ledLength');
  assert.equal(bad({ led: { 0: hex(new Uint8Array(490)) } }), null);
  assert.throws(() => parseBackup(file({ config: { 0: cfg.slice(3) } })), { message: copy.history.damaged });
  assert.throws(() => parseBackup('nope'), { message: copy.history.notBackup });
  assert.throws(() => parseBackup('{}'), { message: copy.history.notBackup });
});

test('restore plan: read what is not loaded first; skip unreadable slots unless confirmed', () => {
  const b = { config: { 0: cfg, 1: cfg, 3: cfg }, led: { 0: led, 1: led } };
  const p = planRestore(b, true, { profiles: [0], leds: [0] });
  assert.deepEqual(p, { profiles: [0, 1, 3], leds: [0, 1], readProfiles: [1, 3], readLeds: [1] });
  assert.deepEqual(restoreWrites(p, [3], false), { profiles: [0, 1], leds: [0, 1], skipped: [3] });
  assert.deepEqual(restoreWrites(p, [1], false), { profiles: [0, 3], leds: [0], skipped: [1] }, 'profile and lighting of that slot');
  assert.deepEqual(restoreWrites(p, [1, 3], true), { profiles: [0, 1, 3], leds: [0, 1], skipped: [] });
  assert.deepEqual(planRestore(b, false, { profiles: [], leds: [] }).leds, [], 'profiles only');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHex } from './bytes.ts';
import { FACTORY_CONFIG_HEX } from './fixtures.ts';
import {
  decodeResponse, encodeResponse, sampleTable, sampleCurve, constrain, clampPoint, applyPreset, PRESETS, TABLE_X,
  BLOCK_A, BLOCK_B, type StickResponse, type Side
} from './response.ts';

const factory = () => fromHex(FACTORY_CONFIG_HEX);
const SIDES: Side[] = ['left', 'right'];
const changed = (a: Uint8Array, b: Uint8Array) => [...a.keys()].filter((i) => a[i] !== b[i]);
const inBlocks = (i: number, side: Side) =>
  (i >= BLOCK_A[side] && i < BLOCK_A[side] + 7) || (i >= BLOCK_B[side] && i < BLOCK_B[side] + 12);

test('sample grid is the app\'s integer 100·i/8', () => {
  assert.deepEqual(TABLE_X, [0, 12, 25, 37, 50, 62, 75, 87, 100]);
});

test('factory decodes to the Default (linear) curve', () => {
  for (const side of SIDES) {
    const r = decodeResponse(factory(), side);
    assert.equal(r.type, 0);
    assert.equal(r.deadzone, 0);
    assert.equal(r.edge, 0);
    assert.deepEqual([r.p0, r.p1, r.end], [{ x: 63, y: 63 }, { x: 127, y: 127 }, 127]);
    assert.deepEqual(r.table, PRESETS.linear.table);
    assert.deepEqual(sampleTable(r), PRESETS.linear.table);
  }
});

test('encode(decode(factory)) is byte-identical', () => {
  for (const side of SIDES) {
    const raw = factory();
    assert.deepEqual(encodeResponse(raw, side, decodeResponse(raw, side)), raw);
  }
});

test('each preset reproduces its official table', () => {
  const base = decodeResponse(factory(), 'left');
  for (const key of ['linear', 'fast', 'delay'] as const) {
    const r = applyPreset(base, key);
    assert.equal(r.type, PRESETS[key].type);
    assert.deepEqual(sampleTable(r), PRESETS[key].table, key);
  }
});

test('preset bytes land in both blocks and nothing else changes', () => {
  for (const side of SIDES) {
    const raw = factory();
    const out = encodeResponse(raw, side, applyPreset(decodeResponse(raw, side), 'fast'));
    const a = BLOCK_A[side], b = BLOCK_B[side];
    assert.deepEqual([...out.subarray(a, a + 7)], [1, 0, 64, 96, 127, 127, 127]);
    assert.deepEqual([...out.subarray(b, b + 12)], [1, 50, 68, 88, 106, 126, 131, 138, 143, 150, raw[b + 10], 0]);
    for (const i of changed(raw, out)) assert.ok(inBlocks(i, side), `byte ${i} outside ${side} blocks`);
  }
});

test('encode never touches bytes outside the two blocks', () => {
  const raw = factory();
  const r: StickResponse = { ...decodeResponse(raw, 'right'), type: 3, deadzone: 13, edge: 8, p0: { x: 40, y: 20 }, p1: { x: 100, y: 110 } };
  const out = encodeResponse(raw, 'right', r);
  assert.ok(changed(raw, out).length > 0);
  for (const i of changed(raw, out)) assert.ok(inBlocks(i, 'right'), `byte ${i}`);
  assert.deepEqual(decodeResponse(out, 'right'), { ...r, table: sampleTable(r) });
  assert.notStrictEqual(out, raw);
});

test('signed dead zone and edge round-trip as int8', () => {
  const raw = factory();
  const r = { ...decodeResponse(raw, 'left'), type: 3 as const, deadzone: -13, edge: -10 };
  const out = encodeResponse(raw, 'left', r);
  assert.equal(out[110], 0xf3);
  assert.equal(out[801], 0xf6);
  const back = decodeResponse(out, 'left');
  assert.deepEqual([back.deadzone, back.edge], [-13, -10]);
  assert.equal(back.table[0], 60, 'anti-dead zone of 10% starts the table at 60');
});

test('a dead zone zeroes the first table entries', () => {
  const r = { ...decodeResponse(factory(), 'left'), deadzone: 19 }; // 15%
  assert.deepEqual(sampleTable(r).slice(0, 2), [50, 50]);
  assert.equal(sampleCurve(r, 10), 0);
  assert.equal(sampleCurve(r, 100), 100);
});

test('constraints: dead zone ≤ P0 ≤ P1 ≤ 100 − edge on both axes', () => {
  const base = decodeResponse(factory(), 'left');
  const c = constrain({ ...base, deadzone: 30, edge: 20, p0: { x: 10, y: 120 }, p1: { x: 5, y: 3 } });
  assert.ok(c.deadzone <= c.p0.x && c.p0.x <= c.p1.x && c.p1.x <= 127 - c.edge);
  assert.ok(c.p0.y <= c.p1.y && c.p1.y <= 127);
  assert.deepEqual(clampPoint(base, 'p0', { x: 200, y: -4 }), { x: 127, y: 0 });
  assert.deepEqual(clampPoint({ ...base, p0: { x: 60, y: 70 } }, 'p1', { x: 10, y: 10 }), { x: 60, y: 70 });
  for (let i = 0; i < 200; i++) {
    const rnd = () => Math.floor(Math.random() * 255) - 127;
    const r = constrain({ ...base, deadzone: Math.abs(rnd()) % 61, edge: Math.abs(rnd()) % 64, p0: { x: rnd(), y: rnd() }, p1: { x: rnd(), y: rnd() } });
    assert.ok(r.deadzone <= r.p0.x && r.p0.x <= r.p1.x && r.p1.x <= 127 - r.edge, JSON.stringify(r));
    assert.ok(0 <= r.p0.y && r.p0.y <= r.p1.y && r.p1.y <= 127, JSON.stringify(r));
    const t = sampleTable(r);
    assert.ok(t.every((v, k) => v >= 50 && v <= 150 && (k === 0 || v >= t[k - 1])), `monotonic ${t}`);
  }
});

test('presetOf judges the shape only: type byte, dead zone and edge do not matter', async () => {
  const { presetOf, applyPreset, decodeResponse } = await import('./response.ts');
  const { fromHex } = await import('./bytes.ts');
  const { FACTORY_CONFIG_HEX } = await import('./fixtures.ts');
  const r = decodeResponse(fromHex(FACTORY_CONFIG_HEX), 'left');
  assert.equal(presetOf(r), 'linear', 'factory stores 63/63');
  assert.equal(presetOf({ ...r, type: 3 }), 'linear');
  const windowed = { ...r, deadzone: 30, edge: 20 };
  for (const k of ['linear', 'fast', 'delay'] as const) assert.equal(presetOf({ ...applyPreset(windowed, k), type: 3 }), k);
  assert.equal(presetOf({ ...r, p0: { x: 40, y: 100 } }), 'custom');
});

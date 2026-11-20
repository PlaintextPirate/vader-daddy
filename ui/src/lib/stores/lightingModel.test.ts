import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHex } from '../protocol/bytes.ts';
import { decodeLed, encodeLed, makeSteady, LED_WRITE_BYTES } from '../protocol/led.ts';
import { FACTORY_RAINBOW_LED_HEX } from '../protocol/fixtures.ts';
import {
  toDraft, fromDraft, describeLightChanges, setSteady, copyToAll, addStep, deleteStep, moveStep, stepCount,
  MAX_STEPS, MIN_STEPS, type LightDraft
} from './lightingModel.ts';

const rainbow = () => decodeLed(fromHex(FACTORY_RAINBOW_LED_HEX));
const steadyBase = () => decodeLed(encodeLed(makeSteady(rainbow(), [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255], [255, 128, 0]], 40)));
const clone = (d: LightDraft): LightDraft => structuredClone(d);
const undoAll = (o: LightDraft, d: LightDraft) => {
  for (let i = 0; i < 10; i++) { const c = describeLightChanges(o, d)[0]; if (!c) return; c.revert(d, o); }
};

test('factory rainbow: draft → config is byte-identical', () => {
  const base = rainbow();
  const d = toDraft(base);
  assert.equal(d.mode, 'animated');
  assert.equal(stepCount(d), 6);
  assert.equal(d.speed, 16);
  assert.equal(d.brightness, 50);
  assert.deepEqual(encodeLed(fromDraft(base, d)), encodeLed(base));
});

test('steady config: draft → config is byte-identical; per-LED detected', () => {
  const base = steadyBase();
  const d = toDraft(base);
  assert.equal(d.mode, 'steady');
  assert.equal(d.perLed, true);
  assert.deepEqual(d.steady, ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#ff8000']);
  assert.deepEqual(encodeLed(fromDraft(base, d)), encodeLed(base));
});

test('unknown bytes survive any edit', () => {
  const raw = fromHex(FACTORY_RAINBOW_LED_HEX).slice(0, LED_WRITE_BYTES);
  for (const i of [0, 1, 9, 13, 19]) raw[i] = 0x5a; // version and reserved bytes
  const base = decodeLed(raw);
  const d = toDraft(base);
  d.brightness = 80;
  d.grid[2][0] = '#ffffff';
  for (const mode of ['animated', 'steady'] as const) {
    d.mode = mode;
    const out = encodeLed(fromDraft(base, d));
    for (const i of [0, 1, ...Array.from({ length: 11 }, (_, k) => 9 + k)]) assert.equal(out[i], raw[i], `${mode} byte ${i}`);
  }
});

test('one colour for all LEDs writes five equal colours', () => {
  const d = toDraft(steadyBase());
  d.perLed = false;
  setSteady(d, 0, '#00ffff');
  const c = fromDraft(steadyBase(), d);
  for (let l = 0; l < 5; l++) assert.deepEqual(c.leds[l][0], [0, 100, 100]);
});

test('steady and animated work are kept apart', () => {
  const o = toDraft(rainbow());
  const d = clone(o);
  d.grid[0][0] = '#ffffff';
  d.mode = 'steady';
  setSteady(d, 0, '#ff0000');
  d.mode = 'animated';
  assert.equal(d.grid[0][0], '#ffffff');
  d.mode = 'steady';
  assert.equal(d.steady[0], '#ff0000');
});

test('change descriptions read well', () => {
  const o = toDraft(rainbow());
  const d = clone(o);
  assert.deepEqual(describeLightChanges(o, d), []);
  d.brightness = 15;
  d.speed = 5;
  d.grid[2][0] = '#ffffff';
  const c = describeLightChanges(o, d).map(({ label, from, to }) => [label, from, to]);
  assert.deepEqual(c, [['Light bar colours', '', ''], ['Light bar speed', 'Medium', 'Fast'], ['Light bar brightness', '50%', '15%']]);
  d.speed = 20;
  assert.deepEqual(describeLightChanges(o, d).find((x) => x.id === 'speed')?.to, 'Medium, slower');
  deleteStep(d, 5);
  const col = describeLightChanges(o, d).find((x) => x.id === 'colours')!;
  assert.deepEqual([col.from, col.to], ['6 steps', '5 steps']);
  d.mode = 'steady';
  const m = describeLightChanges(o, d).map((x) => [x.id, x.from, x.to]);
  assert.deepEqual(m, [['mode', 'Animated', 'Steady'], ['brightness', '50%', '15%']]);
});

test('switching per-LED without changing colours is not a change', () => {
  const o = toDraft(steadyBase());
  const d = clone(o);
  d.perLed = false;
  d.steady = Array(5).fill(d.steady[0]);
  const flat = clone(d);
  flat.perLed = true;
  assert.deepEqual(describeLightChanges(d, flat), []);
});

test('each undo restores exactly', () => {
  for (const base of [rainbow(), steadyBase()]) {
    const o = toDraft(base);
    const d = clone(o);
    d.brightness = 99;
    d.speed = 70;
    setSteady(d, 1, '#000000');
    d.perLed = !d.perLed;
    copyToAll(d, 0, '#ffffff');
    moveStep(d, 0, 1);
    addStep(d, 1);
    d.mode = d.mode === 'steady' ? 'animated' : 'steady';
    undoAll(o, d);
    assert.deepEqual(describeLightChanges(o, d), []);
    assert.deepEqual(encodeLed(fromDraft(base, d)), encodeLed(fromDraft(base, o)));
  }
});

test('step edits respect the limits and return the step to select', () => {
  const d = toDraft(rainbow());
  const first = d.grid.map((r) => r[0]);
  assert.equal(addStep(d, 0), 1);
  assert.deepEqual(d.grid.map((r) => r[1]), first);
  while (stepCount(d) < MAX_STEPS) addStep(d, 0);
  assert.equal(addStep(d, 3), 3);
  assert.equal(stepCount(d), MAX_STEPS);
  assert.equal(moveStep(d, 0, -1), 0);
  assert.equal(moveStep(d, MAX_STEPS - 1, 1), MAX_STEPS - 1);
  d.grid[0][0] = '#123456';
  assert.equal(moveStep(d, 0, 1), 1);
  assert.equal(d.grid[0][1], '#123456');
  while (stepCount(d) > MIN_STEPS) deleteStep(d, stepCount(d) - 1);
  assert.equal(deleteStep(d, 1), 1);
  assert.equal(stepCount(d), MIN_STEPS);
  assert.equal(deleteStep(toDraft(rainbow()), 5), 4);
});

test('copy to all LEDs: one step, or all five steady', () => {
  const d = toDraft(rainbow());
  copyToAll(d, 2, '#ff0000');
  assert.deepEqual(d.grid.map((r) => r[2]), Array(5).fill('#ff0000'));
  assert.notEqual(d.grid[0][1], '#ff0000');
  copyToAll(d, null, '#00ff00');
  assert.deepEqual(d.steady, Array(5).fill('#00ff00'));
});

// ---- fromDraft keeps every header byte the user did not change (synthetic headers).
import { toDraft as toD, fromDraft as fromD } from './lightingModel.ts';

function header(mode: number, extra: number[] = []): Uint8Array {
  const raw = fromHex(FACTORY_RAINBOW_LED_HEX);
  raw.set([0x00, 0x02, 0x07, 0x01, mode === 5 ? 0 : 5, 0xc8, 0x32, 0x05, mode], 0); // feedback 7, loop start 1, loop time 200
  extra.forEach((v, i) => { raw[9 + i] = v; });
  return raw;
}
const diffOf = (a: Uint8Array, b: Uint8Array) => [...a.keys()].filter((i) => a[i] !== b[i]);

test('brightness alone writes only the brightness byte (animated and steady), clamped only when edited', () => {
  for (const mode of [1, 5]) {
    const raw = header(mode), base = decodeLed(raw), o = toD(base), d = structuredClone(o);
    d.brightness = 70;
    const out = encodeLed(fromD(base, d, o));
    assert.deepEqual(diffOf(out, raw.slice(0, LED_WRITE_BYTES)), [6], `mode ${mode}`);
    d.brightness = 140;
    assert.equal(encodeLed(fromD(base, d, o))[6], 100, 'an edited value is clamped');
    assert.equal(encodeLed(fromD(base, o, o))[5], 200, 'loop time 200 kept while not edited');
  }
});

test('speed alone writes only the loop time byte', () => {
  const raw = header(1), base = decodeLed(raw), o = toD(base), d = structuredClone(o);
  d.speed = 40;
  assert.deepEqual(diffOf(encodeLed(fromD(base, d, o)), raw.slice(0, LED_WRITE_BYTES)), [5]);
});

test('a colour edit keeps feedback and loop start; a mode change writes the verified layout', () => {
  const raw = header(1), base = decodeLed(raw), o = toD(base), d = structuredClone(o);
  d.grid[0][0] = '#000000';
  const c = fromD(base, d, o);
  assert.deepEqual([c.feedback, c.loopStart, c.loopTime], [7, 1, 200]);
  const m = structuredClone(o); m.mode = 'steady';
  const s = fromD(base, m, o);
  assert.deepEqual([s.feedback, s.loopStart, s.mode], [0, 0, 5]);
});

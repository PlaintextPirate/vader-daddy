import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHex, withChecksum, parcels } from './bytes.ts';
import { decodeLed, encodeLed, makeSteady, makeAnimated, gridOf, steadyColour, PRESETS, LED_WRITE_BYTES } from './led.ts';
import { decodeConfig, encodeConfig, decodeMacros, macroUnits } from './config.ts';
import { bindingOf, setBinding, macroOfScript, matches, type Script } from './bindings.ts';
import { FACTORY_CONFIG_HEX, FACTORY_RAINBOW_LED_HEX } from './fixtures.ts';

test('config round-trips byte-for-byte', () => {
  const raw = fromHex(FACTORY_CONFIG_HEX);
  assert.equal(raw.length, 840);
  const c = decodeConfig(raw);
  assert.equal(c.version, '1.3');
  assert.equal(c.parcelCount, 84);
  assert.deepEqual(encodeConfig(c), raw);
});

test('factory config decodes to known values', () => {
  const c = decodeConfig(fromHex(FACTORY_CONFIG_HEX));
  assert.equal(c.buttons[16].target, 14, 'C → L3');
  assert.equal(c.buttons[17].target, 15, 'Z → R3');
  assert.deepEqual([c.sticks.left.deadzone, c.sticks.left.end], [0, 127]);
  assert.equal(c.gyro.activationKey, 12);
  assert.equal(c.rumble.enabled, true);
  assert.equal(c.rumble.left.scale, 50);
});

test('editing one field changes only its bytes', () => {
  const raw = fromHex(FACTORY_CONFIG_HEX);
  const c = decodeConfig(raw);
  c.rumble.left.scale = 80;
  const out = encodeConfig(c);
  const changed = [...out.keys()].filter((i) => out[i] !== raw[i]);
  assert.deepEqual(changed, [149]);
});

test('LED round-trips the written 490 bytes', () => {
  const raw = fromHex(FACTORY_RAINBOW_LED_HEX);
  const out = encodeLed(decodeLed(raw));
  assert.equal(out.length, LED_WRITE_BYTES);
  assert.deepEqual(out, raw.slice(0, LED_WRITE_BYTES));
});

test('steady colour matches the layout that was verified on hardware', () => {
  const base = decodeLed(fromHex(FACTORY_RAINBOW_LED_HEX));
  const s = encodeLed(makeSteady(base, [255, 80, 0], 15));
  assert.deepEqual([s[2], s[4], s[6], s[7], s[8]], [0, 0, 15, 5, 5]);
  assert.deepEqual([...s.slice(20, 23)], [100, 31, 0]);
  assert.deepEqual([...s.slice(50, 53)], [100, 31, 0]);
  assert.deepEqual(steadyColour(decodeLed(s)), [255, 79, 0]);
});

test('save command checksum matches the bytes that worked', () => {
  // Captured from a successful save: tx 50 03 10 1d 0a (ver 0x1d10)
  assert.deepEqual(withChecksum([0x50, 0x03, 0x10, 0x1d], 5).slice(0, 5), [0x50, 0x03, 0x10, 0x1d, 0x0a]);
  // read config id: tx 50 02 00 ae
  assert.deepEqual(withChecksum([0x50, 0x02, 0x00], 4).slice(0, 4), [0x50, 0x02, 0x00, 0xae]);
});

test('parcels', () => {
  const p = parcels(0x33, new Uint8Array(490));
  assert.equal(p.length, 49);
  assert.deepEqual(p[48].slice(-2), [0xa0, 48]);
});

test('factory rainbow is 5 LEDs × 6 keyframes; animated round-trips through the grid', () => {
  const base = decodeLed(fromHex(FACTORY_RAINBOW_LED_HEX));
  const grid = gridOf(base);
  assert.equal(grid.length, 5);
  assert.equal(grid[0].length, 6);
  assert.deepEqual(base.leds[0][5], [100, 0, 0]); // LED 0 ends its hue walk on red
  const again = decodeLed(encodeLed(makeAnimated(base, grid, base.loopTime, base.brightness)));
  assert.deepEqual(gridOf(again), grid);
  assert.equal(again.loopEnd, 5);
  assert.equal(again.mode, 1);
});

test('per-LED steady colours and presets have the right shape', () => {
  const base = decodeLed(fromHex(FACTORY_RAINBOW_LED_HEX));
  const s = decodeLed(encodeLed(makeSteady(base, [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255], [0, 0, 0]], 20)));
  assert.deepEqual(gridOf(s).map((l) => l[0]), [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255], [0, 0, 0]]);
  for (const p of Object.values(PRESETS)) {
    const g = p.build([[255, 0, 0], [0, 0, 255], [0, 255, 0]]);
    assert.equal(g.length, 5);
    assert.ok(g[0].length >= 2 && g[0].length <= 10 && g.every((l) => l.length === g[0].length));
  }
});

test('macro encoding matches the bytes that played correctly on the controller', () => {
  const c = decodeConfig(fromHex(FACTORY_CONFIG_HEX));
  assert.deepEqual(c.macros, []);
  // The hardware test: trigger key 18, A for 50 ms, B for 150 ms, X for 250 ms, 100 ms gaps.
  c.macros = [{ trigger: 18, type: 1, cycleMs: 30, actions: [
    { button: 4, startMs: 0, holdMs: 50 }, { button: 5, startMs: 150, holdMs: 150 }, { button: 7, startMs: 400, holdMs: 250 }] }];
  const out = encodeConfig(c);
  assert.deepEqual(Array.from(out.slice(230, 264)), Array.from(fromHex(
    '01 00 00 00 00 00 12 06 00 01 00 00 04 01 05 00 04 00 0f 00 05 01 1e 00 05 00 28 00 07 01 41 00 07 00')));
  assert.equal(out[264], 0xff);
  assert.deepEqual(Array.from(out.slice(13 + 18 * 3, 16 + 18 * 3)), [0x20, 0, 0]);
  assert.deepEqual(decodeMacros(out), c.macros);
});

test('several macros: offsets, round trip, and removing a macro frees its button', () => {
  const c = decodeConfig(fromHex(FACTORY_CONFIG_HEX));
  c.macros = [
    { trigger: 19, type: 1, cycleMs: 30, actions: [{ button: 4, startMs: 0, holdMs: 100 }, { button: 5, startMs: 0, holdMs: 100 }] },
    { trigger: 18, type: 2, cycleMs: 50, actions: [{ button: 7, startMs: 20, holdMs: 40 }] }];
  const out = encodeConfig(c);
  assert.equal(out[230], 2);
  assert.equal(out[232], 5); // second macro starts after 1 header + 4 steps
  assert.equal(macroUnits(c.macros), 8);
  const back = decodeConfig(out);
  assert.deepEqual(back.macros, c.macros);
  back.macros = [back.macros[1]];
  const out2 = encodeConfig(back);
  assert.equal(out2[13 + 19 * 3], 0xff);
  assert.equal(out2[13 + 18 * 3], 0x20);
  assert.deepEqual(decodeMacros(out2), [c.macros[1]]);
});

test('hold macro: type 2 with press steps only, as verified on the controller', () => {
  const c = decodeConfig(fromHex(FACTORY_CONFIG_HEX));
  c.macros = [{ trigger: 19, type: 2, cycleMs: 30, hold: true, actions: [{ button: 4, startMs: 0, holdMs: 100 }, { button: 5, startMs: 0, holdMs: 100 }] }];
  const out = encodeConfig(c);
  assert.deepEqual(Array.from(out.slice(230, 248)), Array.from(fromHex('01 00 00 00 00 00 13 02 00 02 00 00 04 01 00 00 05 01')));
  assert.equal(out[248], 0xff);
  assert.deepEqual(decodeMacros(out), c.macros);
  assert.equal(macroUnits(c.macros), 3);
});

test('bindings: every kind round-trips through the profile bytes', () => {
  const c = decodeConfig(fromHex(FACTORY_CONFIG_HEX));
  assert.equal(bindingOf(c, 19).kind, 'default');
  assert.deepEqual(bindingOf(c, 16).buttons, [14]); // factory: C acts as L3
  const script: Script = { id: 's1', name: 'Dash', mode: 'once', cycleMs: 30, actions: [{ button: 4, startMs: 0, holdMs: 50 }, { button: 5, startMs: 150, holdMs: 150 }] };
  setBinding(c, 19, { kind: 'buttons', buttons: [4, 5], behaviour: 'hold', turbo: 5 });      // M1: hold A+B
  setBinding(c, 18, { kind: 'buttons', buttons: [7, 8], behaviour: 'toggle', turbo: 5 });    // M2: latch X+Y
  setBinding(c, 21, { kind: 'buttons', buttons: [10], behaviour: 'turbo', turbo: 5 });       // M3: LB turbo (button table)
  setBinding(c, 20, { kind: 'buttons', buttons: [10, 11], behaviour: 'turbo', turbo: 100 }); // M4: LB+RB every 100 ms
  setBinding(c, 17, { kind: 'script', buttons: [], behaviour: 'hold', turbo: 5, script });   // Z: a script
  const back = decodeConfig(encodeConfig(c));
  assert.deepEqual(Array.from(encodeConfig(back).slice(230, 248)), Array.from(fromHex('04 00 03 06 0b 00 13 02 00 02 00 00 04 01 00 00 05 01')));
  assert.deepEqual([bindingOf(back, 19).behaviour, bindingOf(back, 19).buttons], ['hold', [4, 5]]);
  assert.deepEqual([bindingOf(back, 18).behaviour, bindingOf(back, 18).buttons], ['toggle', [7, 8]]);
  assert.deepEqual([bindingOf(back, 21).behaviour, bindingOf(back, 21).buttons, bindingOf(back, 21).turbo], ['turbo', [10], 5]);
  assert.deepEqual(Array.from(encodeConfig(back).slice(13 + 21 * 3, 16 + 21 * 3)), [10, 1, 5]); // the bytes that pulsed on the controller
  assert.deepEqual([bindingOf(back, 20).behaviour, bindingOf(back, 20).buttons, bindingOf(back, 20).turbo], ['turbo', [10, 11], 100]);
  assert.equal(bindingOf(back, 17).kind, 'script');
  assert.ok(matches(back.macros.find((m) => m.trigger === 17)!, script));
  assert.deepEqual(macroOfScript(17, script), back.macros.find((m) => m.trigger === 17));
  setBinding(back, 19, { kind: 'default', buttons: [], behaviour: 'hold', turbo: 5 });
  assert.equal(encodeConfig(back)[13 + 19 * 3], 0xff);
  assert.equal(back.macros.length, 3);
});

test('bindings: a sixth macro is refused', () => {
  const c = decodeConfig(fromHex(FACTORY_CONFIG_HEX));
  for (const k of [19, 18, 21, 20, 16]) setBinding(c, k, { kind: 'buttons', buttons: [4, 5], behaviour: 'hold', turbo: 5 });
  assert.throws(() => setBinding(c, 17, { kind: 'buttons', buttons: [4, 5], behaviour: 'hold', turbo: 5 }));
  setBinding(c, 17, { kind: 'buttons', buttons: [4], behaviour: 'turbo', turbo: 8 }); // a plain remap with turbo needs no macro
  assert.equal(c.macros.length, 5);
});

test('stick circularity is per stick at bytes 800 (left) and 812 (right)', () => {
  const c = decodeConfig(fromHex(FACTORY_CONFIG_HEX));
  assert.deepEqual(c.round, { left: false, right: false });
  c.round.right = true;
  const out = encodeConfig(c);
  assert.equal(out[800], 0);
  assert.equal(out[812], 1);
  assert.deepEqual(decodeConfig(out).round, { left: false, right: true });
});

test('an untouched profile encodes byte-for-byte with the response flag on and off', () => {
  const raw = fromHex(FACTORY_CONFIG_HEX);
  // a profile whose stored table is stale (written by something else) must survive untouched, too
  const stale = Uint8Array.from(raw);
  stale.set([3, 51, 60, 70, 80, 90, 100, 110, 120, 149], 802);
  for (const bytes of [raw, stale]) for (const responseCurve of [false, true]) {
    const out = encodeConfig(decodeConfig(bytes), { responseCurve });
    const changed = [...out.keys()].filter((i) => out[i] !== bytes[i]);
    assert.deepEqual(changed, [], `responseCurve ${responseCurve}`);
  }
});

test('flag off: a stick edit never writes the second curve block', () => {
  const raw = fromHex(FACTORY_CONFIG_HEX);
  const c = decodeConfig(raw);
  c.sticks.left.deadzone = 10;
  c.sticks.right.end = 119;
  c.edge.left = 9; // even if a draft carries an edge change, it is not written with the flag off
  const out = encodeConfig(c);
  assert.deepEqual([...out.keys()].filter((i) => out[i] !== raw[i]), [110, 122]);
});

test('flag on: an edited stick writes both blocks; the other stick and every other byte stay', () => {
  const raw = fromHex(FACTORY_CONFIG_HEX);
  const c = decodeConfig(raw);
  c.sticks.right.deadzone = 10;
  c.sticks.right.type = 3;
  const out = encodeConfig(c, { responseCurve: true });
  const changed = [...out.keys()].filter((i) => out[i] !== raw[i]);
  assert.ok(changed.every((i) => (i >= 116 && i <= 122) || (i >= 802 && i <= 813)), String(changed));
  assert.deepEqual([out[116], out[117], out[802], out[803], out[804]], [3, 10, 3, 50, 54]);
});

test('a macro repeat byte of 0xFF survives a save unless the repeat pause is edited', () => {
  const c = decodeConfig(fromHex(FACTORY_CONFIG_HEX));
  setBinding(c, 19, { kind: 'buttons', buttons: [4, 7], behaviour: 'turbo', turbo: 60 }); // repeating macro, cycle 30 ms
  setBinding(c, 18, { kind: 'buttons', buttons: [5], behaviour: 'toggle', turbo: 5 });
  const raw = encodeConfig(c);
  raw[820] = 0xff; raw[821] = 0xff; // as never set on the controller
  const d = decodeConfig(raw);
  assert.equal(d.macros[0].cycleMs, 30, '0xFF reads as the default 30 ms');
  assert.deepEqual(encodeConfig(d), raw, 'untouched: byte-for-byte');
  d.buttons[4].turboType = 1; d.buttons[4].turbo = 5; d.buttons[4].target = 5; // an unrelated edit
  const out = encodeConfig(d);
  assert.deepEqual([out[820], out[821]], [0xff, 0xff]);
  d.macros[0].cycleMs = 50; // the repeat pause edited
  assert.deepEqual([encodeConfig(d)[820], encodeConfig(d)[821]], [5, 0xff]);
});

test('encodeConfig keeps stick block B as read with the curve flag off, whatever the fields say', () => {
  const c = decodeConfig(fromHex(FACTORY_CONFIG_HEX));
  c.edge.left = 20;
  const raw = fromHex(FACTORY_CONFIG_HEX);
  const out = encodeConfig(c);
  assert.deepEqual([...out.subarray(790, 814)], [...raw.subarray(790, 814)]);
});

test('trigger motors: decoded from the factory bytes, and only the edited byte changes', () => {
  const raw = fromHex(FACTORY_CONFIG_HEX);
  const c = decodeConfig(raw);
  const set = { type: 1, min: 30, max: 80, filter: 5, vibLimit: 1, scale: 50, timeLimit: 0 };
  const micro = { type: 255, min: 40, max: 120, filter: 5, vibLimit: 0, scale: 50, timeLimit: 0 };
  assert.deepEqual(c.triggerMotors.left, { line: set, micro });
  assert.deepEqual(c.triggerMotors.right, { line: set, micro });
  assert.deepEqual(encodeConfig(c), raw);
  c.triggerMotors.right.line.scale = 70;
  const out = encodeConfig(c);
  const changed = [...out.keys()].filter((i) => out[i] !== raw[i]);
  assert.deepEqual(changed, [169 + 5]);
});

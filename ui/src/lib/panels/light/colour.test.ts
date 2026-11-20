import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToLed, ledToHex } from '../../protocol/led.ts';
import { PRESETS, parseHex, snapHex, showHex } from './colour.ts';
import { presetOf } from './colour.ts';

test('the eight presets round-trip hex → controller → hex', () => {
  assert.equal(PRESETS.length, 8);
  for (const p of PRESETS) assert.equal(ledToHex(hexToLed(p.hex)), p.hex, p.id);
  assert.equal(PRESETS[0].hex, '#ffffff');
  assert.deepEqual(hexToLed('#ffffff'), [100, 100, 100]);
  assert.deepEqual(hexToLed('#ff0000'), [100, 0, 0]);
});

test('every controller value round-trips controller → hex → controller', () => {
  for (let v = 0; v <= 100; v++) assert.deepEqual(hexToLed(ledToHex([v, 100 - v, v])), [v, 100 - v, v]);
});

test('snapHex lands on a value the controller holds, and is idempotent', () => {
  for (const h of ['#123456', '#abcdef', '#7f7f7f', '#010203']) {
    const s = snapHex(h);
    assert.equal(snapHex(s), s);
    assert.equal(ledToHex(hexToLed(s)), s);
  }
});

test('parseHex accepts #RRGGBB in any case, with or without #', () => {
  assert.equal(parseHex('#CCFF00'), '#ccff00');
  assert.equal(parseHex(' ccff00 '), '#ccff00');
  for (const bad of ['', '#ccf', '#ccff0', '#ccff000', '#ggffaa', 'red']) assert.equal(parseHex(bad), null, bad);
});

test('showHex is upper case', () => assert.equal(showHex('#ccff00'), '#CCFF00'));

test('presetOf names preset colours and nothing else', () => {
  for (const p of PRESETS) assert.equal(presetOf(p.hex.toUpperCase()), p.id);
  assert.equal(presetOf('#123456'), null);
});

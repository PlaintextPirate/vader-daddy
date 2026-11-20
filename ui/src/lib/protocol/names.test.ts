import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHex } from './bytes.ts';
import { FACTORY_CONFIG_HEX } from './fixtures.ts';
import { readName, writeName, clampName, NAME_OFFSET, NAME_BYTES } from './names.ts';

const factory = () => fromHex(FACTORY_CONFIG_HEX);

test('reads the factory name', () => {
  assert.equal(readName(factory()), '常规游戏配置');
});

test('writing the factory name back reproduces the factory bytes', () => {
  const raw = factory();
  assert.deepEqual(writeName(raw, readName(raw)), raw);
});

test('write touches only bytes 770..785 and returns a new array', () => {
  const raw = factory();
  const out = writeName(raw, 'Shooter');
  assert.notEqual(out, raw);
  assert.equal(readName(raw), '常规游戏配置', 'input untouched');
  const changed = [...out.keys()].filter((i) => out[i] !== raw[i]);
  assert.ok(changed.every((i) => i >= NAME_OFFSET && i < NAME_OFFSET + NAME_BYTES));
  assert.equal(readName(out), 'Shooter');
  assert.deepEqual([...out.slice(NAME_OFFSET, NAME_OFFSET + 4)], [0x53, 0, 0x68, 0]);
  assert.deepEqual([...out.slice(NAME_OFFSET + 14, NAME_OFFSET + 16)], [0, 0], 'zero padded');
});

test('eight code units fill all 16 bytes; longer input is cut', () => {
  const out = writeName(factory(), 'ABCDEFGHIJ');
  assert.equal(readName(out), 'ABCDEFGH');
  assert.equal(out[NAME_OFFSET + 16], factory()[NAME_OFFSET + 16], 'byte after the field untouched');
});

test('clamp never splits a surrogate pair and drops NUL', () => {
  assert.equal(clampName('ABCDEFG😀'), 'ABCDEFG');
  assert.equal(clampName('AB😀'), 'AB😀');
  assert.equal(clampName('A\u0000B'), 'AB');
});

test('empty name zeroes the field', () => {
  const out = writeName(factory(), '');
  assert.equal(readName(out), '');
  assert.deepEqual([...out.slice(NAME_OFFSET, NAME_OFFSET + NAME_BYTES)], Array(16).fill(0));
});

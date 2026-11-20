import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeLed, encodeLed, LED_WRITE_BYTES } from './led.ts';

/** A synthetic lighting slot with unusual header bytes. */
function synthetic(): Uint8Array {
  const b = new Uint8Array(500).fill(0x11);
  b.set([0x00, 0x02, 0x07, 0x02, 0x05, 0xc8, 0x32, 0x00, 0x01], 0); // feedback 7, loop start 2, loop time 200 (out of range), LED count 0
  return b;
}

test('an untouched config encodes to its stored bytes, header included', () => {
  const raw = synthetic();
  assert.deepEqual(encodeLed(decodeLed(raw)), raw.slice(0, LED_WRITE_BYTES));
});

test('a brightness-only edit changes only the brightness byte', () => {
  const raw = synthetic();
  const c = decodeLed(raw);
  c.brightness = 80;
  const out = encodeLed(c);
  const diff = [...out.keys()].filter((i) => out[i] !== raw[i]);
  assert.deepEqual(diff, [6]);
  assert.equal(out[6], 80);
});

test('an edited header field is written; LED count 0 stays 0 unless changed', () => {
  const c = decodeLed(synthetic());
  assert.equal(c.ledCount, 5, 'reads as 5');
  c.feedback = 0;
  const out = encodeLed(c);
  assert.deepEqual([out[2], out[7]], [0, 0]);
});

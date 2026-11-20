import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speedToSlider, sliderToSpeed, speedBand, FACTORY_SPEED, FAST_MAX, MEDIUM_MAX, SLIDER_MIN, SLIDER_MAX } from './speed.ts';

test('slider is reversed: right is faster, ends map to the ends', () => {
  assert.equal(speedToSlider(1), SLIDER_MAX);
  assert.equal(speedToSlider(100), SLIDER_MIN);
  assert.ok(speedToSlider(5) > speedToSlider(50));
  for (let s = 2; s <= 100; s++) assert.ok(speedToSlider(s) < speedToSlider(s - 1), `monotonic at ${s}`);
});

test('every stored value is reachable and round-trips', () => {
  for (let s = 1; s <= 100; s++) assert.equal(sliderToSpeed(speedToSlider(s)), s);
});

test('out-of-range values clamp', () => {
  assert.equal(speedToSlider(0), SLIDER_MAX);
  assert.equal(speedToSlider(255), SLIDER_MIN);
  assert.equal(sliderToSpeed(-5), 100);
  assert.equal(sliderToSpeed(9999), 1);
});

test('Slow, Medium and Fast each take a third of the track', () => {
  const third = (SLIDER_MAX - SLIDER_MIN) / 3;
  for (let p = SLIDER_MIN; p <= SLIDER_MAX; p++) {
    const band = speedBand(sliderToSpeed(p));
    const expected = p < third ? 'slow' : p < 2 * third ? 'medium' : 'fast';
    // Positions right at a boundary may round into either neighbour.
    if (Math.abs(p - third) > 1 && Math.abs(p - 2 * third) > 1) assert.equal(band, expected, `position ${p}`);
  }
});

test('the factory speed reads Medium and sits near the middle of the track', () => {
  assert.equal(speedBand(FACTORY_SPEED), 'medium');
  const at = speedToSlider(FACTORY_SPEED) / SLIDER_MAX;
  assert.ok(at > 0.4 && at < 0.6, `factory at ${Math.round(at * 100)}%`);
});

test('three bands', () => {
  assert.equal(speedBand(1), 'fast');
  assert.equal(speedBand(FAST_MAX), 'fast');
  assert.equal(speedBand(FAST_MAX + 1), 'medium');
  assert.equal(speedBand(MEDIUM_MAX), 'medium');
  assert.equal(speedBand(MEDIUM_MAX + 1), 'slow');
  assert.equal(speedBand(100), 'slow');
});

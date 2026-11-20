import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapMs, niceStep, fitSpan, pxPerMs, msToPx, pxToMs, ticks, zoomIn, zoomOut, lanes, room, dragPress,
  placePress, newPress, hitZone, contentEnd, ZOOM_MAX, MAX_MS, type Press
} from './timeline.ts';

const A = 4, B = 5, RT = 13;
const p = (button: number, startMs: number, holdMs: number): Press => ({ button, startMs, holdMs });

test('snaps to 10 ms', () => {
  assert.equal(snapMs(14), 10);
  assert.equal(snapMs(15), 20);
  assert.equal(snapMs(-4), -0);
});

test('nice steps are 1, 2, 5 × 10ⁿ and at least 10 ms', () => {
  assert.equal(niceStep(3), 10);
  assert.equal(niceStep(11), 20);
  assert.equal(niceStep(50), 50);
  assert.equal(niceStep(51), 100);
  assert.equal(niceStep(130), 200);
  assert.equal(niceStep(700), 1000);
});

test('fit span matches the mock-up (250 ms of presses shows 0–250)', () => {
  assert.equal(fitSpan(250), 250);
  assert.equal(fitSpan(0), 100);
  assert.equal(fitSpan(260), 300);
  assert.equal(fitSpan(1234), 1500);
});

test('ms ↔ px with zoom', () => {
  const k = pxPerMs(816, 250, 1);
  assert.equal(msToPx(250, k), 816);
  assert.equal(pxToMs(msToPx(150, k), k), 150);
  assert.equal(pxPerMs(816, 250, 2), k * 2);
});

test('ticks every 50 ms across 816 px for 250 ms', () => {
  assert.deepEqual(ticks(250, pxPerMs(816, 250, 1)), [0, 50, 100, 150, 200, 250]);
  assert.deepEqual(ticks(250, pxPerMs(816, 250, 4)).slice(0, 3), [0, 10, 20]);
});

test('zoom stays within limits', () => {
  assert.equal(zoomOut(1), 1);
  assert.equal(zoomIn(1), 1.5);
  let z = 1;
  for (let i = 0; i < 20; i++) z = zoomIn(z);
  assert.equal(z, ZOOM_MAX);
});

test('lanes group presses by button in order of first appearance', () => {
  const ps = [p(B, 0, 100), p(RT, 0, 100), p(A, 150, 100), p(B, 200, 50)];
  assert.deepEqual(lanes(ps), [{ button: B, items: [0, 3] }, { button: RT, items: [1] }, { button: A, items: [2] }]);
  assert.equal(contentEnd(ps), 250);
});

test('moving clamps at 0 and snaps', () => {
  const ps = [p(A, 50, 100)];
  assert.equal(dragPress(ps, 0, 'body', -400).startMs, 0);
  assert.equal(dragPress(ps, 0, 'body', 23).startMs, 70);
});

test('resizing keeps at least 10 ms and the other end fixed', () => {
  const ps = [p(A, 100, 100)];
  assert.deepEqual(dragPress(ps, 0, 'end', -500), p(A, 100, 10));
  assert.deepEqual(dragPress(ps, 0, 'start', 500), p(A, 190, 10));
  assert.deepEqual(dragPress(ps, 0, 'start', -40), p(A, 60, 140));
  assert.deepEqual(dragPress(ps, 0, 'start', -400), p(A, 0, 200));
});

test('two presses of one button never overlap while dragging', () => {
  const ps = [p(A, 0, 100), p(A, 200, 100), p(B, 120, 50)];
  assert.deepEqual(room(ps, 1), { lo: 100, hi: 60000 });
  assert.equal(dragPress(ps, 1, 'body', -300).startMs, 100);
  assert.equal(dragPress(ps, 0, 'body', 300).startMs, 100);
  assert.equal(dragPress(ps, 0, 'end', 300).holdMs, 200);
  assert.equal(dragPress(ps, 1, 'start', -300).startMs, 100);
  // Another button is free to overlap.
  assert.equal(dragPress(ps, 2, 'body', -120).startMs, 0);
});

test('typed times are clamped to the room left', () => {
  const ps = [p(A, 0, 100), p(A, 200, 100)];
  assert.deepEqual(placePress(ps, 1, 50, 100), p(A, 100, 100));
  assert.deepEqual(placePress(ps, 0, 0, 500), p(A, 0, 200));
  assert.deepEqual(placePress(ps, 0, -20, 3), p(A, 0, 10));
});

test('new press goes after the last, or at the same time, never on its own button', () => {
  const ps = [p(B, 0, 100)];
  assert.deepEqual(newPress(ps, A, false), p(A, 150, 100));
  assert.deepEqual(newPress(ps, A, true), p(A, 0, 100));
  assert.deepEqual(newPress(ps, B, true), p(B, 100, 100));
  assert.deepEqual(newPress([], A, false), p(A, 0, 100));
});

test('hit-testing: handles at both ends, body between; narrow bars keep a body', () => {
  assert.equal(hitZone(3, 200), 'start');
  assert.equal(hitZone(195, 200), 'end');
  assert.equal(hitZone(100, 200), 'body');
  assert.equal(hitZone(7, 15), 'body');
  assert.equal(hitZone(2, 15), 'start');
});

test('a huge typed start is clamped to the last start that keeps the length', () => {
  const ps = [{ button: 4, startMs: 0, holdMs: 100 }];
  const p = placePress(ps, 0, 999999, 100)!;
  assert.equal(p.holdMs, 100);
  assert.equal(p.startMs, MAX_MS - 100);
});

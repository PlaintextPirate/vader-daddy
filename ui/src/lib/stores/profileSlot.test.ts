import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHex } from '../protocol/bytes.ts';
import { FACTORY_CONFIG_HEX } from '../protocol/fixtures.ts';
import { guardedBytes } from '../protocol/guards.ts';
import { writeName } from '../protocol/names.ts';
import { readSlot, replaceSlot, encodeDraft, settleProfileWrite, slotChanges, differences, REPLACED } from './profileSlot.ts';

const raw = () => fromHex(FACTORY_CONFIG_HEX);
const ALL = [false, true].flatMap((n) => [false, true].map((c) => ({ profileNames: n, responseCurve: c })));
const named = (name: string) => writeName(raw(), name);

test('encodeDraft never changes a guarded byte whose flag is off, whatever the draft says (all four combinations)', () => {
  for (const f of ALL) {
    const s = readSlot(raw(), f);
    s.draft.edge.left = 30; s.draft.sticks.left.type = 3; s.draft.sticks.left.p0y = 100;
    if (f.profileNames) s.draft.name = 'Renamed';
    const out = encodeDraft(s.draft, f);
    for (const i of guardedBytes(f)) assert.equal(out[i], raw()[i], `byte ${i} with ${JSON.stringify(f)}`);
    if (f.profileNames) assert.notDeepEqual([...out.subarray(770, 786)], [...raw().subarray(770, 786)]);
    if (f.responseCurve) assert.notEqual(out[801], raw()[801]);
  }
});

test('copy to a slot: with the flags off, only the allowed ranges differ from the target', () => {
  for (const f of ALL) {
    const target = readSlot(named('Target'), f);
    const src = raw(); src[110] = 9; src[791] = 77; src.set(named('Source').subarray(770, 786), 770);
    const r = replaceSlot(target, src, 'copy', f);
    const out = encodeDraft(r.draft, f);
    assert.equal(out[110], 9);
    assert.equal(out[791], f.responseCurve ? 77 : raw()[791]);
    assert.equal(r.draft.raw[770], f.profileNames ? 0x53 /* S */ : 0x54 /* T */);
    assert.equal(slotChanges(r, [], f)[0].id, REPLACED);
  }
});

test('reset keeps the slot name whatever the flags', () => {
  for (const f of ALL) {
    const target = readSlot(named('Mine'), f);
    const r = replaceSlot(target, raw(), 'reset', f, { keepName: true });
    assert.deepEqual([...r.draft.raw.subarray(770, 786)], [...named('Mine').subarray(770, 786)]);
  }
});

test('replace with identical bytes lists nothing', () => {
  const f = ALL[0], s = readSlot(raw(), f);
  assert.equal(replaceSlot(s, raw(), 'x', f).replaced, undefined);
});

test('a verified write: original and draft are the read-back', () => {
  const f = ALL[0], s = readSlot(raw(), f);
  s.draft.sticks.left.deadzone = 10;
  const written = encodeDraft(s.draft, f), back = Uint8Array.from(written);
  back[225] = 9; // the save version may differ
  const r = settleProfileWrite(s, written, back, f, 'not taken');
  assert.deepEqual(r.bad, []);
  assert.deepEqual(slotChanges(r.state, [], f), []);
  assert.equal(r.state.original.raw[225], 9);
});

test('a mismatch adopts the read-back as the original and keeps the draft, so the list shows what did not land', () => {
  const f = ALL[0], s = readSlot(raw(), f);
  s.draft.sticks.left.deadzone = 10; s.draft.gyro.sensX = 40;
  const written = encodeDraft(s.draft, f);
  const back = Uint8Array.from(written); back[110] = raw()[110]; // the dead zone did not take
  const r = settleProfileWrite(s, written, back, f, 'not taken');
  assert.deepEqual(r.bad, [110]);
  assert.equal(r.state.original.gyro.sensX, 40, 'what the controller holds now');
  assert.deepEqual(slotChanges(r.state, [], f).map((c) => c.id), ['stick.left.deadzone']);
});

test('a mismatch in bytes no field covers keeps Save available with one entry', () => {
  const f = ALL[0], s = readSlot(raw(), f);
  const r0 = replaceSlot(s, (() => { const b = raw(); b[832] = 1; return b; })(), 'import', f);
  const written = encodeDraft(r0.draft, f), back = raw();
  const r = settleProfileWrite({ original: r0.original, draft: r0.draft }, written, back, f, 'not taken');
  assert.deepEqual(r.bad, [832]);
  assert.deepEqual(slotChanges(r.state, [], f).map((c) => c.label), ['not taken']);
});

test('differences ignores what it is told to', () => {
  assert.deepEqual(differences(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 0, 0]), [2]), [1]);
});

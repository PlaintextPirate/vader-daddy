/**
 * Finding 5 / 17: what the change list shows and what bytes change are the same thing, in both states of the
 * response-curve flag. For many edit sequences: the list is empty exactly when the draft encodes to the original's
 * bytes, and undoing every listed change (in either order) gives the original's bytes back.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHex } from '../protocol/bytes.ts';
import { FACTORY_CONFIG_HEX } from '../protocol/fixtures.ts';
import { decodeConfig } from '../protocol/config.ts';
import { setBinding } from '../protocol/bindings.ts';
import { setDeadzonePct, setOuterPct, setPoint, setPreset, copyStick, copyTrigger } from '../panels/analog/edits.ts';
import { describeChanges, type ProfileDraft } from './changes.ts';
import { encodeDraft } from './profileSlot.ts';

type Edit = [string, (d: ProfileDraft, curve: boolean) => void];
const EDITS: Edit[] = [
  ['dead zone', (d, c) => setDeadzonePct(d, 'left', 8, c)],
  ['big dead zone', (d, c) => setDeadzonePct(d, 'right', 45, c)],
  ['outer limit', (d, c) => setOuterPct(d, 'right', 90, c)],
  ['small outer limit', (d, c) => setOuterPct(d, 'left', 55, c)],
  ['preset fast', (d) => setPreset(d, 'left', 'fast')],
  ['preset precise', (d) => setPreset(d, 'right', 'delay')],
  ['point', (d) => setPoint(d, 'right', 'p0', { x: 50, y: 90 })],
  ['mirror stick', (d, c) => copyStick(d, 'left', 'right', c)],
  ['mirror trigger', (d) => copyTrigger(d, 'left', 'right')],
  ['trigger dead zone', (d) => { d.triggers.left.deadzone = 30; }],
  ['circularity', (d) => { d.round.left = !d.round.left; }],
  ['edge only', (d) => { d.edge.left = 12; }],
  ['rumble', (d) => { d.rumble.enabled = !d.rumble.enabled; d.rumble.left.scale = 10; }],
  ['gyro', (d) => { d.gyro.sensX = 40; }],
  ['remap', (d) => setBinding(d, 19, { kind: 'buttons', buttons: [4, 7], behaviour: 'hold', turbo: 5 })],
  ['script', (d) => setBinding(d, 18, { kind: 'script', buttons: [], behaviour: 'hold', turbo: 5, script: { id: 's', name: 'S', mode: 'repeat', cycleMs: 50, actions: [{ button: 5, startMs: 0, holdMs: 100 }] } })]
];

const factory = (): ProfileDraft => decodeConfig(fromHex(FACTORY_CONFIG_HEX));
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

function sequences(): Edit[][] {
  const out: Edit[][] = EDITS.map((e) => [e]);
  for (let i = 0; i < EDITS.length; i++) for (let j = 0; j < EDITS.length; j++) if (i !== j) out.push([EDITS[i], EDITS[j]]);
  // A few longer runs, including a stick edit followed by mirroring.
  out.push([EDITS[0], EDITS[2], EDITS[7]], [EDITS[4], EDITS[1], EDITS[3], EDITS[7], EDITS[8]], [EDITS[6], EDITS[0], EDITS[2], EDITS[10]]);
  return out;
}

for (const curve of [false, true]) {
  const f = { profileNames: false, responseCurve: curve };
  test(`change list ⇔ bytes, response curve ${curve ? 'on' : 'off'}`, () => {
    for (const seq of sequences()) {
      const name = seq.map((e) => e[0]).join(' + ');
      for (const order of ['listed', 'reverse'] as const) {
        const o = factory(), d = structuredClone(o);
        const before = encodeDraft(o, f);
        for (const [, fn] of seq) fn(d, curve);
        const list = describeChanges(o, d, [], { responseCurve: curve });
        assert.equal(list.length === 0, same(encodeDraft(d, f), before), `${name}: empty list ⇔ identical bytes (${list.map((c) => c.id)})`);
        for (const c of order === 'listed' ? list : [...list].reverse()) c.revert(d, o);
        assert.deepEqual(describeChanges(o, d, [], { responseCurve: curve }), [], `${name}: nothing left after undoing all (${order})`);
        assert.ok(same(encodeDraft(d, f), before), `${name}: undoing all gives the original bytes (${order})`);
      }
    }
  });
}

test('with the curve on, a dead-zone or outer-limit edit alone lists only that entry', () => {
  for (const [name, fn] of [EDITS[0], EDITS[2]]) {
    const o = factory(), d = structuredClone(o);
    fn(d, true);
    assert.equal(d.sticks[name === 'dead zone' ? 'left' : 'right'].type, 3, 'the codec sets Custom, as the official app');
    const ids = describeChanges(o, d, [], { responseCurve: true }).map((c) => c.id);
    assert.equal(ids.length, 1, `${name}: ${ids}`);
    assert.ok(!ids[0].endsWith('.response'));
  }
});

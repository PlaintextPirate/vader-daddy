import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHex } from '../protocol/bytes.ts';
import { FACTORY_CONFIG_HEX } from '../protocol/fixtures.ts';
import { guardedBytes } from '../protocol/guards.ts';
import { replaceBytes, sameProfile, toProfileFile, parseProfileFile, compactHex, exportName } from './profileFile.ts';

const factory = () => fromHex(FACTORY_CONFIG_HEX);

const ON = { profileNames: true, responseCurve: true };

test('replace copies every byte, including undecoded regions, but keeps the target save version', () => {
  const src = factory(), dst = factory();
  src[830] = 0x12; src[790] = 0x34; src[225] = 1; src[226] = 2; // tail regions the app does not decode
  dst[225] = 0xd2; dst[226] = 0x07;
  const out = replaceBytes(src, dst, ON);
  assert.equal(out.length, 840);
  assert.equal(out[830], 0x12);
  assert.equal(out[790], 0x34);
  assert.deepEqual([out[225], out[226]], [0xd2, 0x07]);
  for (let i = 0; i < 840; i++) if (i !== 225 && i !== 226) assert.equal(out[i], src[i], `byte ${i}`);
  assert.notEqual(out, src, 'a new array');
});

test('replace keeps the target bytes of every flag-guarded range whose flag is off (all four combinations)', () => {
  const src = factory(), dst = factory();
  for (let i = 0; i < 840; i++) { src[i] = i & 0xff; dst[i] = (i * 7 + 3) & 0xff; }
  for (const names of [false, true]) for (const curve of [false, true]) {
    const f = { profileNames: names, responseCurve: curve };
    const out = replaceBytes(src, dst, f);
    const kept = new Set([225, 226, ...guardedBytes(f)]);
    for (let i = 0; i < 840; i++) assert.equal(out[i], kept.has(i) ? dst[i] : src[i], `byte ${i} with ${JSON.stringify(f)}`);
    // the ranges themselves
    const name = [...out.subarray(770, 786)], blockB = [...out.subarray(790, 800), out[801], ...out.subarray(802, 812), out[813]];
    assert.deepEqual(name, [...(names ? src : dst).subarray(770, 786)]);
    assert.deepEqual(blockB, [...(curve ? src : dst).subarray(790, 800), (curve ? src : dst)[801], ...(curve ? src : dst).subarray(802, 812), (curve ? src : dst)[813]]);
    assert.deepEqual([out[800], out[812]], [src[800], src[812]], 'circularity is verified: always copied');
  }
});

test('replace with keepName keeps the target name whatever the flags (reset to defaults)', () => {
  const src = factory(), dst = factory();
  dst.fill(0, 770, 786); dst[770] = 0x41;
  for (const names of [false, true]) {
    const out = replaceBytes(src, dst, { profileNames: names, responseCurve: true }, { keepName: true });
    assert.deepEqual([...out.subarray(770, 786)], [...dst.subarray(770, 786)]);
  }
});

test('same profile ignores only the save version', () => {
  const a = factory(), b = factory();
  b[225] = 9;
  assert.ok(sameProfile(a, b));
  b[500] ^= 1;
  assert.ok(!sameProfile(a, b));
});

test('export then import round-trips the bytes and the name', () => {
  const bytes = factory();
  bytes[831] = 0xab;
  const file = toProfileFile(bytes, 'Shooter');
  assert.equal(file.app, 'VaderDaddy');
  assert.equal(file.kind, 'profile');
  assert.equal(file.version, 1);
  const r = parseProfileFile(JSON.stringify(file));
  assert.ok(r.ok);
  if (r.ok) { assert.deepEqual(r.bytes, bytes); assert.equal(r.name, 'Shooter'); }
});

test('import refuses bad files with a reason', () => {
  const good = compactHex(factory());
  const reason = (t: string) => { const r = parseProfileFile(t); return r.ok ? 'ok' : r.reason; };
  assert.equal(reason('not json'), 'json');
  assert.equal(reason('[]'), 'kind');
  assert.equal(reason(JSON.stringify({ kind: 'backup', config: good })), 'kind');
  assert.equal(reason(JSON.stringify({ kind: 'profile', config: good.slice(0, -2) + 'zz' })), 'hex');
  assert.equal(reason(JSON.stringify({ kind: 'profile', config: good + 'ff' })), 'length');
  assert.equal(reason(JSON.stringify({ kind: 'profile', config: good.replace(/(..)/g, '$1 ') })), 'ok');
  assert.equal(reason(JSON.stringify({ kind: 'profile', config: '02' + good.slice(2) })), 'header', 'not 01 03 54');
  assert.equal(reason(JSON.stringify({ kind: 'profile', config: good.replace(/(..)/g, '$1 ').replace('01 03', '1 003') })), 'hex', 'odd tokens');
});

test('export file names are tidy', () => {
  assert.equal(exportName('Shooter / FPS'), 'vader4pro-Shooter-FPS.json');
  assert.equal(exportName('常规'), 'vader4pro-常规.json');
  assert.equal(exportName('///'), 'vader4pro-profile.json');
});

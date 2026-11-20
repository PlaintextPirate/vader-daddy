#!/usr/bin/env node
// Smoke test for the redesigned UI, demo mode only (never talks to the controller or the real service).
//   npm run smoke                      vite preview on a free port against the existing ui/build (run `npm run build` first)
//   npm run smoke -- --url http://127.0.0.1:5173    use a running server instead (dev or preview)
// Drives headless Chrome over the DevTools protocol, fails on any console error or uncaught exception, prints a
// pass/fail table and writes a screenshot of every failed step to a temp dir. Exit code 1 on any failure.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPreview, startChrome, connect, sleep } from './lib/cdp.mjs';

const args = process.argv.slice(2);
const argUrl = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;
if (argUrl && /:47815\b/.test(argUrl)) { console.error('Refusing to run against port 47815 (the real service).'); process.exit(2); }

const verbose = args.includes('--verbose');
const CTL = '[aria-label="Controller"]';
const ASIDE = 'aside.inspector';
// Requests the static build has no answer for and the Mac app never makes; not a page error.
const IGNORED = [/favicon\.ico/];

let d, preview, chrome, shots;
const results = [];
const t0 = Date.now();

// ---------- helpers ----------
const click = (name, role = 'button', scope) => d.click(name, role, { scope });
const press = (key) => d.press(key);
const text = () => d.text();
const waitFor = (fn, what, timeout = 5000) => d.waitFor(fn, { what, timeout });
const evalJs = (fn) => d.eval(fn);
function assert(cond, msg) { if (!cond) throw new Error(msg); }

/** A controller part by name: parts say what they are mapped to after a comma ("M1, not set"). */
const part = (n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(,|$)`);
/** Heading of the open inspector panel, or null. */
const panelTitle = () => evalJs(() => document.querySelector('aside.inspector h2')?.textContent?.trim() ?? null);
const hash = () => evalJs(() => location.hash);
const expectPanel = (title) => waitFor(async () => (await panelTitle()) === title, `panel "${title}"`);
const expectNoPanel = () => waitFor(async () => (await panelTitle()) === null, 'panel to close');
/** The save bar's count text when shown, '' when hidden. */
const saveBar = () => evalJs(() => {
  const r = document.querySelector('[role=region][aria-label="Unsaved changes"]');
  return r && r.getAttribute('aria-hidden') !== 'true' ? r.querySelector('button.count').textContent.trim() : '';
});
const expectCount = (n) => waitFor(async () => (await saveBar()) === (n === 0 ? '' : n === 1 ? '1 unsaved change' : `${n} unsaved changes`),
  `save bar to say ${n} change(s)`);
/** Lines of the change list popover (opens it, reads it, closes it). */
async function changeList() {
  await click(/unsaved change/);
  const t = await waitFor(() => evalJs(() => document.querySelector('[role=dialog][aria-label="Unsaved changes"]')?.innerText), 'change list');
  await press('Escape');
  await waitFor(async () => !(await d.has('Unsaved changes', 'dialog')), 'change list to close');
  return t;
}
const toast = (s) => waitFor(async () => (await evalJs(() => [...document.querySelectorAll('[role=status],[role=alert]')].map((e) => e.textContent).join('\n'))).includes(s), `toast "${s}"`);
/** Nudges a slider in the open panel one step with the keyboard. */
async function nudge(slider) { await d.focus(slider, 'slider', ASIDE); await press('ArrowRight'); }

async function open() {
  await d.goto(`${base}/?demo`);
  await d.get(part('M1'), 'button', CTL, 10000);
}

/** Runs one named check. `fresh` reloads the page first, so one failure does not cascade into the next step. */
async function step(name, fn, { fresh = false } = {}) {
  const s = Date.now();
  const before = d.errors.length;
  try {
    if (fresh) await open();
    let timer;
    await Promise.race([fn(), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('step timed out after 30 s')), 30000); })])
      .finally(() => clearTimeout(timer));
    const errs = d.errors.slice(before).filter((e) => !IGNORED.some((r) => r.test(e)));
    if (errs.length) throw new Error(`page error: ${errs.join(' | ')}`);
    results.push({ name, ok: true, ms: Date.now() - s });
    if (verbose) console.error(`  ok   ${name}`);
  } catch (e) {
    let shot = '';
    try { shots ??= mkdtempSync(join(tmpdir(), 'vader-smoke-')); shot = join(shots, `${results.length + 1}.png`); writeFileSync(shot, await d.screenshot()); } catch {}
    results.push({ name, ok: false, ms: Date.now() - s, err: e.message.split('\n')[0], shot });
    if (verbose) console.error(`  FAIL ${name}: ${e.message}`);
  }
}

// ---------- run ----------
let base = argUrl;
async function cleanup() { try { d?.close(); } catch {} await chrome?.stop(); preview?.stop(); }
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => cleanup().finally(() => process.exit(130)));
try {
  if (!base) { preview = await startPreview(); base = preview.url; }
  chrome = await startChrome();
  d = await connect(chrome.port);
  // Leaving with unsaved edits asks first (beforeunload): the smoke test always leaves.
  d.on((m) => { if (m.method === 'Page.javascriptDialogOpening') d.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); });
  await d.viewport(1440, 900);

  await step('load: controller visible in demo', async () => {
    await open();
    const parts = await d.find(/.+/, 'button', CTL);
    assert(parts.length === 22, `expected 22 controller parts, found ${parts.length}`);
    assert(await d.has('Profile 1', 'button') || (await d.find(/^Profile 1/, 'button')).length, 'profile switcher missing');
    assert(!(await text()).includes('No controller'), 'says "No controller"');
  });

  const PANELS = [['M1', 'M1', '#m1'], ['Left stick', 'Left stick', '#ls'], ['Left trigger', 'Left trigger', '#lt'],
    ['Gyro', 'Gyro', '#gyro'], ['Vibration', 'Vibration', '#vibration'], ['Light bar', 'Light bar', '#light']];
  await step('open each inspector by click', async () => {
    for (const [btn, title, h] of PANELS) {
      await click(['Gyro', 'Vibration'].includes(btn) ? btn : part(btn), 'button', ['Gyro', 'Vibration'].includes(btn) ? undefined : CTL);
      await expectPanel(title);
      assert((await hash()) === h, `hash for ${title} is ${await hash()}`);
    }
    await click('Done', 'button', ASIDE);
    await expectNoPanel();
  });

  await step('open each inspector by keyboard (Enter/Space), Esc closes', async () => {
    for (const [btn, title] of PANELS) {
      await d.focus(['Gyro', 'Vibration'].includes(btn) ? btn : part(btn), 'button', ['Gyro', 'Vibration'].includes(btn) ? undefined : CTL);
      await press(btn === 'Gyro' ? ' ' : 'Enter');
      await expectPanel(title);
      await press('Escape');
      await expectNoPanel();
    }
  });

  await step('one edit in each panel: count and change list', async () => {
    await click(part('M1'), 'button', CTL); await expectPanel('M1');
    await click('B', 'button', ASIDE); await expectCount(1);
    await click(part('Left trigger'), 'button', CTL); await expectPanel('Left trigger');
    await nudge('Dead zone'); // mirrored to the right trigger: two changes
    await expectCount(3);
    await click(part('Left stick'), 'button', CTL); await expectPanel('Left stick');
    await click('Same for the right stick', 'switch', ASIDE); // off: only the left stick changes
    await nudge('Dead zone'); // one entry: the Custom curve type a dead-zone edit implies is folded into it
    await expectCount(4);
    await click('Gyro'); await expectPanel('Gyro'); await nudge('Left-right speed'); await expectCount(5);
    await click('Vibration'); await expectPanel('Vibration'); await nudge('Left strength'); await expectCount(6);
    await click(part('Light bar'), 'button', CTL); await expectPanel('Light bar'); await nudge('Brightness'); await expectCount(7);
    const list = await changeList();
    for (const s of ['M1', 'Not set → B', 'Left stick dead zone', 'Left trigger dead zone', 'Right trigger dead zone',
      'Gyro left-right speed', '25 → 26', 'Vibration left strength', 'Light bar brightness', '50% → 51%'])
      assert(list.includes(s), `change list lacks "${s}":\n${list}`);
    assert(!list.includes('Right stick dead zone'), 'right stick changed although mirroring was switched off');
  });

  await step('undo one change from the list', async () => {
    await click(/unsaved change/);
    await click('Undo Vibration left strength');
    await expectCount(6);
    const list = await evalJs(() => document.querySelector('[role=dialog][aria-label="Unsaved changes"]')?.innerText ?? '');
    assert(!list.includes('Vibration left strength'), 'undone change still listed');
    await press('Escape');
  });

  await step('Discard resets everything', async () => {
    await click('Discard');
    await expectCount(0);
    await toast('Changes discarded');
    const caption = await evalJs(() => document.body.innerText.includes('Not set'));
    assert(caption, 'M1 caption not back to "Not set"');
  });

  await step('edit again and Save (demo): toast, count gone', async () => {
    await click(part('M1'), 'button', CTL); await expectPanel('M1');
    await click('B', 'button', ASIDE); await expectCount(1);
    await click('Save');
    await toast('Saved to the controller');
    await expectCount(0);
    assert(await d.has('B', 'button', ASIDE), 'panel lost');
  });

  let scriptName = 'Smoke combo';
  await step('create a script, add a press, rename, close', async () => {
    await click(part('M1'), 'button', CTL); await expectPanel('M1');
    await click('New script', 'button', ASIDE);
    await d.get(/^Script \d+$/, 'button', '[role=dialog][aria-modal=true]');
    const bars = async () => (await d.find(/^[A-Z0-9 -]+, \d+ to \d+ ms$/i)).length;
    const n = await bars();
    await click('Add a press', 'button', '[role=dialog][aria-modal=true]');
    await click('B', 'button', '[role=dialog][aria-label="Pick a button"]');
    await waitFor(async () => (await bars()) === n + 1, 'one more press on the timeline');
    assert((await d.find(/^B, \d+ to \d+ ms$/)).length === 1, 'the new press is not B');
    await click(/^Script \d+$/, 'button', '[role=dialog][aria-modal=true]');
    await d.focus('Script name', 'textbox');
    await press('Meta+a'); await d.type(scriptName); await press('Enter');
    await d.get(scriptName, 'button', '[role=dialog][aria-modal=true]');
    await click('Done', 'button', '[role=dialog][aria-modal=true]');
    await waitFor(async () => !(await d.has(scriptName, 'dialog')), 'sheet to close');
    await expectPanel('M1');
  }, { fresh: true });

  await step('assign the script to M2: paddle caption', async () => {
    await click(part('M2'), 'button', CTL); await expectPanel('M2');
    await click(scriptName, 'button', ASIDE);
    // Paddle captions are HTML under the drawing: the script's name shows under M1 and M2.
    const captions = () => evalJs(() => document.querySelector('.stage')?.innerText ?? '');
    await waitFor(async () => (await captions()).split(scriptName).length - 1 >= 2, `"${scriptName}" under M1 and M2`);
    await click('Discard'); await expectCount(0);
    await press('Escape'); await expectNoPanel();
  });

  await step('⌘K search finds "Left stick" and opens it', async () => {
    await press('Meta+k');
    await d.get('Search settings and buttons', 'combobox');
    await d.type('Left stick');
    await d.get(/^Left stick/, 'option');
    await press('Enter');
    await expectPanel('Left stick');
    assert(!(await d.has('Search', 'dialog')), 'palette still open');
    await press('Escape'); await expectNoPanel();
  }, { fresh: true });

  await step('profile menu: copy to profile 3', async () => {
    // Demo profiles 1 and 3 start identical, so change profile 1 first or the copy would change nothing.
    await click(part('M1'), 'button', CTL); await expectPanel('M1');
    await click('Y', 'button', ASIDE); await expectCount(1);
    await press('Escape'); await expectNoPanel();
    await click(/^Profile 1.*Profile options$/);
    await click('Copy to profile 3');
    await toast('Copied to profile 3. Save to keep it.');
    await press('Escape');
  }, { fresh: true });

  await step('switch profile with unsaved changes: confirm, Discard', async () => {
    await expectCount(1); // M1 → Y from the step before
    await click('Profile 2');
    await d.get('Profile 1 has unsaved changes.', 'dialog');
    await click('Discard', 'button', '[role=dialog][aria-label="Profile 1 has unsaved changes."]');
    await d.get(/^Profile 2.*Profile options$/, 'button');
    await expectCount(0);
    await click('Profile 3');
    await d.get(/^Profile 3.*Profile options$/, 'button');
    await expectCount(1); // the copy from profile 1, unsaved
    assert((await changeList()).includes('Profile replaced by a copy of profile 1'), 'copy not listed on profile 3');
    await click('Discard'); await expectCount(0);
    await press('Escape');
  });

  await step('History: back up now, backup listed', async () => {
    await click('History');
    await d.get('Back up now');
    await click('Back up now');
    await toast('Backed up all profiles');
    await waitFor(async () => (await text()).includes('Backed up by hand'), 'backup in the list');
  }, { fresh: true });

  await step('Settings shows controller options', async () => {
    await click('Settings');
    for (const s of ['Polling rate', 'Stick resolution', 'Switch off after', 'Diagnostics', 'Firmware'])
      await waitFor(async () => (await text()).includes(s), `"${s}"`);
  });

  await step('Esc closes things in the right order', async () => {
    await press('Escape');
    await waitFor(async () => (await d.has(part('M1'), 'button', CTL)), 'main view after Esc');
    await click(part('M1'), 'button', CTL); await expectPanel('M1');
    // palette over panel: Esc closes the palette only
    await press('Meta+k'); await d.get('Search settings and buttons', 'combobox');
    await press('Escape');
    await waitFor(async () => !(await d.has('Search', 'dialog')), 'palette closed first');
    assert((await panelTitle()) === 'M1', 'panel closed together with the palette');
    // profile menu over panel: Esc closes the menu only
    await click(/^Profile 1.*Profile options$/);
    await d.get('Profile options', 'dialog');
    await press('Escape');
    await waitFor(async () => !(await d.has('Profile options', 'dialog')), 'profile menu closed');
    assert((await panelTitle()) === 'M1', 'panel closed together with the menu');
    // script sheet over panel: Esc closes the sheet only
    await click('New script', 'button', ASIDE);
    await d.get('Done', 'button', '[role=dialog][aria-modal=true]');
    await press('Escape');
    await waitFor(async () => !(await d.has(/^Script \d+$/, 'dialog')), 'sheet closed');
    assert((await panelTitle()) === 'M1', 'panel closed together with the sheet');
    await press('Escape'); await expectNoPanel();
    assert((await hash()) === '', 'hash not cleared');
  }, { fresh: true });

  await step('940×600 with a panel open: Save is fully visible and clickable', async () => {
    await d.viewport(940, 600);
    await open();
    await click(part('M3'), 'button', CTL); await expectPanel('M3');
    await click('B', 'button', ASIDE); await expectCount(1);
    await click(/^Save/);
    await toast('Saved to the controller');
    await expectCount(0);
    const f = await evalJs(() => document.activeElement === document.body);
    assert(!f, 'focus fell to <body> after Save');
  });

  await step('Save stays clickable while an error toast shows', async () => {
    await d.viewport(1440, 900);
    await d.goto(`${base}/?demo&debug`); // ?debug exposes window.__vader in a production build
    await d.get(part('M1'), 'button', CTL, 10000);
    await click(part('M1'), 'button', CTL); await expectPanel('M1');
    await click('X', 'button', ASIDE); await expectCount(1);
    await evalJs(() => window.__vader.toasts.error('Smoke test error'));
    await sleep(400);
    await click(/^Save/); // throws when the toast covers it
    await toast('Saved to the controller');
    await evalJs(() => window.__vader.toasts.items.forEach((t) => window.__vader.toasts.dismiss(t.id)));
  });

  await step('Esc closes the palette before the profile menu under it', async () => {
    await open();
    await click(/^Profile 1.*Profile options$/);
    await d.get('Profile options', 'dialog');
    await press('Meta+k'); await d.get('Search settings and buttons', 'combobox');
    await press('Escape');
    await waitFor(async () => !(await d.has('Search', 'dialog')), 'palette closed');
    assert(await d.has('Profile options', 'dialog'), 'the menu closed together with the palette');
    await press('Escape');
    await waitFor(async () => !(await d.has('Profile options', 'dialog')), 'menu closed');
  });

  await step('an unknown hash loads without errors; #home opens nothing', async () => {
    await d.goto(`${base}/?demo#bogus`);
    await d.get(part('M1'), 'button', CTL, 10000);
    assert((await panelTitle()) === null, 'a panel opened for #bogus');
    await d.goto('about:blank');
    await d.goto(`${base}/?demo&debug#home`);
    await d.get(part('M1'), 'button', CTL, 10000);
    assert((await evalJs(() => window.__vader.session.selection)) === null, '#home left a selection');
  });

  await step('/classic?demo loads', async () => {
    await d.goto(`${base}/classic?demo`);
    await waitFor(async () => (await text()).includes('Vader 4 Pro'), 'classic UI showing the demo controller', 8000);
    assert(await d.has('Try the new look', 'link') || (await text()).includes('Try the new look'), 'no way back to the new UI');
  });
} catch (e) {
  results.push({ name: 'harness', ok: false, ms: 0, err: e.message });
} finally {
  await cleanup();
}

// ---------- report ----------
const w = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(w)}  ${String(r.ms).padStart(5)} ms${r.ok ? '' : `\n      ${r.err}${r.shot ? `\n      screenshot: ${r.shot}` : ''}`}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed in ${((Date.now() - t0) / 1000).toFixed(1)} s against ${base ?? '(no server)'}`);
process.exit(failed ? 1 : 0);

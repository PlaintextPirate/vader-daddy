// Tiny, dependency-free Chrome DevTools Protocol driver for the smoke test and exploratory runs (Node 22:
// global fetch and WebSocket). Starts `vite preview` and headless Chrome on free ports, finds things by their
// accessible name through the browser's own accessibility tree, and clicks/types with real input events.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FORBIDDEN_PORT = 47815; // the real VaderDaddy service: never touch it

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => (port === FORBIDDEN_PORT ? freePort().then(resolve, reject) : resolve(port)));
    });
  });
}

async function until(fn, ms, what) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v; } catch (e) { last = e; }
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}${last ? `: ${last.message}` : ''}`);
}

/** `vite preview` against the existing ui/build. Returns { url, stop }. */
export async function startPreview() {
  const port = await freePort();
  const proc = spawn(process.execPath, [join(UI_DIR, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: UI_DIR, stdio: 'ignore', detached: false });
  const url = `http://127.0.0.1:${port}`;
  await until(() => fetch(url).then((r) => r.ok), 15000, 'vite preview');
  return { url, stop: () => { try { proc.kill('SIGTERM'); } catch {} } };
}

/** Headless Chrome with a throwaway profile. Returns { port, stop }. */
export async function startChrome({ width = 1440, height = 900 } = {}) {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'vader-smoke-chrome-'));
  const proc = spawn(CHROME, [`--headless=new`, `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', `--window-size=${width},${height}`, 'about:blank'],
    { stdio: 'ignore' });
  await until(() => fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.ok), 15000, 'Chrome');
  return {
    port,
    stop: async () => {
      try { proc.kill('SIGTERM'); } catch {}
      await Promise.race([new Promise((r) => proc.once('exit', r)), sleep(3000)]);
      try { proc.kill('SIGKILL'); } catch {}
      try { rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  };
}

const KEYS = {
  Escape: [27, 'Escape'], Enter: [13, 'Enter'], Tab: [9, 'Tab'], ' ': [32, 'Space'], Backspace: [8, 'Backspace'],
  ArrowUp: [38, 'ArrowUp'], ArrowDown: [40, 'ArrowDown'], ArrowLeft: [37, 'ArrowLeft'], ArrowRight: [39, 'ArrowRight'],
  Home: [36, 'Home'], End: [35, 'End'], Delete: [46, 'Delete']
};
const MODS = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };

/** Connects to the first page of a running Chrome. Returns the page driver. */
export async function connect(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP socket failed')); });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  const errors = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(`${msg.error.message} ${msg.error.data ?? ''}`)) : res(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  listeners.add(({ method, params }) => {
    if (method === 'Runtime.consoleAPICalled' && (params.type === 'error' || params.type === 'assert'))
      errors.push(`console.${params.type}: ${params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    else if (method === 'Runtime.exceptionThrown')
      errors.push(`exception: ${params.exceptionDetails.exception?.description ?? params.exceptionDetails.text}`);
    else if (method === 'Log.entryAdded' && params.entry.level === 'error')
      errors.push(`log: ${params.entry.text} ${params.entry.url ?? ''}`.trim());
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('DOM.enable');
  await send('Accessibility.enable');

  const d = {
    send, errors,
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    close: () => ws.close(),

    /** Evaluates an expression (or `() => …` source) in the page and returns its JSON value. */
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: typeof expr === 'function' ? `(${expr})()` : expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result.value;
    },

    async goto(url) {
      const loaded = new Promise((r) => { const off = d.on((m) => { if (m.method === 'Page.loadEventFired') { off(); r(); } }); });
      await send('Page.navigate', { url });
      await Promise.race([loaded, sleep(10000)]);
    },
    reload: async () => {
      const loaded = new Promise((r) => { const off = d.on((m) => { if (m.method === 'Page.loadEventFired') { off(); r(); } }); });
      await send('Page.reload');
      await Promise.race([loaded, sleep(10000)]);
    },
    viewport: (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }),
    reducedMotion: (on) => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: on ? 'reduce' : 'no-preference' }] }),
    text: () => d.eval('document.body.innerText'),

    /** Polls a Node-side function (which may call d.eval) until it returns something truthy. */
    waitFor: (fn, { timeout = 5000, what = 'condition' } = {}) => until(fn, timeout, what),
    waitText: (s, timeout = 5000) => until(async () => (await d.text()).includes(s), timeout, `text "${s}"`),
    waitNoText: (s, timeout = 5000) => until(async () => !(await d.text()).includes(s), timeout, `text "${s}" to go`),

    /** Accessible nodes whose name matches (string = exact, RegExp = test), optionally of a role, visible only. */
    async find(name, role, scope) {
      const { root } = await send('DOM.getDocument', { depth: 0 });
      let nodeId = root.nodeId;
      if (scope) { nodeId = (await send('DOM.querySelector', { nodeId, selector: scope })).nodeId; if (!nodeId) return []; }
      const q = { nodeId };
      if (typeof name === 'string') q.accessibleName = name;
      if (role) q.role = role;
      const { nodes } = await send('Accessibility.queryAXTree', q);
      const out = [];
      for (const n of nodes) {
        if (n.ignored || !n.backendDOMNodeId) continue;
        if (name instanceof RegExp && !name.test(n.name?.value ?? '')) continue;
        try {
          const { model } = await send('DOM.getBoxModel', { backendNodeId: n.backendDOMNodeId });
          if (model.width < 1 || model.height < 1) continue;
          out.push({ id: n.backendDOMNodeId, role: n.role?.value, name: n.name?.value, model });
        } catch { /* not rendered */ }
      }
      return out;
    },
    async get(name, role, scope, timeout = 4000) {
      return until(async () => (await d.find(name, role, scope))[0], timeout, `${role ?? 'element'} "${name}"${scope ? ` in ${scope}` : ''}`);
    },
    has: async (name, role, scope) => (await d.find(name, role, scope)).length > 0,

    /** Clicks the centre of the first visible element with that accessible name (and role, inside scope). */
    async click(name, role, { count = 1, scope } = {}) {
      const el = typeof name === 'object' && name.id ? name : await d.get(name, role, scope);
      await send('DOM.scrollIntoViewIfNeeded', { backendNodeId: el.id }).catch(() => {});
      const { object } = await send('DOM.resolveNode', { backendNodeId: el.id });
      // The first point (centre first, then a grid) where the element itself is on top: catches covered elements.
      const { result } = await send('Runtime.callFunctionOn', { objectId: object.objectId, returnByValue: true, functionDeclaration: `function () {
        const r = this.getBoundingClientRect();
        const pts = [[0.5, 0.5]];
        for (let i = 1; i < 8; i++) for (let j = 1; j < 8; j++) pts.push([i / 8, j / 8]);
        for (const [fx, fy] of pts) {
          const x = r.left + r.width * fx, y = r.top + r.height * fy;
          const h = document.elementFromPoint(x, y);
          if (h && (h === this || this.contains(h))) return { x, y };
        }
        const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { covered: h ? h.tagName.toLowerCase() + '.' + String(h.className?.baseVal ?? h.className) : 'nothing' };
      }` });
      const p = result.value;
      if (p.covered) throw new Error(`"${el.name}" is covered by ${p.covered}`);
      return d.clickAt(p.x, p.y, count);
    },
    async clickAt(x, y, count = 1) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      for (let i = 1; i <= count; i++) {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: i });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: i });
      }
      await sleep(60);
    },
    async focus(name, role, scope) {
      const el = await d.get(name, role, scope);
      await send('DOM.focus', { backendNodeId: el.id });
    },

    /** Presses a key: 'Escape', 'Enter', 'Tab', 'a', with modifiers like 'Meta+k', 'Shift+Tab'. */
    async press(combo) {
      const parts = combo.split('+');
      const key = parts.pop() || '+';
      const modifiers = parts.reduce((m, p) => m | (MODS[p] ?? 0), 0);
      const [code, codeName] = KEYS[key] ?? [key.toUpperCase().charCodeAt(0), /\d/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`];
      const text = !modifiers || modifiers === MODS.Shift ? (key.length === 1 ? key : key === 'Enter' ? '\r' : undefined) : undefined;
      // No nativeVirtualKeyCode: on macOS Chrome reads it as a Mac key code and runs its own shortcuts (⌘K became
      // a menu command that opened a new foreground tab and stalled the page).
      const base = { key, code: codeName, windowsVirtualKeyCode: code, modifiers };
      await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, text, unmodifiedText: text });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(60);
    },
    type: async (s) => { await send('Input.insertText', { text: s }); await sleep(60); },
    focused: () => d.eval(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()} ${a.getAttribute('aria-label') ?? a.textContent?.trim().slice(0, 40) ?? ''}` : ''; }),

    async screenshot() {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      return Buffer.from(data, 'base64');
    }
  };
  return d;
}

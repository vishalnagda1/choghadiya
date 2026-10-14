// scripts/smoke.mjs — DO-02 (t_e96f9d7a) headless-Chromium smoke test.
//
// Contract: docs/05-plan.md §DO-02, docs/07-test-plan.md §L3,
//           docs/adr/008-testing-tooling.md §2, docs/04-architecture.md §5.3/§7.
//
// What it proves, in one run, against the SHIPPED files (no build step):
//   1. the static server serves index.html/style.css/app.js/favicon.svg with 200;
//   2. 16 slot rows (8 day + 8 night) render from the deterministic Mumbai fixture
//      — the day/night NAME sequences equal docs/03-ux.md §8 exactly;
//   3. the EN toggle flips <html lang> and re-translates every [data-i18n] node
//      via the real i18n.js dictionary (imported here, not re-typed);
//   4. no horizontal scroll at 320/390/430/1024 CSS px (CDP
//      Emulation.setDeviceMetricsOverride);
//   5. zero `NaN` / `Invalid Date` in the rendered DOM (US-9 AC2);
//   6. no console error / uncaught exception; favicon.svg loads 200;
//   7. cache-busting: every `?v=` in index.html/app.js equals the package.json
//      version (ASSET_VERSION, US-19 AC3 / research R7);
//   8. perf budget: total shipped JS (transitive import graph from index.html)
//      < 60 KB min+gzip (NFR-P3) — see the PERF BUDGET line.
//   9. the v2.3.0 surfaces (DO-1, t_ed1c4b8c): the manual geolocation button, the S8
//      inauspicious-periods block (Mumbai fixture values), the S9 detail panel
//      (default = live slot / tap-select / same-tap revert / reload revert), the ±10-day
//      calendar picker, the 12h↔24h toggle re-render, and settings persistence across a
//      reload (sessionStorage, item 7a). Slot ranges are asserted in the ACTIVE cycle:
//      the 12-hour form by default, the 24-hour form after the toggle.
//
// Determinism (the "Mumbai fixture, no network" decision on the card):
//   - Chrome runs with Emulation.setTimezoneOverride('Asia/Kolkata') and a
//     CDP geolocation override pinned to the fixture coords (docs/03-ux.md §8);
//   - the clock is pinned to 2026-10-14T03:00:00Z (08:30 IST) by an init script,
//     so "today" is always the fixture date and the current-slot highlight is
//     reproducible (the page's own `resolveCurrentSlot(…, now)` path is unchanged);
//   - nothing in this script or the page performs a network request.
//
// Exit codes are CI-honest: 0 = all checks pass, 1 = a check failed,
// 2 = the harness could not start (no Chrome/Node WebSocket). `make check`
// depends on those codes (the M7 gate).
//
// Run: node scripts/smoke.mjs   (or: make check)

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { DICT, t } from '../i18n.js';
import { MUMBAI, MUMBAI_DATE, MUMBAI_EXPECTED } from '../tests/fixtures.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/** 03-ux §8 fixture instant: 08:30 IST on the fixture date (inside the Labh day slot). */
const FIXTURE_NOW_MS = Date.parse(`${MUMBAI_DATE}T03:00:00Z`);
const VIEWPORT_WIDTHS = [320, 390, 430, 1024];

/* ------------------------------------------------------------------ */
/* Static server (repo root, exactly what GitHub Pages serves)         */
/* ------------------------------------------------------------------ */

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
});

function startStaticServer(root) {
  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const abs = path.resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    fs.readFile(abs, (err, buf) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

/* ------------------------------------------------------------------ */
/* Chrome discovery + launch                                           */
/* ------------------------------------------------------------------ */

function isExecutable(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function walkForChrome(dir, depth, out) {
  if (depth <= 0) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkForChrome(p, depth - 1, out);
    } else if (
      e.isFile()
      && /^(chrome|chrome-headless-shell|Google Chrome for Testing|google-chrome)$/.test(e.name)
    ) {
      out.push(p);
    }
  }
}

/**
 * A binary is only a candidate once it actually runs. A half-extracted
 * puppeteer cache (e.g. a `.app` whose Framework never unzipped) passes the
 * `--version`-less "is it executable" test but aborts on launch, which would
 * turn a working system Chrome into an unusable harness. Probe `--version`.
 */
function chromeRuns(bin) {
  try {
    const res = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 15000 });
    return res.status === 0 && /Chrome|Chromium/i.test(`${res.stdout || ''}${res.stderr || ''}`);
  } catch {
    return false;
  }
}

/** Resolve a Chromium binary: CHROME_PATH, the puppeteer cache, the OS default, then PATH. */
export function findChrome() {
  const candidates = [];
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);

  const puppeteerCache = path.join(os.homedir(), '.cache', 'puppeteer');
  const cached = [];
  walkForChrome(puppeteerCache, 7, cached);
  // Prefer full Chrome over headless-shell: --headless=new + the tab icon path exercise
  // the real shipping binary.
  candidates.push(
    ...cached.filter((p) => !p.includes('chrome-headless-shell')),
    ...cached.filter((p) => p.includes('chrome-headless-shell')),
  );

  if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    );
  }
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']) {
    for (const d of pathDirs) candidates.push(path.join(d, name));
  }

  for (const c of candidates) if (isExecutable(c) && chromeRuns(c)) return c;
  return null;
}

function readDevToolsPort(userDataDir, timeoutMs) {
  const portFile = path.join(userDataDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        const [port] = fs.readFileSync(portFile, 'utf8').split('\n');
        if (port && Number(port) > 0) {
          resolve(Number(port));
          return;
        }
      } catch {
        /* not written yet */
      }
      if (Date.now() > deadline) {
        reject(new Error('Chrome did not expose a DevTools port in time'));
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}

/* ------------------------------------------------------------------ */
/* Minimal CDP client (Node's built-in WebSocket — zero driver deps)   */
/* ------------------------------------------------------------------ */

async function connectWebSocket(url) {
  if (typeof WebSocket !== 'function') {
    throw new Error('global WebSocket is unavailable — Node >= 22 is required');
  }
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', () => reject(new Error(`could not open CDP websocket at ${url}`)), {
      once: true,
    });
  });
}

export class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
    ws.addEventListener('message', (event) => this.#onMessage(event.data));
    ws.addEventListener('close', () => {
      this.closed = true;
      for (const { reject } of this.pending.values()) reject(new Error('CDP connection closed'));
      this.pending.clear();
    });
  }

  #onMessage(data) {
    const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg.id != null && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (code ${msg.error.code})`));
      else resolve(msg.result);
      return;
    }
    if (msg.method) {
      for (const cb of this.listeners.get(msg.method) || []) cb(msg.params, msg.sessionId);
    }
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
      }, 30000).unref?.();
    });
  }

  on(method, cb) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(cb);
    return () => {
      const list = this.listeners.get(method) || [];
      const i = list.indexOf(cb);
      if (i >= 0) list.splice(i, 1);
    };
  }

  waitForEvent(method, { sessionId, timeout = 15000 } = {}) {
    return new Promise((resolve, reject) => {
      const off = this.on(method, (params, sid) => {
        if (sessionId && sid !== sessionId) return;
        clearTimeout(timer);
        off();
        resolve(params);
      });
      const timer = setTimeout(() => {
        off();
        reject(new Error(`timed out waiting for ${method}`));
      }, timeout);
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* already gone */
    }
  }
}

/* ------------------------------------------------------------------ */
/* Page harness                                                        */
/* ------------------------------------------------------------------ */

/**
 * Init script installed before any page script runs: pins the clock to the
 * fixture instant so `todayIn()`, `resolveCurrentSlot()` and the date label are
 * reproducible on any machine and any run date.
 */
function clockInitScript(fixedMs) {
  return `(() => {
  const RealDate = Date;
  const FIXED = ${fixedMs};
  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(FIXED); else super(...args);
    }
    static now() { return FIXED; }
  }
  MockDate.parse = RealDate.parse;
  MockDate.UTC = RealDate.UTC;
  MockDate.prototype = RealDate.prototype;
  globalThis.Date = MockDate;
})();`;
}

function makePage(cdp, sessionId) {
  const page = {
    sessionId,
    send: (method, params) => cdp.send(method, params, sessionId),
    async evaluate(expression, { awaitPromise = false } = {}) {
      const res = await cdp.send(
        'Runtime.evaluate',
        { expression, awaitPromise, returnByValue: true, userGesture: true },
        sessionId,
      );
      if (res.exceptionDetails) {
        const d = res.exceptionDetails;
        throw new Error(`page exception: ${d.exception?.description || d.text}`);
      }
      return res.result?.value;
    },
    async waitFor(expression, { timeout = 20000, interval = 100, label = expression } = {}) {
      const deadline = Date.now() + timeout;
      let last;
      for (;;) {
        last = await page.evaluate(expression);
        if (last) return last;
        if (Date.now() > deadline) throw new Error(`timed out waiting for: ${label}`);
        await new Promise((r) => setTimeout(r, interval));
      }
    },
    async setViewport(width, height = 900) {
      await page.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await new Promise((r) => setTimeout(r, 120));
    },
  };
  return page;
}

/**
 * Start the whole harness (server + Chrome + page) and hand it to `fn`.
 * Always tears down. Used by BOTH scripts/smoke.mjs and scripts/axe-check.mjs.
 */
export async function withPage(fn, { viewport = { width: 1024, height: 900 }, initScripts = [] } = {}) {
  const chrome = findChrome();
  if (!chrome) throw new Error('no Chromium binary found (set CHROME_PATH)');

  const { server, port } = await startStaticServer(ROOT);
  const origin = `http://127.0.0.1:${port}`;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'choghadiya-smoke-'));
  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-component-update',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  let cdp;
  let cdpWs;
  const consoleErrors = [];
  let chromeStderr = '';
  child.stderr?.on('data', (d) => {
    chromeStderr += d.toString();
    if (chromeStderr.length > 8000) chromeStderr = chromeStderr.slice(-8000);
  });
  const teardown = async () => {
    try {
      cdp?.close();
    } catch {
      /* ignore */
    }
    try {
      child.kill('SIGKILL');
    } catch {
      /* ignore */
    }
    await new Promise((resolve) => server.close(resolve));
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  try {
    let devtoolsPort;
    try {
      devtoolsPort = await readDevToolsPort(userDataDir, 20000);
    } catch (err) {
      throw new Error(`${err.message}\n  chrome: ${chrome}\n  stderr: ${chromeStderr.split('\n').slice(0, 6).join('\n  ')}`);
    }
    const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
    cdpWs = await connectWebSocket(version.webSocketDebuggerUrl);
    cdp = new Cdp(cdpWs);

    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const page = makePage(cdp, sessionId);

    // Collect console errors / uncaught exceptions / browser log errors for the
    // "no console error" acceptance criterion.
    cdp.on('Runtime.exceptionThrown', (params, sid) => {
      if (sid !== sessionId) return;
      consoleErrors.push(`uncaught: ${params.exceptionDetails?.exception?.description || params.exceptionDetails?.text}`);
    });
    cdp.on('Runtime.consoleAPICalled', (params, sid) => {
      if (sid !== sessionId) return;
      if (params.type === 'error' || params.type === 'assert') {
        consoleErrors.push(`console.error: ${(params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')}`);
      }
    });
    cdp.on('Log.entryAdded', (params, sid) => {
      if (sid !== sessionId) return;
      const e = params.entry || {};
      if (e.level === 'error') consoleErrors.push(`log: ${e.text}${e.url ? ` (${e.url})` : ''}`);
    });

    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Log.enable');
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: clockInitScript(FIXTURE_NOW_MS) });
    for (const source of initScripts) {
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source });
    }
    await page.send('Emulation.setTimezoneOverride', { timezoneId: MUMBAI.timezone });
    await page.send('Emulation.setGeolocationOverride', {
      latitude: MUMBAI.latitude,
      longitude: MUMBAI.longitude,
      accuracy: 5,
    });
    await cdp.send('Browser.grantPermissions', { origin, permissions: ['geolocation'] });
    await page.setViewport(viewport.width, viewport.height);

    const loaded = cdp.waitForEvent('Page.loadEventFired', { sessionId, timeout: 20000 });
    await page.send('Page.navigate', { url: `${origin}/` });
    await loaded;

    return await fn({ page, cdp, origin, port, server, consoleErrors, chrome });
  } finally {
    await teardown();
  }
}

/** Wait for the Mumbai fixture view to be fully rendered (16 real rows). */
export async function waitForRows(page, { timeout = 25000 } = {}) {
  return page.waitFor(
    `document.querySelectorAll('#day-list button.slot').length === 8 &&
     document.querySelectorAll('#night-list button.slot').length === 8`,
    { timeout, label: '16 slot rows rendered from the fixture' },
  );
}

/**
 * Reload the page in the SAME tab (so sessionStorage survives — the v2.3.0 item-7
 * persistence contract) and wait for the fixture view to be rendered again. The CDP
 * init scripts (pinned clock) and the timezone/geolocation overrides are attached to
 * the target/session, so they re-apply to the new document; they are re-asserted here
 * defensively because every reload-based assertion depends on the pinned Mumbai view.
 */
export async function reloadPage(page, cdp, { timezone } = {}) {
  const loaded = cdp.waitForEvent('Page.loadEventFired', { sessionId: page.sessionId, timeout: 20000 });
  await page.send('Page.reload', { ignoreCache: false });
  await loaded;
  if (timezone) await page.send('Emulation.setTimezoneOverride', { timezoneId: timezone });
  await waitForRows(page);
}

/* ------------------------------------------------------------------ */
/* Shipped-asset helpers (perf budget + cache-busting)                 */
/* ------------------------------------------------------------------ */

/** Transitive ESM import graph of the shipped site, seeded from index.html. */
export function shippedJsFiles() {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const seeds = [...indexHtml.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  const queue = seeds.map((s) => path.resolve(ROOT, s.split('?')[0]));
  while (queue.length) {
    const abs = queue.shift();
    if (seen.has(abs) || !fs.existsSync(abs)) continue;
    seen.add(abs);
    const src = fs.readFileSync(abs, 'utf8');
    // Only relative, same-origin specifiers — bare specifiers would be a shipped dep.
    for (const m of src.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)) {
      queue.push(path.resolve(path.dirname(abs), m[1].split('?')[0]));
    }
    for (const m of src.matchAll(/\bimport\s+['"](\.[^'"]+)['"]/g)) {
      queue.push(path.resolve(path.dirname(abs), m[1].split('?')[0]));
    }
  }
  return [...seen].sort();
}

/** gzip of the raw (unminified) shipped JS — an UPPER bound on "min+gzip". */
export function shippedJsBudget() {
  const files = shippedJsFiles();
  let raw = 0;
  const parts = [];
  for (const f of files) {
    const buf = fs.readFileSync(f);
    raw += buf.length;
    parts.push(buf);
  }
  const gzip = zlib.gzipSync(Buffer.concat(parts), { level: 9 }).length;
  return { files: files.map((f) => path.relative(ROOT, f)), raw, gzip };
}

/** Every `?v=` version token in a shipped file (index.html + module specifiers). */
export function assetVersions() {
  const out = [];
  for (const rel of ['index.html', ...shippedJsFiles().map((f) => path.relative(ROOT, f))]) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of src.matchAll(/\?v=([A-Za-z0-9._-]+)/g)) out.push({ file: rel, version: m[1] });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Assertions                                                          */
/* ------------------------------------------------------------------ */

class Report {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.lines = [];
  }

  check(name, ok, detail = '') {
    if (ok) {
      this.passed += 1;
      this.lines.push(`  PASS  ${name}`);
    } else {
      this.failed += 1;
      this.lines.push(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    }
    return ok;
  }

  note(text) {
    this.lines.push(`  ....  ${text}`);
  }

  print(title) {
    process.stdout.write(`\n${title}\n${this.lines.join('\n')}\n`);
  }
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const r = new Report();

  await withPage(async ({ page, cdp, origin, consoleErrors }) => {
    // --- 0. the fixture view renders -------------------------------------
    await waitForRows(page);

    const rowCounts = await page.evaluate(`JSON.stringify({
      day: document.querySelectorAll('#day-list button.slot').length,
      night: document.querySelectorAll('#night-list button.slot').length,
      total: document.querySelectorAll('button.slot').length,
    })`);
    const counts = JSON.parse(rowCounts);
    r.check('16 rows render (8 day + 8 night) from the Mumbai fixture',
      counts.day === 8 && counts.night === 8 && counts.total === 16,
      JSON.stringify(counts));

    // --- 1. server serves the shipped assets ------------------------------
    for (const asset of ['/', '/style.css', '/app.js', '/favicon.svg']) {
      const res = await fetch(origin + asset);
      r.check(`GET ${asset} -> 200`, res.status === 200, `status ${res.status}`);
    }

    // --- 2. favicon is a valid, emoji-free SVG ---------------------------
    const favicon = fs.readFileSync(path.join(ROOT, 'favicon.svg'), 'utf8');
    r.check('favicon.svg parses as SVG (xmlns + a single <svg> root)',
      /^<svg[\s>]/.test(favicon.trim()) && favicon.includes('xmlns="http://www.w3.org/2000/svg"')
      && (favicon.match(/<svg/g) || []).length === 1);
    r.check('favicon.svg carries no <script>, <image> or external reference',
      !/<script|<image|href=|url\(|xlink/i.test(favicon));
    // PRD Q7 / US-19 AC3: minimal, emoji-free. Covers the pictographic/emoji blocks
    // plus variation selectors and regional indicators — the legacy stray "🐴" class
    // of defect.
    const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2460}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
    r.check('favicon.svg is emoji-free (PRD Q7 / US-19 AC3)',
      !emojiRe.test(favicon),
      (favicon.match(emojiRe) || []).join(''));
    const faviconOk = await page.evaluate(
      "fetch('favicon.svg').then(r => r.status)",
      { awaitPromise: true },
    );
    r.check('favicon.svg loads with 200 in the browser', faviconOk === 200, `status ${faviconOk}`);

    // --- 3. fixture slot sequences match docs/03-ux.md §8 ----------------
    // dataset.name is "<hi>, <en>" in Hindi, "<en>" in English — take the latin tail.
    const latinOf = (rows) => rows.map((n) => String(n).split(', ').pop());
    const names = JSON.parse(await page.evaluate(`JSON.stringify({
      day: [...document.querySelectorAll('#day-list button.slot')].map(b => b.dataset.name),
      night: [...document.querySelectorAll('#night-list button.slot')].map(b => b.dataset.name),
    })`));
    const expectedDay = MUMBAI_EXPECTED.daySlots.map((s) => DICT.en[`quality.${s}`]);
    const expectedNight = MUMBAI_EXPECTED.nightSlots.map((s) => DICT.en[`quality.${s}`]);
    r.check('day rows are the 8 fixture day slots in order (Labh…Labh)',
      latinOf(names.day).join(',') === expectedDay.join(','), latinOf(names.day).join(','));
    r.check('night rows are the 8 fixture night slots in order (Udveg…Udveg)',
      latinOf(names.night).join(',') === expectedNight.join(','), latinOf(names.night).join(','));

    // --- 4. row shape: name, time range (ACTIVE format), tier word, selection control ---
    // v2.3.0 CR6 / 03-ux §3.9 (FE-6): a slot row is now a SELECTION control into the
    // S9 detail panel — `aria-pressed` + `aria-controls="choghadiya-panel"` — and the
    // v1.0.1 inline `.meaning` / `aria-expanded` disclosure is RETIRED (this assertion
    // used to lock that retired contract, which is why `make check` was red here).
    // v2.3.0 CR1 (FE-1): the range must be rendered in the ACTIVE cycle — 12-hour by
    // default — so a bare "HH:MM – HH:MM" row is a FAILURE here; the 24-hour form is
    // asserted after the toggle in section 18, not accepted as an alternative here.
    const shape = JSON.parse(await page.evaluate(`JSON.stringify(
      [...document.querySelectorAll('button.slot')].map(b => ({
        name: b.dataset.name, time: b.dataset.time, tier: b.dataset.tier,
        pressed: b.getAttribute('aria-pressed'),
        controls: b.getAttribute('aria-controls'),
        expanded: b.getAttribute('aria-expanded'),
        meaningNodes: b.parentElement.querySelectorAll('.meaning').length,
        text: b.textContent.trim(),
      }))
    )`));
    const RANGE_12H_RE = /^\d{2}:\d{2} [ap]m – \d{2}:\d{2} [ap]m$/;
    const RANGE_24H_RE = /^\d{2}:\d{2} – \d{2}:\d{2}$/;
    r.check('every row has a Hindi+English name, a 12-hour (default) time range and a tier word',
      shape.length === 16 && shape.every((s) =>
        /\S/.test(s.name || '') && RANGE_12H_RE.test(s.time) && /\S/.test(s.tier || '')),
      JSON.stringify(shape.find((s) => !RANGE_12H_RE.test(s.time)) || {}));
    r.check('every row is a selection control (aria-pressed + aria-controls=choghadiya-panel, no aria-expanded)',
      shape.every((s) => (s.pressed === 'true' || s.pressed === 'false')
        && s.controls === 'choghadiya-panel' && s.expanded === null),
      JSON.stringify(shape.find((s) => s.controls !== 'choghadiya-panel' || s.expanded !== null) || {}));
    r.check('no row is selected by default, and the retired v1.0.1 inline disclosure (.meaning) is gone',
      shape.every((s) => s.pressed === 'false' && s.meaningNodes === 0)
      && (await page.evaluate("document.querySelectorAll('.meaning').length")) === 0);

    // --- 5. DOM is free of NaN / Invalid Date ----------------------------
    const domText = await page.evaluate('document.documentElement.textContent');
    r.check('no "NaN" or "Invalid Date" anywhere in the rendered DOM',
      !/NaN|Invalid Date/.test(domText));

    // --- 6. current-slot highlight is singular and sane ------------------
    const current = JSON.parse(await page.evaluate(`JSON.stringify({
      count: document.querySelectorAll('[aria-current="true"]').length,
      badges: document.querySelectorAll('.badge-now').length,
    })`));
    r.check('at most one current slot, and its badge count matches (US-14)',
      current.count <= 1 && current.badges === current.count, JSON.stringify(current));

    // --- 7. server-side (200) checks are done; page console must be clean -
    const faviconErrors = consoleErrors.filter((e) => /favicon/i.test(e));
    r.check('no console error / uncaught exception on load',
      consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(' | '));
    r.check('favicon caused no console error', faviconErrors.length === 0);

    // --- 8. no horizontal scroll at the required widths ------------------
    for (const width of VIEWPORT_WIDTHS) {
      await page.setViewport(width, 800);
      const metrics = JSON.parse(await page.evaluate(`JSON.stringify({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyScroll: document.body.scrollWidth,
      })`));
      r.check(`no horizontal scroll at ${width}px`,
        metrics.scrollWidth <= metrics.clientWidth + 1 && metrics.bodyScroll <= metrics.clientWidth + 1,
        JSON.stringify(metrics));
    }
    await page.setViewport(1024, 900);

    // --- 9. EN toggle flips <html lang> and every [data-i18n] node -------
    // Two nodes are runtime-owned (renderChip writes #loc-name, renderDateBar
    // announces the formatted date into #live): they are re-localised, not
    // dictionary-literal, so they are checked for non-empty, sane, changed text.
    const RUNTIME_OWNED = new Set(['loc-name', 'live']);
    const snapshot = () => page.evaluate(`JSON.stringify(
      [...document.querySelectorAll('[data-i18n]')].map(el => ({
        id: el.id, key: el.getAttribute('data-i18n'), text: el.textContent,
      })))`).then(JSON.parse);

    const hiNodes = await snapshot();
    await page.evaluate("document.getElementById('b-en').click()");
    await page.waitFor("document.documentElement.lang === 'en'", { label: 'html lang flips to en' });
    const enNodes = await snapshot();
    r.check('EN toggle flips <html lang> to "en"',
      (await page.evaluate('document.documentElement.lang')) === 'en');

    const wrongEn = enNodes.filter((n) => {
      if (RUNTIME_OWNED.has(n.id)) return false;
      return n.text !== t(n.key, 'en');
    });
    r.check(`every [data-i18n] node renders its EN dictionary string (${enNodes.length - RUNTIME_OWNED.size} dictionary nodes)`,
      wrongEn.length === 0,
      wrongEn.slice(0, 4).map((n) => `${n.id || n.key}="${n.text}"`).join(' | '));
    r.check('the runtime-owned nodes render non-empty, well-formed localised text',
      enNodes.filter((n) => RUNTIME_OWNED.has(n.id)).every((n) => n.text.trim() && !/NaN|Invalid Date/.test(n.text)),
      enNodes.filter((n) => RUNTIME_OWNED.has(n.id)).map((n) => `${n.id}="${n.text}"`).join(' | '));
    r.check('the device-fix chip shows the localised "My location" label',
      enNodes.find((n) => n.id === 'loc-name')?.text === t('loc.my', 'en'),
      enNodes.find((n) => n.id === 'loc-name')?.text);

    // Every node whose two dictionary strings actually differ must have flipped, and
    // the language-neutral ones (identical in both dictionaries) must be unchanged.
    const pairs = enNodes.map((en, i) => ({ hi: hiNodes[i], en }))
      .filter(({ hi }) => hi && !RUNTIME_OWNED.has(hi.id));
    const flippable = pairs.filter(({ hi }) => DICT.hi[hi.key] !== DICT.en[hi.key]);
    const notFlipped = flippable.filter(({ hi, en }) => hi.text === en.text);
    r.check(`the toggle re-translated every language-varying node (${flippable.length} nodes)`,
      flippable.length > 0 && notFlipped.length === 0,
      notFlipped.map(({ hi }) => hi.key).join(','));
    const langNeutral = pairs.filter(({ hi }) => DICT.hi[hi.key] === DICT.en[hi.key]);
    r.check('language-neutral copy (identical in both dictionaries) is rendered as-is',
      langNeutral.every(({ hi, en }) => hi.text === en.text && en.text === DICT.en[hi.key]),
      langNeutral.map(({ hi }) => hi.key).join(','));

    // EN row names must equal the fixture slot names (latin) — a second fixture lock.
    const enRowNames = JSON.parse(await page.evaluate(
      "JSON.stringify([...document.querySelectorAll('#day-list button.slot')].map(b => b.dataset.name))",
    ));
    const expectedEn = MUMBAI_EXPECTED.daySlots.map((s) => DICT.en[`quality.${s}`]);
    r.check('EN day-row names match the fixture sequence',
      enRowNames.join(',') === expectedEn.join(','),
      enRowNames.join(','));

    await page.evaluate("document.getElementById('b-hi').click()");
    await page.waitFor("document.documentElement.lang === 'hi'", { label: 'html lang flips back to hi' });
    r.check('HI toggle flips <html lang> back to "hi"',
      (await page.evaluate('document.documentElement.lang')) === 'hi');

    // --- 10. cache-busting: ?v= == package.json version ------------------
    const versions = assetVersions();
    const wrong = versions.filter((v) => v.version !== pkg.version);
    r.check(`every ?v= asset version equals the package.json version (${pkg.version})`,
      versions.length >= 5 && wrong.length === 0,
      wrong.length ? wrong.slice(0, 3).map((v) => `${v.file}:${v.version}`).join(', ') : `found ${versions.length}`);

    // --- 11. perf budget -------------------------------------------------
    const budget = shippedJsBudget();
    const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
    r.note(`PERF BUDGET: shipped JS ${budget.files.length} files, raw ${kb(budget.raw)}, gzip ${kb(budget.gzip)} (min+gzip <= this; NFR-P3 budget 60 KB)`);
    r.check('shipped JS (raw-gzip upper bound) is under the 60 KB min+gzip budget (NFR-P3)',
      budget.gzip < 60 * 1024, `${kb(budget.gzip)}`);
    r.note(`FCP note (M6 gate): QA runs Lighthouse mobile (mid-range Android / 4G, FCP < 1.5 s) against the deployed https://time.gitick.com/ — see docs/07-test-plan.md §M6.`);
    r.note(`shipped JS graph: ${budget.files.join(', ')}`);

    /* ================================================================== */
    /* v2.3.0 surfaces (CR1/CR2/CR4/CR5/CR6 + item 7) — added by DO-1     */
    /* ================================================================== */

    // --- 12. CR2: the manual "use my current location" button ------------
    const geoBtn = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const b = document.getElementById('use-current');
      if (!b) return null;
      return {
        inSheet: document.getElementById('sheet').contains(b),
        label: document.getElementById('use-current-label').textContent,
        busy: b.getAttribute('aria-busy'),
        disabled: b.disabled,
        type: b.getAttribute('type'),
      };
    })())`));
    r.check('the manual "use my current location" button is present inside the location sheet',
      Boolean(geoBtn) && geoBtn.inSheet === true && geoBtn.type === 'button',
      JSON.stringify(geoBtn));
    r.check('the geolocation button shows the localised loc.useCurrent label (idle, enabled)',
      Boolean(geoBtn) && geoBtn.label === t('loc.useCurrent', 'hi')
      && geoBtn.busy === 'false' && geoBtn.disabled === false,
      geoBtn && geoBtn.label);

    // --- 13. CR5: the S8 inauspicious-periods block ----------------------
    const periods = JSON.parse(await page.evaluate(`JSON.stringify({
      hidden: document.getElementById('periods').hidden,
      heading: document.getElementById('periods-h').textContent,
      rows: [...document.querySelectorAll('#period-rows .period')].map(row => ({
        name: (row.querySelector('.period__name') || {}).textContent ?? null,
        range: (row.querySelector('.period__range') || {}).textContent ?? null,
        date: (row.querySelector('.period__date') || {}).textContent ?? null,
        desc: (row.querySelector('.period__desc') || {}).textContent ?? null,
      })),
    })`));
    // Mumbai 2026-10-14 (Wed) fixture from BE-A / RS-1 §11.5, rendered in 12-hour
    // format (the default cycle) — Vaar Vela 12:24–13:52, Kaal Vela 09:28–10:56,
    // Kaal Ratri 03:28–05:00 (on the next civil date). Exact, ±0 min.
    const MUMBAI_PERIODS_12H = [
      { key: 'periods.vaarVela', range: '12:24 pm – 01:52 pm', crossDate: false },
      { key: 'periods.kaalVela', range: '09:28 am – 10:56 am', crossDate: false },
      { key: 'periods.kaalRatri', range: '03:28 am – 05:00 am', crossDate: true },
    ];
    r.check('the S8 inauspicious-periods block is visible with exactly 3 rows (Vaar Vela, Kaal Vela, Kaal Ratri)',
      periods.hidden === false && periods.rows.length === 3 && periods.heading === t('periods.heading', 'hi'),
      JSON.stringify({ hidden: periods.hidden, heading: periods.heading, rows: periods.rows.length }));
    r.check('the 3 period rows carry the Mumbai 2026-10-14 fixture ranges in 12-hour format (no NaN)',
      periods.rows.length === 3 && periods.rows.every((row, i) =>
        row.name === t(MUMBAI_PERIODS_12H[i].key, 'hi')
        && row.range === MUMBAI_PERIODS_12H[i].range
        && /\S/.test(row.desc || '')
        && !/NaN|Invalid Date/.test(`${row.name}${row.range}${row.desc}`)),
      JSON.stringify(periods.rows.map((row) => `${row.name}=${row.range}`)));
    r.check('only the cross-midnight period (Kaal Ratri) is annotated with its trailing civil date',
      periods.rows.length === 3
      && periods.rows.filter((row) => Boolean(row.date)).length === 1
      && MUMBAI_PERIODS_12H[2].crossDate === true
      && /^· \S/.test(periods.rows[2].date || ''),
      JSON.stringify(periods.rows.map((row) => row.date)));

    // --- 14. CR6: S9 detail panel — default = the live current slot ------
    const panelDefault = JSON.parse(await page.evaluate(`JSON.stringify({
      hidden: document.getElementById('choghadiya-panel').hidden,
      bodyHidden: document.getElementById('panel-body').hidden,
      promptHidden: document.getElementById('panel-prompt').hidden,
      badgeHidden: document.getElementById('panel-badge').hidden,
      badge: document.getElementById('panel-badge').textContent,
      name: document.getElementById('panel-name').textContent,
      range: document.getElementById('panel-range').textContent,
      note: document.getElementById('panel-note').textContent,
      tier: document.getElementById('panel-tier-note').textContent,
      warnHidden: document.getElementById('panel-warn').hidden,
      meaning: document.getElementById('panel-meaning').textContent,
      goodFor: document.getElementById('panel-goodfor').textContent,
      badFor: document.getElementById('panel-badfor').textContent,
      nuance: document.getElementById('panel-nuance').textContent,
      currentName: (document.querySelector('button.slot[aria-current="true"]') || {}).dataset
        ? document.querySelector('button.slot[aria-current="true"]').dataset.name : null,
      pressed: document.querySelectorAll('button.slot[aria-pressed="true"]').length,
    })`));
    const currentLatin = String(panelDefault.currentName || '').split(', ').pop();
    r.check('the detail panel is visible by default and follows the live current choghadiya with the current badge',
      panelDefault.hidden === false && panelDefault.bodyHidden === false
      && panelDefault.promptHidden === true && panelDefault.badgeHidden === false
      && panelDefault.badge === t('panel.badge.current', 'hi') && panelDefault.pressed === 0,
      JSON.stringify({ hidden: panelDefault.hidden, badge: panelDefault.badge, pressed: panelDefault.pressed }));
    r.check('the default panel shows the current slot name, a 12-hour range, the current note and its tier note',
      Boolean(currentLatin) && panelDefault.name.includes(currentLatin)
      && RANGE_12H_RE.test(panelDefault.range)
      && panelDefault.note === t('panel.note.current', 'hi') && /\S/.test(panelDefault.tier)
      && !/NaN|Invalid Date/.test(`${panelDefault.name}${panelDefault.range}${panelDefault.note}${panelDefault.tier}`),
      JSON.stringify({ name: panelDefault.name, range: panelDefault.range, note: panelDefault.note }));
    r.check('the default panel carries the full meaning / good-for / bad-for / day-night content',
      [panelDefault.meaning, panelDefault.goodFor, panelDefault.badFor, panelDefault.nuance].every((v) => /\S/.test(v)),
      JSON.stringify({ meaning: String(panelDefault.meaning).slice(0, 40) }));

    // --- 15. CR4: the calendar picker (±10 civil days) drives the view ---
    const picker = JSON.parse(await page.evaluate(`JSON.stringify({
      type: document.getElementById('datepicker').type,
      min: document.getElementById('datepicker').min,
      max: document.getElementById('datepicker').max,
      value: document.getElementById('datepicker').value,
      label: document.getElementById('date-label').textContent,
      disabled: document.getElementById('datepicker').disabled,
    })`));
    const RANGE_DAYS_14 = { min: '2026-10-04', max: '2026-10-24' }; // Mumbai civil date 2026-10-14 ∓ 10
    r.check('the date picker is a native date control with min/max = the location civil date ∓10',
      picker.type === 'date' && picker.disabled === false
      && picker.min === RANGE_DAYS_14.min && picker.max === RANGE_DAYS_14.max
      && picker.value === MUMBAI_DATE,
      JSON.stringify(picker));

    const dayNames = () => page.evaluate(
      "JSON.stringify([...document.querySelectorAll('#day-list button.slot')].map(b => b.dataset.name))",
    ).then(JSON.parse);
    const labelBeforePick = picker.label;
    const dayNamesBeforePick = await dayNames();
    const picked = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const el = document.getElementById('datepicker');
      el.value = '2026-10-15';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { value: el.value, label: document.getElementById('date-label').textContent };
    })())`));
    const dayNamesAfterPick = await dayNames();
    r.check('picking an adjacent date re-renders the slot lists and the date label',
      picked.value === '2026-10-15' && picked.label !== labelBeforePick
      && dayNamesAfterPick.join(',') !== dayNamesBeforePick.join(','),
      JSON.stringify({ label: picked.label, before: dayNamesBeforePick.join(','), after: dayNamesAfterPick.join(',') }));
    r.check('an off-today picked date drops the highlight and shows the neutral panel prompt (US-14 AC3)',
      (await page.evaluate("document.querySelectorAll('button.slot[aria-current=\"true\"]').length")) === 0
      && (await page.evaluate("document.getElementById('panel-body').hidden")) === true
      && (await page.evaluate("document.getElementById('panel-prompt').hidden")) === false);
    await page.evaluate(`(() => {
      const el = document.getElementById('datepicker');
      el.value = '${MUMBAI_DATE}';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await page.waitFor(
      `document.getElementById('datepicker').value === '${MUMBAI_DATE}'
       && document.querySelector("button.slot[aria-current='true']") !== null`,
      { label: 'fixture date restored after the picker probe' },
    );
    r.check('re-picking the fixture date restores the current-slot highlight and the default panel',
      (await page.evaluate("document.querySelectorAll('button.slot[aria-current=\"true\"]').length")) === 1
      && (await page.evaluate("document.getElementById('panel-badge').hidden")) === false
      && (await dayNames()).join(',') === dayNamesBeforePick.join(','));

    // --- 16. CR6: tap selects a slot into the panel; the same tap reverts -
    const firstRow = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const b = document.querySelector('#day-list button.slot');
      return { key: b.dataset.slot, name: b.dataset.name, pressed: b.getAttribute('aria-pressed') };
    })())`));
    await page.evaluate("document.querySelector('#day-list button.slot').click()");
    await page.waitFor("document.querySelector('#day-list button.slot').getAttribute('aria-pressed') === 'true'",
      { label: 'first row selected' });
    const selectedPanel = JSON.parse(await page.evaluate(`JSON.stringify({
      pressed: document.querySelectorAll('button.slot[aria-pressed="true"]').length,
      current: document.querySelectorAll('button.slot[aria-current="true"]').length,
      currentKey: (document.querySelector('button.slot[aria-current="true"]') || {}).dataset
        ? document.querySelector('button.slot[aria-current="true"]').dataset.slot : null,
      badgeHidden: document.getElementById('panel-badge').hidden,
      name: document.getElementById('panel-name').textContent,
      range: document.getElementById('panel-range').textContent,
      note: document.getElementById('panel-note').textContent,
    })`));
    r.check('tapping a non-current row selects it (aria-pressed) and the panel shows THAT slot, not the live one',
      selectedPanel.pressed === 1 && selectedPanel.badgeHidden === true
      && selectedPanel.name.includes(String(firstRow.name).split(', ').pop())
      && selectedPanel.note === t('panel.note.tapAgain', 'hi')
      && RANGE_12H_RE.test(selectedPanel.range),
      JSON.stringify(selectedPanel));
    r.check('the current-slot marker stays exclusive to the live row while another row is selected (US-14 AC1)',
      selectedPanel.current === 1 && selectedPanel.currentKey !== firstRow.key,
      JSON.stringify({ currentKey: selectedPanel.currentKey, selectedKey: firstRow.key }));
    await page.evaluate("document.querySelector('#day-list button.slot').click()");
    await page.waitFor("document.querySelectorAll('button.slot[aria-pressed=\"true\"]').length === 0",
      { label: 'selection cleared by the second tap' });
    r.check('tapping the same row again reverts the panel to the live current slot',
      (await page.evaluate("document.getElementById('panel-badge').hidden")) === false
      && (await page.evaluate("document.getElementById('panel-note').textContent")) === t('panel.note.current', 'hi')
      && (await page.evaluate("document.querySelectorAll('button.slot[aria-pressed=\"true\"]').length")) === 0);

    // --- 17. a reload reverts the selection (UI state only, never stored) -
    await page.evaluate("document.querySelector('#day-list button.slot').click()");
    await page.waitFor("document.querySelectorAll('button.slot[aria-pressed=\"true\"]').length === 1",
      { label: 'row re-selected before the reload probe' });
    await reloadPage(page, cdp, { timezone: MUMBAI.timezone });
    const afterReload = JSON.parse(await page.evaluate(`JSON.stringify({
      rows: document.querySelectorAll('button.slot').length,
      pressed: document.querySelectorAll('button.slot[aria-pressed="true"]').length,
      badgeHidden: document.getElementById('panel-badge').hidden,
      note: document.getElementById('panel-note').textContent,
    })`));
    r.check('a page reload reverts the S9 selection to the live current slot (selection is UI-only)',
      afterReload.rows === 16 && afterReload.pressed === 0
      && afterReload.badgeHidden === false && afterReload.note === t('panel.note.current', 'hi'),
      JSON.stringify(afterReload));

    // --- 18. CR1: the 12h/24h toggle re-renders every visible time -------
    await page.evaluate("document.getElementById('b-h24').click()");
    await page.waitFor("document.getElementById('b-h24').getAttribute('aria-pressed') === 'true'",
      { label: '24-hour cycle active' });
    const h24 = JSON.parse(await page.evaluate(`JSON.stringify({
      h12: document.getElementById('b-h12').getAttribute('aria-pressed'),
      rowRanges: [...document.querySelectorAll('button.slot')].map(b => b.dataset.time),
      rowText: [...document.querySelectorAll('button.slot .time')].map(e => e.textContent),
      periodRanges: [...document.querySelectorAll('#period-rows .period__range')].map(e => e.textContent),
      panelRange: document.getElementById('panel-range').textContent,
    })`));
    r.check('the 24h toggle re-renders every slot range, the S8 periods block and the S9 panel in 24-hour format',
      h24.h12 === 'false'
      && h24.rowRanges.length === 16 && h24.rowRanges.every((v) => RANGE_24H_RE.test(v))
      && h24.rowText.every((v) => RANGE_24H_RE.test(v))
      && h24.periodRanges.length === 3 && h24.periodRanges.every((v) => RANGE_24H_RE.test(v))
      && RANGE_24H_RE.test(h24.panelRange),
      JSON.stringify({ h12: h24.h12, periods: h24.periodRanges, panel: h24.panelRange }));
    r.check('24-hour ranges are the plain HH:MM form (no am/pm suffix) with the fixture period values',
      h24.periodRanges.join(' | ') === '12:24 – 13:52 | 09:28 – 10:56 | 03:28 – 05:00',
      h24.periodRanges.join(' | '));
    await page.evaluate("document.getElementById('b-h12').click()");
    await page.waitFor("document.getElementById('b-h12').getAttribute('aria-pressed') === 'true'",
      { label: '12-hour cycle restored' });
    r.check('the 12h toggle restores the 12-hour render (the default)',
      (await page.evaluate("[...document.querySelectorAll('button.slot')].every(b => /^\\d{2}:\\d{2} [ap]m – \\d{2}:\\d{2} [ap]m$/.test(b.dataset.time))")) === true
      && (await page.evaluate("[...document.querySelectorAll('#period-rows .period__range')].map(e => e.textContent).join(' | ')"))
        === '12:24 pm – 01:52 pm | 09:28 am – 10:56 am | 03:28 am – 05:00 am');

    // --- 19. item 7a: settings persist across a reload (sessionStorage) --
    // Set a NON-default pair (24-hour + English), reload, and assert both survive —
    // then put the tab back into its documented default state (12-hour, Hindi).
    await page.evaluate("document.getElementById('b-h24').click()");
    await page.waitFor("document.getElementById('b-h24').getAttribute('aria-pressed') === 'true'",
      { label: '24-hour for the persistence probe' });
    await page.evaluate("document.getElementById('b-en').click()");
    await page.waitFor("document.documentElement.lang === 'en'", { label: 'English for the persistence probe' });
    await reloadPage(page, cdp, { timezone: MUMBAI.timezone });
    const persisted = JSON.parse(await page.evaluate(`JSON.stringify({
      lang: document.documentElement.lang,
      h24: document.getElementById('b-h24').getAttribute('aria-pressed'),
      h12: document.getElementById('b-h12').getAttribute('aria-pressed'),
      rowRanges: [...document.querySelectorAll('button.slot')].map(b => b.dataset.time),
      keys: Object.keys(sessionStorage).sort(),
    })`));
    r.check('the 12h/24h time format persists across a reload (sessionStorage-backed, v2.3.0 item 7)',
      persisted.h24 === 'true' && persisted.h12 === 'false'
      && persisted.rowRanges.length === 16 && persisted.rowRanges.every((v) => RANGE_24H_RE.test(v)),
      JSON.stringify({ h24: persisted.h24, rows: persisted.rowRanges.slice(0, 2) }));
    r.check('the language choice persists across a reload',
      persisted.lang === 'en' && persisted.keys.some((k) => k.endsWith('settings.lang')),
      JSON.stringify({ lang: persisted.lang, keys: persisted.keys }));
    r.check('every persisted key is namespaced choghadiya.* (session-store.js owns the storage)',
      persisted.keys.length > 0 && persisted.keys.every((k) => k.startsWith('choghadiya.')),
      JSON.stringify(persisted.keys));

    // Leave the page in its documented default state (12-hour, Hindi).
    await page.evaluate("document.getElementById('b-h12').click()");
    await page.waitFor("document.getElementById('b-h12').getAttribute('aria-pressed') === 'true'",
      { label: 'default format restored after the persistence probe' });
    await page.evaluate("document.getElementById('b-hi').click()");
    await page.waitFor("document.documentElement.lang === 'hi'",
      { label: 'default language restored after the persistence probe' });

    r.print('SMOKE — headless Chromium, Mumbai fixture, no network');
  });

  process.stdout.write(`\nSMOKE RESULT: ${r.passed} passed, ${r.failed} failed\n`);
  return r.failed === 0 ? 0 : 1;
}

if (IS_MAIN) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`\nSMOKE HARNESS ERROR: ${err && err.message ? err.message : err}\n`);
      process.exit(2);
    });
}

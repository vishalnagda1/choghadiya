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

  await withPage(async ({ page, origin, consoleErrors }) => {
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

    // --- 4. row shape: name, time range (active format), tier word, disclosure semantics ---
    const shape = JSON.parse(await page.evaluate(`JSON.stringify(
      [...document.querySelectorAll('button.slot')].map(b => ({
        name: b.dataset.name, time: b.dataset.time, tier: b.dataset.tier,
        expanded: b.getAttribute('aria-expanded'),
        controls: b.getAttribute('aria-controls'),
        meaningId: (b.parentElement.querySelector('.meaning') || {}).id || null,
        text: b.textContent.trim(),
      }))
    )`));
    // v2.3.0 CR1 (FE-1): the default cycle is 12-hour, so a row range is
    // "hh:mm am – hh:mm am"; the widened alternative accepts the 24h "HH:MM – HH:MM"
    // the toggle produces. Either form is a real clock range, never NaN.
    const RANGE_RE = /^(?:\d{2}:\d{2}|\d{2}:\d{2} [ap]m) – (?:\d{2}:\d{2}|\d{2}:\d{2} [ap]m)$/;
    r.check('every row has a Hindi+English name, a time range in the active format and a tier word',
      shape.length === 16 && shape.every((s) =>
        /\S/.test(s.name || '') && RANGE_RE.test(s.time) && /\S/.test(s.tier || '')));
    r.check('every row is a collapsed disclosure control (aria-expanded=false + aria-controls)',
      shape.every((s) => s.expanded === 'false' && s.controls && s.controls === s.meaningId));

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

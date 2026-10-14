// scripts/axe-check.mjs — DO-02 (t_e96f9d7a) accessibility gate (PRD M7 / US-18 AC1).
//
// Contract: docs/05-plan.md §DO-02, docs/07-test-plan.md §L3 (M7),
//           docs/adr/008-testing-tooling.md §2, docs/03-ux.md §7.1/§7.5.
//
// Scans the SHIPPED page with axe-core — the same deterministic Mumbai-fixture
// view scripts/smoke.mjs builds (shared harness: scripts/smoke.mjs exports
// withPage/waitForRows) — in five states:
//   1. the base page;            2. the city-search <dialog> open;
//   3. a slot row SELECTED (S9 detail panel content visible, v2.3.0 CR6 — the retired
//      v1.0.1 row-disclosure state is gone);   4. the off-today neutral panel prompt
//      with the S8 periods block visible and the date picker focused;   5. 320 px.
//
// EXIT CODES (the M7 gate — CI-honest, make check depends on these):
//   0  axe ran and found 0 critical/serious violations;
//   1  at least one critical/serious violation (moderate/minor are reported, not fatal);
//   2  the harness or axe-core itself could not run (nothing was verified).
//
// axe-core is a DEV-ONLY dependency (pinned exact in package.json, never shipped,
// never referenced from index.html/app.js/style.css — the shipped site keeps
// `script-src 'self'`). Install once with `npm ci` before running `make check`.
//
// Run: node scripts/axe-check.mjs   (or: make check)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT, withPage, waitForRows } from './smoke.mjs';
import { MUMBAI_DATE } from '../tests/fixtures.js';

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const AXE_PATH = path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');
const FATAL_IMPACTS = new Set(['critical', 'serious']);

/** The adjacent civil date used for the off-today S9 prompt state (MUMBAI_DATE + 1 day). */
const OFF_TODAY = (() => {
  const [y, m, d] = MUMBAI_DATE.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
})();

const RUN_EXPR = `axe.run(document, { resultTypes: ['violations'], reporter: 'v2' }).then((r) => JSON.stringify({
  violations: r.violations.map((v) => ({
    id: v.id, impact: v.impact, help: v.help, count: v.nodes.length,
    targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  })),
  passes: r.passes.length,
  incomplete: r.incomplete.map((i) => i.id),
  inapplicable: r.inapplicable.length,
}))`;

async function main() {
  if (!fs.existsSync(AXE_PATH)) {
    process.stderr.write(
      `AXE GATE ERROR: axe-core is not installed (${AXE_PATH} missing).\n`
      + 'Run `npm ci` first — axe-core is a dev-only dependency (never shipped).\n',
    );
    return 2;
  }
  const axeSource = fs.readFileSync(AXE_PATH, 'utf8');
  const axeVersion = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'node_modules', 'axe-core', 'package.json'), 'utf8'),
  ).version;

  let failed = 0;
  const out = [];

  await withPage(async ({ page }) => {
    const loaded = await page.evaluate("typeof window.axe !== 'undefined' && typeof window.axe.run === 'function'");
    if (!loaded) throw new Error('axe-core was not injected into the page');

    await waitForRows(page);

    const scan = async (label) => {
      const raw = await page.evaluate(RUN_EXPR, { awaitPromise: true });
      const res = JSON.parse(raw);
      if (!res || typeof res.passes !== 'number' || res.passes < 1) {
        throw new Error(`axe did not actually run for "${label}"`);
      }
      const fatal = res.violations.filter((v) => FATAL_IMPACTS.has(v.impact));
      const other = res.violations.filter((v) => !FATAL_IMPACTS.has(v.impact));
      out.push(`  ${fatal.length === 0 ? 'PASS' : 'FAIL'}  ${label}: ${fatal.length} critical/serious, `
        + `${other.length} moderate/minor, ${res.passes} rules passed`);
      for (const v of fatal) {
        out.push(`         ! ${v.impact} ${v.id} (${v.count} node${v.count === 1 ? '' : 's'}) — ${v.help}`);
        out.push(`           ${v.targets.join(' | ')}`);
      }
      for (const v of other) {
        out.push(`         . ${v.impact} ${v.id} (${v.count}) — non-fatal, recorded for the M7 report`);
      }
      if (res.incomplete.length) out.push(`         i ${res.incomplete.length} incomplete rule(s): ${res.incomplete.slice(0, 6).join(', ')}`);
      if (fatal.length) failed += 1;
      return res;
    };

    // 1. base page (16 rows, Hindi, device-fix chip)
    await scan(`base page @1024px (${axeVersion})`);

    // 2. city-search dialog open
    await page.evaluate("document.getElementById('loc-chip').click()");
    await page.waitFor("document.getElementById('sheet').open === true", { label: 'city sheet opens' });
    await scan('city-search dialog open');
    await page.evaluate("document.getElementById('sheet').close()");
    await page.waitFor("document.getElementById('sheet').open === false", { label: 'city sheet closes' });

    // 3. S9 detail panel with a slot row SELECTED (v2.3.0 CR6 / 03-ux §3.9): rows are
    //    SELECTION controls (`aria-pressed` + `aria-controls="choghadiya-panel"`) and the
    //    retired v1.0.1 row-disclosure state no longer exists, so the old
    //    "row disclosure opens" scan is replaced by a panel-content scan.
    await page.evaluate("document.querySelector('#day-list button.slot').click()");
    await page.waitFor("document.querySelector('#day-list button.slot').getAttribute('aria-pressed') === 'true'",
      { label: 'a slot row is selected' });
    await scan('slot row selected — S9 panel content visible');

    // 4. off-today view: the neutral S9 prompt (no badge, hidden body) with the S8
    //    inauspicious-periods block visible and the date picker focused.
    await page.evaluate(`(() => {
      const el = document.getElementById('datepicker');
      el.value = '${OFF_TODAY}';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await page.waitFor("document.getElementById('panel-prompt').hidden === false",
      { label: 'off-today panel prompt shows' });
    await page.evaluate("document.getElementById('datepicker').focus()");
    await scan('off-today — S8 periods block + S9 prompt, date picker focused');
    await page.evaluate(`(() => {
      const el = document.getElementById('datepicker');
      el.value = '${MUMBAI_DATE}';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await page.waitFor("document.querySelector(\"button.slot[aria-current='true']\") !== null",
      { label: 'fixture date restored' });

    // 5. narrowest supported layout (NFR-A6 / 03-ux §5)
    await page.setViewport(320, 800);
    await scan('base page @320px');
  }, { initScripts: [axeSource] });

  process.stdout.write(`\nAXE GATE (axe-core ${axeVersion}, dev-only) — 0 critical/serious required (PRD M7)\n${out.join('\n')}\n`);
  process.stdout.write(`\nAXE RESULT: ${failed === 0 ? 'PASS' : `FAIL — ${failed} state(s) with critical/serious violations`}\n`);
  return failed === 0 ? 0 : 1;
}

if (IS_MAIN) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`\nAXE GATE ERROR: ${err && err.message ? err.message : err}\n`);
      process.exit(2);
    });
}

# ADR-008 — Testing: `node --test` for logic, headless Chromium + axe for the UI

- **Status:** Accepted (2026-10-14)
- **Deciders:** architect (research §4/§9; M3/M7 gates from PRD §3)
- **Impacts:** `tests/`, CI workflow, QA handoff, dev dependencies

## Context

The algorithmic core must be regression-locked (research R8: a wrong 7×16 table
ships silently if untested), and PRD gates M3 (±2 min vs a reference panchang) and
M7 (axe: 0 critical/serious). The stack has no build step, so tests must run
against the shipped files directly. The UX card already validated a headless
Chromium (CDP) + computed-contrast workflow, so the team has a proven tool path.

## Decision

1. **Unit/contract tests: `node --test` (Node ≥ 20 LTS, zero dependencies).**
   Suites: the 7×16 sequence table (112 assertions copied verbatim from research
   §5.2/§5.3), slot-boundary continuity, the Mumbai 2026-10-14 fixture (crosses
   midnight), polar (US-9), DST London (US-7), current-slot boundary cases
   (US-14), geocoder client behaviour with an injectable `fetch`, and the i18n
   58-key coverage contract (M4). Runs in CI on every push via `make test`.
2. **Browser checks: headless Chromium (CDP) + `axe-core` (dev-only, pinned in
   `package.json`, never shipped).** Smoke: 16 rows from the fixture, language
   toggle, dialog focus management, `scrollWidth == clientWidth` at 320/390/430/1024,
   no `NaN`/`Invalid Date` in the DOM. The axe scan is the M7 gate.
3. **Manual QA** (qa-engineer's card): ±2 min comparison vs Drik Panchang for 3
   cities/dates (M3), real-device geolocation-denied path, 200% zoom, screen
   reader pass using 03-ux §7.5 as the script. Output: `docs/07-test-plan.md` /
   `docs/08-test-report.md`.

## Alternatives considered

- **Vitest/Jest + jsdom**: rejected — a toolchain and dependency tree to test
  ~200 lines of pure arithmetic; `node --test` covers it and keeps the repo
  install-free to run.
- **Playwright as the e2e framework**: acceptable but heavier; the CDP smoke path
  matches what UX already ran and keeps the surface small. Revisit if the smoke
  script grows beyond a few hundred lines.
- **Testing only via QA manual passes**: rejected — R8 demands automated
  table-locking; a human eyeballing 112 slots is exactly the failure mode the
  pinned algorithm warns about (research §5.5 cites a published wrong table).

## Consequences

- `tests/` are the gate behind `make test`; CI blocks merges on red.
- `axe-core` (and the headless browser driver) are **dev-only** dependencies; the
  shipped site stays dependency-free except vendored suncalc (ADR-003).
- The sequence tables live in `tests/` as literal data copied from research §5 —
  if the algorithm ever changes, the tables and the research doc change together
  in one reviewed commit.

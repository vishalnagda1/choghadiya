# tests/ — suite inventory (Choghadiya)

Scaffold for the test suites defined in `docs/05-plan.md` §1 and planned in
`docs/07-test-plan.md`. **This file is a placeholder inventory**: the actual test
files (`tests/*.test.js`) and `tests/fixtures.js` are written by the BE
implementation tickets (`BE-01`..`BE-04`) per the plan's §1 file-ownership rule.
`BE-04` appends the final ticket→test mapping table at the bottom of this file.

## How to run

| Command | Runs | Notes |
|---------|------|-------|
| `make test` | `node --test tests/` | L1 unit + L2 contract suites; also `npm test`. Red-blocking in CI. |
| `make check` | `make test` **+** `node scripts/smoke.mjs` **+** `node scripts/axe-check.mjs` | Full pre-release gate: render smoke, no horizontal scroll, zero `NaN`, axe 0 critical/serious (M7). |
| `make dev` | static server at `http://localhost:8080` | Required by the smoke/axe scripts; also `npm run dev`. |
| `node --test tests/<file>` | one suite | Targeted re-test after a fix. |

Requires **Node ≥ 20 LTS**. No test touches the network: the geocoder suite injects
a mock `fetchImpl`, and the smoke/axe suites run only against the local `make dev`
server. No runtime dependencies; dev-only tooling (`axe-core`, headless Chromium)
is pinned in `package.json` and never ships (`docs/05-plan.md` §1).

## Required suites (per `docs/05-plan.md` §1 / `docs/07-test-plan.md` §6)

| Suite ID | File | Owner | Covers |
|----------|------|-------|--------|
| S-SEQ | `tests/sequences.test.js` | BE-01 | Pinned sequence: 7 weekdays × (8 day + 8 night) = **112 assertions** against research §5.2/§5.3 |
| S-SCHED | `tests/choghadiya.test.js` | BE-01, BE-03 | `buildSchedule` boundaries/continuity, Mumbai 2026-10-14 fixture (03-ux §8), polar/undefined, DST-London, timezone rendering, current-slot |
| S-GEO | `tests/geocoder.test.js` | BE-02 | Geocoder request shaping, debounce/submit-only, cache, abort, error taxonomy (mock `fetchImpl`) |
| S-I18N | `tests/i18n.test.js` | BE-04 | 58-key coverage in both locales (M4 gate), `t()` interpolation, slot-name strings |
| — | `tests/fixtures.js` | BE-01 | Shared fixtures: Mumbai 2026-10-14, polar, DST-London |
| S-SMOKE | `scripts/smoke.mjs` | DO-02 | Headless render smoke: 16 rows, toggle, current highlight, no `NaN`/`Invalid Date`, no horizontal scroll, degradation states |
| S-AXE | `scripts/axe-check.mjs` | DO-02 | axe-core scan; exit non-zero on any critical/serious (M7 gate) |

The full per-test list with expected results and the US-1..US-19 traceability
matrix live in **`docs/07-test-plan.md`** §6 and §9.

## Status

Scaffold only — suites are implemented by the BE/DO tickets listed above. As of
2026-10-14 the repository has no `tests/` files yet (M1 walking-skeleton work is
in flight). Keep this inventory in sync with `docs/05-plan.md` §1; the final
ticket→test mapping is appended here by `BE-04`.

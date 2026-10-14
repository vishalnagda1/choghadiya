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

Suites S-SEQ, S-SCHED, S-GEO and S-I18N are implemented and green (`make test`:
56 tests / 56 pass / 0 fail, ≈0.6 s wall — well inside the 5 s budget). S-SMOKE
and S-AXE are DO-02 tooling and land with that ticket. Keep this inventory in
sync with `docs/05-plan.md` §1 and `docs/07-test-plan.md` §6.

## US-1..US-10 traceability matrix (P0 acceptance criteria → named test)

Appended by **BE-04** (`tests/i18n.test.js` is the M4 i18n gate). Each row names
the exact `test(...)` title that asserts the criterion; a test lives in the file
of its suite (S-SEQ = `tests/sequences.test.js`, S-SCHED = `tests/choghadiya.test.js`,
S-GEO = `tests/geocoder.test.js`, S-I18N = `tests/i18n.test.js`). Criteria whose
verification is inherently end-to-end name the DO-02 script that asserts them
(`scripts/smoke.mjs` / `scripts/axe-check.mjs`) — those are the only non-unit
assertions, and nothing here is verified by hand except the M3 ±2 min panchang
comparison (qa-engineer card).

US-1 (P0) — dynamic day & night schedule
- AC1 8 day + 8 night equal parts sunrise→sunset→next-sunrise (S-SEQ) `each half returns 8 slots, and the 8th slot repeats the 1st (7-name cycle)`; (S-SCHED) `continuity invariant: slot[n].end === slot[n+1].start in both halves (US-1 AC4)`
- AC2 mid-Dec day ≈ 11 h → slot ≈ 82 min (S-SCHED) `day-slot length tracks the real solar day, ≈82 min mid-Dec and ≈98 min mid-Jun (US-1 AC1/AC2/AC3)`
- AC3 mid-Jun day ≈ 13 h → slot ≈ 98 min (S-SCHED) `day-slot length tracks the real solar day, ≈82 min mid-Dec and ≈98 min mid-Jun (US-1 AC1/AC2/AC3)`
- AC4 slot n end === slot n+1 start, no gaps (S-SCHED) `continuity invariant: slot[n].end === slot[n+1].start in both halves (US-1 AC4)`; `the 8 day slots sum to exactly sunset − sunrise (US-1 AC4)`
- AC5 no fixed 06:00/18:00 in the calc path (S-SCHED) `no fixed 06:00/18:00 boundary values exist in the calculation path (US-1 AC5)`

US-2 (P0) — correct 7-name sequence
- AC1 day table research §5.2 (S-SEQ) `daySequence matches the research §5.2 table for all 7 weekdays (56 assertions)`
- AC2 night table research §5.3 (S-SEQ) `nightSequence matches the research §5.3 table for all 7 weekdays (56 assertions)`
- AC3 Sunday slot 1 = slot 8 = Udveg, 8th repeats 1st (S-SEQ) `each half returns 8 slots, and the 8th slot repeats the 1st (7-name cycle)`
- AC4 7 × (8+8) = 112 pinned assertions pass (S-SEQ) `the sequence lock is exactly 7 x (8 day + 8 night) = 112 slot assertions`
- AC5 names map to exactly one of the 7 accepted names (S-SEQ) `tierFor maps every canonical name to its quality tier (04-architecture §4.2)`; (S-I18N) `the 7 canonical slot names have quality.* keys with the exact §6 strings (US-11 AC4)`

US-3 (P0) — date-boundary (sunrise→sunrise) semantics
- AC1 02:00 Thu belongs to Wednesday's night list (S-SCHED) `night half crossing midnight is attributed to its start date, Wednesday (US-3 AC1)`; `resolveCurrentSlot keeps the after-midnight slot in the previous day list (US-14 AC2, US-3 AC1)`
- AC2 weekday of the schedule = weekday of the sunrise that starts D (S-SCHED) `buildSchedule(Mumbai 2026-10-14) is the 03-ux §8 fixture` (asserts `weekday === 3`, Wednesday)
- AC3 "today" is the location's civil date (S-SCHED) `todayIn returns the location civil date, not the device date (US-3 AC3)`

US-4 (P0) — use my current location
- AC1 geolocated coords render with the device timezone (FE-03 integration; DO-02 `scripts/smoke.mjs` renders 16 rows); tz rendering proven by (S-SCHED) `formatTime renders in the location IANA zone, 24-hour, identical in both locales (US-7 AC1)`
- AC2 denied/unavailable → city input, no error wall (see US-8 AC1 below): (S-I18N) `every string matches the 03-ux §6 table verbatim…` (geo.denied); DO-02 `scripts/smoke.mjs` S5 state
- AC3 coordinates never leave the device: geocode requests carry only the typed name — (S-GEO) `request shape: exact §5.2 URL, count=8, language, JSON accept (US-5 AC1)`; `the default fetch can never be reached when fetchImpl is injected`; protocol-level confirmation in `docs/09-security-audit.md`

US-5 (P0) — look up any city
- AC1 submit calls Open-Meteo, shows city/region/country (S-GEO) `request shape: exact §5.2 URL, count=8, language, JSON accept (US-5 AC1)`; `response mapping: §5.2 fields only, missing fields normalised to null`
- AC2 selected result's coords + returned IANA tz are used (S-GEO) `response mapping: §5.2 fields only, missing fields normalised to null`; (S-SCHED) `formatTime renders every slot on the location clock (US-7 AC1)`
- AC3 "London" from India renders Europe/London, not IST (S-SCHED) `DST fixture: London renders GMT before and BST after the spring transition (US-7 AC2)`; `formatTime renders in the location IANA zone, 24-hour, identical in both locales (US-7 AC1)`
- AC4 no per-keystroke requests; submit or ≥400 ms debounce (S-GEO) `debounce: N keystrokes → exactly one request per quiet period (US-5 AC4)`; `searchNow: explicit submit sends immediately, bypassing the debounce`; `searchNow cancels a pending debounced call (submit wins, still one request)`
- AC5 no matches → "no city found", app usable (S-GEO) `empty or absent \`results\` resolves [] — never an error (US-5 AC5, S7)`; (S-I18N) city.noResults in the §6 contract; DO-02 `scripts/smoke.mjs` S7 state

US-6 (P0) — client-side solar computation with pinned library
- AC1 pinned suncalc@2.1.1, no floating "latest", no network for the core calc (S-SCHED) `vendored suncalc 2.1.1 is byte-identical to the pinned checksum and exposes getTimes`
- AC2 upper-limb + refraction convention documented, ±1–2 min accepted (S-I18N) `every string matches the 03-ux §6 table verbatim in both languages` (convention.note string); named tolerance in (S-SCHED) `day-slot length tracks the real solar day…`

US-7 (P0) — correct timezone & DST handling
- AC1 Intl.DateTimeFormat with the location IANA zone (S-SCHED) `formatTime renders in the location IANA zone, 24-hour, identical in both locales (US-7 AC1)`; `formatDate honours the location zone across the +14..-11 range (US-7 AC1)`
- AC2 DST date reflects the correct offset, no fixed UTC offsets (S-SCHED) `DST fixture: London renders GMT before and BST after the spring transition (US-7 AC2)`
- AC3 geolocation uses the device's Intl-resolved timezone (S-SCHED) `todayIn returns the location civil date, not the device date (US-3 AC3)`; `formatTime renders in the location IANA zone…` (FE-03 supplies the device zone)

US-8 (P0) — geolocation denied / unavailable
- AC1 plain-language note + city input, no crash (S-I18N) geo.denied key present verbatim; DO-02 `scripts/smoke.mjs` S5 state; FE-04
- AC2 insecure context falls back without throwing DO-02 `scripts/smoke.mjs` insecure-context path; FE-04

US-9 (P0) — polar / undefined sunrise or sunset
- AC1 clear "not defined" message (S-SCHED) `polar input returns defined:false, reason "solar-undefined", never throws (US-9)`; (S-I18N) undefined.polar / undefined.reason keys present verbatim
- AC2 no NaN / Invalid Date / empty slot row in the DOM DO-02 `scripts/smoke.mjs` (zero NaN/Invalid Date in DOM); unit guard (S-SCHED) `polar input returns defined:false, reason "solar-undefined", never throws (US-9)`

US-10 (P0) — geocode failure / limits
- AC1 clear retry message; last successful location stays usable (S-GEO) `non-2xx maps to GeocoderError{code:"http"} (S6, US-10)`; `a rejected fetch maps to GeocoderError{code:"network"} and keeps the cause`; `errors are never cached, and a later retry can succeed`; (S-I18N) city.error / city.retry keys; FE-04 S6
- AC2 fair use: debounced/explicit submit + cached last result (S-GEO) `per-query cache: one request for repeats, case/whitespace-insensitive (US-10 AC1)`; `supersede: a newer debounced search aborts the in-flight request (US-10 AC2)`

M4 gate — i18n 58-key coverage (US-11 AC3): (S-I18N) `03-ux §6 declares exactly 58 dictionary keys…`, `every 03-ux §6 key exists in both dictionaries (58 keys x 2 languages = 116 assertions)`, `every string matches the 03-ux §6 table verbatim in both languages`, `index.html data-i18n* hooks all resolve to a dictionary key (no copy outside the dictionary)`.

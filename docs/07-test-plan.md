# 07 — Test Plan

Project: **Choghadiya Refactor** · Owner: `qa-engineer` · Date: 2026-10-14 · Version: **v1.0 (initial)**
Card: `t_5fad74cc` (QA-01 · Test plan & test scaffolding)
Inputs: `docs/00-brief.md`, `docs/02-prd.md` (US-1..US-19 + ACs, §3 metrics, §6 NFRs),
`docs/05-plan.md` (§1 structure, §3 tickets, §4 coverage map, §5 DoD),
`docs/03-ux.md` (§6 58-key copy deck, §7 accessibility, §8 Mumbai fixture, §10.1 QC checklist),
`docs/04-architecture.md` (§5 contracts, §8.1 error taxonomy, §10 testing strategy),
`docs/06-threat-model.md` (SEC checklist).

Scope: this document is the **plan** and the traceability contract. Test **implementation**
(`tests/*.test.js`, `tests/fixtures.js`, `scripts/smoke.mjs`, `scripts/axe-check.mjs`) is owned by
the implementation tickets (`BE-01`..`BE-04`, `DO-02`) per `docs/05-plan.md` §1 file-ownership.
The suite inventory lives in `tests/README.md`. This card writes no test code.

---

## 1. Objectives & quality bar

Verify that every MVP acceptance criterion in `docs/02-prd.md` §5 is met, that the product never
renders a broken state (`NaN` / `Invalid Date` / empty slot row), and that the three objective
quality gates are measured, not assumed:

- **M4** — 100 % actionable-string coverage in both EN and HI dictionaries (58 keys, `03-ux.md` §6).
- **M6** — First Contentful Paint < 1.5 s on a mid-range Android over 4G (manual Lighthouse run).
- **M7** — 0 critical/serious axe violations on the shipped page.

Plus the two manual measurements named by the plan: **M3** ±2 min panchang comparison and the
**M6** Lighthouse mobile FCP run (§6 below).

Definition of a passing release: **no open Critical/High bug**, all MVP acceptance criteria pass,
scoreboard in §8 green.

---

## 2. Test levels & tooling (pinned to `docs/05-plan.md` §1)

| Level | Tool / entry point | Suite file | Runs where | Gate |
|-------|--------------------|-----------|-----------|------|
| L1 unit — pure calculation | `node --test` (Node ≥ 20 LTS, zero runtime deps) | `tests/sequences.test.js`, `tests/choghadiya.test.js` | CI + local (`make test`) | every push |
| L1 unit — geocoder client | `node --test` with **injected `fetchImpl`** (never real `fetch`) | `tests/geocoder.test.js` | CI + local | every push |
| L2 contract — i18n coverage | `node --test` | `tests/i18n.test.js` | CI + local | every push (M4) |
| L3 integration — browser render smoke | headless Chromium via CDP, driven by `scripts/smoke.mjs` | `scripts/smoke.mjs` | local + pre-release (`make check`) | pre-release |
| L3 accessibility gate | `axe-core` via `scripts/axe-check.mjs` | `scripts/axe-check.mjs` | local + pre-release (`make check`) | pre-release (M7) |
| L4 manual / exploratory | QA + real browser + real device | this document, §6 | pre-release | QA verdict |

Shared fixtures: `tests/fixtures.js` (BE-owned) provides the Mumbai 2026-10-14 fixture, the polar
fixture, and the DST-London fixture. No suite may invent its own divergent fixture values — the
numbers come from `03-ux.md` §8 and `docs/01-research.md` §5.

**Commands:** `make test` (L1+L2 only), `make check` (L1+L2 + smoke + axe). `npm test` / `npm run dev`
mirror the Makefile targets (`docs/05-plan.md` §1). CI (`.github/workflows/ci.yml`) runs `make test`
on every push/PR and is red-blocking.

### 2.1 Non-negotiable plan rules

1. **No test touches the network.** The geocoder suite injects a fake `fetchImpl`; the smoke and axe
   suites run only against the local static server started by `make dev` (`http://localhost:8080`).
   No suite may fetch `geocoding-api.open-meteo.com`, a CDN, or any external origin. This keeps CI
   hermetic and is a hard requirement (`docs/05-plan.md` §5 item 2; `docs/04-architecture.md` §10).
2. **Fixtures are pinned, not computed ad hoc.** The 7×16 sequence tables are copied verbatim from
   `docs/01-research.md` §5.2/§5.3; the Mumbai numbers from `docs/03-ux.md` §8.
3. **Determinism.** `NOW` is injected/pinned in every test that involves the current slot; the poll
   and debounce are driven by fake timers, never wall-clock sleeps.
4. **Assertions are named** so a failure maps back to a US/AC via the matrix in §9.

---

## 3. Environments & browser/device matrix

| Environment | Definition | Purpose |
|-------------|------------|---------|
| Local dev | `make dev` → `python3 http.server` at `http://localhost:8080`, repo root as document root | smoke + axe + exploratory |
| CI | Node ≥ 20 LTS, `make test`; no network egress assumed | L1+L2 regression on every push |
| Staging / release candidate | GitHub Pages build of the release commit (served locally via `make dev`, then the deployed `https://time.gitick.com/`) | pre-release smoke + manual M6/M3 |
| Real device | one Android phone (mobile-first target) + one desktop | geolocation grant/deny, 200 % zoom, screen reader, touch targets |

Browser/device matrix (`docs/02-prd.md` NFR-B1/B2): Chrome/Edge, Firefox, Safari (incl. iOS Safari),
Android Chrome — latest two major versions; viewports **320, 390, 430, 768, 1024, 1920** px; light and
dark theme (`prefers-color-scheme`). Smoke covers 320/390/430/1024 automatically; the wider set is
covered by the manual pass. Legacy browsers (IE, pre-ESM) are out of scope (NFR-B4).

---

## 4. Entry & exit criteria

**Entry criteria (before the Execute card `docs/08-test-report.md` starts):**

- GATE 1 signed off (done 2026-10-14 — `docs/STATUS.md`), docs 00–06 frozen for the release.
- All M1–M3 plan tickets landed (`DO-01, BE-01, FE-01, FE-02, BE-02, BE-03, FE-03, FE-04, FE-05, DO-02, BE-04`).
- `make test` green locally and in CI on the release commit.
- `make check` green (smoke 16 rows, no horizontal scroll, zero `NaN`; axe exit 0).
- A tagged, frozen release candidate exists (implementation code is not moving during QA).

**Exit criteria (release verdict PASS):**

- Every MVP acceptance criterion either passes an automated test or a named manual check (§9); none is untraced except the two explicitly-manual measurements in §6.
- No open **Critical** or **High** bug; all **Medium** bugs fixed or explicitly waived by the CTO with a documented residual risk.
- M4 (58-key coverage), M7 (axe 0 critical/serious) measured green; M3 (±2 min) and M6 (FCP < 1.5 s) measured and recorded with numbers.
- Whole suite re-run on the exact release commit; regression scope (§5) clean.
- `docs/08-test-report.md` written with the top line `VERDICT: PASS`.

---

## 5. Regression scope

Run on every fix re-test and on the final release commit:

- **Full:** `make test` (all L1+L2 suites) and `make check` (L1+L2 + `scripts/smoke.mjs` + `scripts/axe-check.mjs`).
- **Targeted:** the specific suite(s) named by each fix card in its `parents`, plus the suites that
  share a file with the change (`choghadiya.js` → SCH+SEQ; `geocoder.js` → GEO; `i18n.js`/copy → I18N+SMK;
  DOM/`app.js` → SMK+AXE).
- **Smoke always:** S-SMOKE and S-AXE are mandatory on every re-test regardless of the fix area —
  they catch the two known re-introducible layout/specificity defects from `03-ux.md` §10.
- **Manual spot-check:** the specific state or view touched (e.g. a fix to S6 re-checks S7 and the
  last-location-preserved behaviour).

---

## 6. Named suites with expected results

Suite IDs are stable and used by the traceability matrix (§9).

### S-SEQ — `tests/sequences.test.js` — pinned-sequence lock

The **112-assertion suite**: 7 weekdays × (8 day + 8 night) slots checked against the tables copied
verbatim from `docs/01-research.md` §5.2 (day) and §5.3 (night). Expected: **112/112 pass**.

| Test | Assertions | Expected |
|------|-----------|----------|
| `SEQ-01 day sequence, all 7 weekdays` | 56 (7×8) | day slots per §5.2; 8th slot repeats 1st (e.g. Sunday slot 1 = slot 8 = Udveg) |
| `SEQ-02 night sequence, all 7 weekdays` | 56 (7×8) | night slots per §5.3; Wednesday night = Udveg, Shubh, Amrit, Char, Rog, Kaal, Labh, Udveg |
| `SEQ-03 cycle membership` | 7 | every emitted name ∈ {amrit, shubh, labh, char, rog, kaal, udveg}; `"char"` is the canonical key (US-2 AC5) |

Totals: **112 slot assertions** (US-2 AC4) + the membership check.

### S-SCHED — `tests/choghadiya.test.js` — schedule engine, boundaries, timezone, degradations

| Test | What it proves | US / AC |
|------|----------------|---------|
| `SCH-01 continuity` | `slot[n].end === slot[n+1].start` for day and night (no gap/overlap) | US-1 AC4 |
| `SCH-02 half-length sum` | 8 day slots sum to `sunset − sunrise`; 8 night slots sum to `nextSunrise − sunset` | US-1 AC1 |
| `SCH-03 no hardcoded clock` | day base === computed sunrise; a source scan asserts no `06:00`/`18:00` (or `360`/`1080`-min) constants in the calculation path | US-1 AC5 / M2 |
| `SCH-04 Mumbai 2026-10-14 fixture` | sunrise 06:32, sunset 18:17, next sunrise 06:33 (±1 min); **Wednesday day starts Labh**, **night starts Udveg**; 16 names match `03-ux.md` §8 | US-1, US-2, US-3 |
| `SCH-05 winter day length` | Mumbai mid-Dec day slot ≈ 82 min (≈ 11 h / 8), **not** the legacy 90 min | US-1 AC2 |
| `SCH-06 summer day length` | Mumbai mid-Jun day slot ≈ 98 min (≈ 13 h / 8) | US-1 AC3 |
| `SCH-07 date boundary` | a 02:00 Thursday slot is attributed to **Wednesday's** night list / weekday sequence | US-3 AC1 |
| `SCH-08 weekday of schedule` | weekday = weekday of the **sunrise that starts D**, in the location's civil date | US-3 AC2 |
| `SCH-09 todayIn` | `todayIn(tz)` returns the **location's** civil date, not the device's | US-3 AC3 |
| `SCH-10 polar/undefined` | polar fixture → `{defined:false, reason:"solar-undefined"}`, no throw, sunrise/sunset `null`, **no `Invalid Date`** escaping | US-9 AC1/AC2 |
| `SCH-11 DST-London` | London on a spring-transition date renders the correct offset via IANA (no fixed UTC offsets) | US-7 AC2 |
| `SCH-12 tz rendering` | `formatTime`/`formatDate` use the location's IANA zone, 24-hour in **both** locales | US-7 AC1, US-12 AC2 |
| `SCH-13 current-slot off-today` | `resolveCurrentSlot` returns `null` when the viewed date ≠ today at the location | US-13 AC3, US-14 AC3 |
| `SCH-14 current-slot boundaries` | resolves at exact half/slot boundaries; the night-after-midnight case resolves inside **Wednesday's** night list | US-14 AC1/AC2 |
| `SCH-15 tier mapping` | `tierFor` maps the 7 names to correct tiers (Amrit=most auspicious, Shubh/Labh=auspicious, Char=neutral, Rog/Kaal/Udveg=inauspicious) | US-15 AC1 |
| `SCH-16 addDays` | civil-date arithmetic is tz-safe across a DST change and a month boundary | US-13 AC2 |

### S-GEO — `tests/geocoder.test.js` — geocoder client (mock `fetchImpl`, no network)

| Test | What it proves | US / AC |
|------|----------------|---------|
| `GEO-01 request shaping` | `GET geocoding-api.open-meteo.com/v1/search?name=<encoded>&count=8&language=<lang>` | US-5 AC1 |
| `GEO-02 one request per submit` | exactly one request per explicit submit | US-5 AC4 |
| `GEO-03 debounce` | 400 ms quiet period; never one request per keystroke | US-5 AC4 |
| `GEO-04 bad query` | empty / < 2 chars → `GeocoderError{bad-query}` **with no request sent** | 03-ux S1 |
| `GEO-05 network error` | fetch rejects → `GeocoderError{network}` | US-10 AC1 |
| `GEO-06 http error` | non-2xx → `GeocoderError{http}` | US-10 AC1 |
| `GEO-07 empty results` | absent/`[]` results → resolves `[]` | US-5 AC5 |
| `GEO-08 cache hit` | per-query cache → second call sends no request | US-10 AC2 |
| `GEO-09 abort on supersede` | `AbortController` cancels an in-flight superseded request | US-10 AC2 |
| `GEO-10 mapping` | response mapped to `{name, admin1, country, latitude, longitude, timezone, population}` incl. IANA `timezone` | US-5 AC2 |
| `GEO-11 never Nominatim` | no request is ever issued to a Nominatim origin | ADR-004 |

**Geocoder error taxonomy (the named error → UI-state contract, `04-architecture.md` §8.1):**

| Code | Trigger | Expected UI state | Test |
|------|---------|-------------------|------|
| `bad-query` | empty / < 2 chars after trim | inline `city.required`; no request | GEO-04 |
| `network` | fetch reject / timeout | **S6** `role="alert"` + Retry; last location kept | GEO-05 |
| `http` | non-2xx | **S6** (same) | GEO-06 |
| `geocode-empty` | `results` absent / `[]` | **S7** no-results; sheet stays open | GEO-07 |
| `solar-undefined` | null/Invalid sunrise or sunset (raised by `buildSchedule`) | **S3** not-defined panel; no `NaN` | SCH-10 + SMK-08 |

### S-I18N — `tests/i18n.test.js` — dictionary coverage contract (M4 gate)

| Test | What it proves | US / AC |
|------|----------------|---------|
| `I18N-01 58-key coverage` | **all 58 keys of `03-ux.md` §6 exist in both `hi` and `en`**; no gaps, no extras | M4, US-11 AC3 |
| `I18N-02 interpolation` | `t(key, lang, {n})` substitutes `{n}` (e.g. `city.resultsCount`) | US-11 AC3 |
| `I18N-03 unknown key` | unknown key behaviour is defined (throws in dev/test) | contract |
| `I18N-04 slot names` | the 7 names read exactly `Amrit, Shubh, Labh, Char, Rog, Kaal, Udveg` (en) and `अमृत, शुभ, लाभ, चर, रोग, काल, उद्वेग` (hi) | US-11 AC4 |

Expected: **58/58 keys in each locale**; the M4 gate is green.

### S-SMOKE — `scripts/smoke.mjs` — headless render smoke (L3)

Drives the local static build (`make dev`) with headless Chromium/CDP. Expected: every check passes,
zero console errors, zero `NaN`/`Invalid Date`/`undefined`/empty rows in the DOM.

| Test | What it proves | US / AC |
|------|----------------|---------|
| `SMK-01 render 16 rows` | 8 day + 8 night rows from the Mumbai fixture, each with name + start–end range | US-12 AC1/AC2 |
| `SMK-02 toggle` | EN↔HI flips `<html lang>` (`hi`↔`en`) + all `data-i18n` nodes, no reload, < 100 ms; date relabels | US-11 AC1/AC2/AC5, NFR-P2 |
| `SMK-03 Hindi default` | first load renders Hindi | US-11 AC1 |
| `SMK-04 current highlight` | today fixture: current row has `aria-current="true"` + visible "अभी/Now" badge on the correct slot | US-14 AC1/AC2 |
| `SMK-05 date nav` | ‹ / › re-renders the adjacent date and label; off-today shows no "current" | US-13 AC1/AC2/AC3, US-14 AC3 |
| `SMK-06 non-colour quality` | each row carries a tier word + glyph, distinguishable without colour | US-15 AC1/AC2 |
| `SMK-07 no horizontal scroll` | at 320 / 390 / 430 / 1024 px `scrollWidth === clientWidth` | US-16 AC1/AC3 |
| `SMK-08 no broken values` | no `NaN`, `Invalid Date`, `undefined`, or empty slot row anywhere in the DOM (incl. the polar state) | US-9 AC2 / M5 |
| `SMK-09 degradation states` | **S3, S5, S6, S7** each render their message, and the language toggle still works in every state | US-8, US-9, US-10, US-5 AC5 |
| `SMK-10 keyboard path` | Tab reaches toggle, chip, prev/next, and rows; focus ring visible | US-18 AC2 |
| `SMK-11 semantics` | exactly one `<h1>`; day/night are labelled `<section>`+`<h2>`; controls have accessible names | US-18 AC4 |
| `SMK-12 asset hygiene` | `favicon.svg` loads (200, no console error); asset URLs carry `?v=<ASSET_VERSION>` | US-19 AC3 |
| `SMK-13 console clean` | full load + toggle + nav with zero console errors | US-19 AC2 |
| `SMK-14 disclosure` | privacy one-liner in the sheet + attribution + convention note in the footer | US-17 AC1/AC2, US-6 AC2 |
| `SMK-15 sheet focus` | city `<dialog>` opens with focus in the field, `Esc` closes, focus returns to the chip | US-18 AC2 (03-ux S2) |
| `SMK-16 touch targets` | primary controls ≥ 44×44 CSS px | US-16, NFR-A5 |

### S-AXE — `scripts/axe-check.mjs` — accessibility gate (M7)

| Test | What it proves | Expected |
|------|----------------|----------|
| `AXE-01 axe scan` | `axe-core` on the shipped page | **0 critical/serious** violations; script exits non-zero otherwise (M7, US-18 AC1) |

### Manual / exploratory (L4) — §6

| Test | What it proves | Metric |
|------|----------------|--------|
| `MAN-01 panchang comparison` | **M3**: sunrise/sunset-derived slot boundaries within **±2 min** of Drik Panchang for **≥ 3 cities × dates** | M3, US-6 AC2 |
| `MAN-02 Lighthouse mobile FCP` | **M6 gate**: FCP < **1.5 s**, mid-range Android / 4G throttling | M6, NFR-P1 |
| `MAN-03 real-device geolocation` | grant → slots for device coords + device tz; deny → S5 city fallback, no dead end | US-4 AC1, US-8 |
| `MAN-04 contrast (both themes)` | text pairs ≥ 4.5:1, focus rings ≥ 3:1 in light **and** dark | US-18 AC3, NFR-A3 |
| `MAN-05 screen reader` | current row announces name, time, tier, "now"; `lang` flips pronunciation | US-18, 03-ux §7.3 |
| `MAN-06 privacy/network inspection` | DevTools network log shows **no** analytics/beacons, no coordinates transmitted; only the typed city name to Open-Meteo on an explicit search | US-17 AC3, NFR-PR1/2/3 |
| `MAN-07 200 % zoom / reduced motion` | no clipped content or lost control at 200 % zoom; no animation under `prefers-reduced-motion` | NFR-A6, 03-ux §7.5 |

The `03-ux.md` §7.5 ten-point QC checklist is the script for `MAN-05`/`MAN-07`.

---

## 7. Bug severity taxonomy

Every bug in `docs/08-test-report.md` carries an ID, severity, steps, expected vs actual. Fix cards
are filed for **Critical / High / Medium** (to the owning developer role), and a re-test card is filed
for QA when the verdict is FAIL.

| Severity | Definition | Release impact |
|----------|------------|----------------|
| **Critical** | Core function broken or impossible (no schedule renders), any privacy/security leak (coordinates or PII transmitted, XSS), or a hard crash / dead end. No workaround. | **Blocks release.** Fix + re-test mandatory. |
| **High** | A P0 acceptance criterion fails, or a major flow is broken with only a painful workaround (e.g. a degradation state shows `NaN`, timezone renders in the wrong zone, toggle requires reload). | **Blocks release.** |
| **Medium** | Noticeable defect with a reasonable workaround; non-blocking but should ship fixed (e.g. a missing accessible name, a copy string missing a translation, a layout glitch outside target widths). | Fix before release or CTO-waive with documented residual risk. |
| **Low** | Cosmetic / minor polish that does not affect correctness or access (spacing, a nit in secondary copy). | May ship; log as a follow-up. |

---

## 8. Quality-gate scoreboard (exit needs all green)

| Gate | Metric | Where measured | Expected |
|------|--------|----------------|----------|
| M1 | Algorithm correctness | `S-SEQ` (`SEQ-01..03`) | 112/112 slot assertions pass |
| M2 | Dynamic slots, no hardcoded clock | `S-SCHED` (`SCH-03`) + code inspection | 0 hardcoded boundaries |
| M3 | ±2 min vs mainstream panchang | `MAN-01` | within ±2 min, 3+ cities/dates |
| M4 | Bilingual coverage | `S-I18N` (`I18N-01`) | 58/58 keys in hi + en, 0 fallbacks |
| M5 | No-blocking-path coverage | `S-SMOKE` (`SMK-08`, `SMK-09`) + `S-SCHED` (`SCH-10`) | no `NaN`/`Invalid Date`; S3/S5/S6/S7 all handled |
| M6 | Mobile FCP < 1.5 s | `MAN-02` | measured < 1500 ms |
| M7 | Accessibility | `S-AXE` (`AXE-01`) | 0 critical/serious |
| M8 | Release gate | this plan's exit criteria + GATE 2 | verdict PASS |

---

## 9. Traceability matrix — US-1..US-19 → suite / test

Every acceptance criterion maps to at least one named test. **Nothing is left untraced except the
two explicitly-manual measurements (MAN-01, MAN-02).**

### EPIC A — Schedule computation

| Story / AC | Criterion (abridged) | Planned test(s) |
|------------|----------------------|-----------------|
| US-1 AC1 | 8 day slots sunrise→sunset, 8 night slots sunset→next sunrise, no hardcoded times | `SCH-02` |
| US-1 AC2 | Mumbai mid-Dec day slot ≈ 82 min, not 90 | `SCH-05` |
| US-1 AC3 | Mumbai mid-Jun day slot ≈ 98 min | `SCH-06` |
| US-1 AC4 | consecutive slots touch (no gap/overlap) | `SCH-01` |
| US-1 AC5 | no fixed 06:00/18:00 in the calc path | `SCH-03` |
| US-2 AC1 | day slots match research §5.2 for all 7 weekdays | `SEQ-01` |
| US-2 AC2 | night slots match research §5.3 for all 7 weekdays | `SEQ-02` |
| US-2 AC3 | Sunday day slot 1 = slot 8 = Udveg | `SEQ-01` |
| US-2 AC4 | **112 assertions** (7×16) against the pinned tables pass | `SEQ-01` + `SEQ-02` |
| US-2 AC5 | each name ∈ the 7 accepted names; "Char" canonical | `SEQ-03` |
| US-3 AC1 | 02:00 Thursday belongs to Wednesday's night | `SCH-07` |
| US-3 AC2 | weekday = sunrise's weekday, location civil date | `SCH-08` |
| US-3 AC3 | "today" = location's local date, not device's | `SCH-09` |

### EPIC B — Location & solar data

| Story / AC | Criterion (abridged) | Planned test(s) |
|------------|----------------------|-----------------|
| US-4 AC1 | geolocation grant → device coords + device tz | `MAN-03` + `SMK-01`/`SMK-04` |
| US-4 AC2 | denial → city input + note, no error wall | `SMK-09` |
| US-4 AC3 | coords used on-device only, never transmitted | `MAN-06` |
| US-5 AC1 | submit → Open-Meteo call, results with city/region/country | `GEO-01` + `SMK-09` |
| US-5 AC2 | selected result → coords + returned IANA tz used | `GEO-10` + `SMK-09` |
| US-5 AC3 | "London" from India renders in `Europe/London` | `SCH-12` + `SMK-09` |
| US-5 AC4 | no per-keystroke requests (submit/≥400 ms debounce) | `GEO-02`, `GEO-03` |
| US-5 AC5 | no matches → clear message, app usable (S7) | `GEO-07` + `SMK-09` |
| US-6 AC1 | pinned `suncalc@2.1.1`, no network for core calc | `SCH-04` + `SCH-03` (offline) |
| US-6 AC2 | documented upper-limb convention, ±1–2 min accepted | `MAN-01` |
| US-7 AC1 | times formatted via `Intl` with location IANA zone | `SCH-12` |
| US-7 AC2 | DST date shows the DST offset (IANA) | `SCH-11` |
| US-7 AC3 | geolocation → device `Intl` resolved timezone | `MAN-03` + `SMK-01` |

### EPIC C — Degradations

| Story / AC | Criterion (abridged) | Planned test(s) |
|------------|----------------------|-----------------|
| US-8 AC1 | denial → city input + note, no crash/dead end (S5) | `SMK-09` |
| US-8 AC2 | insecure context → city fallback, no throw | `SMK-09` |
| US-9 AC1 | no sunrise/sunset → clear "not defined" message (S3) | `SCH-10` + `SMK-09` |
| US-9 AC2 | no `NaN`/`Invalid Date`/empty row rendered | `SCH-10` + `SMK-08` |
| US-10 AC1 | geocoder unreachable → retry message, last location usable (S6) | `GEO-05`, `GEO-06` + `SMK-09` |
| US-10 AC2 | fair-use: debounced/submit-only, cached last result | `GEO-02`, `GEO-03`, `GEO-08`, `GEO-09` |

### EPIC D — Bilingual UX

| Story / AC | Criterion (abridged) | Planned test(s) |
|------------|----------------------|-----------------|
| US-11 AC1 | Hindi default on first visit | `SMK-03` |
| US-11 AC2 | toggle updates all strings, no reload, ~100 ms | `SMK-02` |
| US-11 AC3 | every string from the dictionary, no fallback | `I18N-01` + `SMK-02` |
| US-11 AC4 | 7 slot names exact EN/HI | `I18N-04` |
| US-11 AC5 | `<html lang>` flips for screen readers | `SMK-02` |

### EPIC E — Today view & navigation

| Story / AC | Criterion (abridged) | Planned test(s) |
|------------|----------------------|-----------------|
| US-12 AC1 | viewed date + 8 day + 8 night rows with names/times | `SMK-01` |
| US-12 AC2 | each row shows name + time range in the location tz | `SMK-01` + `SCH-12` |
| US-13 AC1 | "next day" shows next date, label updates | `SMK-05` |
| US-13 AC2 | "previous day" steps back without error | `SMK-05` + `SCH-16` |
| US-13 AC3 | no "current" mark off-today | `SMK-05` + `SCH-13` |
| US-14 AC1 | current slot highlighted (today at location) | `SMK-04` + `SCH-14` |
| US-14 AC2 | night-half highlight lands on correct night slot/day | `SCH-14` + `SMK-04` |
| US-14 AC3 | not today → nothing highlighted | `SCH-13` + `SMK-05` |
| US-14 AC4 | highlight refreshes across a slot boundary (≤60 s poll) | `SMK-04` (poll) + `MAN-*` open-app note |
| US-15 AC1 | quality conveyed by text/icon in addition to colour | `SMK-06` + `SCH-15` |
| US-15 AC2 | all three tiers distinguishable without colour | `SMK-06` |

### EPIC F — Quality, delivery & compliance

| Story / AC | Criterion (abridged) | Planned test(s) |
|------------|----------------------|-----------------|
| US-16 AC1 | 360 px: no horizontal scroll, one-handed reach | `SMK-07` + `SMK-16` |
| US-16 AC2 | desktop layout centred/readable | `SMK-07` (1024/1920) + manual |
| US-16 AC3 | usable 320–1920 px | `SMK-07` |
| US-17 AC1 | one-line disclosure about the geocoder call | `SMK-14` |
| US-17 AC2 | attribution line present | `SMK-14` |
| US-17 AC3 | no analytics/PII/coordinates transmitted | `MAN-06` |
| US-18 AC1 | axe: 0 critical/serious | `AXE-01` (M7) |
| US-18 AC2 | keyboard-operable controls with visible focus | `SMK-10`, `SMK-15` |
| US-18 AC3 | contrast ≥ 4.5:1 | `MAN-04` (+ axe colour checks) |
| US-18 AC4 | semantic headings, accessible names | `SMK-11` |
| US-19 AC1 | split static files, no server/key/build step | `SMK-13` + repo inspection |
| US-19 AC2 | works end-to-end at `time.gitick.com/`, no console errors | `SMK-13` + post-deploy smoke (`t_169d64f7`) |
| US-19 AC3 | valid favicon; assets cache-busted | `SMK-12` |
| US-19 AC4 | all MVP ACs pass | this document's exit criteria (§4) |

---

## 10. Deliverables & handoffs

- **This card (`t_5fad74cc`):** `docs/07-test-plan.md` + `tests/README.md` (suite inventory scaffold). No test code.
- **Implementation tickets** (`BE-01..BE-04`, `DO-02`) implement the suites named in §6; §9 is the
  contract they must satisfy, and `BE-04` appends the final ticket→test mapping to `tests/README.md`.
- **Execute card (`docs/08-test-report.md`, QA):** runs the suites + the manual §6 items and produces
  the PASS/FAIL verdict; files fix cards for Critical/High/Medium and a re-test card on FAIL.
- **Blocked-by-QA gates:** M8 / GATE 2 release (`t_169d64f7`) needs the QA verdict and the security
  audit (`docs/09-security-audit.md`) green.

## 11. Revision log

| Version | Date | Author | Change |
|---------|------|--------|--------|
| v1.0 (initial) | 2026-10-14 | qa-engineer | Initial test plan: levels & tooling, environments, entry/exit criteria, regression scope, severity taxonomy, named suites (S-SEQ 112-assertion, S-SCHED fixture/polar/DST, S-GEO error taxonomy, S-I18N M4 gate, S-SMOKE, S-AXE M7 gate), US-1..US-19 traceability matrix. |

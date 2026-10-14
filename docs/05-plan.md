# 05 — Implementation Plan

Project: **Choghadiya Refactor** · Owner: architect · Date: 2026-10-14 · Version: **v1.0 (initial)**
Inputs: `docs/04-architecture.md` (module surface §2.3, contracts §5), `docs/02-prd.md` (US-1..US-19), `docs/03-ux.md` (screens, tokens, copy deck), `docs/00-brief.md` "Release definition" + "Change log" (deploy + versioning constraints, 2026-10-14).
Audience: `cto` (turns tickets into board cards), `tech-lead`, `backend-dev`, `frontend-dev`, `devops-engineer`.

---

## 1. Repository / folder structure

```text
choghadiya/                          # = repo root, deployed verbatim to GitHub Pages
├── index.html                       # FE — shell, CSP meta, landmarks, dialog
├── style.css                        # FE — tokens (03-ux §4.1), responsive bands, [hidden] reset
├── app.js                           # FE — state, orchestration, rendering (DOM only)
├── choghadiya.js                    # BE — pure calculation (Node-importable, no DOM)
├── geocoder.js                      # BE — Open-Meteo client (injectable fetch)
├── i18n.js                          # FE — 58-key hi/en dictionary + t()
├── vendor/
│   └── suncalc-2.1.1.js             # DO — vendored ESM build, byte-copy of npm 2.1.1
├── favicon.svg                      # DO — valid, minimal, emoji-free (PRD Q7)
├── CNAME                            # DO — time.gitick.com
├── package.json                     # DO — name, version 2.1.0 baseline, "type": "module",
│                                    #     scripts.test / scripts.dev, dev-only test deps
├── Makefile                         # DO — make dev / make test / make check
├── .github/workflows/ci.yml         # DO — run make test on every push/PR
├── tests/
│   ├── fixtures.js                  # BE — Mumbai 2026-10-14, polar, DST-London fixtures
│   ├── sequences.test.js            # BE — the 7×16 pinned tables (112 assertions)
│   ├── choghadiya.test.js           # BE — buildSchedule, boundaries, current-slot
│   ├── geocoder.test.js             # BE — debounce/cache/abort/error taxonomy (mock fetch)
│   └── i18n.test.js                 # BE — 58-key coverage contract (M4 gate)
├── scripts/
│   ├── smoke.mjs                    # DO — headless Chromium smoke (render, toggle, no-NaN)
│   └── axe-check.mjs                # DO — axe-core scan, exit non-zero on critical/serious
├── docs/                            # (as per TEAM_CHARTER; STATUS.md append-only)
└── (README.md, CHANGELOG.md, RELEASE_NOTES.md — tech-writer cards, not in this plan)
```

**File-ownership rule:** every ticket below lists the exact files it owns; no two
*parallel* tickets share a file. Sequential tickets may extend a file only after
their dependency is done (stated per ticket).

---

## 2. Milestones

| # | Name | Intent | Exit criteria |
|---|------|--------|---------------|
| **M1** | Walking skeleton | End-to-end first: real `buildSchedule` → 16 slots rendered for a fixed Mumbai fixture, bilingual toggle, `make dev` + `make test` green | 16 rows (8 day + 8 night) render from the computed fixture at 320 px and desktop; EN/HI toggle with `<html lang>` flip; `node --test` green in CI; sequence tables locked |
| **M2** | Location, timezone & degradations | The product becomes location-aware and never breaks: geolocation, city search, city-timezone rendering, all S3/S5/S6/S7 states | Slots for geolocated and searched locations; London renders in `Europe/London`; polar/denied/geocode-error/no-results states each show their message with zero `NaN`/`Invalid Date` |
| **M3** | Accessibility, polish & quality gates | Meet NFR-A/P and the M4/M7 gates: a11y semantics, highlight polling, responsive/dark verification, favicon + cache-busting, full suite | axe 0 critical/serious; keyboard tab-through complete; 60 s highlight refresh; favicon loads; assets carry `?v=`; all tests green |
| **M4** | Release (GATE 2) | Package, tag and deploy | See §4 — a **single pre-existing devops card `t_169d64f7`** (referenced, not duplicated here) |

Milestones are sequential gates, but **within** each milestone the listed tickets
run in parallel lanes (BE ∥ DO ∥ FE) as drawn in §3.2.

---

## 3. Ticket list

Legend: **BE** = backend-dev, **FE** = frontend-dev, **DO** = devops-engineer.
IDs are plan-local; the CTO creates the board cards (except M4's, which exists).

### Milestone M1 — Walking skeleton

#### DO-01 · Repo scaffold, tooling, vendored suncalc, CI
- **Owner:** devops-engineer
- **Files owned:** `package.json`, `Makefile`, `.github/workflows/ci.yml`, `vendor/suncalc-2.1.1.js`, `CNAME`, `.gitignore` (additions)
- **Acceptance criteria:**
  - `make dev` serves the repo root at `http://localhost:8080` with zero installs (python3 http.server); `npm run dev` mirrors it.
  - `make test` / `npm test` runs `node --test tests/` and exits 0.
  - `vendor/suncalc-2.1.1.js` is the verbatim ESM build of npm `suncalc@2.1.1`; `node -e "import('./vendor/suncalc-2.1.1.js').then(m=>console.log(typeof m.getTimes))"` prints `function` (record the tarball source/checksum in the commit message — ADR-003).
  - `package.json` carries `"type": "module"`, scripts `test`/`dev`, and **version `2.1.0`** (the currently released version — the brief requires the next release tag to be a semver bump from 2.1.0, i.e. **v2.2.0**).
  - CI workflow runs `make test` on every push and PR; red tests block.
  - `CNAME` contains `time.gitick.com`.
- **Dependencies:** none. **Parallel with:** BE-01, FE-01.

#### BE-01 · Schedule engine + pinned-sequence test lock
- **Owner:** backend-dev
- **Files owned:** `choghadiya.js`, `tests/fixtures.js`, `tests/sequences.test.js`, `tests/choghadiya.test.js`
- **Acceptance criteria:**
  - Implements the contract of `04-architecture.md` §5.1 (`computeSunTimes`, `buildSchedule`, `daySequence`, `nightSequence`, `tierFor`, `resolveCurrentSlot`, `todayIn`, `formatTime`, `formatDate`, `addDays`) exactly; pure — no DOM/network access.
  - `tests/sequences.test.js` asserts all 7 weekdays × (8 day + 8 night) slots against the research §5.2/§5.3 tables copied verbatim — **112 assertions, all pass** (US-2 AC1–AC4).
  - Continuity invariant holds: `slot[n].end === slot[n+1].start` for both halves; 8 day slots sum to `sunset − sunrise` (US-1 AC4).
  - Mumbai 2026-10-14 fixture matches 03-ux §8 within ±1 min (sunrise 06:32, sunset 18:17, next sunrise 06:33; Wednesday day starts Labh, night starts Udveg) and the night half after midnight is attributed to Wednesday (US-3 AC1).
  - Polar fixture returns `defined:false, reason:"solar-undefined"` with no throw and no `Invalid Date` escaping (US-9).
  - `resolveCurrentSlot` returns `null` for non-today dates and resolves correctly at exact half/slot boundaries (US-13 AC3, US-14).
- **Dependencies:** DO-01 only for the test runner config (can be written in parallel; the first green run needs DO-01). **Parallel with:** DO-01, FE-01.

#### FE-01 · Static shell + design tokens + responsive layout
- **Owner:** frontend-dev
- **Files owned:** `index.html`, `style.css`
- **Acceptance criteria:**
  - `index.html` has the 03-ux §1.1 structure (header, date bar, day/night `<section>`s, footer, `<dialog>` sheet, `<noscript>`), semantic landmarks and exactly one `<h1>` (03-ux §7.1), plus the CSP `<meta>` exactly as `04-architecture.md` §5.3 and `<link rel="icon" href="favicon.svg">`.
  - `style.css` defines every token of 03-ux §4.1 with those exact names/values (light + dark via `prefers-color-scheme` and `[data-theme="dark"]` hook), the §4.3 type scale, §4.4 spacing/radii, §4.5 component classes.
  - Ships the two rendering fixes from 03-ux §10 as requirements: `[hidden]{display:none !important}` reset, and the slot row grid `minmax(0, 1fr) auto auto` with the two-zone collapse band at **≤ 419 px**.
  - Responsive bands per 03-ux §5: no horizontal scroll at 320/390/430 px, two-column day/night at ≥ 900 px, max-width 640→960 px.
  - All interactive controls ≥ 44×44 CSS px; visible focus ring `--focus` on everything; motion wrapped in `prefers-reduced-motion: no-preference`.
  - Opens correctly via `make dev` with zero console errors (skeleton content is static markup).
- **Dependencies:** none. **Parallel with:** DO-01, BE-01.

#### FE-02 · Render + i18n + date navigation (the walking-skeleton integration)
- **Owner:** frontend-dev
- **Files owned:** `app.js`, `i18n.js`
- **Acceptance criteria:**
  - `i18n.js` implements the **58 keys of 03-ux §6 verbatim** for `hi` and `en` plus `t(key, lang, vars)` with `{n}` interpolation; no UI copy exists outside it (US-11 AC3).
  - `app.js` renders 8 day + 8 night slot rows (name both scripts per 03-ux §3 zone 2, 24-hour time range, quality chip with word + glyph, tier word) from `buildSchedule` for a **fixed Mumbai fixture location**; DOM access only inside `init()`/render functions (ADR-002 review check).
  - Language toggle: instant, no reload, `<html lang>` flips `hi`↔`en`, date label re-formats (`hi-IN` / `en-IN`), < 100 ms (US-11 AC1/AC2/AC5, NFR-P2).
  - Date bar ‹ › steps `viewedDate` via `addDays`, label updates, both lists re-render (US-13 AC1–AC2); third-party text (none yet, but the render path for labels) uses `textContent` only (NFR-S2).
  - Quality tier is carried by word + glyph, never colour alone (US-15 AC1).
  - `make test` stays green; `make dev` shows the Mumbai fixture matching 03-ux §8 (Wednesday 2026-10-14: day Labh…Labh, night Udveg…Udveg).
- **Dependencies:** DO-01, BE-01, FE-01.

### Milestone M2 — Location, timezone & degradations

#### BE-02 · Geocoder client (Open-Meteo) with cache, debounce, error taxonomy
- **Owner:** backend-dev
- **Files owned:** `geocoder.js`, `tests/geocoder.test.js`
- **Acceptance criteria:**
  - Implements the §5.1 contract: `geocodeCity(query, {fetchImpl, signal}) -> GeocodeResult[]`; query validation (trim, ≥ 2 chars, ≤ 64) throws `GeocoderError{code:"bad-query"}` **without sending a request** (03-ux S1 validation).
  - Exactly one request per explicit submit or 400 ms quiet period — never per keystroke, never Nominatim (ADR-004, US-5 AC4).
  - Request shape: `GET https://geocoding-api.open-meteo.com/v1/search?name=…&count=8&language=…` with `encodeURIComponent`; response mapped to `GeocodeResult {name, admin1, country, latitude, longitude, timezone, population}` (§5.2).
  - Per-query in-memory cache (Map) and `AbortController` cancel of superseded requests (US-10 AC2).
  - Errors: network/non-2xx → `GeocoderError{code:"network"|"http"}`; empty/absent `results` → resolves `[]` (US-5 AC5, US-10 AC1).
  - `tests/geocoder.test.js` (mock `fetchImpl`) covers: request shaping, debounce/submit-only, cache hit, abort on supersede, all error codes. All green.
- **Dependencies:** BE-01 (contract/tooling). **Parallel with:** BE-03.

#### BE-03 · Timezone, civil-date & current-slot helpers
- **Owner:** backend-dev
- **Files owned:** `choghadiya.js` (extends BE-01's file after it lands), `tests/choghadiya.test.js` (extends)
- **Acceptance criteria:**
  - `formatTime`/`formatDate` format with `Intl.DateTimeFormat` using the **location's** IANA `timeZone` (24-hour in both locales); no fixed-offset math anywhere (US-7 AC1, ADR-005).
  - `todayIn(timeZone)` returns the location's civil date — geolocation far from the device tz resolves "today" at the location (US-3 AC3).
  - DST fixture passes: London times on a spring-transition date render with the correct offset (US-7 AC2).
  - `resolveCurrentSlot(schedule, now)` handles the night-after-midnight case: 02:00 Thursday resolves inside **Wednesday's** night list when that schedule is viewed (US-14 AC2, 03-ux §8 fixture crosses midnight).
  - All tests green; no behaviour change to BE-01's sequence tests.
- **Dependencies:** BE-01. **Parallel with:** BE-02.

#### FE-03 · Geolocation flow + city search sheet + location chip
- **Owner:** frontend-dev
- **Files owned:** `app.js` (extends FE-02's file after it lands), `index.html` (sheet internals), `style.css` (sheet/ chip styles)
- **Acceptance criteria:**
  - Geolocation requested **after first paint** (never blocking); on grant, slots render for device coords with device IANA tz (US-4 AC1/AC3); skeleton state S4 shown while resolving.
  - Location chip opens `<dialog>` via `showModal()` (focus containment/Esc for free); focus lands in the city field on open and returns to the chip on close (03-ux S2, US-18 AC2).
  - City submit (Enter / Search button) calls `geocodeCity`; result rows show `name, admin1, country` **and the city's local time**, inserted via `textContent`/`createElement` only (US-5 AC1, NFR-S2); the privacy one-liner is visible in the sheet (US-17 AC1).
  - Selecting a result stores `lat/lon/timezone/label`, re-renders all times in the **city's** clock, redefines "today" as the city's local date, closes the sheet (US-5 AC2/AC3, US-7).
  - Chip shows the location label with a ✕ clear affordance (`aria-label` from the dictionary).
  - No request per keystroke is possible through this UI (delegates to BE-02's debounce).
- **Dependencies:** FE-02, BE-02.

#### FE-04 · Degradation states (never break)
- **Owner:** frontend-dev
- **Files owned:** `app.js`, `index.html`, `style.css` (state blocks)
- **Acceptance criteria:**
  - **S3** (US-9): `defined:false` replaces both lists with the bilingual not-defined message; date bar stays live; **no `NaN`, `Invalid Date`, `undefined`, or empty slot row ever reaches the DOM** (assertable via `scripts/smoke.mjs` later).
  - **S5** (US-8): geolocation denied/unavailable/insecure context → `role="status"` notice "Location unavailable — enter a city" + city input; no error wall; app stays usable.
  - **S6** (US-10): geocode failure → `role="alert"` + Retry that re-submits the same query; last successful location stays rendered behind the sheet.
  - **S7** (US-5 AC5): no results → "No city found — check the spelling"; field keeps its value; sheet stays open.
  - Empty state (`empty.noLocation`) when no location has ever been chosen; date bar + city field remain.
  - Every message comes from the dictionary in both languages; language toggle still works in every state (03-ux F4 step 4).
- **Dependencies:** FE-03, BE-03.

### Milestone M3 — Accessibility, polish & quality gates

#### FE-05 · Accessibility semantics, disclosure & live highlight
- **Owner:** frontend-dev
- **Files owned:** `app.js`, `index.html`, `style.css`
- **Acceptance criteria:**
  - Current slot: `aria-current="true"` + visible "अभी / Now" badge; accessible name reads name, time range, tier, current state (03-ux §7.3); highlight refreshes on a **≤ 60 s, visibility-aware poll** and never goes stale (US-14 AC4, PRD Q2 default).
  - Slot rows are `<button>`s with `aria-expanded` toggling the inline meaning line (`meaning.*` keys); `<ol>`/`<li>` semantics per 03-ux §4.5.
  - Live regions: `aria-busy` on lists while loading, `role="status"` for S5/loading/results count, `role="alert"` for S6 (03-ux §7.3 split).
  - Keyboard: full tab order (03-ux §7.2), `Alt+←`/`Alt+→` date shortcuts, no keyboard trap, focus never moved except sheet open/close.
  - `lang` flips on toggle; decorative glyphs `aria-hidden="true"`; placeholder never the only label (US-18 AC4).
  - Reduced-motion honoured; 200% zoom without clipping (NFR-A6).
  - All of US-18 AC1–AC4 demonstrable by the DO-02 axe + smoke scripts.
- **Dependencies:** FE-04, BE-03.

#### DO-02 · Favicon, cache-busting, smoke + axe tooling, perf budget check
- **Owner:** devops-engineer
- **Files owned:** `favicon.svg`, `scripts/smoke.mjs`, `scripts/axe-check.mjs`, `package.json` (devDependencies, `ASSET_VERSION`-related scripts), `Makefile` (check targets)
- **Acceptance criteria:**
  - `favicon.svg` is valid SVG, minimal, **emoji-free** (PRD Q7, US-19 AC3); loads with 200 and no console error.
  - Cache-busting: `index.html` asset URLs carry `?v=<ASSET_VERSION>` where `ASSET_VERSION` equals the `package.json` version (2.1.0 baseline → bumped at release); documented bump procedure in the Makefile target comment (US-19 AC3, research R7).
  - `make check` runs: `make test` + `node scripts/smoke.mjs` (16 rows render from the Mumbai fixture; EN toggle flips `html lang` + all `data-i18n`; no horizontal scroll at 320/390/430/1024 via CDP `Emulation.setDeviceMetricsOverride`; zero `NaN`/`Invalid Date` in the DOM) + `node scripts/axe-check.mjs` (axe-core; **exit non-zero on any critical/serious violation** — the M7 gate).
  - Dev-only deps are pinned in `package.json` and never referenced from shipped files; the shipped site keeps `script-src 'self'` true.
  - Perf budget recorded: total shipped JS < 60 KB min+gzip (NFR-P3) and an FCP measurement note for the M6 gate (Lighthouse mobile run documented for QA).
- **Dependencies:** DO-01, FE-05 (needs the finished DOM to scan). **Parallel with:** BE-04.

#### BE-04 · Release-gate test suite completion
- **Owner:** backend-dev
- **Files owned:** `tests/**` only
- **Acceptance criteria:**
  - Full suite green in CI and locally: 112 sequence assertions, fixture/DST/polar/current-slot suites, geocoder suite, i18n 58-key coverage contract (M4 gate).
  - Every P0 acceptance criterion of US-1..US-10 is traceable to a named test (mapping table appended to `tests/README.md` — plain text is fine); nothing is asserted only manually except M3's ±2 min panchang comparison (QA card).
  - `make test` runtime < 5 s (keeps CI honest); no network access in any test.
- **Dependencies:** BE-02, BE-03. **Parallel with:** FE-05, DO-02.

### Milestone M4 — Release (GATE 2)

> **The release is ONE pre-existing devops card: `t_169d64f7` (assignee
> `devops-engineer`), gated behind GATE 2.** This plan deliberately does **not**
> invent a separate publish step. Per the client-authorized release definition in
> `docs/00-brief.md` (2026-10-14 change log):

- **Deploy target:** `github.com/vishalnagda1/choghadiya` (`main`), deployed
  directly via the authenticated `gh` CLI (user `vishalnagda1`, repo + workflow
  scopes) to GitHub Pages at `https://time.gitick.com/`.
- **Versioning:** every release MUST carry a git tag with a semver bump from
  `package.json` **2.1.0** — the next release is **v2.2.0** (tag `v2.2.0`,
  `package.json` version `2.2.0`, `ASSET_VERSION` bumped in the same commit so
  `?v=2.2.0` busts the Pages cache).
- **GATE 2 prerequisites (not this plan's tickets):** QA release verdict
  (`docs/08-test-report.md`, all MVP ACs pass incl. M3 ±2 min manual comparison)
  and the security audit (`docs/09-security-audit.md`, NFR-S5) are green.
- **In-card acceptance criteria (restated for the card owner):**
  - `make check` green on the release commit; working tree clean.
  - `package.json` = `2.2.0`, git tag `v2.2.0` pushed, changelog/release notes
    linked (tech-writer card).
  - `gh` CLI deploy to `vishalnagda1/choghadiya` `main` succeeds; Pages build
    serves `https://time.gitick.com/` with no console errors, 16 rows, working
    toggle, valid favicon, fresh assets (cache-busted URL observed).
  - Post-deploy smoke recorded in `docs/STATUS.md`.
- **Plan-ticket dependencies for `t_169d64f7`:** all of M1–M3 done (DO-01, BE-01,
  FE-01, FE-02, BE-02, BE-03, FE-03, FE-04, FE-05, DO-02, BE-04) + GATE 2.

---

## 3.2 Parallel lanes (what can run at the same time)

```text
M1:   DO-01 ─┐
      BE-01 ─┼─→ FE-02 (integration) ──┐
      FE-01 ─┘                          │
M2:                 BE-02 ─┐            │
                    BE-03 ─┼─→ FE-03 ─→ FE-04 ─┐
                           │   (dep: FE-02)     │
M3:                        │        FE-05 ─┐    │
                           │        BE-04 ─┼─→ DO-02 ─┐
                           │               │          │
M4:                        └───────────────┴──────────┴─→ t_169d64f7  [GATE 2]
```

Rules encoded above: BE owns `choghadiya.js`/`geocoder.js`/`tests/`; FE owns
`index.html`/`style.css`/`app.js`/`i18n.js`; DO owns tooling/vendor/assets. The
only cross-time file extensions are FE-03/FE-04/FE-05 continuing `app.js` after
FE-02, and BE-03 extending `choghadiya.js` after BE-01 — both sequenced by
dependencies, never parallel.

---

## 4. Coverage map (PRD stories → tickets)

| Story | Tickets | Story | Tickets |
|-------|---------|-------|---------|
| US-1 dynamic schedule | BE-01, FE-02 | US-11 language toggle | FE-02, FE-05 |
| US-2 pinned sequence | BE-01 (BE-04) | US-12 today view | FE-01, FE-02 |
| US-3 date boundary | BE-01, BE-03 | US-13 prev/next dates | FE-02 |
| US-4 geolocation | FE-03 | US-14 current-slot highlight | BE-03, FE-05 |
| US-5 city lookup | BE-02, FE-03 | US-15 quality w/o colour | FE-01, FE-02 |
| US-6 suncalc pinned | DO-01, BE-01 | US-16 responsive | FE-01 |
| US-7 timezone/DST | BE-03, FE-03 | US-17 privacy/attribution | FE-01, FE-02, FE-03 |
| US-8 geo denied | FE-04 | US-18 WCAG 2.2 AA | FE-05, DO-02 |
| US-9 polar/undefined | BE-01, FE-04 | US-19 static delivery | DO-01, DO-02, `t_169d64f7` |
| US-10 geocode failure | BE-02, FE-04 | | |

NFR gates: M4 (i18n coverage) → `tests/i18n.test.js` (BE-04); M6 (FCP) → DO-02
measurement + QA Lighthouse; M7 (axe) → DO-02 `make check`; M8 (release) → GATE 2
+ `t_169d64f7`.

---

## 5. Definition of done (per ticket)

1. Owned files exist, are internally consistent with `04-architecture.md` §5
   contracts and 03-ux §4.1/§6 (exact token and dictionary keys).
2. `make test` (and `make check` where applicable) green; no test touches the network.
3. Nothing claimed untested: acceptance criteria are verified by a command or a
   measured render, and the verification is named in the ticket's completion.
4. Commit with the ticket id (`feat(scope): … [t_xxxx]`), and one line appended to
   `docs/STATUS.md`.

## 6. Explicit non-goals of this plan

- No countdown timer, shareable URLs, favourites, PWA/offline, notifications,
  panchang detail, Rahu Kaal, Gujarati (PRD §4.2/§8) — do not start them.
- No Nominatim implementation (ADR-004), no webfonts, no framework, no bundler.
- README/CHANGELOG/RELEASE_NOTES and `docs/07/08/09` are other roles' cards
  (tech-writer, qa-engineer, security-engineer) and are not duplicated here.

## 7. Revision log

| Version | Date | Author | Change |
|---------|------|--------|--------|
| v1.0 (initial) | 2026-10-14 | architect | M1–M4 milestones, 11 plan tickets + referenced release card `t_169d64f7`, file-ownership lanes, US coverage map. |
| v1.0.1 | 2026-10-14 | architect | Folded in CTO release constraints (t_8347643d, client-authorized): gh CLI deploy to `vishalnagda1/choghadiya` (main) → Pages `time.gitick.com`; semver tag from package.json 2.1.0, next release v2.2.0; M4 references the single pre-existing devops card `t_169d64f7` behind GATE 2 instead of a separate publish step. |

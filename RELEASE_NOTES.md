# Release Notes — Choghadiya

**Current release: v2.3.2 (2026-10-14).** Previous release: v2.3.1. This file
describes the current release in full; the v2.3.1 and v2.3.0 notes are kept below (and in
full in git history and [CHANGELOG.md](CHANGELOG.md)).

---

## v2.3.2 — 2026-10-14 (current)

**Release:** v2.3.2 (semver *patch* on the v2.3.1 baseline)
**Date:** 2026-10-14
**Target:** GitHub Pages — <https://time.gitick.com/>
**Deploy runbook:** [docs/DEPLOY.md](docs/DEPLOY.md)

### What this release is

Date-bar polish. Beyond the calendar and the › button below, the app is
**unchanged from v2.3.1**.

### Changed

- **A calendar that matches the app.** Tapping the date opens a calendar right
  under it, in the app's own colours and fonts, in light or dark mode, with Hindi
  or English day and month names. Only the selectable ±10 days can be picked;
  today is ringed and the date you're viewing is highlighted. It works with the
  keyboard (arrow keys, Home/End, Page Up/Down, Enter, Esc) and closes when you
  tap outside it.
- **The › button stays put.** On wider screens the "आज / Today" button now sits
  between the date and ›, so › no longer jumps left when Today appears.

### Fixed

- The date picker now opens on phones (in v2.3.1 a tap on touch screens did not
  open it).
- The calendar no longer opens off to one side of the date on wide screens.

### Verification

`make check` exit 0 — tests 108/108, security greps 0 hits, smoke 69/69, axe PASS
(including the open calendar). Shipped JS 59.8 KB gzip, under the 60 KB budget.

---

## v2.3.1 — 2026-10-14 (previous release)

**Release:** v2.3.1 (semver *patch* on the v2.3.0 baseline)
**Date:** 2026-10-14
**Target:** GitHub Pages — <https://time.gitick.com/>
**Status:** **published** — client-approved at GATE (`t_3b2c54e5`); annotated tag
`v2.3.1` created on the post-gate HEAD `f8d8690`, pushed to
`vishalnagda1/choghadiya` `main` (fast-forward `1404f63..f8d8690`, no force),
GitHub Release `v2.3.1` published (Latest), GitHub Pages rebuilt for `f8d8690`
and the deployed build verified live (see *Post-deploy verification* below and
[docs/releases/v2.3.1-publish-staged.md](docs/releases/v2.3.1-publish-staged.md)).
**Deploy runbook:** [docs/DEPLOY.md](docs/DEPLOY.md)

### What this release is

A small, client-requested copy tidy-up plus one bug fix. Beyond the three removed
copy lines and the picker fix below, the app is **unchanged from v2.3.0**:
12-hour by default with a 24-hour toggle, the ±10-day calendar picker, the
inauspicious periods (Vaar Vela / Kaal Vela / Kaal Ratri), the choghadiya detail
panel, and browser-local `localStorage` settings + a 24 h search cache.

### Removed

- **The privacy disclosure line.** This sentence appeared in **two** places —
  the page footer **and** the location search sheet; **both are gone**:

  > Your searched city name is sent to Open-Meteo to find coordinates. No server
  > storage — settings stay in this browser with no expiry; recent searches and
  > cached results expire after 24 hours.

- **The "No account · no tracking · no backend" footer note.**
- **The date-picker range hint** ("You can pick from 10 days before to 10 days
  after today"). The **±10-day selectable range itself is unchanged** — the
  picker still accepts any date from 10 days before to 10 days after today; only
  the explanatory hint text was removed.

### Deliberately kept — the licence credit

The geocoder attribution credit **stays** in the footer:

> Location search by Open-Meteo · Data from GeoNames · CC BY 4.0

with its three licence links (Open-Meteo, GeoNames, CC BY 4.0). Open-Meteo's and
GeoNames' **CC BY 4.0** terms require attribution while their data is displayed,
so this single footer credit is the licence-required minimum and is **not** part
of the removal — there is no lawful version of this app without it.

### Fixed

- **The date picker now opens.** Tapping the displayed date previously did not
  bring up the calendar. Tapping it now opens the browser's **native calendar
  picker**, and choosing a date updates the day/night lists and the
  inauspicious-periods block for that date. The ±10-day range, the `‹ / ›` and
  `Alt + ← / →` navigation, the keyboard path and the no-location disabled state
  are unchanged.
  *(Date pickers are supplied by the browser: the calendar is the operating
  system's own UI, so its exact appearance — and whether it needs a direct tap on
  the date — varies a little by browser.)*

### How to run

Unchanged:

- `make dev` — serve the repo root locally at <http://localhost:8080>.
- `make check` — the full quality gate (unit/contract tests + security greps +
  headless render smoke + axe-core accessibility scan).

### Verification & known issues

- The v2.3.1 gate was re-run green on the release commit `f8d8690` by the publish
  card (`t_ac3060ad`) — `make check` **exit 0**: tests **108/108** (incl. the i18n
  contract at **119 keys / 238 assertions**), security greps **0 hits / 4 gates**,
  smoke **67/67**, axe **PASS** (5 states). The independent QA verdict is
  **PASS-WITH-KNOWN-ISSUES** (no open Critical/High/Medium; one Low *documentation*
  finding, `QA231-F1`, already fixed by `t_5bcedccd`) —
  [docs/08-test-report.md](docs/08-test-report.md) §15; the security sign-off is in
  [docs/09-security-audit.md](docs/09-security-audit.md). Registry: shipped JS
  186.1 KB raw / 59.0 KB gzip (NFR-P3 budget 60 KB).
- **Known issues carried from v2.3.0** (still true on v2.3.1; none is a code
  defect):
  1. **±1–2 min vs a printed panchang.** Expected; `suncalc` uses the upper-limb +
     refraction convention (QA measured a max **1 min** delta for the three new
     periods vs live Drik Panchang).
  2. **English slot-name spellings.** `Labh / Amrit / Kaal / Char / Rog / Udveg /
     Shubh` are deliberately shorter than Drik Panchang's long forms — a product
     decision fixed by the PRD and the UX spec.
- Post-release verification still open (not defects): the real-device geolocation
  *grant* path and a live screen-reader pass.

#### Post-deploy verification (v2.3.1, deployed URL)

Executed by the publish card (`t_ac3060ad`) against the live
<https://time.gitick.com/> after the v2.3.1 push and the Pages rebuild:

| Check | Result |
|-------|--------|
| Pages build for the release commit `f8d8690` | **built** (GitHub Pages API: `status=built`, `duration=83 161 ms`, no error) |
| Tag on the remote | `refs/tags/v2.3.1` → annotated object `793b217…` → commit `f8d8690` |
| Deployed assets | `favicon.svg`, `style.css`, `app.js`, `choghadiya.js`, `inauspicious.js`, `i18n.js`, `geocoder.js`, `session-store.js`, `vendor/suncalc-2.1.1.js` — **all HTTP 200** at `?v=2.3.1`, none versionless |
| Deployed bytes are the release tree | SHA-256 of all 10 served files **byte-identical** to the repo at the tagged commit (e.g. `app.js` `0201b2bb…02eb`, `index.html` `2a1fabc1…52d9`) |
| Removed copy gone from the served DOM | **0 hits** in the served `index.html` / `i18n.js` / `app.js` (static, JS-off) **and** in the live DOM for the removed `privacy.line` sentence, the "No account · no tracking · no backend" note and the date-picker range hint — **in both Hindi (default) and English**, including the location sheet that carried the second `privacy.line` render site |
| Attribution credit kept | footer credit present live in both languages with its **3 anchors** (open-meteo.com / geonames.org / creativecommons.org/licenses/by/4.0/), each `rel="noopener noreferrer" target="_blank"` |
| Date picker opens live | location "Mumbai" selected via a real geocoder search → `#datepicker` enabled with `min=2026-10-04 / max=2026-10-24 / value=2026-10-14` (today ∓10); a **trusted** click on the field called `showPicker()` **once** with `ok: true`; a `change` to `2026-10-16` re-rendered the label and the 16 slot rows |
| Console errors | **0** on a fresh load (listeners installed pre-navigation) and after the picker commit |
| M6 mobile FCP gate (Lighthouse 12.8.2, mobile + simulated throttling) | **1420 / 1131 / 904 ms** over 3 runs → **max 1420 ms < 1500 ms gate: PASS**; LCP 1.54/1.28/1.28 s, TBT 10/0/0 ms, CLS 0/0.084/0.084, performance score 1.00/0.98/0.98. This closes the re-measure that v2.3.0 carried as known. |

Full record, commands and rollback: [docs/releases/v2.3.1-publish-staged.md](docs/releases/v2.3.1-publish-staged.md).

---

## v2.3.0 — 2026-10-14 (previous release)

> **Historical.** Superseded by v2.3.1 (2026-10-14), which removed the
> `privacy.line` disclosure, the "no account · no tracking · no backend" footer
> note and the date-picker range hint (the CC BY 4.0 credit deliberately stays),
> and fixed the date picker not opening. The notes below describe v2.3.0 as it
> shipped.

> **Versioning note.** The package baseline was `2.2.0`; v2.3.0 was cut as
> **`v2.3.0`** with the release step bumping `package.json` to `2.3.0`, updating
> every asset `?v=` token, re-running the full `make check` gate green on the
> release commit, and creating the annotated tag `v2.3.0` in the same commit.

> **Earlier release notes.** v2.2.0 notes are preserved in git history and in
> [CHANGELOG.md](CHANGELOG.md).

### What v2.3.0 was

The **v2.3.0 feature wave** on top of the v2.2.0 refactor. It made the clock
**12-hour by default** with a toggle, reworked date selection into a **calendar
picker (±10 days)**, added a **manually re-triggerable location button**, computed
and explained the **inauspicious periods** (Vaar Vela / Kaal Vela / Kaal Ratri),
added a **choghadiya detail panel** explaining each slot, and — for the first time
— **persisted settings and cached geocode results in the browser** (`localStorage`:
settings survive a full browser restart; the geocode cache keeps a 24 h TTL). That
last item relaxed the v2.2.0 "no storage ever" stance to **"no server storage;
local TTL-gated cache only"**.

### Highlights

- **12-hour by default (new), 24-hour on demand.** Every time reads `06:32 am`;
  a header 12h/24h toggle switches the whole app to `06:32` instantly, and the
  choice is remembered across browser restarts.
- **Calendar date picker (±10 civil days).** The date label itself is the picker;
  any date from 10 days before to 10 days after the viewed location's today,
  clamped at the edges. `‹ / ›`, `Alt + ← / →` and the polar escape hatch all
  share the same clamp.
- **"Use my current location" button.** A button inside the location sheet
  re-triggers geolocation on demand — handy after a denial or when switching back
  to the device fix. Its own denied/timeout state is reported inline in the sheet.
- **Inauspicious periods, explained.** **Vaar Vela**, **Kaal Vela** and **Kaal
  Ratri** are computed for the selected date and location and listed below the
  slot lists with their ranges and a one-line explanation. Definitions follow the
  verified research tables (§11 — Vaar Vela is *not* Yamagandam, Kaal Ratri is
  *not* Rahu Kaalam on 6 of 7 weekdays). A cross-midnight period carries the
  civil-date suffix; Saturday's legitimate double periods render in full. The UI
  states these are traditional beliefs, not astronomical facts.
- **Choghadiya detail panel.** Below the periods block, a card shows the shown
  slot's meaning, what it is good for, what to avoid, a day/night nuance and a
  contextual note. It defaults to the **current** slot; tapping another row
  selects it, tapping it again (or reloading) returns to the current slot. If an
  inauspicious period overlaps the shown slot, the panel warns and **names it**.
- **Remembers your settings, caches your searches.** Time format, language and
  last location survive a **reload and a full browser restart**; successful city
  searches are cached for **24 hours** so a repeat search or reload does not
  re-hit the geocoder. Settings never expire; cached searches expire after 24 h.
  All of it is browser-local `localStorage` — **nothing is ever sent to a
  server**.
- **Everything from v2.2.0 still held.** Real solar timings, location awareness
  with correct IANA timezone/DST rendering, bilingual Hindi-default UI (then
  **122 keys**; **119 keys as of v2.3.1**), colour-independent quality tiers, the
  current-slot highlight, graceful degradations, and the WCAG 2.2 AA / responsive
  baseline.
- **Attribution reduced, not removed — and linked.** Full removal of the
  geocoder attribution would breach Open-Meteo's and GeoNames' CC BY 4.0 terms, so
  v2.3.0 kept **one minimal footer credit** ("Location search by Open-Meteo ·
  Data from GeoNames · CC BY 4.0") and rewrote the privacy line to the new
  storage stance. The three key words were **real hyperlinks** — `Open-Meteo` →
  open-meteo.com, `GeoNames` → geonames.org, `CC BY 4.0` →
  `creativecommons.org/licenses/by/4.0/` — each with
  `rel="noopener noreferrer" target="_blank"`, built with DOM APIs only (never
  `innerHTML`). *(The rewritten `privacy.line` half of this bullet was **removed
  in v2.3.1**; the CC BY 4.0 credit half stays.)*

### Notable fixes (v2.3.0)

- **Geocode cache wiring (item 7b).** The 24 h geocode cache shipped in code but
  `app.js` initially never handed the cache store to the geocoder, so repeat
  searches still refetched. The cache store is now injected — verified live: the
  cache survives a reload and a repeat query sends no request.
- **CI/gate honesty carried forward** from v2.2.0: the SEC-05/03/14 source greps
  now include a **SEC-STORAGE** gate (web-storage tokens allowed only in
  `session-store.js`), so the new storage path is held to the same standard.

**Fix wave (the GATE 2 rev 2 delta).** After the first gate, the client confirmed
item 7 as `localStorage`, and the QA-1 / SEC-1 findings from both gate reports were
fixed on `main`:

- **Item-7 scope flipped `sessionStorage` → `localStorage`** (client-confirmed):
  settings now survive full browser restarts with **no expiry**; the geocode cache
  keeps its **24 h TTL** (F2 / SEC F9).
- **Privacy disclosure reworded** so it stays truthful under `localStorage` — the
  now-false "only in this browser tab" claim is gone, and the copy discloses
  settings-no-expiry plus the 24 h cache TTL (F9). *(This disclosure line was
  removed entirely in v2.3.1.)*
- **Attribution credit rendered with 3 live licence links** (SEC F8, above).
- **Overlap-warning copy made tier-neutral** — no longer calls an inauspicious
  slot "otherwise-good" (QA F3).
- **Geocode-cache read path re-validates persisted entries** — a tampered/legacy
  entry can no longer blank the render (SEC F10).
- **Every internal module specifier carries `?v=`** — no unversioned module edge
  (SEC F12).
- **Architecture doc corrected** — §16.2/§16.3 match the shipped key layout and
  `createGeocoder` signature (QA F5).
- **Gate honesty:** the SEC-14 origin allow-list gains exactly three **link-only**
  licence hosts with a non-`href` guard, and the smoke gate now asserts every
  internal specifier has a `?v=` token.

### Known issues & limitations (v2.3.0)

> **Reconciliation.** The GATE 2 rev 2 fix wave landed on `main` after the first
> gate: the client confirmed item 7 as `localStorage`, the attribution credit was
> rendered with links, and QA-1 / SEC-1 findings **F2, F3, F4, F5, F8, F9, F10 and
> F12 were all fixed** (see *Notable fixes* above). Those findings are therefore
> **moved out of this section** — they are fixed on `main` and **cleared by QA-2's
> re-test verdict**, [docs/08-test-report.md](docs/08-test-report.md) §14 (**PASS**,
> no open Critical/High/Medium) and the SEC-1 delta re-sign-off,
> [docs/09-security-audit.md](docs/09-security-audit.md) (**PASS-with-accepted-risks**,
> 0 Critical / 0 High / 0 Medium).
> The gate was green on the post-wave tree — `make check` **exit 0** at HEAD
> `61282a8` (tests 108/108, greps 0 hits/4 gates, smoke 67/67, axe PASS 5 states).
> No QA finding remained open above Informational; the informational residuals
> (F13/F14/F15) are carried to the post-release backlog.

Remaining known issues (no open code defect; both are product decisions, not bugs):

1. **±1–2 min vs a printed panchang.** Expected and disclosed in the UI footer;
   suncalc uses the upper-limb + refraction convention (also verified by QA-1
   MAN-01 M3: max **1 min** delta for the three new periods vs live Drik Panchang).
2. **English slot-name spellings.** `Labh / Amrit / Kaal / Char / Rog / Udveg /
   Shubh` are deliberately shorter than Drik Panchang's long forms — a product
   decision fixed by [docs/02-prd.md](docs/02-prd.md) US-2 AC5 / US-11 AC4 and
   [docs/03-ux.md](docs/03-ux.md) §6.

Items carried from v2.2.0 that remain open as post-release verification (not
defects): the real-device geolocation *grant* path (MAN-03) and a live
screen-reader pass (MAN-05); the city-sheet loading/`recent cities` polish was
formally **cut** at the v2.2.0 GATE 2 and remains on the post-release backlog.
QA-1's residual risks for v2.3.0 are in docs/08 §13.8 (item-7b hit/expiry paths
rest on smoke + unit tests; no real-device geolocation; no real screen reader; the
M6 Lighthouse FCP is owned by the release/publish step). Carried into the wave by
DO-FIX: the axe gate is host-theme-dependent (`scripts/axe-check.mjs` does not pin
an emulated `prefers-color-scheme`), so a light-mode CI host would not have caught
the footer-link dark-theme contrast defect the wave fixed in `style.css`; the
footer link colour is a one-rule product change a follow-up UX card may replace
with a design-system token.

### Security (v2.3.0)

Pre-release audit for v2.3.0: **PASS-with-accepted-risks** (SEC-1,
[docs/09-security-audit.md](docs/09-security-audit.md) §10) — **0 Critical · 0 High
· 2 Medium · 1 Low · 1 Informational**, audited tree `c68d00a`, **0**
vulnerabilities (`npm audit`, incl. dev) and no secret leaks (`gitleaks`, 87
commits). Both Medium findings — the attribution hyperlinks (F8) and the
storage-scope disclosure (F9) — were the audit's **GATE 2 conditions** and were
**landed by the fix wave**, as were the Low finding (F10, geocode-cache read path)
and the Informational item (F12, bare-`?v=`-less import). The SEC-1 delta
re-sign-off updates [docs/09](docs/09-security-audit.md). What was relevant to
v2.3.0:

- The **CSP is unchanged** (`script-src 'self'`); the local cache adds no network
  origin and never transmits stored data — the geocoder still calls **only**
  `geocoding-api.open-meteo.com`, and no coordinates ever appear in a URL (US-17,
  probed live). The three attribution licence links are navigation-only and sit in
  a **link-only** SEC-14 allow-list entry that fails the gate in any non-`href`
  context (`fetch` / `import` / `src`).
- A new **SEC-STORAGE** grep gate fails `make check` if a web-storage token
  appears outside `session-store.js`; every module reaches storage only through
  that module's `get/set/remove` (envelope-parsed, injection-safe, throw-tolerant).
- The geocode cache **re-validates persisted entries on read** (F10), so a
  tampered or legacy entry cannot reach the renderer.

### Verification summary (v2.3.0)

> **Gate re-run on the post-wave tree.** The fix-wave gate was green at HEAD
> `61282a8` — `make check` **exit 0**: tests **108/108**, security greps **0 hits
> across 4 gates**, smoke **67/67**, axe **PASS (5 states)**, 0 critical/serious.
> These figures supersede QA-1's (§13, HEAD `d45fef1`, 100/100 · 66/66), which
> predate the fix wave; the authoritative post-wave verdict is **QA-2's
> [docs/08](docs/08-test-report.md) §14 (PASS — no open Critical/High/Medium)**, with the SEC-1 delta
> re-sign-off (**PASS-with-accepted-risks**, 0 Critical / 0 High / 0 Medium) in
> [docs/09](docs/09-security-audit.md). The release commit was **HEAD of `main`
> at publish time** (`1a13519`) — see
> [docs/releases/v2.3.0-publish-staged.md](docs/releases/v2.3.0-publish-staged.md).

| Check | Command | Result |
|-------|---------|--------|
| Unit + contract suites | `make test` | **108 tests / 108 pass / 0 fail** (Node's built-in runner; includes the 122-key bilingual i18n contract, the pinned 112-assertion sequence lock and the F10 tampered-entry tests) |
| Headless render smoke | `make smoke` | **67 / 67 checks pass** (16 rows from the Mumbai fixture, 12h default + 24h toggle, S8 periods fixture, S9 panel default/select/revert/reload, ±10-day picker, `localStorage` persistence across reload, cache-busting, `?v=` presence on every internal specifier, plus 12 item-7b geocode-cache checks) |
| Accessibility gate | `make axe` | **0 critical/serious** and **0 moderate/minor** across 5 states (base, city dialog, row selected with panel, off-today + picker focused, base @320 px) |
| Security greps | `make greps` | **PASS — 0 hits across 4 gates** (SEC-05 HTML sinks, SEC-03 inline styles/handlers, SEC-14 origins, SEC-STORAGE) |
| Full gate | `make check` | **exit 0** at HEAD `61282a8` (test + greps + smoke + axe) |
| Dependency audit | `npm audit` (incl. dev) | **0 vulnerabilities** |
| Secret scan | `gitleaks detect --source .` | **no leaks found** (87 commits) |
| Perf budget | (printed by smoke) | shipped JS **184.9 KB raw / 58.5 KB gzip** upper bound (7 files) < 60 KB min+gzip (NFR-P3) |

#### Post-deploy verification (v2.3.0, deployed URL)

Executed by the release step (`DO-3`, `t_0a7a35b6`) against the live
<https://time.gitick.com/> after the v2.3.0 push and Pages rebuild:

| Check | Result |
|-------|--------|
| Pages build for the release commit `1a13519` | **built** (GitHub Pages API: `status=built`, `duration=66.7 s`, no error) |
| Tag on the remote | `refs/tags/v2.3.0` → annotated object `7612422…` → commit `1a13519` |
| Deployed shell is the new build | `?v=2.3.0` on `favicon.svg`/`style.css`/`app.js`; full module graph (`app.js` → `choghadiya.js`, `inauspicious.js`, `i18n.js`, `geocoder.js`, `session-store.js`; `choghadiya.js` → `vendor/suncalc-2.1.1.js`) — **every asset HTTP 200** with `?v=2.3.0`, none versionless |
| v2.3.0 surfaces live (real Chrome) | 12-hour default (`06:32 am`) with a working 12h↔24h toggle (`06:32`), "use my current location" button, native date picker `min=2026-10-04 / max=2026-10-24 / value=2026-10-14` (= today ∓10), inauspicious-periods block (Vaar Vela / Kaal Vela / Kaal Ratri incl. the cross-midnight civil-date suffix), choghadiya detail panel (current slot + meaning/good-for), **0 console errors** |
| `localStorage` semantics live | `choghadiya.settings.*` written as `{"t":null,"v":…}` envelopes (no expiry); the 24h choice and the location survived a reload; no `sessionStorage` use |
| Attribution credit live | 3 real hyperlinks in the footer — open-meteo.com / geonames.org / creativecommons.org/licenses/by/4.0/ — each `rel="noopener noreferrer" target="_blank"` |
| Deployed smoke | The `scripts/smoke.mjs` harness serves the repo files from its own local static server and pins a fixture clock/geolocation, so it has **no remote-URL mode**; the shipped-file gate was re-run green on the release commit (`make check` **exit 0** @ `1a13519` — tests 108/108, greps 0 hits/4 gates, smoke 67/67, axe PASS 5 states) and the deployed URL was covered by the live browser probe above instead |
| M6 mobile FCP gate (Lighthouse 12.8.2, mobile + simulated throttling) | **1496 ms / 1127 ms / 1127 ms** over 3 runs → **max 1496 ms < 1500 ms gate: PASS**; LCP 1.60/1.28/1.28 s, TBT 20/0/0 ms, performance score 0.99/0.92/0.92. (Informational: CLS 0 in run 1, 0.178 in runs 2–3 — the geolocation-prompt layout shift on a first visit; not a v2.3.0 gate, flagged as a possible follow-up.) |

### Deploy / rollback (v2.3.0)

Deployed to GitHub Pages (`vishalnagda1/choghadiya`, `main`) with the annotated
tag `v2.3.0`, after GATE 2. The full runbook — pre-flight gate, release
bump/tag/push commands, Pages verification, the post-deploy smoke + Lighthouse
FCP gate, and rollback — is [`docs/DEPLOY.md`](docs/DEPLOY.md). This app is a
static bundle, so rollback is a `git revert` of the release commit plus a
redeploy (the `?v=` bump busts the Pages cache on the next deploy).

### Attribution & licence (v2.3.0)

- `suncalc` 2.1.1 — BSD-2-Clause (vendored, checksum-pinned).
- Open-Meteo Geocoding API — data from GeoNames, **CC BY 4.0**. In-app credit
  (three key words hyperlinked to open-meteo.com / geonames.org /
  creativecommons.org): "Location search by Open-Meteo · Data from GeoNames ·
  CC BY 4.0".
- Project licence: MIT.

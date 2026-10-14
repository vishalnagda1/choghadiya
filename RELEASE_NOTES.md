# Release Notes — Choghadiya v2.3.0

**Release:** v2.3.0 (semver minor, bumping the `package.json` baseline `2.2.0`)
**Date:** 2026-10-14
**Target:** GitHub Pages — <https://time.gitick.com/>
**Status:** pre-release — prepared on `main`; **not yet tagged or deployed**. The
version bump, the annotated `v2.3.0` tag and the Pages deploy are cut by the
release step after client sign-off (GATE 2).
**Deploy runbook:** [docs/DEPLOY.md](docs/DEPLOY.md)

> **Versioning note.** The package baseline is `2.2.0`; this release is cut as
> **`v2.3.0`**. The release step bumps `package.json` to `2.3.0`, updates every
> asset `?v=` token (now covering all shipped JS modules), re-runs the full
> `make check` gate green on the release commit, and creates the annotated tag
> `v2.3.0` in the same commit.

> **Earlier release notes.** v2.2.0 notes are preserved in git history and in
> [CHANGELOG.md](CHANGELOG.md); this file describes the current release.

---

## What this release is

The **v2.3.0 feature wave** on top of the v2.2.0 refactor. It makes the clock
**12-hour by default** with a toggle, reworks date selection into a **calendar
picker (±10 days)**, adds a **manually re-triggerable location button**, computes
and explains the **inauspicious periods** (Vaar Vela / Kaal Vela / Kaal Ratri),
adds a **choghadiya detail panel** explaining each slot, and — for the first time
— **persists settings and caches geocode results in the browser** (per-tab
`sessionStorage`). That last item relaxes the v2.2.0 "no storage ever" stance to
**"no server storage; local session cache only"**.

---

## Highlights

- **12-hour by default (new), 24-hour on demand.** Every time reads `06:32 am`;
  a header 12h/24h toggle switches the whole app to `06:32` instantly, and the
  choice is remembered for the tab.
- **Calendar date picker (±10 civil days).** The date label itself is the picker:
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
  last location survive a **reload**; successful city searches are cached for
  **24 hours** so a repeat search or reload does not re-hit the geocoder. All of
  it is per-tab `sessionStorage`, cleared when the tab closes — **nothing is ever
  sent to a server**.
- **Everything from v2.2.0 still holds.** Real solar timings, location awareness
  with correct IANA timezone/DST rendering, bilingual Hindi-default UI (now
  **122 keys**), colour-independent quality tiers, the current-slot highlight,
  graceful degradations, and the WCAG 2.2 AA / responsive baseline.
- **Attribution reduced, not removed.** Full removal of the geocoder attribution
  would breach Open-Meteo's and GeoNames' CC BY 4.0 terms, so v2.3.0 keeps **one
  minimal footer credit** ("Location search by Open-Meteo · Data from GeoNames ·
  CC BY 4.0") and rewrites the privacy line to the new storage stance. The credit
  is plain text in this release; licence hyperlinks are a deferred follow-up.

---

## Notable fixes

- **Geocode cache wiring (item 7b).** The 24 h geocode cache shipped in code but
  `app.js` initially never handed the cache store to the geocoder, so repeat
  searches still refetched. The cache store is now injected — verified live: the
  cache survives a reload and a repeat query sends no request.
- **CI/gate honesty carried forward** from v2.2.0: the SEC-05/03/14 source greps
  now include a **SEC-STORAGE** gate (web-storage tokens allowed only in
  `session-store.js`), so the new storage path is held to the same standard.

---

## Known issues & limitations

> **Reconciliation — DONE.** This section is reconciled with the final v2.3.0
> verdicts: **QA-1** ([docs/08-test-report.md](docs/08-test-report.md) §13 —
> *PASS-WITH-KNOWN-ISSUES*, tested HEAD `d45fef1`) and **SEC-1**
> ([docs/09-security-audit.md](docs/09-security-audit.md) §10 —
> *PASS-with-accepted-risks*, audited tree `c68d00a`). Neither verdict is FAIL and
> no Critical/High finding is open, so the release is shippable pending GATE 2.
> The findings below are the QA/security findings as filed (`F*` ids); none is a
> code defect that blocks the release, and each open *decision* is surfaced to the
> client at GATE 2.

1. **Storage scope — `sessionStorage` vs client-requested `localStorage` (QA F2 /
   SEC F9, Medium).** The shipped build is per-tab **`sessionStorage`**
   (`session-store.js` `STORAGE_SCOPE='session'`), so settings survive a **reload**
   but are cleared on tab close. The client addendum records a confirmed change to
   `localStorage` (settings surviving full browser restarts); that flip is a
   one-line change plus copy/ADR updates and is **not** in this build. **GATE 2
   decision:** keep per-tab session scope (as audited here) or flip to
   `localStorage` in a follow-up change card. If the flip lands, `privacy.line`,
   this file, README, CHANGELOG and ADR-009 need a delta pass (SEC-1 F9) — see
   docs/07 §12.
2. **Attribution credit ships as plain text (QA F4 / SEC F8, Medium).** Full
   removal of the geocoder credit would breach Open-Meteo's and GeoNames' CC BY 4.0
   terms, so v2.3.0 keeps one minimal footer credit ("Location search by Open-Meteo
   · Data from GeoNames · CC BY 4.0") with `privacy.line` rewritten to the new
   storage stance. The licence **hyperlinks** (open-meteo.com / geonames.org /
   creativecommons.org) are **deferred**: they would extend the shipped CSP origin
   allow-list, which the SEC-14 gate freezes. **GATE 2 decision:** land the links
   (and extend the allow-list) or record the client's explicit acceptance of the
   plain-text credit. See docs/09 §10.3.
3. **`panel.note.overlay.*` copy defect (QA F3, Low).** The overlap-warning copy
   reads "within this *auspicious* choghadiya" even when the overlapped slot is
   inauspicious; the front-end implemented the UX spec verbatim. UX-owned copy fix.
4. **Geocode-cache read path skips re-validation (SEC F10, Low).** A tampered
   stored entry (e.g. `timezone:"Not/AZone"`) renders inert but **selecting** it
   throws an uncaught `RangeError` and blanks the render. Local-tamper-only (not
   remotely reachable); fix = re-validate persisted entries on read or guard
   `selectResult`. Routed as a backend fix.
5. **Stale `docs/04` keys (QA F5, Low).** `docs/04-architecture.md` §16.3
   documents an older geocode-cache key layout and §16.2 an older `createGeocoder`
   signature; the shipped `geocoder.js` layout is
   `choghadiya.geocache.entry.<lang>\0<query>` + `choghadiya.geocache.index`.
   Architect doc fix.
6. **Bare module specifier (SEC F12, Informational).** `inauspicious.js` imports
   `./choghadiya.js` without a `?v=` token, so that edge of the module graph is a
   second, unversioned fetch that the `make bump` `?v=` rewrite does not cover.
   Harmless (the module is stateless) but it bypasses cache-busting there; routed
   as an import-token fix.
7. **±1–2 min vs a printed panchang.** Expected and disclosed in the UI footer;
   suncalc uses the upper-limb + refraction convention (also verified by QA-1
   MAN-01 M3: max **1 min** delta for the three new periods vs live Drik Panchang).
8. **English slot-name spellings.** `Labh / Amrit / Kaal / Char / Rog / Udveg /
   Shubh` are deliberately shorter than Drik Panchang's long forms — a product
   decision fixed by [docs/02-prd.md](docs/02-prd.md) US-2 AC5 / US-11 AC4 and
   [docs/03-ux.md](docs/03-ux.md) §6.

Items carried from v2.2.0 that remain open as post-release verification (not
defects): the real-device geolocation *grant* path (MAN-03) and a live
screen-reader pass (MAN-05); the city-sheet loading/`recent cities` polish was
formally **cut** at the v2.2.0 GATE 2 and remains on the post-release backlog.
QA-1's residual risks for v2.3.0 are in docs/08 §13.8 (item-7b hit/expiry paths
rest on smoke + unit tests; no real-device geolocation; no real screen reader; the
M6 Lighthouse FCP is owned by the release/publish step).

---

## Security

Pre-release audit for v2.3.0: **PASS-with-accepted-risks** (SEC-1,
[docs/09-security-audit.md](docs/09-security-audit.md) §10) — **0 Critical · 0 High
· 2 Medium · 1 Low · 1 Informational**, audited tree `c68d00a`, **0**
vulnerabilities (`npm audit`, incl. dev) and no secret leaks (`gitleaks`, 87
commits). The two Medium findings are the attribution hyperlinks and the
storage-scope disclosure (Known issues #1–#2) — both **GATE 2 decisions**, neither
an open code defect; the Low finding is the geocode-cache read path (#4) and the
Informational item is the bare `?v=`-less import (#6). What is relevant to
v2.3.0:

- The **CSP is unchanged** (`script-src 'self'`, byte-exact vs docs/04 §5.3); the
  browser cache adds no network origin and never transmits stored data — the
  geocoder still calls **only** `geocoding-api.open-meteo.com`, and no coordinates
  ever appear in a URL (US-17, probed live).
- A new **SEC-STORAGE** grep gate fails `make check` if a web-storage token
  appears outside `session-store.js`; every module reaches storage only through
  that module's `get/set/remove` (envelope-parsed, injection-safe, throw-tolerant).
- The **attribution hyperlink** item (Known issues #2) is the main open
  security-adjacent decision, surfaced at GATE 2.

---

## Verification summary

> **Re-confirmed on the release commit.** The packaging step ran
> `make bump VERSION=2.3.0` and then `make check` **exit 0** on the bumped tree;
> the figures below match the final QA-1 report
> ([docs/08](docs/08-test-report.md) §13, tested HEAD `d45fef1`) and the SEC-1
> audit ([docs/09](docs/09-security-audit.md) §10, audited tree `c68d00a`).

| Check | Command | Result |
|-------|---------|--------|
| Unit + contract suites | `make test` | **100 tests / 100 pass / 0 fail** (≈0.56 s; includes the 122-key §6 vertical-slice i18n contract) |
| Headless render smoke | `make smoke` | **66 / 66 checks pass** (16 rows from the Mumbai fixture, 12h default + 24h toggle, S8 periods fixture, S9 panel default/select/revert/reload, ±10-day picker, settings persistence across reload, cache-busting, plus 12 item-7b geocode-cache checks) |
| Accessibility gate | `make axe` | **0 critical/serious** and **0 moderate/minor** across 5 states (base, city dialog, row selected with panel, off-today + picker focused, base @320 px) |
| Security greps | `make greps` | **PASS — 0 hits across 4 gates** (SEC-05 HTML sinks, SEC-03 inline styles/handlers, SEC-14 origins, SEC-STORAGE) |
| Full gate | `make check` | **exit 0** on the release commit (test + greps + smoke + axe) |
| Dependency audit | `npm audit` (incl. dev) | **0 vulnerabilities** |
| Secret scan | `gitleaks detect --source .` | **no leaks found** (87 commits) |
| Perf budget | (printed by smoke) | shipped JS **177.8 KB raw / 55.8 KB gzip** upper bound (7 files) < 60 KB min+gzip (NFR-P3) |

### Post-deploy verification (deployed URL)

**Placeholder** — to be executed by the release step against the live
<https://time.gitick.com/> after the v2.3.0 push and Pages rebuild: confirm the
Pages build for the release commit, that the deployed shell serves the new
`?v=2.3.0` assets (all HTTP 200), a live smoke of the new surfaces, and the
mobile Lighthouse FCP gate (**FCP < 1.5 s**). Record the results in the release
task metadata.

---

## Deploy / rollback

Deployed to GitHub Pages (`vishalnagda1/choghadiya`, `main`) with the annotated
tag `v2.3.0`, after GATE 2. The full runbook — pre-flight gate, release
bump/tag/push commands, Pages verification, the post-deploy smoke + Lighthouse
FCP gate, and rollback — is [`docs/DEPLOY.md`](docs/DEPLOY.md). This app is a
static bundle, so rollback is a `git revert` of the release commit plus a
redeploy (the `?v=` bump busts the Pages cache on the next deploy).

---

## Attribution & licence

- `suncalc` 2.1.1 — BSD-2-Clause (vendored, checksum-pinned).
- Open-Meteo Geocoding API — data from GeoNames, **CC BY 4.0**. In-app credit
  (plain text in v2.3.0): "Location search by Open-Meteo · Data from GeoNames ·
  CC BY 4.0". Hyperlinks deferred (see Known issues #2).
- Project licence: MIT.

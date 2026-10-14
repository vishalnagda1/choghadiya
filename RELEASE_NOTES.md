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

> **Reconciliation status — PLACEHOLDER.** The v2.3.0 QA report
> ([docs/08-test-report.md](docs/08-test-report.md)) and security audit
> ([docs/09-security-audit.md](docs/09-security-audit.md)) **have not yet been run
> for v2.3.0** (those documents still describe v2.2.0). The items below are the
> known state from the **integration review (TL-1)** and must be reconciled with
> the QA-1 / SEC-1 verdicts by the release step before publishing.

1. **Manual/browser checks pending QA-1.** Real-browser exploratory checks for the
   new surfaces (picker, periods, panel, geolocation button) and their
   accessibility are carried by the QA-1 card; the integration review's live
   Chromium spot-runs passed, but the formal QA report has not landed.
2. **Security re-audit pending SEC-1.** The hyperlink half of the attribution
   credit is **deferred** — Open-Meteo's terms ask for a link *next to* displayed
   location data, but adding three `http(s)` hyperlink origins would extend the
   shipped CSP origin allow-list, which the SEC-14 gate and the current audit
   scope freeze. The credit therefore ships as **plain text**; the hyperlinks are
   an open item for SEC-1 / GATE 2.
3. **Storage scope is session-based (client-confirmed change pending).** Shipped
   behaviour is per-tab **`sessionStorage`** (cleared on tab close). The client's
   confirmed change request describes `localStorage` (settings surviving full
   browser restarts); that is a one-line flip in `session-store.js` plus copy/ADR
   updates and is sequenced against the QA-1 / SEC-1 / TW-1 cards at GATE 2. If it
   lands before release, the privacy copy and these notes need a delta pass.
4. **`panel.note.overlay.*` copy defect (UX-1, low).** The overlap-warning copy
   reads "within this *auspicious* choghadiya" even when the overlapped slot is
   inauspicious; the front-end implemented the UX spec verbatim. Routed as a UX
   copy fix.
5. **±1–2 min vs a printed panchang.** Expected and disclosed in the UI footer;
   suncalc uses the upper-limb + refraction convention.
6. **English slot-name spellings.** `Labh / Amrit / Kaal / Char / Rog / Udveg /
   Shubh` are deliberately shorter than Drik Panchang's long forms — a product
   decision fixed by [docs/02-prd.md](docs/02-prd.md) US-2 AC5 / US-11 AC4 and
   [docs/03-ux.md](docs/03-ux.md) §6.

Items carried from v2.2.0 that remain open as post-release verification (not
defects): the real-device geolocation *grant* path (MAN-03) and a live
screen-reader pass (MAN-05); the city-sheet loading/`recent cities` polish was
formally **cut** at the v2.2.0 GATE 2 and remains on the post-release backlog.

---

## Security

Pre-release audit for v2.3.0: **PENDING (SEC-1)**. The v2.2.0 audit
([docs/09-security-audit.md](docs/09-security-audit.md), **PASS-with-accepted-risks**,
0 Critical / 0 High) is the last completed audit. What is already known for
v2.3.0:

- The **CSP is unchanged** (`script-src 'self'`); the session cache adds no
  network origin and never transmits stored data.
- A new **SEC-STORAGE** grep gate fails `make check` if a web-storage token
  appears outside `session-store.js`.
- The **SSR/attribution hyperlink** item (see Known issues #2) is the main open
  security-adjacent decision.

---

## Verification summary

> **Numbers marked "placeholders" are expected to be re-confirmed on the release
> commit by the packaging step.** The figures below are the last measured values
> on the integrated v2.3.0 tree (integration review **TL-1** at `9693f10`, plus
> this docs card's own re-runs of `make test` / `make greps` / `make smoke` /
> `make axe`).

| Check | Command | Result |
|-------|---------|--------|
| Unit + contract suites | `make test` | **100 tests / 100 pass / 0 fail** (≈0.57 s; includes the 122-key §6 vertical-slice i18n contract) |
| Headless render smoke | `make smoke` | **54 / 54 checks pass** (16 rows from the Mumbai fixture, 12h default + 24h toggle, S8 periods fixture, S9 panel default/select/revert/reload, ±10-day picker, settings persistence across reload, cache-busting) |
| Accessibility gate | `make axe` | **0 critical/serious** and **0 moderate/minor** across 5 states (base, city dialog, row selected with panel, off-today + picker focused, base @320 px) |
| Security greps | `make greps` | **PASS — 0 hits across 4 gates** (SEC-05 HTML sinks, SEC-03 inline styles/handlers, SEC-14 origins, SEC-STORAGE) |
| Full gate | `make check` | **exit 0** on the integrated tree (re-confirm on the release commit) |
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

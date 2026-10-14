# Release Notes — Choghadiya v2.2.0

**Release:** v2.2.0 (semver minor, bumping the `package.json` baseline `2.1.0`)
**Date:** 2026-10-14
**Target:** GitHub Pages — <https://time.gitick.com/>
**Status:** prepared for client release approval (GATE 2)

> **Versioning note.** The package baseline is `2.1.0`; this release is cut as
> **`v2.2.0`** by the release step, which bumps `package.json` to `2.2.0`, updates
> every asset `?v=` token, and creates the annotated tag `v2.2.0` in the same
> commit. The figures below were measured on `main` *before* that bump (i.e. at
> `?v=2.1.0`); `make check` is re-run on the release commit.

---

## What this release is

A refactor of the existing Choghadiya page from a **static, hardcoded-timing**
app into a **dynamic, location-aware, bilingual** tool. Slots are now computed
from the **real sunrise/sunset** at the user's location and date, the timings are
correct for any city and season, and the whole UI is available in **Hindi
(default) and English**.

---

## Highlights

- **Real solar timings, not fixed blocks.** Day slots = sunrise → sunset ÷ 8;
  night slots = sunset → next sunrise ÷ 8, computed client-side with the
  vendored `suncalc` 2.1.1. At Mumbai the day slots are ≈82 min in mid-December
  and ≈98 min in mid-June.
- **Location-aware.** Uses browser geolocation, with a **city search** fallback
  (free, keyless Open-Meteo Geocoding) that renders each city on **its own IANA
  timezone and DST rules** (e.g. London on `Europe/London`, not the device clock).
- **Bilingual, instant.** Hindi by default, one-tap EN toggle, no reload — all
  **58 user-facing strings** ship in both languages.
- **Today view with navigation.** 8 + 8 rows for any date, with prev / next and a
  **Today** reset; the **current slot is highlighted** (`aria-current` + "Now"
  badge) and refreshed at most every 60 s.
- **Readable without colour.** Each slot shows a quality word + glyph and can be
  expanded to read what the slot is good for.
- **Never breaks.** Geolocation denied, geocoder failure (with Retry), no city
  found, and polar locations all show a clear message; `NaN` / `Invalid Date` /
  empty rows are impossible by construction.
- **Accessible & responsive.** WCAG 2.2 AA baseline (keyboard, focus, landmarks,
  live regions, 200 % zoom, reduced-motion) and no horizontal scroll from 320 px.
- **Privacy by design.** No accounts, cookies, analytics or backend; coordinates
  never leave the device; only a typed city name reaches the geocoder, and that
  is disclosed in the UI.

---

## Notable fixes

- **Date-boundary correctness:** an after-midnight slot is attributed to the
  previous Vedic day's *night* list, and solar times are anchored at the
  location's local noon so distant timezones resolve to the correct solar day.
- **Geocoder input hardening:** control characters rejected without a request,
  out-of-range coordinates / invalid IANA timezones dropped, string lengths
  capped, and the query cache bounded (64 entries, FIFO).
- **Strict CSP + text-only rendering** of third-party/user-supplied strings.

---

## Known issues & limitations

Honest state as of these notes. The QA release report (`docs/08-test-report.md`)
and security audit (`docs/09-security-audit.md`) are produced by their own cards
and were still pending when this document was written; the items below come from
the milestone reviews and upstream handoffs.

1. **Real-browser manual checks still to be signed off by QA:** text-zoom pass,
   screen-reader pass, the ±2-minute panchang comparison, Lighthouse mobile
   First Contentful Paint (< 1.5 s gate), and real-device geolocation. Automated
   coverage (unit, headless smoke, axe) is green; these are the human gates.
2. **City-sheet polish not shipped.** The UX spec's "loading" state for a submit
   and the "3 recent cities" empty state are not implemented (they were outside
   the milestone ticket scope and are pending a scope decision). Searching shows
   results/errors correctly; there is just no inline spinner and no recent-cities
   shortcut.
3. **`<dialog>` close-event edge case.** In a browser build that does **not** fire
   the native `close` event on the city sheet (reproduced in the headless test
   browser; spec-correct browsers are unaffected), the app's internal
   sheet-open flag can remain set, which leaves the `Alt` + `←`/`→` day
   shortcuts disabled until reload. Routed as a follow-up hardening item; not
   observed in the reviewed evergreen browsers.
4. **Geocoder defense-in-depth.** The geocoder now validates and drops bad
   coordinates/timezones at its boundary (closing the crash path); a redundant
   guard at the app's day-aggregation call site was intentionally left out to
   avoid a code collision and remains a low-priority follow-up.
5. **±1–2 min vs a printed panchang.** Expected and disclosed in the UI footer;
   suncalc uses the upper-limb + refraction convention.

Deferred by design (not defects) in this release: countdown to the next slot,
shareable URLs, favourites, PWA/offline, notifications, panchang detail, Rahu
Kaal, and languages beyond Hindi/English. See
[docs/02-prd.md](docs/02-prd.md) §4.2 and [docs/05-plan.md](docs/05-plan.md) §6.

---

## Verification summary

Measured on `main` (pre-bump) — every command below was executed and passed:

| Check | Command | Result |
|-------|---------|--------|
| Unit + contract suites | `make test` | **64 tests / 64 pass / 0 fail** (≈0.6 s) |
| Headless render smoke | `make smoke` | **31 / 31 checks pass** (16 rows from the Mumbai fixture, EN/HI toggle, no `NaN`/`Invalid Date`, no horizontal scroll at 320/390/430/1024 px, favicon 200, cache-busting) |
| Accessibility gate | `make axe` | **0 critical/serious** and **0 moderate/minor** across base @1024 px, city dialog open, slot row expanded, base @320 px (axe-core 4.10.2) |
| Full gate | `make check` | **exit 0** (test + smoke + axe) |
| Perf budget | (printed by smoke) | shipped JS **98.4 KB raw / 32.3 KB gzip** upper bound < 60 KB min+gzip (NFR-P3) |
| Cache-busting | (asserted by smoke) | every `?v=` token == `package.json` version |
| Local serve | `make dev` | `index.html`, `style.css`, `app.js`, `favicon.svg`, `i18n.js`, `choghadiya.js`, `geocoder.js` all served **200** |

Milestone reviews REV-M1, REV-M2 and REV-M3 all returned **PASS** (REV-M2 with a
required geocoder fix that has since landed and is covered by the green
integrated run above).

---

## Deploy / rollback

Deployment to GitHub Pages (`vishalnagda1/choghadiya`, `main`) and the release
tag are handled by the release tooling; see the deploy runbook owned by that
step. This app is a static bundle, so rollback is a `git revert` of the release
commit plus a redeploy (the `?v=` bump busts the Pages cache on the next
deploy).

---

## Attribution & licence

- `suncalc` 2.1.1 — BSD-2-Clause (vendored, checksum-pinned).
- Open-Meteo Geocoding API — data from GeoNames, CC-BY 4.0. Credit:
  "Geocoding by Open-Meteo / GeoNames".
- Project licence: MIT.

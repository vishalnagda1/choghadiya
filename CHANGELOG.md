# Changelog

All notable changes to **Choghadiya** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The UI is bilingual (Hindi default / English toggle); the changelog below is
written in English.

---

## [Unreleased] — planned as v2.2.0

This release is the refactor of the app from a **static, hardcoded-timing page**
into a **dynamic, location-aware, bilingual** tool. It ships as **v2.2.0** (a
semver *minor* bump from the `2.1.0` package baseline); the version bump and the
`v2.2.0` git tag are cut in the same commit by the release step. Entries below
describe what is on `main` for this release.

### Added

- **Dynamic day & night schedule.** The 8 day slots (sunrise → sunset ÷ 8) and
  8 night slots (sunset → next sunrise ÷ 8) are computed client-side from the
  real solar times at the viewed location and date, instead of the previous
  fixed 06:00–18:00 blocks.
- **Location awareness.** Browser Geolocation API as the primary path; a manual
  **city-name search** (free, keyless **Open-Meteo Geocoding API**) as the
  fallback, returning city / region / country and the city's local time.
- **Correct timezone & DST rendering.** Searched cities render on their own IANA
  timezone via `Intl.DateTimeFormat` (no fixed UTC offsets, DST-correct);
  geolocation uses the device's resolved timezone.
- **Bilingual UI (Hindi default, English toggle)** with an instant, no-refresh
  switch. Every user-facing string lives in a 58-key dictionary covering both
  languages, including the 7 Choghadiya names.
- **Today view** showing both the day and night lists for the current date, with
  **prev / next date navigation** and a **Today** reset pill.
- **Current-slot highlight** for the slot containing "now" on the viewed
  location's clock, refreshed at most every 60 s and paused while the tab is
  hidden.
- **Quality tiers that don't rely on colour:** each slot shows a quality word and
  a glyph (✓✓ most auspicious / ✓ auspicious / ○ neutral / ✕ inauspicious) and
  can be expanded in place to read what the slot is good for.
- **Graceful degradation states:** geolocation denied / unavailable, geocoder
  failure (with a **Retry** that re-submits the same query), city-not-found, the
  polar "no sunrise/sunset" state, and the empty "choose a city" state — none of
  which can render `NaN`, `Invalid Date` or an empty slot row.
- **Accessibility baseline (WCAG 2.2 AA):** semantic landmarks, full keyboard
  operability with visible focus, `aria-current` on the active slot, disclosure
  rows with `aria-expanded` / `aria-controls`, live regions, `<html lang>` update
  on toggle, 44×44 px touch targets, reduced-motion support and 200 % zoom.
- **Responsive, mobile-first layout** with no horizontal scroll from 320 px up.
- **Privacy & attribution lines:** a disclosure that a searched city name is sent
  to the geocoder (coordinates never leave the device), a geocoder credit, and a
  "no account / no tracking / no backend" note.
- **Delivery & tooling:** a zero-dependency Makefile (`dev` / `test` / `smoke` /
  `axe` / `check` / `bump`) and `npm` scripts; a GitHub Actions workflow running
  the test suite on every push and PR; a vendored, checksum-pinned `suncalc`
  2.1.1; a minimal SVG favicon; and `?v=` cache-busting tied to the package
  version.
- **Test & quality gates:** Node test-runner suites, including a **112-assertion
  pinned sequence lock** (7 weekdays × 8 day + 8 night), a geocoder suite with an
  injected mock `fetch` (no network), a **58-key × 2-language i18n contract
  suite**, a headless-Chromium render **smoke** test and an **axe-core**
  accessibility gate, all wired into `make check`.

### Changed

- **Slot boundaries** are now equal divisions of the *actual* solar day and night
  (≈82-minute day slots mid-December, ≈98-minute slots mid-June at Mumbai) rather
  than fixed clock blocks; display rounds to the nearest minute.
- **Slot-name sequence** now follows the pinned weekday-ruler cycle from the
  research tables (day and night sequences differ), replacing the previous
  simplified 7×8 grid.
- **"Today"** is the viewed location's civil date (sunrise → sunrise semantics),
  not the device's date.

### Fixed

- **Date-boundary correctness:** an after-midnight slot (e.g. 02:00 Thursday)
  is now attributed to the previous Vedic day's *night* list, and solar times are
  anchored at the location's local noon so distant timezones/offsets no longer
  resolve to the wrong solar day.
- **Geocoder input hardening:** control characters are rejected without a
  request, out-of-range coordinates and invalid IANA timezones are dropped, city
  strings are length-capped, and the query cache is bounded (FIFO, 64 entries).

### Security

- Strict `Content-Security-Policy` (`default-src 'none'`, `script-src 'self'`,
  single geocoder origin), `no-referrer`, and **text-only rendering** of
  third-party / user-supplied strings (no `innerHTML`) to prevent injection.
- Keyless, pinned, permissively licensed dependencies only (`suncalc@2.1.1`,
  BSD-2-Clause); no backend, accounts or secrets in the repo.

### Removed

- The previous **hardcoded 06:00–18:00 Choghadiya timing grid**.

---

## [2.1.0] — baseline (pre-refactor)

The original single-page app: a static, mobile page that displayed a
**hardcoded Choghadiya timing grid** with fixed day boundaries and no location
awareness or language toggle. Kept here as the version baseline (`package.json`
`2.1.0`) that `v2.2.0` bumps from; it predates this repository's history.

[Unreleased]: https://github.com/vishalnagda1/choghadiya/compare/v2.1.0...HEAD

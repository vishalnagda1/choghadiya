# Changelog

All notable changes to **Choghadiya** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The UI is bilingual (Hindi default / English toggle); the changelog below is
written in English.

---

## [2.3.0] — 2026-10-14 (pre-release)

This release is the **v2.3.0 feature wave** on top of the v2.2.0 refactor. It is
prepared on `main`; the version bump, the annotated `v2.3.0` tag and the Pages
deploy are cut by the release step after client sign-off (GATE 2). Entries below
describe what is on `main` for this release.

### Added

- **12-hour clock by default (item 1).** Every time is rendered as `06:32 am`;
  a new **12h / 24h toggle** in the header switches the whole app to `06:32`
  instantly, with no reload. The toggle is a `role="group"` segmented control
  with `aria-pressed` and localised labels.
- **"Use my current location" button (item 2).** An explicit control inside the
  location sheet re-triggers the Geolocation API on demand (after a denial, or
  when the user wants to switch back to the device fix). It is idempotent while
  a request is in flight and reports its own denied/timeout state inline in the
  sheet instead of the page-level banner.
- **Calendar date picker (item 4).** The formatted date label is now a native
  `<input type="date">` overlay; it accepts any date within **±10 civil days** of
  the viewed location's today (21 days inclusive), clamped with the native
  `min`/`max`. The **‹ / ›** buttons, the **Alt + ← / →** shortcut and the
  polar-date escape hatch share one clamped navigation path, and the edges render
  disabled rather than silently refusing.
- **Inauspicious periods (item 5).** A new **S8** block below the day/night lists
  computes and displays **Vaar Vela**, **Kaal Vela** and **Kaal Ratri** for the
  selected date and location, each with its time range in the active clock format
  and a one-line explanation. Definitions follow the research tables (§11): Vaar
  Vela is the weekday's fixed day-eighth; Kaal Vela is the day's *Kaal*
  choghadiya; Kaal Ratri is the night's *Labh* choghadiya (Vaar Vela is **not**
  Yamagandam and Kaal Ratri is **not** Rahu Kaalam on 6 of 7 weekdays). A period
  that ends after midnight carries a civil-date suffix; Saturday's legitimate
  double periods render in full. The block hides when the solar data is undefined
  (polar dates), and the UI states that these are traditional beliefs, not
  astronomical facts.
- **Choghadiya detail panel (item 6).** A new **S9** card below the periods block
  shows the selected slot's **meaning**, what it is **good for**, what to
  **avoid**, a day/night nuance, its tier note, and a contextual note. It
  defaults to the **current** choghadiya, the **badge** marks the live slot, and
  tapping another row selects it (`aria-pressed` + `aria-controls`); tapping the
  same row again — or reloading — returns to the current slot. When an
  inauspicious period overlaps the shown slot, the panel warns and **names the
  period**.
- **Per-tab settings persistence and a 24-hour geocode cache (item 7).** A new
  `session-store.js` provides a namespaced (`choghadiya.*`), TTL-capable
  `sessionStorage` wrapper. The time format, language and last chosen location
  persist across a **reload**; successful geocode responses are cached with a
  **24 h TTL** (FIFO, capped at 64 entries), so a repeat search or a reload does
  not re-hit the geocoder. Settings carry **no expiry**; cached responses expire
  on the TTL. The store degrades silently to an in-memory fallback if web storage
  is unavailable or throws.
- **New test and gate coverage.** `session-store.js` and `inauspicious.js` join
  the shipped set; `scripts/security-greps.mjs` gains a **SEC-STORAGE** gate
  (web-storage tokens allowed only in `session-store.js`); the smoke test covers
  the periods block, the detail panel, the picker, the 12h/24h toggle and
  session persistence; the axe scan covers the panel and picker states.

### Changed

- **Default time format is now 12-hour.** This is a **behaviour change** from
  v2.2.0, which rendered 24-hour ranges only. Users who prefer 24-hour times can
  switch with the new header toggle; the choice persists for the tab.
- **Date navigation** gained a calendar picker and a document range (±10 civil
  days); prev/next remains and shares the same clamp.
- **Slot rows are now selection controls** (`aria-pressed` + `aria-controls`) that
  drive the S9 detail panel. The v2.2.0 inline expand-in-place "meaning" line was
  retired — the panel supersedes it (the `meaning.*` strings remain in the
  dictionary).
- **Attribution and privacy disclosure rewritten (item 3).** The two v2.2.0 body
  lines were reduced — **not removed** — because full removal would breach both
  Open-Meteo's CC BY 4.0 terms (which require a link next to displayed location
  data) and GeoNames' CC BY 4.0 credit requirement:
  - the footer keeps one minimal credit line,
    `Location search by Open-Meteo · Data from GeoNames · CC BY 4.0`;
  - `privacy.line` was rewritten to the new storage stance: "Your searched city
    name is sent to Open-Meteo to find coordinates. **No server storage** —
    settings and recent searches stay only in this browser tab."
  The credit ships as **plain text** in v2.3.0; the licence hyperlinks are a
  deferred follow-up (adding them would extend the CSP origin allow-list).
- **Storage posture (ADR-007 → ADR-009).** The v2.2.0 "no web storage at all"
  stance is **relaxed**: [ADR-009](docs/adr/009-session-scoped-storage.md)
  supersedes ADR-007 in part, adopting **"no server storage; local session cache
  only"** (per-tab `sessionStorage`, cleared on tab close). The i18n contract
  grew from 58 to **122 keys** to carry the new surfaces.

### Fixed

- **Item 7b geocode cache wiring.** The 24 h geocode cache was built and
  unit-tested with `session-store.js` but was initially **not passed to the
  geocoder** by `app.js`, so repeat searches still refetched. The cache store is
  now injected, so the 24 h TTL applies to real searches — verified live (the
  cache survives a reload and the repeat query sends no request).

### Security

- The CSP `script-src 'self'` posture is unchanged; the session cache adds **no
  new network origin** and never sends stored data anywhere.
- A new **SEC-STORAGE** source grep fails the gate if `localStorage` /
  `sessionStorage` ever appears outside `session-store.js`, keeping every storage
  access behind one audited module.

---

## [2.2.0] — 2026-10-14

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

[Unreleased]: https://github.com/vishalnagda1/choghadiya/compare/v2.2.0...HEAD
[2.3.0]: https://github.com/vishalnagda1/choghadiya/compare/v2.2.0...v2.3.0

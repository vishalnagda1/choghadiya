# Release Notes — Choghadiya v2.2.0

**Release:** v2.2.0 (semver minor, bumping the `package.json` baseline `2.1.0`)
**Date:** 2026-10-14
**Target:** GitHub Pages — <https://time.gitick.com/>
**Status:** released — GATE 2 client sign-off 2026-10-14; tagged `v2.2.0` and pushed to `vishalnagda1/choghadiya` `main`
**Deploy runbook:** [docs/DEPLOY.md](docs/DEPLOY.md)

> **Versioning note.** The package baseline was `2.1.0`; this release is cut as
> **`v2.2.0`**. The release step bumped `package.json` to `2.2.0`, updated every
> asset `?v=` token, re-ran the full `make check` gate green on the release
> commit, and created the annotated tag `v2.2.0` in the same commit (which was
> pushed to `main` alongside it). The integrity figure below is the measured
> shipped-JS budget; it is independent of the `?v=` string and is unchanged by
> the bump.

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

Honest state as of these notes, reconciled with the **published** QA report
([docs/08-test-report.md](docs/08-test-report.md), verdict **PASS-WITH-KNOWN-ISSUES**)
and security audit ([docs/09-security-audit.md](docs/09-security-audit.md), verdict
**PASS-with-accepted-risks**), and with the **CTO dispositions approved at GATE 2**
(client approved 2026-10-14, no feedback). Items 1–4 are carried as **known issues, not
defects** — every MVP acceptance criterion (US-1…US-19) passes, there is **no open
Critical/High/Medium defect**, and there is **no open High/Critical security finding**.

1. **Real-browser manual checks.** QA executed the human gates in
   [docs/08-test-report.md](docs/08-test-report.md) §5–§7: panchang accuracy **max Δ 1 min**
   vs Drik Panchang across 5 city-date combos (gate ±2 min), mobile **FCP 1.13 s**
   (gate < 1.5 s), contrast ≥ 6.26:1 light / 7.43:1 dark, 200 % zoom and reduced-motion
   clean, and a full network/privacy inspection. Two items remain **unexecuted** and are
   declared honestly in docs/08 §8: the real-device geolocation *grant* path (MAN-03) and
   a live screen-reader pass (MAN-05 — an accessibility-tree proxy was used instead). Both
   are post-release verification items, not defects.
2. **City-sheet polish — cut from v2.2.0 (GATE 2 disposition).** The UX spec's city-sheet
   *loading* submit state (`aria-busy` + spinner) and *"3 recent cities"* empty state
   (`docs/03-ux.md` §S2) are **not implemented**. **Formally CUT from v2.2.0 and deferred
   to the post-release backlog** — neither has a PRD acceptance criterion behind it
   (outside US-1…US-19), "3 recent cities" has no key in the 58-key copy deck (so
   implementing it needs a coordinated copy-deck change), and search itself works
   correctly (results / no-results / error + Retry all verified). There is no inline
   spinner and no recent-cities shortcut; that is the whole gap.
3. **`<dialog>` close-event edge case — deferred post-release hardening (accepted residual
   risk).** In a browser build that does **not** fire the native `close` event on the city
   sheet (reproduced only in the headless test browser; spec-correct browsers are
   unaffected), the app's internal sheet-open flag can remain set, which leaves the `Alt` +
   `←`/`→` day shortcuts disabled until reload. Not observed in any reviewed evergreen
   browser; routed as a post-release hardening item.
4. **Geocoder defense-in-depth — deferred post-release hardening (accepted residual risk).**
   The geocoder validates and drops bad coordinates/timezones at its boundary (the crash
   path is closed and covered by tests); a redundant guard at the app's day-aggregation
   call site was intentionally left out to avoid a code collision and remains a low-priority
   post-release item.
5. **±1–2 min vs a printed panchang.** Expected and disclosed in the UI footer;
   suncalc uses the upper-limb + refraction convention.
6. **English slot-name spellings.** `Labh / Amrit / Kaal / Char / Rog / Udveg / Shubh` are
   deliberately shorter than Drik Panchang's long forms (`Labha / Amrita / Kala / …`) — a
   product decision fixed by `docs/02-prd.md` US-2 AC5 / US-11 AC4 and `docs/03-ux.md` §6.

Deferred by design (not defects) in this release: countdown to the next slot,
shareable URLs, favourites, PWA/offline, notifications, panchang detail, Rahu
Kaal, and languages beyond Hindi/English. See
[docs/02-prd.md](docs/02-prd.md) §4.2 and [docs/05-plan.md](docs/05-plan.md) §6.

---

## Security

Pre-release audit: [docs/09-security-audit.md](docs/09-security-audit.md) —
**PASS-with-accepted-risks (0 Critical · 0 High · 1 Medium · 2 Low)** at the release
commit; **no open High/Critical finding** (the audit's FAIL trigger). All three fix
cards **landed before the release** (HEAD `d9a7b89`):

- **F1 (Medium)** — GitHub Actions pinned to full commit SHAs instead of mutable tags
  in `.github/workflows/ci.yml` (SEC-18 / RK10) — **landed** (`t_899c4547`).
- **F2 (Low)** — the city input's `name` attribute removed (SEC-07 DOM-clobbering
  hygiene; the form is JS-only) — **landed** (`t_9ec675d1`).
- **F3 (Low)** — the SEC-05/03/14 source greps are now a persistent failing gate
  (`scripts/security-greps.mjs`, wired into `make check` as `make greps`) — **landed**
  (`t_899c4547`).

Accepted residuals, documented in docs/09 §7–§8: **F4** the privacy one-liner
under-describes the request's fixed `count`/`language` params (a copy-deck item, no
user-identifying data), plus informational **F5** (SVG namespace identifier), **F6**
(dev-only `axe-core` is MPL-2.0, never shipped) and **F7** (release-push ops notes —
remote config + branch-protection recommendation). CSP is byte-exact with a provably
enforcing `script-src 'self'`, all dynamic text renders via `textContent`, the core
calculation is network-free, and the only outbound call is the user-initiated geocode.

---

## Verification summary

Re-run on the **release commit** (post-bump, `?v=2.2.0`) — every command below was executed and passed:

| Check | Command | Result |
|-------|---------|--------|
| Unit + contract suites | `make test` | **64 tests / 64 pass / 0 fail** (≈0.6 s) |
| Headless render smoke | `make smoke` | **31 / 31 checks pass** (16 rows from the Mumbai fixture, EN/HI toggle, no `NaN`/`Invalid Date`, no horizontal scroll at 320/390/430/1024 px, favicon 200, cache-busting) |
| Accessibility gate | `make axe` | **0 critical/serious** and **0 moderate/minor** across base @1024 px, city dialog open, slot row expanded, base @320 px (axe-core 4.10.2) |
| Full gate | `make check` | **exit 0** (test + greps + smoke + axe) |
| Perf budget | (printed by smoke) | shipped JS **98.4 KB raw / 32.3 KB gzip** upper bound < 60 KB min+gzip (NFR-P3) |
| Cache-busting | (asserted by smoke) | every `?v=` token == `package.json` version |
| Local serve | `make dev` | `index.html`, `style.css`, `app.js`, `favicon.svg`, `i18n.js`, `choghadiya.js`, `geocoder.js` all served **200** |

Milestone reviews REV-M1, REV-M2 and REV-M3 all returned **PASS** (REV-M2 with a
required geocoder fix that has since landed and is covered by the green
integrated run above). The QA execution ([docs/08-test-report.md](docs/08-test-report.md))
and the pre-release security audit ([docs/09-security-audit.md](docs/09-security-audit.md))
were both re-verified green at HEAD `d9a7b89` (QA: tests 64/64, smoke 31/31, axe clean;
security: 0 Critical / 0 High, all F1–F3 fixes landed).

---

## Deploy / rollback

Deployed to GitHub Pages (`vishalnagda1/choghadiya`, `main`) with the annotated
tag `v2.2.0`. The full runbook — pre-flight gate, release bump/tag/push
commands, Pages verification, the post-deploy smoke + Lighthouse FCP gate, and
rollback — is [`docs/DEPLOY.md`](docs/DEPLOY.md). This app is a static bundle,
so rollback is a `git revert` of the release commit plus a redeploy (the `?v=`
bump busts the Pages cache on the next deploy).

---

## Attribution & licence

- `suncalc` 2.1.1 — BSD-2-Clause (vendored, checksum-pinned).
- Open-Meteo Geocoding API — data from GeoNames, CC-BY 4.0. Credit:
  "Geocoding by Open-Meteo / GeoNames".
- Project licence: MIT.

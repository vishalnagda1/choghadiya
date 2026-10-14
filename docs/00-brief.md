# Project Brief — Choghadiya (Chaughadiya refactor)

## Vision
Upgrade the existing single-page Choghadiya web app from static, hardcoded
timings into a dynamic, location-aware, bilingual tool that computes accurate
Vedic astrology time slots client-side, with a modern responsive UI.

## Users
General public, primarily Hindi-speaking (Indian) users who want today's
auspicious/inauspicious Choghadiya slots for their own location. Mobile-first.

## Goals & success criteria
- Choghadiya slots are computed dynamically from real local sunrise/sunset, not
  fixed 06:00–18:00 blocks.
- Works for the user's actual location (browser geolocation) or any named city.
- Fully bilingual (English / Hindi) with instant, no-refresh toggling.
- Responsive, modern, mobile-friendly layout.

## MVP features (must-have)
1. Dynamic day/night Choghadiya: day = sunrise→sunset ÷ 8; night = sunset→next
   sunrise ÷ 8.
2. Location: browser Geolocation API as primary; manual city-input fallback
   using a free, keyless geocoding API (Open-Meteo Geocoding or Nominatim).
3. Solar data via `suncalc` (pure client-side, no network for core calc).
4. Bilingual i18n (English + Hindi), toggle in UI, includes the 7 Choghadiya
   names (Amrit, Shubh, Labh, Char, Rog, Kaal, Udveg).
5. "Today" view: day + night slot lists for the current date, with prev/next
   date navigation.
6. Highlight the current slot.

## Choghadiya algorithm
Each of the 8 day slots and 8 night slots is assigned a name from the
traditional 7-name cycle, starting from the weekday ruler's slot. Research must
pin the exact standard sequence — the current hardcoded 7×8 grid is a
simplified and possibly inaccurate sequence and is NOT the source of truth.

## Later features (out of scope for v1)
- Panchang detail, muhurat beyond Choghadiya, location favorites/history,
  offline service worker, notifications.

## Constraints & preferences
- Frontend only. Hosted on GitHub Pages — no backend, no server logic.
- Code structure: index.html + style.css + app.js + i18n dictionary (separate files).
- All logic and calculations on the client (JavaScript).
- Vanilla JS preferred unless a build step is justified; keep it simple to deploy
  to GitHub Pages.

## Integrations
- Browser Geolocation API.
- Open-Meteo Geocoding API or Nominatim (free, keyless, CORS-friendly) for
  city-name → coordinates, used only for manual fallback.
- suncalc (or equivalent client-side library) for sunrise/sunset.

## Data & compliance
No user data stored or transmitted (location stays on-device except the optional
geocode call to a third-party API).

## Release definition
Merged, working refactor deployed to GitHub Pages (https://time.gitick.com/),
satisfying all MVP acceptance criteria and passing QA. Deployed directly to
`github.com/vishalnagda1/choghadiya` (main) via the `gh` CLI (authenticated as
vishalnagda1, repo + workflow scopes). Each release MUST be versioned with a git
tag (semantic version bump from current package.json 2.1.0, e.g. v2.2.0).

## Open questions + agreed defaults
- Presentation: "Today" view with prev/next date navigation (confirmed).
- Geocoding: free third-party API acceptable (confirmed).
- Code structure: split files (confirmed).
- Default language: Hindi (confirmed).

## Client quotes
- "Today view — day + night lists for the current date, with prev/next date navigation."
- "Yes — use free Open-Meteo Geocoding or Nominatim (no key)."
- "Split into index.html + style.css + app.js + i18n dictionary."
- "Hindi (matches current app + Vedic context)."

## Change log
- 2026-10-14: Client authorized direct deploy to `github.com/vishalnagda1/choghadiya`
  (main) via authenticated `gh` CLI, and requires every release to be versioned with
  a git tag (semver bump from 2.1.0). See "Release definition".
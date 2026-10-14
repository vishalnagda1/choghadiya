# ADR-007 — No persistent storage in v1 (no cookies, no web storage)

- **Status:** Accepted (2026-10-14) — **superseded in part by
  [ADR-009](009-session-scoped-storage.md)** (2026-10-14): v2.3.0 change item 7
  adds session-scoped storage (settings + geocoding cache). Everything below
  stands as written and remains accurate for v1–v2.2.0; from v2.3.0 the privacy
  stance is "no server storage; local session cache only" (ADR-009).
- **Deciders:** architect (privacy posture: PRD NFR-PR1..PR3, brief §Data & compliance)
- **Impacts:** `app.js` state handling, geolocation-denied flow, language toggle

## Context

The brief promises "no user data stored or transmitted (location stays on-device
except the optional geocode call)", and PRD NFR-PR3 bans cookies, analytics and
trackers. The UX spec makes the language choice session-only and shows a "cached
last city" in the geolocation-denied flow (03-ux F3) without defining the cache.
Web storage (`localStorage`/`sessionStorage`) is technically available and would
smooth a reload, but any persistence weakens the privacy story and starts a data
retention question the product does not need.

## Decision

**Persist nothing.** All state (language, location, viewed date, in-flight UI
state) lives in `AppState` in memory for the lifetime of the page. The "cached last
city" of flow F3 means *the in-memory location chosen earlier in the same page
session* — a reload starts clean. The geocoder's query cache is in-memory
(`Map`), never written to disk. No cookies, no `localStorage`, no `sessionStorage`,
no IndexedDB, no URL-encoded state in v1.

## Alternatives considered

- **`sessionStorage` for last city + language**: rejected for v1 — small UX gain
  (survives reload), but it is storage of user-derived data that the privacy
  disclosure would then have to cover, and it invites scope creep (favourites,
  history) that PRD §8 explicitly defers.
- **`localStorage` with a consent banner**: rejected — turns a privacy-first
  utility into a consent-managed site; disproportionate.

## Consequences

- A reload always starts in Hindi with no location (geolocation prompt re-fires or
  the user re-enters a city). Accepted as v1 behaviour; flagged to the client as a
  possible later enhancement (with a fresh privacy note).
- The privacy one-liner stays literally true: "Location is never stored" (US-17).
- If persistence is ever added, NFR-PR3 requires a fresh privacy decision and a
  PRD amendment before implementation.

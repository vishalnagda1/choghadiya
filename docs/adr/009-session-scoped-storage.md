# ADR-009 — Client-side storage for settings + geocoding cache (v2.3.0)

*(Originally titled "Session-scoped client storage"; the scope was amended to
`localStorage` on 2026-10-14 — see "Amendment" below. File name retained for
stable links.)*

- **Status:** Accepted (2026-10-14) — **Amended (2026-10-14): storage scope
  finalized to `localStorage`** (client-confirmed on board card `t_6886a974`;
  the "Amendment" section below supersedes every scope statement above it).
  **Supersedes [ADR-007](007-no-persistent-storage.md) in part.**
- **Deciders:** architect (record) + CTO (contract, board card `t_a46a447b`/BE-C);
  driven by the client change request (brief change log 2026-10-14, item 7).
- **Impacts:** `session-store.js` (new), `geocoder.js` cache surface, `app.js`
  settings hydration, the privacy disclosure copy (US-17), `docs/06-threat-model.md`
  / `docs/09-security-audit.md` inputs (SEC-1 re-audit).

## Context

v2.3.0 change item 7 (`docs/00-brief.md` change log, 2026-10-14) requires:

> **Persistence & caching via `sessionStorage`** — persist user settings (time
> format 12h/24h, language, last selected location) across reloads, and cache
> geocoding API responses for a bounded TTL so the same city-name query is not
> re-hit repeatedly. […] This relaxes the v2.2.0 "no storage ever" stance to
> "no server storage; local session cache only" — update the privacy disclosure
> accordingly.

This directly supersedes part of ADR-007 ("Persist nothing"), which was correct
for v1–v2.2.0 but is now contradicted by an explicit client instruction. The
brief itself flags the one genuine ambiguity: `sessionStorage` survives reload but
is **per-tab and clears on tab close** (what the client's words specify);
`localStorage` **survives browser restart** — "team to confirm with client which
is intended". That confirmation is a GATE 2 question, not an engineering guess.

## Decision

1. **One storage module.** A new pure module `session-store.js` (ESM,
   Node-importable) is **the only file in the codebase allowed to reference
   `sessionStorage`/`localStorage`**. Exported surface:
   - `get(key)` → value or `null`;
   - `set(key, value, opts = {})` — `opts.ttlMs` optional; **absent = no expiry
     (persists indefinitely)**;
   - `remove(key)`, `clear()`;
   - `STORAGE_SCOPE = 'local'` — the scope decision lives in this one constant.
     (Amended 2026-10-14: final scope is `localStorage`; the original decision
     value was `'session'` — see "Amendment" below.)
2. **Wire format.** Every entry is a JSON envelope `{ t, v }` where `v` is the
   caller's value and `t` is the **expiry instant** in epoch ms (`Date.now() +
   ttlMs`) or `null` for a no-expiry entry. `get` returns `null` **and deletes
   the entry** when it is expired (`Date.now() >= t`), malformed, unparsable,
   or not an envelope. Keys are namespaced `choghadiya.*`. (Envelope wording
   corrected 2026-10-14 to match shipped `session-store.js`, which stores the
   expiry instant, not the write time.)
3. **Never throws.** All storage access is wrapped in try/catch with a silent
   in-memory `Map` fallback (private mode, quota exceeded, disabled storage →
   the app keeps working with zero user-visible failures).
4. **What is persisted (item 7a).** Settings only:
   `choghadiya.settings.timeFormat` (`'12h'` default | `'24h'`),
   `choghadiya.settings.lang` (`'hi'` default | `'en'`),
   `choghadiya.settings.location` (`{lat, lon, timezone, label}` | null).
   `viewedDate` is **not** persisted (reload always returns to today).
5. **Geocoding cache (item 7b).** `geocoder.js` gains an optional `cacheStore`
   on `createGeocoder({ fetchImpl, debounceMs, lang, cache, cacheStore })` (all
   options optional; `app.js` calls it as `createGeocoder({ lang, cacheStore })`
   with `cacheStore = { get, set, remove }`, the `session-store.js` façade).
   **With no `cacheStore` the behaviour is exactly v2.2.0** (in-memory FIFO-64
   `Map`). With a store-backed `cacheStore`: TTL **24 hours**, FIFO cap 64
   entries, cache key = `<lang>\u0000<normalized query>` (normalized = trimmed +
   case-folded), persisted as `choghadiya.geocache.entry.<lang>\u0000<query>`
   plus `choghadiya.geocache.index` (full layout in `04-architecture.md`
   §16.3), so the same city query costs zero fetches across reloads.
   (Signature and key wording corrected 2026-10-14 to match shipped
   `geocoder.js`/`app.js` — QA finding F5.)
6. **Privacy stance becomes "no server storage; local TTL-gated cache only."**
   The disclosure copy must change accordingly (US-17 line is no longer
   literally true — see Consequences); FE-4/TW-1 own the wording. (Phrasing
   confirmed with the client 2026-10-14; the interim wording was "no server
   storage; local session cache only".)

### Open question — GATE 2 (RESOLVED 2026-10-14 → `localStorage`)

**Resolution (client-confirmed 2026-10-14, board card `t_6886a974`): the storage
scope is `localStorage`** — settings survive full browser restarts. The
mechanism flip (`STORAGE_SCOPE` `'session'` → `'local'` in `session-store.js`)
lands via implementation card BE-FIX-1. The decision is final; see the
"Amendment" section below. The original question and interim default are kept
for the trail:

**`sessionStorage` (per-tab, clears on tab close — what the client specified) vs
`localStorage` (survives browser restart)?** Default shipped value:
`STORAGE_SCOPE = 'session'` per the client's literal words. Flipping to
`'local'` is a **one-line change confined to `session-store.js`**, plus the
matching disclosure-copy and ADR status updates. Nothing outside `session-store.js`
may branch on the scope.

## Alternatives considered

- **`localStorage` from the start**: rejected for now — it is a broader
  retention promise than the client's words ("sessionStorage", "across
  reloads"), and picking it before the client confirms would bake in the more
  aggressive option. Hence the open question + the one-line flip.
  *(Superseded by the 2026-10-14 Amendment: the client confirmed `localStorage`,
  so the broader retention promise is now the requirement.)*
- **Keep ADR-007's "persist nothing"**: rejected — the client explicitly
  requested persistence and caching.
- **IndexedDB**: rejected — overkill for three small settings keys and a 64-entry
  query cache; async API with no benefit here.
- **Cookies**: rejected — banned by NFR-PR3, sent on every request (the exact
  property the privacy stance avoids), and unnecessary.

## Consequences

- **"Location is never stored" (US-17) becomes false.** The last selected
  location (including coordinates) and recent city-name queries now sit in web
  storage. The disclosure must truthfully say: settings + geocode results are
  cached **locally, per tab session, on-device only** *(the per-tab lifetime is
  superseded by the Amendment below — scope is `localStorage`)*; nothing is
  stored on a
  server; coordinates still never leave the device (the origin table in
  `04-architecture.md` §5.2 is unchanged).
- **ADR-007 is superseded in part.** Its history stands: v1–v2.2.0 shipped with
  zero storage and that remains accurate for those releases. Its status line
  carries a superseded-by pointer; this ADR is the storage record from v2.3.0.
- **New hygiene constraint (enforced by the security greps gate, DO-1):**
  `sessionStorage`/`localStorage` may appear **only** in `session-store.js`.
- **Threat model / audit delta (SEC-1):** new data-at-rest surface (settings,
  city names, last location), cleared on tab close *(retention superseded by
  the Amendment below: `localStorage` — settings persist indefinitely,
  geocache expires at 24 h TTL)*; no new network origins, so
  the CSP and the §5.2 origin list are unchanged.
- **If GATE 2 flips to `localStorage`:** change `STORAGE_SCOPE`, the disclosure
  copy, and this ADR's status note — no other code change. *(Executed
  2026-10-14 — see the Amendment below.)*

## Amendment (2026-10-14) — storage scope finalized: `localStorage`

**Client decision (confirmed 2026-10-14 on board card `t_6886a974`, brief change
log item 7 — final, do not re-litigate): the storage scope is `localStorage`**
(survives full browser restarts), not `sessionStorage`. This section supersedes
every scope statement above it: Decision item 1's original `'session'` value,
the GATE 2 open question's interim default, and the interim disclosure phrasing
"local session cache only". The context and decision trail above stand as
recorded.

### Final scope

- `STORAGE_SCOPE = 'local'` in `session-store.js` — the one constant that
  selects the backing store (`localStorage`). The mechanism flip lands via
  implementation card BE-FIX-1; nothing outside `session-store.js` branches on
  the scope.
- **Settings persist indefinitely, with no expiry:**
  `choghadiya.settings.{timeFormat,lang,location}` are written with no `ttlMs`
  (envelope `t: null`) and survive browser restarts until the user clears site
  data (or `clear()` is invoked).
- **Geocache entries keep the 24 h TTL envelope** (item 7b unchanged):
  `choghadiya.geocache.entry.<lang>\u0000<normalized query>` with
  `ttlMs = 24 h`, FIFO-capped at 64 via `choghadiya.geocache.index`.
- **Disclosure phrasing: "no server storage; local TTL-gated cache only."**

### Consequences of the scope change

- **Privacy disclosure change (US-17).** The disclosure copy must reflect
  indefinite on-device persistence of settings, not per-tab lifetime. FE/TW own
  the wording (FE-4/TW-1); the phrasing above is client-confirmed.
- **Shared-device at-rest exposure.** Settings (including the last selected
  location with coordinates and its label) and recent city-name searches now
  sit in `localStorage` at rest and are readable by anyone with access to the
  same browser profile until cleared — longer exposure than the interim
  per-tab scope.
- **Cache bounded by TTL, settings not.** Only geocache entries expire (24 h);
  the three settings keys have no expiry envelope. There is no TTL on settings
  by design — the client asked for indefinite persistence.
- Everything else in this ADR is unchanged: single storage module, envelope
  wire format, never-throws fallback, `choghadiya.*` namespace, the
  sessionStorage/localStorage hygiene grep (DO-1), ADR-007 superseded in part.

### Revert path

One line: set `STORAGE_SCOPE = 'session'` in `session-store.js` — restores
per-tab retention with zero other code changes. Then revert the disclosure copy
and this ADR's status note (mirror of the original flip).

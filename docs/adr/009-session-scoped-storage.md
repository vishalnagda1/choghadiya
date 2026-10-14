# ADR-009 — Session-scoped client storage for settings + geocoding cache (v2.3.0)

- **Status:** Accepted (2026-10-14) — **supersedes [ADR-007](007-no-persistent-storage.md)
  in part**; one implementation-scope question open for GATE 2 (see "Open question"
  below). The storage *scope* decision (`sessionStorage`) is settled for now.
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
   - `set(key, value, opts = {})` — `opts.ttlMs` optional; **absent = session
     lifetime (no expiry)**;
   - `remove(key)`, `clear()`;
   - `STORAGE_SCOPE = 'session'` — the scope decision lives in this one constant.
2. **Wire format.** Every entry is a JSON envelope `{ t: <epoch ms>, v: <value> }`.
   `get` returns `null` **and deletes the entry** when it is expired (`now >
   t + ttlMs`), malformed, unparsable, or not an envelope. Keys are namespaced
   `choghadiya.*`.
3. **Never throws.** All storage access is wrapped in try/catch with a silent
   in-memory `Map` fallback (private mode, quota exceeded, disabled storage →
   the app keeps working with zero user-visible failures).
4. **What is persisted (item 7a).** Settings only:
   `choghadiya.settings.timeFormat` (`'12h'` default | `'24h'`),
   `choghadiya.settings.lang` (`'hi'` default | `'en'`),
   `choghadiya.settings.location` (`{lat, lon, timezone, label}` | null).
   `viewedDate` is **not** persisted (reload always returns to today).
5. **Geocoding cache (item 7b).** `geocoder.js` gains an optional
   `createGeocoder({ fetchImpl, cacheStore })`. **With no `cacheStore` the
   behaviour is exactly v2.2.0** (in-memory FIFO-64 `Map`). With a
   session-backed `cacheStore` (built on `session-store.js`): TTL **24 hours**,
   FIFO cap 64 entries, cache key = normalized query + language, so the same
   city query costs zero fetches across reloads in the same tab.
6. **Privacy stance becomes "no server storage; local session cache only."**
   The disclosure copy must change accordingly (US-17 line is no longer
   literally true — see Consequences); FE-4/TW-1 own the wording.

### Open question — GATE 2 (client decision, implementation is a one-line flip)

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
  cached **locally, per tab session, on-device only**; nothing is stored on a
  server; coordinates still never leave the device (the origin table in
  `04-architecture.md` §5.2 is unchanged).
- **ADR-007 is superseded in part.** Its history stands: v1–v2.2.0 shipped with
  zero storage and that remains accurate for those releases. Its status line
  carries a superseded-by pointer; this ADR is the storage record from v2.3.0.
- **New hygiene constraint (enforced by the security greps gate, DO-1):**
  `sessionStorage`/`localStorage` may appear **only** in `session-store.js`.
- **Threat model / audit delta (SEC-1):** new data-at-rest surface (settings,
  city names, last location), cleared on tab close; no new network origins, so
  the CSP and the §5.2 origin list are unchanged.
- **If GATE 2 flips to `localStorage`:** change `STORAGE_SCOPE`, the disclosure
  copy, and this ADR's status note — no other code change.

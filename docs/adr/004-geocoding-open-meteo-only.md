# ADR-004 — Open-Meteo Geocoding is the only geocoder in v1

- **Status:** Accepted (2026-10-14)
- **Deciders:** architect (research §7 adopted; narrowing PRD MVP item 4's fallback wording)
- **Impacts:** CSP origin list, US-5, US-10, US-17, fair-use terms

## Context

Manual city lookup must map a typed name to coordinates **and an IANA timezone**
(R2) from a free, keyless, CORS-friendly API. Research §7 recommends Open-Meteo
Geocoding as primary (returns `timezone`, keyless, permissive CORS, multilingual)
with Nominatim as "explicit-submit fallback". Nominatim has strict policy (1 req/s,
identifying Referer/User-Agent, no autocomplete) and does **not** conveniently
return an IANA timezone. The UX handoff states `https://geocoding-api.open-meteo.com`
is the only network origin in v1, and the threat model is built on that list.

## Decision

Implement **Open-Meteo Geocoding only**
(`https://geocoding-api.open-meteo.com/v1/search`), behind the `geocoder.js`
contract (`04-architecture.md` §5.1/§5.2). **Nominatim is not implemented in v1.**
It is recorded as the documented contingency if Open-Meteo terms or availability
change — activating it requires: a second CSP origin, OSM/ODbL attribution, a
timezone source, and an ADR amendment. Request discipline (US-5 AC4, US-10 AC2):
one request per explicit submit or 400 ms quiet period, per-query in-memory cache,
`AbortController` for superseded requests — **never** per-keystroke calls.

## Alternatives considered

- **Open-Meteo primary + Nominatim runtime fallback**: rejected for v1 — doubles
  the origin list, the attribution obligations and the error paths, for a failure
  mode (geocoder outage) whose right UX is a retry message (S6), not a silent
  provider switch.
- **Nominatim only**: rejected — no timezone field, strict policy makes a public
  tool's autocomplete legally risky, ODbL attribution burden.
- **Keyed providers (Google/Mapbox/LocationIQ)**: rejected — secrets contradict
  NFR-S1 and ADR-001's no-secrets forcing function.

## Consequences

- Exactly one network origin in v1; CSP `connect-src 'self'
  https://geocoding-api.open-meteo.com` (04-architecture.md §5.3).
- Terms to respect and disclose: non-commercial fair use, <10,000 calls/day
  (client confirmed non-commercial — PRD A6; commercial use re-opens this ADR,
  PRD Q5); GeoNames **CC-BY 4.0 attribution** ships as `attribution.geocoding`
  in the footer + `privacy.line` disclosure (US-17).
- If Open-Meteo exceeds 10k calls/day or goes down, the UI degrades honestly (S6)
  rather than pretending a fallback exists.

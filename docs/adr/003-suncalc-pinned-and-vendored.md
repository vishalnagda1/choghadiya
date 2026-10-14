# ADR-003 — `suncalc@2.1.1` pinned and vendored locally

- **Status:** Accepted (2026-10-14)
- **Deciders:** architect (research §4 recommendation adopted)
- **Impacts:** CSP origin list, NFR-S4, PRD US-6, threat model

## Context

The core calculation needs sunrise/sunset for any location/date. Research §4/§5
selects `suncalc` (BSD-2-Clause, dependency-free, ESM + UMD, ~3.5k stars, ~0.45M
weekly downloads) and confirms its default convention (`−0.833°`, upper-limb +
refraction) **matches the mainstream Indian panchang convention** (Drik Panchang's
default), so no custom astronomy is needed. PRD US-6 AC1 allows "vendored or
versioned CDN URL — never floating `latest`". The UX handoff requires
`https://geocoding-api.open-meteo.com` to be **the only network origin in v1**.

## Decision

Vendor the **`suncalc@2.1.1` ESM build verbatim** into the repo at
`vendor/suncalc-2.1.1.js` and import it as a local module
(`import * as SunCalc from "./vendor/suncalc-2.1.1.js"`). The file is committed,
checksum-verified at scaffold time (devops records the npm tarball source in the
commit message), and never edited by hand. Version upgrades are a deliberate,
reviewed file replacement — never automatic.

## Alternatives considered

- **Versioned CDN (`cdn.jsdelivr.net/npm/suncalc@2.1.1/+esm`)**: rejected — it adds
  a third-party origin to `script-src`, breaking the "one network origin" property
  the threat model is built on, adds a runtime network dependency (contradicting
  NFR-P4's offline-capable core) and a supply-chain surface for a ~3 KB file.
- **Hand-rolled NOAA solar equations**: rejected — re-implements well-tested
  astronomy and risks silently diverging from the mainstream convention (R1).
- **`solar-calculator` / `sun-position`**: rejected — no accuracy advantage here;
  suncalc's convention match is already verified by research §5.5 cross-checks.

## Consequences

- `script-src 'self'` suffices in the CSP (`04-architecture.md` §5.3).
- The core calculation works with zero network after page load (NFR-P4).
- One third-party runtime artifact exists in the repo: pinned version, permissive
  licence, diffable. The security audit (`docs/09-security-audit.md`) re-verifies
  the vendored file matches the published 2.1.1 build.
- Do not mix suncalc v1 examples/APIs with the vendored v2 (research §4 warns of a
  breaking change); the API used is `getTimes(date, lat, lng)`.

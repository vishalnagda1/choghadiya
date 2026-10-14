# ADR-006 — Single hand-rolled i18n dictionary file

- **Status:** Accepted (2026-10-14)
- **Deciders:** architect (research §4/§9 recommendation; 03-ux §6 is the contract)
- **Impacts:** `i18n.js`, US-11, M4 string-coverage gate

## Context

The product is bilingual EN/HI with ~58 user-facing strings, Hindi default,
instant no-refresh toggle (US-11). The UX copy deck (03-ux §6) fixes the exact
keys and both languages. A build-step-free stack (ADR-002) rules out compile-time
i18n tooling.

## Decision

One file, **`i18n.js`**, exporting `DICT = { hi: {...}, en: {...} }` (the 58 keys
of 03-ux §6 **verbatim**) and `t(key, lang, vars)` with `{n}`-style interpolation
(only `city.resultsCount` uses it). Rendering binds via `data-i18n` attributes and
`textContent` updates; `<html lang>` flips `hi`/`en` on toggle (US-11 AC5). Language
is **session-memory only** (no persistence — ADR-007); default is `hi` on every
visit. A dev-mode unknown key throws; production renders the key visibly so QA can
never mistake a missing string for a translation (US-11 AC3, M4).

## Alternatives considered

- **i18next / @lingui runtime**: rejected — a dependency and API surface for two
  locales of static strings; violates the simplicity budget.
- **Two files (`hi.js` / `en.js`)**: rejected — harder to diff keys across locales;
  one file makes the coverage test trivial and matches 03-ux's "single dictionary
  file" requirement (US-19 AC1).
- **Inline strings per component**: rejected — breaks the M4 coverage gate and the
  instant-toggle requirement.

## Consequences

- QA's M4 gate = an automated test asserting both locales define exactly the 58
  keys of 03-ux §6 (implemented as a contract test in `tests/`).
- New copy must be added to the dictionary **and** the 03-ux table; the wireframe's
  inline subset (03-ux §10) is explicitly not production code.
- Third-party text (city names) never flows through `t()` or `innerHTML`
  (NFR-S2) — dictionary values are our own literals only.

# ADR-002 — Vanilla JS ES modules; `choghadiya.js` / `geocoder.js` split

- **Status:** Accepted (2026-10-14)
- **Deciders:** architect
- **Impacts:** file surface (brief/PRD US-19 AC1), testability, ticket parallelisation

## Context

The brief and PRD US-19 AC1 specify the shipped surface as `index.html` +
`style.css` + `app.js` + an i18n dictionary "plus assets", with **no build step**
and vanilla JS. The UX handoff (`03-ux.md` §9.1) asks for `app.js` to split pure
calculation (`buildSchedule`) from rendering. Unit tests must be able to import the
schedule engine **without a DOM** (research R8: the sequence must be test-locked),
and the plan requires tickets with disjoint file ownership so backend-dev and
frontend-dev can work in parallel.

## Decision

1. **Vanilla ES2022 modules**, loaded via `<script type="module" src="app.js">`.
   No framework, no bundler, no transpiler. Evergreen browsers only (PRD NFR-B4).
2. The pure calculation lives in **`choghadiya.js`** (no DOM, Node-importable) and
   the geocoding client in **`geocoder.js`** (injectable `fetch`); `app.js` keeps
   orchestration + rendering. The i18n dictionary is one file, `i18n.js` (ADR-006).
   Exported contracts are frozen in `04-architecture.md` §5.1.
3. If the client insists on the literal four-file list, `choghadiya.js` and
   `geocoder.js` fold into `app.js` as delimited "Part A — pure" / "Part B — DOM"
   sections **without changing any exported function contract**.

## Alternatives considered

- **Everything in one `app.js`** (literal brief reading): rejected as the default —
  it forces a DOM shim in unit tests and makes two roles edit one file, which the
  plan's parallelisation requirement forbids. Kept as the documented fallback (3).
- **Framework + bundler (React/Vite/Svelte)**: rejected — one screen, 16 rows,
  two locales; a toolchain contradicts C2 and inflates NFR-P3 budget for zero
  user value.
- **AMD / plain script tags with globals**: rejected — modules give real imports,
  testable exports and no global namespace leaks, with identical deploy simplicity.

## Consequences

- Tests (`node --test`) import `choghadiya.js` directly; no jsdom needed.
- `app.js` must keep all DOM access inside `init()`/render functions (CI review
  check) so imports stay Node-safe.
- ES modules require correct MIME (`text/javascript`): GitHub Pages serves `.js`
  correctly; do **not** use `.mjs` (Pages may serve it as `application/octet-stream`).
- Slight surface deviation from the brief's file list is recorded here and in
  `04-architecture.md` §2.3; the escape hatch (3) keeps it reversible.

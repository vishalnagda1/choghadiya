# ADR-001 — Static site on GitHub Pages, no backend

- **Status:** Accepted (2026-10-14)
- **Deciders:** architect (client constraint confirmed in `docs/00-brief.md`)
- **Impacts:** deployment, security model, privacy posture, PRD US-19

## Context

The client's brief fixes the delivery model: frontend-only, hosted on GitHub Pages
at `https://time.gitick.com/`, no server logic. The product needs no user accounts,
no stored data, and exactly one optional third-party call (city geocoding). The
charter asks for a one-command local run and boring technology.

## Decision

Ship the app as **static files on GitHub Pages** (custom domain `time.gitick.com`,
`CNAME` in the repo). No backend, no SSR, no database, no serverless functions —
including for future v1.x features. Local development is `make dev`
(`python3 -m http.server 8080`). Per the client-authorized release definition
(`docs/00-brief.md`, 2026-10-14): releases are published to
**`github.com/vishalnagda1/choghadiya` (`main`) via the authenticated `gh` CLI**,
and every release carries a **semver git tag** bumped from `package.json` 2.1.0
(next release: v2.2.0). The packaging + tag + deploy step is one devops card
(`t_169d64f7`) behind GATE 2; CI (`.github/workflows/ci.yml`) only runs tests.

## Alternatives considered

- **A small serverless backend** (e.g. a geocoding proxy): rejected — adds a
  deploy surface, a second codebase, secrets management and cost to a product whose
  geocoder is already keyless and CORS-friendly. It would also invalidate the
  privacy claim "no backend".
- **Static host elsewhere** (Netlify/Vercel): rejected — the client already serves
  `time.gitick.com` from GitHub Pages; migrating is scope with no user value.
- **Build-step framework (Vite/React/etc.)**: rejected in ADR-002.

## Consequences

- Scale and cost are non-issues (CDN-served static files); rollback = git revert.
- GitHub Pages cannot set response headers → the CSP is delivered as a `<meta>` tag
  (`frame-ancestors` cannot be claimed — documented in `04-architecture.md` §5.3).
- Cache busting must be URL-based (`?v=`, `04-architecture.md` §11) because we
  cannot set `Cache-Control` ourselves.
- Any future feature requiring server state must go back to the client before it
  can ship.

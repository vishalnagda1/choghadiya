# 06 — Threat Model & Security Requirements

Project: **Choghadiya Refactor** · Owner: security-engineer · Date: 2026-10-14 · Version: **v1.0 (initial)**
Upstream: `docs/00-brief.md` (§Data & compliance, §Release definition), `docs/02-prd.md` (NFR-S1..S5, NFR-PR1..PR4), `docs/04-architecture.md` (§5.2 origin list, §5.3 CSP, §6–§9), `docs/adr/003`, `docs/adr/004`, `docs/adr/007`, `docs/05-plan.md` (ticket IDs referenced below).
Downstream: `docs/09-security-audit.md` (pre-release verification of this document's checklist), FE-01..FE-05 / BE-01..BE-04 / DO-01 / DO-02 tickets (implementation), release card `t_169d64f7` (ops hygiene), GATE 2 (release gate).

This document is the **design-time threat model**. It assumes the architecture exactly as
fixed in `04-architecture.md` v1.0.1 (the §5.2 origin allow-list and §5.3 CSP are inputs,
not open questions). Section 8 lists the only security-driven changes to that architecture
and their ADR impact. The checklist in §6 is the contract developers implement against and
the pre-release audit (`docs/09`) verifies item by item.

---

## 1. Scope, system context & assumptions

### 1.1 What is being modelled

A single-route, static, client-only web app served from GitHub Pages
(`https://time.gitick.com/`, repo `github.com/vishalnagda1/choghadiya`). One HTML page,
three hand-written JS modules (`app.js`, `choghadiya.js`, `geocoder.js`), one i18n
dictionary (`i18n.js`), one stylesheet, one vendored library (`vendor/suncalc-2.1.1.js`).
There is **no backend, no accounts, no storage, no secrets** (ADR-007, C1, C5).

Exactly **one network request type** exists in the product:

| # | Call | Target | Data sent | Trigger |
|---|------|--------|-----------|---------|
| N1 | `GET /v1/search` | `https://geocoding-api.open-meteo.com` | `name` (the typed city name), `count=8`, `language` | Manual city search only (explicit submit or 400 ms debounce) |

Browser Geolocation is on-device and transmits nothing (US-4 AC3). Everything else —
schedule computation, timezone handling, rendering — is local arithmetic (NFR-P4).

### 1.2 Assumptions (validating these is part of the pre-release audit)

- A1: GitHub Pages serves the repo `main` over HTTPS with HSTS at the apex and Pages'
  own transport security; we cannot set response headers (ADR-001) — CSP is delivered
  via `<meta>` and `frame-ancestors` cannot be enforced (see §9, R1).
- A2: The browser is honest (the user's own device is outside the trust boundary for
  self-harm: a user can read their own coordinates in devtools — that is not a threat).
- A3: Open-Meteo is a *semi-trusted* third party: its responses are treated as
  **hostile input** regardless (compromise, bug, or reflection of hostile city names).
- A4: The repo, the `gh` CLI credential, and the DNS account for `time.gitick.com` are
  operator-controlled trust roots; their compromise is out of code scope but is listed
  in §9 (R3, R4).
- A5: v1 ships no service worker, no postMessage, no iframes, no URL-driven state
  (no query/hash parameters are read), so several standard web threat classes have no
  surface at all.

---

## 2. Assets & attacker model

### 2.1 Assets worth protecting (ordered)

| # | Asset | Why it matters | Where it lives |
|---|-------|----------------|----------------|
| A1 | Integrity of the served JS/HTML/CSS | A tampered page runs arbitrary code in users' browsers on our origin | GitHub Pages / CDN / repo `main` |
| A2 | User privacy: device coordinates | NFR-PR1 — must never leave the device | Browser memory only |
| A3 | User privacy: typed city name | The only user-derived datum transmitted (NFR-PR2); disclosed, but must not leak anywhere beyond N1 | Request to Open-Meteo only |
| A4 | CSP and origin allow-list | The single enforcement mechanism constraining every compromise downstream | `index.html` `<meta>` |
| A5 | Supply chain: `vendor/suncalc-2.1.1.js` | The only third-party runtime code; tampering = arbitrary code execution in page | Repo |
| A6 | Release credential (`gh` PAT, repo + workflow scopes) | Repo write + workflow edit = total site control (A1) | Operator environment (never the repo) |
| A7 | Correctness of displayed times | Trustworthiness of the product (astrological advice) — integrity of computation | `choghadiya.js` |

### 2.2 Attacker classes

| Attacker | Capability | Relevant? |
|----------|-----------|-----------|
| AL1 — Network attacker (MITM, hostile Wi-Fi) | Intercept/modify HTTP traffic | Yes, mitigated by HTTPS-only + HSTS (host-provided) |
| AL2 — Hostile web input via third party | Control fields of the Open-Meteo response (compromised/malicious service, or reflected hostile place names from GeoNames) | **Yes — the primary application-layer threat** |
| AL3 — Malicious site operator targeting our users | Clickjacking/UI redress against the page | Yes, low impact (R1) |
| AL4 — Supply-chain attacker | Tamper npm `suncalc`, devDeps, or a GitHub Action | Yes (R2) |
| AL5 — Repo/PAT intruder | Push malicious code to `main`, edit CI | Yes, ops scope (R3) |
| AL6 — Curious user / malware on own device | Read own data in devtools | **No** (A2) |
| AL7 — Auth bypass / API abuser | No auth exists; geocoder abuse is client-debounced, fair-use product constraint (ADR-004) | Marginal |

### 2.3 Explicitly out of scope for this model

- GitHub Pages / GitHub / DNS registrar infrastructure compromise (accepted risk, §9).
- Denial of service against GitHub or Open-Meteo (external availability).
- Physical access to the user's device, browser extension compromise.
- Legal/consent regimes beyond the stated disclosure (US-17).

---

## 3. Trust boundaries

```text
 ┌─────────────────────────── User's browser (single origin) ───────────────────────────┐
 │  index.html (CSP meta) · app.js · choghadiya.js · i18n.js · geocoder.js · suncalc    │
 │  ┌ TB2: hostile-ish inputs ─────────────┐                                           │
 │  │ typed city query · Geolocation API   │   (user input & third-party JSON)         │
 │  └──────────────────────────────────────┘                                           │
 └───────────────┬──────────────────────────────────────────────────────────────────────┘
                 │  TB1: HTTPS GET /v1/search — ONLY crossing (city name, count, language)
                 ▼
        https://geocoding-api.open-meteo.com        (semi-trusted: responses are hostile input)

 TB3 (ops, outside the runtime):  repo main ──(gh CLI, PAT)──► GitHub Pages ──► time.gitick.com
 TB4 (supply chain):  npm tarball suncalc@2.1.1 ──(manual vendored copy + checksum)──► repo
```

| Boundary | Crosses | Trust rule |
|----------|---------|------------|
| **TB1** | Outbound GET to Open-Meteo | Only the typed city name crosses. Response fields are validated and allow-listed before use (SEC-10/11). Never `credentials`, cookies, coordinates, or identifiers. |
| **TB2** | User input (query, geolocation) into app state | Query is length/charset-validated (SEC-08); geolocation values are finite-number-checked; all rendering of derived text is `textContent` (SEC-05). |
| **TB3** | Code → production | Any push to `main` is live. Release credential hygiene + tag discipline (SEC-19); CI never deploys (SEC-18). |
| **TB4** | Vendor artifact into repo | Byte-copy with recorded sha256 at DO-01; re-verified at audit (SEC-16). |

There is **no TB for auth, storage, or server APIs** — none exist (ADR-007, 04 §6).

---

## 4. STRIDE threat analysis per component

Severity: **H** = High, **M** = Medium, **L** = Low, **I** = Informational.
"Ctrl" refers to checklist items in §6.

### 4.1 `index.html` — static shell, CSP `<meta>`, asset references

| STRIDE | Threat | Sev | Controls | Residual |
|--------|--------|-----|----------|----------|
| Tampering | CDN/DNS/cache poisoning serves altered HTML (A1) | M | HTTPS + host HSTS (A1); versioned asset URLs; release is a tagged, reviewed commit (SEC-19); rollback = revert (04 §11) | GitHub infra trust (R3/R5) |
| Tampering | CSP meta ineffective because it parses after a resource loads | M | SEC-01: CSP meta is the **first element of `<head>`** | Pre-CSP parse window is empty by construction |
| Information disclosure | Referer header discloses page URL / browsing context to Open-Meteo | L | SEC-02: `<meta name="referrer" content="no-referrer">` | none |
| Elevation | Clickjacking: our `<dialog>`/UI overlaid on a hostile page (`frame-ancestors` is **not** enforceable via `<meta>`, A1) | L | Documented, accepted (R1); content is read-only public data with no actions worth tricking | **Accepted** — revisit if hosting gains header control |
| Elevation | Inline `style`/`<script>`/event-handler attributes reintroduce CSP-unsafe sinks | M | SEC-03: no inline styles/handlers/scripts; styling via classes or CSSOM | none if enforced in review |

### 4.2 `app.js` — state, orchestration, DOM rendering

| STRIDE | Threat | Sev | Controls | Residual |
|--------|--------|-----|----------|----------|
| Tampering (XSS) | Geocoder result fields (`name`, `admin1`, `country`, labels) contain HTML/script payloads (AL2) | **H** | SEC-05: `textContent`/`createElement` only — no `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, URL-HTML sinks (NFR-S2); CSP `script-src 'self'` is the second layer | none expected; verified by audit grep (SEC-22) |
| Tampering (DOM clobbering) | Form controls / `id` attributes shadow `window.*` or `document.*` globals and corrupt state | M | SEC-07: module-scope state only; explicit `querySelector`; no reliance on named globals | none |
| Information disclosure | `console.*` leaks city names / coordinates / queries (A2, A3) | M | SEC-21: production logs bare error codes only; no payload data (04 §8.2) | User's own devtools (out of scope) |
| Denial of service | `NaN` / `Invalid Date` / `undefined` rendered → broken UI, unhandled `Intl`/`Date` `RangeError` | M | SEC-11 (validated inputs), 04 §8.1 `assertRenderable()`; BE-01/BE-03 test fixtures (polar, DST) | none |
| Tampering | Interpolation vars in `t()` rendered as HTML | M | SEC-06: `t()` output is always consumed as text | none |

### 4.3 `choghadiya.js` — pure calculation (no DOM/network)

| STRIDE | Threat | Sev | Controls | Residual |
|--------|--------|-----|----------|----------|
| Denial of service | Hostile/absurd timezone strings from TB1 throw in `Intl.DateTimeFormat` | M | SEC-11: IANA name validated (`try new Intl.DateTimeFormat(…, {timeZone})`) before entering `Location`; unknown tz result is dropped | none |
| Tampering (integrity of output, A7) | Incorrect sequence/date-boundary math misleads users | M (product) | 112-assertion sequence lock (BE-01), continuity invariant, Mumbai/DST/polar fixtures (BE-03/BE-04) | ±2 min vs panchang is QA's manual gate |
| Other STRIDE | — | — | Module is `window`/`document`-free by contract (04 §2.3); no data flows out | — |

### 4.4 `geocoder.js` — the only TB1 crossing

| STRIDE | Threat | Sev | Controls | Residual |
|--------|--------|-----|----------|----------|
| Tampering (XSS entry) | Hostile strings in the JSON response reach the DOM (AL2) | **H** | SEC-05 (render layer), SEC-10 (allow-list mapping into fresh objects — no spread of raw JSON, defeating prototype-pollution and surprise fields) | Open-Meteo as a service (R6) |
| Tampering (prototype pollution) | `__proto__`/`constructor` keys in raw JSON pollute shared prototypes | M | SEC-10: explicit field mapping to a new object literal | none |
| Spoofing / SSRF-class | Query text escapes its parameter and retargets the request (other path/origin/params) | M | SEC-09: fixed base-URL constant; `URLSearchParams`/`encodeURIComponent`; user input only in `name`; `fetch` target is never derived from user or response data | none |
| Information disclosure | Unexpected request contents (coordinates, cookies, auth) | **H** (privacy) | SEC-13: only `name`/`count`/`language`; `credentials: 'omit'`; no auth headers; audit greps shipped files for `http://` and non-allow-listed origins (SEC-14) | none |
| Denial of service | Per-keystroke request storms (self-inflicted fair-use breach) | M | SEC-12: 400 ms debounce + explicit submit + in-memory cache capped ≤ 64 entries (FIFO) + `AbortController` supersede | Open-Meteo fair use ceiling is a product constraint (ADR-004) |
| Denial of service | Oversized/hostile payloads crash the client | L | `count=8` bounds the response; fields length-capped at SEC-11; non-2xx/parse failure → `GeocoderError` → S6 state (never a crash) | none |
| Information disclosure | Error handling echoes raw response/URL into UI or console | L | SEC-21 error taxonomy: bare codes (`geocode-network`, `geocode-http`) only | none |

### 4.5 `i18n.js` — dictionary + `t()`

| STRIDE | Threat | Sev | Controls | Residual |
|--------|--------|-----|----------|----------|
| Tampering | Dictionary edit injects markup (A1 — repo integrity) | L | Values are our own literals, reviewed in code review; and every consumption point is `textContent` anyway (SEC-05/06) — so even a hostile dictionary entry renders as text | none |
| Information disclosure | — | — | Static literals, no user data | — |

### 4.6 `vendor/suncalc-2.1.1.js` — the only third-party runtime code

| STRIDE | Threat | Sev | Controls | Residual |
|--------|--------|-----|----------|----------|
| Tampering (supply chain, AL4) | Malicious code in the vendored build or a later "update" | **H** | SEC-16: verbatim npm `suncalc@2.1.1` ESM byte-copy, sha256 + source recorded in the DO-01 commit; never hand-edited; never a CDN at runtime (ADR-003); audit re-verifies against the registry tarball | Malicious upstream release at pin time (mitigated by pinning one reviewed version; R2) |
| Tampering | Drift between vendored file and pinned version | L | Audit byte-compares (SEC-16); `suncalc` is dependency-free | none |

### 4.7 Hosting, deploy & CI (`main` → GitHub Pages → `time.gitick.com`)

| STRIDE | Threat | Sev | Controls | Residual |
|--------|--------|-----|----------|----------|
| Tampering | Unauthorized push to `main` ships hostile JS (AL5) | **H** | SEC-19: PAT never in repo/logs/CI; operator credential store; tag+release discipline (brief §Release); rollback = revert; recommend branch protection on `main` (ops note) | PAT holder is fully trusted (R3) |
| Tampering | CI workflow modified to exfiltrate or tamper (AL4/AL5) | M | SEC-18: `permissions: contents: read`; actions pinned to full commit SHA; **CI never deploys** and holds no secrets; deploy is the manual `gh` step in `t_169d64f7` | Workflow-scope PAT can edit workflows (R3) |
| Spoofing | DNS/registrar hijack of `time.gitick.com` | L | Hosted DNS account hygiene (ops, out of repo); HTTPS cert issued via Pages | Registrar trust (R4) |
| Information disclosure | Pages/CDN logs — server-side logs exist at GitHub and are outside our control | L | No PII is ever sent to the site itself (only GitHub sees IPs of page loads — inherent to hosting) | Accepted (R5) |

### 4.8 Dev tooling (`node --test`, `axe-core`, headless Chromium) — never ships

| STRIDE | Threat | Sev | Controls | Residual |
|--------|--------|-----|----------|----------|
| Tampering (supply chain) | Malicious devDependency | L | SEC-17: exact-pinned devDeps; devDeps never referenced from shipped files (DO-02 AC); `npm audit` recorded at audit time | npm ecosystem risk, dev-only |
| Information disclosure | Tests phone home (hidden network) | L | SEC-23: no network in any test (`fetchImpl` injection proves the boundary) | none |

---

## 5. Risk register (consolidated)

| ID | Risk (threat → impact) | Inherent | Treatment | Residual |
|----|------------------------|----------|-----------|----------|
| RK1 | Hostile geocoder response → XSS in our origin (A1/A2) | **High** | textContent-only rendering + field allow-list + CSP `script-src 'self'` + no HTML sinks | Low |
| RK2 | Vendored suncalc tampered → arbitrary JS in page | **High** | Pinned byte-copy + checksum + no CDN + audit re-verification | Low |
| RK3 | PAT/`main` compromise → hostile site deploy | **High** | Credential hygiene, tag discipline, revert-based rollback, branch protection (recommended) | Medium (trusted-operator model) |
| RK4 | Privacy leak (coordinates / query) via extra requests or logs | **High** | Origin allow-list + `credentials:'omit'` + no-console-payload rule + audit origin grep | Low |
| RK5 | CSP-unsafe inline styles/scripts reintroduced by implementation | Medium | SEC-01/03 + review + audit grep | Low |
| RK6 | Prototype pollution / type confusion via raw JSON | Medium | SEC-10/11 explicit mapping + validation | Low |
| RK7 | Clickjacking (no `frame-ancestors` possible via `<meta>`) | Low | Accepted + documented (R1) | **Accepted, Low** |
| RK8 | Geocoder abuse / fair-use breach | Medium | Debounce, submit-only, cache cap (SEC-12) | Low |
| RK9 | `Intl`/`Date` RangeError crashes on hostile tz/coords | Medium | SEC-11 validation; polar/DST fixtures | Low |
| RK10 | CI workflow supply chain (action tags are mutable) | Medium | Pin actions to commit SHA, read-only permissions (SEC-18) | Low |
| RK11 | DNS hijack of custom domain | Low | Ops hygiene (R4) | Accepted, Low |

---

## 6. Security requirements checklist (implementation contract)

Every item is **required for release** and will be verified one-by-one in
`docs/09-security-audit.md` (NFR-S5, GATE 2). Owner = the `05-plan.md` ticket that
implements it (plan IDs; the CTO owns board-card creation).

### 6.1 CSP & delivery hardening

- [x] **SEC-01** *(FE-01)* — The CSP `<meta>` exists **verbatim** as `04-architecture.md` §5.3
      (`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self' https://geocoding-api.open-meteo.com; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`) **and is the first element of `<head>`**, before any `<link>`, `<script>`, or `<style>`.
- [x] **SEC-02** *(FE-01)* — `<meta name="referrer" content="no-referrer">` present in `<head>`.
- [x] **SEC-03** *(FE-01/FE-02/FE-03/FE-05)* — No inline `style="…"` attributes, no `<style>` blocks,
      no inline event handler attributes (`onclick=` etc.), no inline `<script>` with logic
      (a documented, logic-free `nomodule`/bootstrap fallback is the only exception).
      Dynamic styling uses CSS classes or CSSOM property assignment (`el.style.x = …` is
      allowed; `el.setAttribute('style', …)` is **not**). `style-src 'self'` is enforced as written.
- [x] **SEC-04** *(FE-01)* — All asset references are same-origin and carry `?v=${ASSET_VERSION}`;
      no `<base>`, no `preconnect`/`dns-prefetch`/`prefetch`/`prerender` hints, no external
      `<link>` (fonts, icons, manifests) — anywhere in shipped files.

### 6.2 Output handling / XSS (the primary application threat)

- [x] **SEC-05** *(FE-02/FE-03)* — All dynamic text (geocoder `name`/`admin1`/`country`, location
      labels, formatted dates/times, interpolated vars) is inserted with `textContent` /
      `createElement` only. **Zero** occurrences of `innerHTML`, `outerHTML`,
      `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, `setAttribute('style')`,
      or `javascript:` URLs in shipped files (NFR-S2).
- [x] **SEC-06** *(FE-02)* — `t()` output and dictionary values are only ever consumed as text;
      interpolation (`{n}`) never becomes markup.
- [ ] **SEC-07** *(FE-02/FE-03)* — DOM-clobbering hygiene: all state in ES-module scope; element
      lookup via explicit `querySelector`; no reads of implicit `window.*`/`document.*` globals;
      form controls carry no `name` attributes. *(⚠️ PARTIAL at audit 2026-10-14 — F2 (Low):
      `index.html:190` input carries `name="city"`; no exploitable path (module scope, no
      global reads); see `docs/09-security-audit.md` §7.)*

### 6.3 Input & third-party data validation (TB1/TB2)

- [x] **SEC-08** *(BE-02)* — Query validated before any request: trimmed, 2–64 chars, no control
      characters; violations throw `GeocoderError{code:'bad-query'}` **without a request**.
- [x] **SEC-09** *(BE-02)* — Request target is a hard-coded constant
      (`https://geocoding-api.open-meteo.com/v1/search`); parameters built with
      `URLSearchParams`/`encodeURIComponent`; user input lands **only** in `name`; the fetch
      URL is never composed from user input or response data.
- [x] **SEC-10** *(BE-02)* — Response objects are **never spread or copied wholesale**; only the
      allow-listed fields (`name`, `admin1`, `country`, `latitude`, `longitude`, `timezone`,
      `population`) are mapped onto a fresh object literal (defeats prototype pollution and
      surprise-field injection).
- [x] **SEC-11** *(BE-02/BE-03)* — Every third-party value is type/range-checked before use:
      `latitude` finite ∈ [−90, 90], `longitude` finite ∈ [−180, 180], `population` finite or
      ignored; `timezone` must pass `new Intl.DateTimeFormat('en', { timeZone })` (else the
      result is dropped); all strings length-capped (≤ 200 chars) before storage/rendering.
      A malformed result is **dropped**, never crashed on.
- [x] **SEC-12** *(BE-02)* — Rate discipline: one request per explicit submit or 400 ms quiet
      period; in-memory cache **capped at ≤ 64 entries** (FIFO eviction); `AbortController`
      cancels superseded in-flight requests; at most one in-flight request at a time.

### 6.4 Network & privacy (NFR-PR1..PR4)

- [x] **SEC-13** *(BE-02/FE-03)* — `geocoder.js` is the only module calling `fetch`; requests carry
      **no** credentials/cookies/auth headers (explicit `credentials: 'omit'`), no coordinates,
      no identifiers — only `name`, `count=8`, `language`.
- [x] **SEC-14** *(all FE/BE)* — Shipped files contain zero references to any origin other than
      `https://geocoding-api.open-meteo.com` (and no `http://` at all): no analytics, trackers,
      beacons (`sendBeacon`/`XMLHttpRequest` to third parties), webfonts, or CDN URLs. A grep of
      the shipped tree must show only the allow-listed origin.
- [x] **SEC-15** *(FE-03)* — The privacy one-liner (US-17) is visible in the city-search sheet and
      the footer attribution is present (NFR-PR4) — disclosure is part of the trust boundary.

### 6.5 Supply chain & dependencies

- [x] **SEC-16** *(DO-01)* — `vendor/suncalc-2.1.1.js` is the verbatim ESM build of npm
      `suncalc@2.1.1` (BSD-2-Clause); the DO-01 commit message records the tarball source and
      sha256; the file is never hand-edited; no runtime fetch of the library from anywhere.
- [x] **SEC-17** *(DO-01/DO-02)* — All dependencies (incl. dev-only: `axe-core`, headless browser
      tooling) are pinned to **exact** versions (no `^`/`~`/`latest`); devDeps are never
      referenced from shipped files; license review: permissive only.
- [ ] **SEC-18** *(DO-01)* — `.github/workflows/ci.yml` is least-privilege: top-level
      `permissions: contents: read`; every third-party action pinned to a full commit SHA; the
      workflow receives **no secrets** and **never deploys** (deploy is manual, `t_169d64f7`).
      *(⚠️ PARTIAL at audit 2026-10-14 — F1 (Medium): `ci.yml:18,21` use tag pins
      (`@v4`), not commit SHAs; permissions/secrets/no-deploy verified OK; see
      `docs/09-security-audit.md` §7.)*

### 6.6 Secrets & release operations

- [ ] **SEC-19** *(release card `t_169d64f7`)* — The `gh` PAT (repo + workflow scopes, as
      client-authorized) is **never** committed, echoed to logs, or placed in CI; it lives in the
      operator's credential store only. Every release is a semver git tag on a clean commit
      (brief §Release definition). Recommend branch protection on `main` (ops note to CTO).
      *(Audit 2026-10-14: repo/history-clean half VERIFIED — gitleaks clean over 31 commits;
      the deploy-time half stays with the release card; note F7: no git remote configured in
      the audit workspace.)*
- [x] **SEC-20** *(all lanes)* — The repo and its full history contain zero secrets: no `.env`,
      tokens, keys, or credentials of any kind (`.gitignore` covers env files; audit runs
      `gitleaks` or an equivalent full-history grep).

### 6.7 Logging & security-event policy

- [x] **SEC-21** *(FE-02/FE-03/FE-04/BE-02)* — Production code logs **no user-derived data**: no city
      names, coordinates, queries, or response bodies in `console.*`; unexpected errors surface
      as the §8.1 UI states (implemented by FE-04's degradation screens) with bare error codes. There is no log pipeline and no third-party
      error/analytics SDK (04 §8.2). Security-relevant events (CSP violations, geocode failures)
      are observable only as the user-visible S5/S6/S7 states.

### 6.8 Verification hooks

- [ ] **SEC-22** *(DO-02 / audit)* — `make check` (or the audit script) additionally greps shipped
      files for HTML sinks (SEC-05), inline styles/handlers (SEC-03), and non-allow-listed
      origins (SEC-14) — any hit fails the gate.
      *(⚠️ PARTIAL at audit 2026-10-14 — F3 (Low): the greps were run clean by this audit
      (docs/09 §3), but no persistent failing gate exists in `make check`/`smoke.mjs`; see
      `docs/09-security-audit.md` §7.)*
- [x] **SEC-23** *(BE-04)* — The test suite runs fully offline (no network in any test); the
      geocoder suite uses the injectable `fetchImpl`, proving no hidden network path.
- [x] **SEC-24** *(security-engineer, audit)* — Manual browser pass at audit: walk all flows
      (geolocation grant/deny, city search, empty/error results, language toggle, date nav) with
      devtools open; assert **zero CSP violations**, exactly one request host
      (`geocoding-api.open-meteo.com`), and no request containing coordinates.

**Audit status (pre-release audit 2026-10-14, `docs/09-security-audit.md`):** 20 of 24 items
verified and ticked at release commit `6112405` (shipped code = `303f682`). SEC-07/SEC-18/SEC-22
are PARTIAL (F2/F1/F3, fix cards open) and SEC-19's deploy-time half stays with the release
card. **SEC-08/SEC-11/SEC-12 and RK9 are verified closed** (fix `6a41384` re-verified live:
control-char queries rejected with no request; hostile tz/out-of-range records dropped;
strings capped ≤ 200; cache FIFO ≤ 64) — REV-M3 follow-up completed. Verdict:
**PASS-with-accepted-risks (0 Critical, 0 High, 1 Medium, 2 Low)**.

---

## 7. Standards mapping

### 7.1 OWASP Top 10 (2021)

| Category | Relevance here | Where addressed |
|----------|----------------|-----------------|
| A01 Broken Access Control | Minimal — no auth/authz; residual: no `frame-ancestors` (R1) | §4.1, §9 R1 |
| A02 Cryptographic Failures | HTTPS-only transport; no secrets; no PII at rest (nothing is stored, ADR-007) | SEC-13, SEC-19, SEC-20, §4.7 |
| A03 Injection | **Primary category** — hostile third-party text → DOM XSS | SEC-05..SEC-11, §4.2/§4.4 |
| A04 Insecure Design | Privacy-by-design: single-purpose network call, no storage, keyless | §1.1, §3, SEC-13 |
| A05 Security Misconfiguration | CSP exactness, meta placement, CI permissions | SEC-01..SEC-04, SEC-18 |
| A06 Vulnerable and Outdated Components | One vendored runtime artifact + pinned devDeps | SEC-16, SEC-17 |
| A07 Identification and Authentication Failures | No user auth (n/a); release credential hygiene is the analogue | SEC-19 |
| A08 Software and Data Integrity Failures | Vendored-byte integrity, no runtime CDN, CI supply chain, untrusted JSON handling | SEC-10, SEC-16..SEC-18, §4.6 |
| A09 Security Logging and Monitoring Failures | No server logs exist by design; local console policy; user-visible error states are the only signal | SEC-21, §10 |
| A10 Server-Side Request Forgery | No server; client analogue = fetch target never derived from untrusted data | SEC-09, §4.4 |

### 7.2 OWASP ASVS v4.0 (chapter-level, L1-appropriate for a static site)

| ASVS v4.0 chapter | Relevance | Where addressed |
|-------------------|-----------|-----------------|
| V1 Architecture & threat modelling | This document; secure-by-design posture | Whole doc; §8 |
| V5 Validation, Sanitization & Encoding | Third-party input validation + output as text | SEC-05..SEC-11 |
| V7 Error Handling & Logging | Bare-code errors; no user data in `console.*` | SEC-21, 04 §8 |
| V8 Data Protection | Coordinates on-device only; single disclosed outbound datum | SEC-13..SEC-15 |
| V9 Communications Security | HTTPS-only, HSTS (host), CSP allow-list, `credentials:'omit'` | SEC-01, SEC-13 |
| V10 Malicious Code & File Upload | Vendored artifact integrity; no upload surface | SEC-16 |
| V12 Files & Resources | `object-src 'none'`, no external includes, pinned assets | SEC-04, SEC-16 |
| V14 Configuration | CSP, referrer policy, CI least privilege, no secrets in repo | SEC-01..SEC-04, SEC-18, SEC-20 |

(Exact sub-requirement numbers are deliberately not cited at item level; the pre-release
audit maps concrete evidence to the chapters above.)

---

## 8. Security-driven changes & clarifications to the architecture

**Verdict on `04-architecture.md` v1.0.1: the security posture is sound. The origin
allow-list (§5.2) and CSP directive set (§5.3) are accepted unchanged — NO ADR
amendment is required.** Two additive requirements and three implementation
clarifications follow; none change any origin or CSP directive.

| # | Change / clarification | Impact | ADR? |
|---|------------------------|--------|------|
| CH1 | **Add** `<meta name="referrer" content="no-referrer">` to `index.html` (new SEC-02) | Hardening: the geocoder receives no referrer context | No — not an origin/CSP change. Suggest a one-line addendum to 04 §5.3 by the architect for cross-doc consistency (follow-up). |
| CH2 | **Placement rule:** the CSP `<meta>` must be the first element of `<head>` (SEC-01) | `<meta>` CSP is not retroactive; placement is the mitigation | No — clarifies §5.3's intent |
| CH3 | **`style-src 'self'` has teeth:** no inline `style` attributes / `<style>` blocks in shipped code; dynamic styling via classes or CSSOM (SEC-03) | This will otherwise surprise FE when highlighting rows / toggling theme — theme switching must be class-based (`[data-theme]`, already in FE-01) | No — enforces §5.3 as written |
| CH4 | **Geocoder hardening constants:** cache cap ≤ 64 entries; string caps ≤ 200 chars; `credentials: 'omit'` (SEC-11/12/13) | Bounds memory/abuse; makes the no-credentials claim explicit | No — refines the §5.2 contract within BE-02 |
| CH5 | **Validation of third-party `timezone`/lat/lon before entering `Location`** (SEC-11) | Prevents `Intl`/`Date` crashes and junk state from hostile responses | No — refines §4.1's runtime types |

If the architecture later adds **any** new origin (analytics, fonts, a second geocoder, a
CDN), the change is a **fresh threat-model revision + ADR amendment**, not an implementation
detail.

---

## 9. Accepted & residual risks

| ID | Residual risk | Why accepted | Revisit trigger |
|----|---------------|--------------|-----------------|
| R1 | **Clickjacking** — `frame-ancestors` cannot be set via `<meta>` on GitHub Pages; the page can be framed by hostile sites | Content is public and read-only; the only stateful UI is a search dialog; no transactions to trick | Hosting that supports response headers; any future "action" (favorites, sharing) |
| R2 | Malicious code inside the pinned `suncalc@2.1.1` release at vendor time | One small, widely used, dependency-free BSD library; version pinned and checksummed; reviewed at audit | suncalc upgrade (new pin = new review) |
| R3 | Release PAT (repo + workflow scopes) holder can fully control the site | Client-authorized operator workflow; scoped, non-committed, revert-based rollback | Token exposure; multi-operator teams; move to fine-grained PAT + branch protection |
| R4 | DNS/registrar compromise of `time.gitick.com` | Outside repo/CI scope; standard registrar hygiene | Domain transfer, DNS changes |
| R5 | GitHub Pages/CDN access logs see visitor IPs | Inherent to the client-mandated hosting (C1); nothing user-derived is sent to the site itself | Hosting change |
| R6 | Open-Meteo availability/integrity | Degradation is graceful (S6/S7, core calc unaffected); responses treated as hostile input regardless | Second geocoder or API changes |
| R7 | Pre-CSP parse window in `index.html` | Empty by construction (CSP first element, no earlier resources) | Any resource added above the CSP meta |

---

## 10. What the pre-release audit (`docs/09-security-audit.md`) must produce

1. Tick-by-tick verification of §6 (SEC-01..SEC-24) with file:line evidence.
2. Scanner runs on the repo at the release commit: `npm audit` (dev deps included),
   `gitleaks` (or equivalent) over full history, `semgrep` (js/`p/security-audit` +
   `p/client-side-xss` rulesets where applicable), a manual grep for HTML sinks and
   non-allow-listed origins (SEC-05/SEC-14/SEC-22).
3. Byte-comparison of `vendor/suncalc-2.1.1.js` against the npm registry tarball (SEC-16).
4. Manual browser network/CSP pass (SEC-24) with evidence in the report.
5. `VERDICT: PASS` or `VERDICT: FAIL (n Critical, n High)`; every Critical/High spawns a fix
   card for the owning lane.

---

## 11. v2.3.0 delta — web storage enters the model (item 7, ADR-009)

*Added by the v2.3.0 re-audit (SEC-1, `t_174049d9`). ADR-007 ("no web storage at all")
is superseded **in part** by ARCH-1's ADR-009; this section is the threat-model
consequence. Everything in §1–§10 not contradicted here still holds.*

### 11.1 What changed

**`localStorage`** (STORAGE_SCOPE='local', profile-scoped) now holds, via
`session-store.js` (the ONLY module that may name a storage API — enforced by the
SEC-STORAGE gate). *(v1.1 of this section audited the interim `sessionStorage`
scope; the client-confirmed flip landed in `20fe1c1` — the lifetime consequences
are in §11.4.)*

- **settings** — `choghadiya.settings.timeFormat` / `.lang` / `.location`
  (`{lat, lon, timezone, label}`; the device fix IS stored when geolocation is used).
  Written as `t:null` envelopes: **no expiry**, so they survive browser restarts
  indefinitely.
- **geocode cache** — `choghadiya.geocache.entry.<lang>\u0000<query>` (24 h TTL,
  FIFO cap 64) + `choghadiya.geocache.index`. Recent queries and Open-Meteo results
  are now **at rest locally** for up to 24 h — including across browser restarts
  within that TTL window.

Physical keys are namespaced `choghadiya.*`; everything is JSON in a `{t, v}` envelope.

### 11.2 New/changed assets & boundary

**TB5 — same-origin web storage (new).** Writable by: any same-origin script, browser
extensions with storage access, and anyone with physical or profile access to the
**browser profile** (shared device — the whole point of §11.4). Trust rule (mirrors
TB2): **stored values are untrusted input on every read.** Consumers must drop
malformed envelopes (session-store does), allow-list fields
(`hydrateSettings`/`normaliseStoredLocation` do), and treat cached third-party strings
exactly like fresh API responses (textContent only — SEC-05 holds; the geocache
read-path gap F10 is fixed by BE-FIX-2 `d8b5cdc`: persisted records are re-validated
on read).

| Asset | STRIDE delta | Control |
|---|---|---|
| stored settings | **T** tamper → wrong lang/format/coords (UI-level only) | field allow-lists + IANA validation on read (verified) |
| geocache entries | **T** tamper → poisoned results / render crash (F10, now fixed); **E** query+results at rest | envelope + per-record validation on read, 24 h TTL, FIFO-64, textContent rendering |
| device coordinates | **E** at rest in `.location` — across browser restarts, indefinitely (settings carry `t:null`) | shared-device exposure disclosed in `privacy.line`; user clear-location control; no server copy |
| storage availability | **D** disabled/throwing storage | try/catch + in-memory Map fallback (verified live: app functional, no DOM leak) |

### 11.3 Requirement deltas (additive to §6)

- **SEC-STORAGE** (new, gate-persisted): `localStorage`/`sessionStorage` tokens only in
  `session-store.js`; every other module goes through get/set/remove/clear.
- **Read-path validation rule (new):** a consumer of stored data must apply the same
  validation as the equivalent live input. Status: settings ✓, geocache ✓ (F10 fixed
  by BE-FIX-2 `d8b5cdc` — `persistGet` re-validates every at-rest record through the
  `mapResult` rules, stricter on coordinates; a wholly invalid entry degrades to a
  cache miss and self-heals on the next fetch).
- **Disclosure truthfulness rule (new):** `privacy.line` must track the actual storage
  scope and TTL wording; changing `STORAGE_SCOPE` is a disclosure change (docs/09 F9).

### 11.4 Landed: the localStorage posture (F9 closed, 2026-10-14)

`docs/00-brief.md` item 7 (client-confirmed, `t_6886a974`) specifies **localStorage**:
settings survive browser restarts **indefinitely (no expiry)**; only the API cache is
TTL-gated. **This is now the shipped posture** — the flip landed in BE-FIX-1
(`20fe1c1`, `STORAGE_SCOPE='session'` → `'local'`), and the fix-wave delta sign-off
(docs/09 §10.12, `t_7b42e0d0`) verified it live. The threat-model consequences:

- **At-rest lifetime now spans browser restarts.** Settings envelopes carry `t:null`
  (no expiry) and never age out: `settings.lang`, `settings.timeFormat` and
  `settings.location` — **including the device/city coordinates and label** — persist
  until the user clears them or the profile is wiped. The geocode cache
  (`geocache.entry.*` + `geocache.index`) remains **TTL-bounded at 24 h**
  (`CACHE_TTL_MS`, FIFO-64) and does not linger beyond it, per the brief.
- **Shared-device exposure ↑ (E).** Anyone with access to the browser profile can
  read the stored coordinates/label and — inside the 24 h window — the recent
  queries and Open-Meteo results. Controls: namespaced `choghadiya.*` keys, `{t,v}`
  envelopes, per-record read-path re-validation (F10 fix), the user's clear-location
  control, the 24 h TTL on everything third-party-derived, and **no server copy of
  any of it**. Extensions with storage access remain inside TB5's trust rule.
- **Disclosure (F9).** `privacy.line` (EN+HI, `i18n.js` + the `index.html`
  fallbacks) is rewritten to the landed truth — "No server storage — settings stay in
  this browser with no expiry; recent searches and cached results expire after
  24 hours." — which is the brief's stance ("no server storage; local TTL-gated cache
  only") with the settings-no-expiry exception made explicit. Verified byte-equal to
  the rendered DOM in both languages and truthful against observed behaviour
  (docs/09 §10.12 live probe). The former "this browser tab" claim is gone; any
  future scope/TTL change remains a disclosure change (§11.3 rule).

## 12. Revision log

| Version | Date | Author | Change |
|---------|------|--------|--------|
| v1.0 (initial) | 2026-10-14 | security-engineer | Initial threat model: assets & attacker classes (§2), trust boundaries TB1–TB4 (§3), STRIDE per component (§4), risk register (§5), implementation checklist SEC-01..SEC-24 mapped to plan tickets (§6), OWASP Top 10 2021 + ASVS v4.0 chapter mapping (§7), architecture change verdict — origin list and CSP unchanged, 5 additive clarifications, no ADR amendment (§8), accepted residuals (§9), audit contract (§10). |
| v1.0 + audit ticks | 2026-10-14 | security-engineer | Pre-release audit (`docs/09-security-audit.md`, commit `6112405`): §6 boxes ticked (20/24 verified; SEC-07/18/22 partial = F2/F1/F3 with fix cards; SEC-19 deploy half = release card), SEC-08/11/12 + RK9 re-verified closed after `6a41384` (REV-M3 follow-up). Verdict: PASS-with-accepted-risks (0 Critical, 0 High, 1 Medium, 2 Low). No change to §1–§5/§7–§10 content. |
| v1.1 (v2.3.0 delta) | 2026-10-14 | security-engineer | New §11 (v2.3.0 re-audit, `t_174049d9`): web storage enters the model (ADR-007 superseded in part by ADR-009) — new boundary TB5 (same-origin web storage = untrusted input on read), storage STRIDE delta, SEC-STORAGE + read-path-validation + disclosure-truthfulness requirement deltas, pending localStorage flip note. Renumbered old §11 → §12. |
| v1.2 (fix-wave delta) | 2026-10-14 | security-engineer | §11 retargeted to the landed localStorage posture (SEC-FIX `t_7b42e0d0`): §11.1 scope = `localStorage` (flip `20fe1c1`), §11.2 TB5 writer set widened to the browser profile (shared device) + STRIDE rows updated (device coordinates at rest across restarts; geocache read-path F10 noted fixed by `d8b5cdc`), §11.3 read-path rule now ✓/✓, §11.4 rewritten from "Pending" to "Landed: the localStorage posture (F9 closed)" — at-rest lifetime spans browser restarts, settings indefinite (`t:null`), geocache 24 h TTL-bounded, shared-device exposure + controls, disclosure verified truthful (docs/09 §10.12). |

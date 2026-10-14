# 09 — Pre-release Security Audit

**VERDICT: PASS-with-accepted-risks (0 Critical · 0 High · 1 Medium · 2 Low)**
— no open High/Critical finding exists (the FAIL trigger in the audit contract); the one
Medium finding (F1, CI action pinning) and one Low finding (F2, `name` attribute) are
routed to fix cards and should land before GATE 2; the remaining findings are accepted
Low/Informational items listed in §8.

| | |
|---|---|
| Project | Choghadiya Refactor — static, client-only web app (`https://time.gitick.com/`) |
| Owner | security-engineer |
| Date | 2026-10-14 |
| Release commit audited | `6112405850f8865a85a64b885bcf231d620d3837` (HEAD at audit time) |
| Shipped-code base | `303f682` — verified: `git diff --name-only 303f682..HEAD` over `index.html app.js choghadiya.js geocoder.js i18n.js style.css favicon.svg vendor .github scripts tests package.json` returns **0 files**; commits after `303f682` (DOCS `238cb02`, QA `6112405`) are documentation only |
| Inputs | `docs/06-threat-model.md` v1.0 (SEC-01..SEC-24 checklist), `docs/04-architecture.md` §5.2/§5.3, `docs/adr/003`, `docs/00-brief.md` "Data & compliance", the integrated codebase |
| Fix cards created | `SEC-FIX-1` devops-engineer (F1+F3, Medium/Low), `SEC-FIX-2` frontend-dev (F2, Low) — see §7 |

---

## 1. Scope & method

Everything the card's acceptance criteria name, plus `docs/06-threat-model.md` §10:

1. NFR-S\* controls verified **in the real code and a live browser** (§3, §4).
2. Supply chain: vendored `suncalc` byte-compared against a **fresh npm registry download**
   (§5); full-history secret scan with `gitleaks 8.30.1` (§6); `npm audit` (§6).
3. `docs/06-threat-model.md` assumptions re-checked against the implementation (§9).
4. Scanners/gates run at the release commit (§2).

Shipped files = `index.html`, `style.css`, `app.js`, `choghadiya.js`, `i18n.js`,
`geocoder.js`, `favicon.svg`, `vendor/suncalc-2.1.1.js`. Dev tooling (`scripts/`,
`tests/`, `node_modules/`, `.github/`) is audited for its own controls (SEC-17/18/22/23)
and for the "never ships" property.

## 2. Gate runs at the release commit (real output)

```text
$ make test            # node --test "tests/**/*.test.js"
ℹ tests 64
ℹ pass 64
ℹ fail 0

$ make check           # tests + smoke + axe
SMOKE RESULT: 31 passed, 0 failed
AXE RESULT: PASS   (0 critical/serious AND 0 moderate/minor on 4 states, axe-core 4.10.2)
   ... PERF BUDGET: shipped JS 5 files, raw 98.4 KB, gzip 32.3 KB (<= 60 KB min+gzip, NFR-P3)
-> exit 0

$ npm audit
found 0 vulnerabilities        # sole dependency: axe-core@4.10.2 (dev-only)

$ gitleaks git . --log-opts="--all" --report-format json --report-path <scratch>/sec-audit-gitleaks.json
INF 31 commits scanned.
INF scanned ~615580 bytes (615.58 KB) in 532ms
INF no leaks found             # exit 0
```

`gitleaks`/`npm audit` were available or installed at audit time; `semgrep` was **not
installed** (`brew install semgrep` not attempted — the applicable registry rules
(`p/client-side-xss`, `p/security-audit` sinks) were covered by the equivalent targeted
greps in §3.2, which are the exact checks SEC-05/SEC-14 require). Recorded as a
methodology limitation, not a finding.

## 3. Control verification (docs/06 §6, SEC-01..SEC-24)

### 3.1 CSP & delivery (SEC-01..SEC-04) — PASS

- **SEC-01** ✅ — CSP `<meta>` is the **first element of `<head>`** (`index.html:4-9`, ahead
  of `<meta charset>`, both `<link>`s and the module script) and its `content` is
  **byte-exact** vs `04-architecture.md` §5.3. Machine-checked:
  `python3 <scratch>/sec-audit-csp.py` -> `MATCH : True`, first head element = `meta`,
  `script-src 'self'` present verbatim.
- **SEC-02** ✅ — `<meta name="referrer" content="no-referrer">` (`index.html:12`).
- **SEC-03** ✅ — grep over shipped files for `style="`, `<style`, `on*=`, `setAttribute('style'`
  -> **0 hits** (only prose in two comments). Live enforcement confirmed in §4 (CSP blocked an
  injected inline script). Dynamic styling is `classList`/`[hidden]` only.
- **SEC-04** ✅ — every asset reference is same-origin and versioned
  (`favicon.svg?v=2.1.0`, `style.css?v=2.1.0`, `app.js?v=2.1.0` + 4 ESM imports asserted by
  `scripts/smoke.mjs` == package.json `2.1.0`); grep for `<base|preconnect|dns-prefetch|prefetch|prerender|modulepreload`
  -> **0 hits**; no external `<link>` anywhere.

### 3.2 Output handling / XSS (SEC-05..SEC-07)

- **SEC-05** ✅ — grep for `innerHTML|outerHTML|insertAdjacentHTML|document.write|eval(|new Function|javascript:|setAttribute('style'`
  over all 8 shipped files -> **0 hits** (one comment mention of "never innerHTML" at
  `app.js:468`). All rendering is `createElement` + `textContent` (`app.js:474-486`,
  `app.js:742-782`, `app.js:935-979`).
- **SEC-06** ✅ — `t()` output is only consumed via `textContent` (`app.js:767` and the
  `[data-i18n]`/`[data-i18n-lang]` pass); the hostile-text probe (§4) rendered adversarial
  dictionary-style strings as literal text.
- **SEC-07** ⚠️ **partially unmet (F2, Low)** — state is ES-module scope, element lookup is
  explicit `querySelector`, and there are no bare `window.*`/`document.*` named-global reads
  (only `setTimeout`/`setInterval`/`clearTimeout` via `window.`, `app.js:254,277,284,655`).
  **But** the city input carries `name="city"` (`index.html:190`) and SEC-07 says form
  controls carry **no** `name` attributes. No exploitable DOM-clobbering path exists
  (module scope + no global reads + the form is `preventDefault()`ed and `form-action 'none'`
  is in the CSP), so this is a letter-of-the-checklist deviation with Low severity.

### 3.3 Input & third-party validation (SEC-08..SEC-12) — PASS (fix `6a41384` re-verified)

The M2 review's SEC-08/11/12 findings landed as `6a41384 fix(geocoder): SEC-08/11/12
hardening [t_cc4f2f25]` and are re-verified here (REV-M3 follow-up):

- **SEC-08** ✅ — `validateQuery` (`geocoder.js:105-125`): trimmed, 2–64 chars, rejects C0
  control chars + DEL -> `GeocoderError{code:'bad-query'}` **with no request** (tests:
  `tests/geocoder.test.js`, 24 cases green).
- **SEC-09** ✅ — hard-coded `GEOCODE_ENDPOINT` (`geocoder.js:42`), `encodeURIComponent`
  (`geocoder.js:133-136`), user input only in `name`; live probe observed request URL
  `https://geocoding-api.open-meteo.com/v1/search?name=London&count=8&language=hi`.
- **SEC-10** ✅ — `mapResult` (`geocoder.js:172-197`) maps only the allow-listed fields onto a
  fresh object literal — no spread of raw JSON. Live probe: payload carrying
  `"__proto__"`/`"constructor"` keys left `({}).polluted` **undefined** (`protoPolluted: false`).
- **SEC-11** ✅ — lat ∈ [−90,90], lon ∈ [−180,180] finite-checked; `timezone` must pass
  `new Intl.DateTimeFormat('en', {timeZone})` or the record is **dropped**; strings capped at
  200 chars (`geocoder.js:172-197`). Live probe with a hostile payload: `Evil/Zone` record
  **dropped**, `lat=999` record **dropped**, 500-char strings rendered capped at 200 —
  zero `NaN`/`Invalid Date`/`undefined` tokens anywhere.
- **SEC-12** ✅ — 400 ms debounce / submit-only, `AbortController` supersession, and
  `setCapped` FIFO cache **≤ 64 entries** (`geocoder.js:206-213`, `MAX_CACHE_ENTRIES=64`);
  the probe produced exactly **one** request per submit.

### 3.4 Network & privacy (SEC-13..SEC-15) — PASS

- **SEC-13** ✅ — `geocoder.js` is the **only** module that calls `fetch`
  (grep: `fetchFn` at `geocoder.js:263` is the single call site); request options observed
  live: `method GET`, `credentials: 'omit'`, `Accept: application/json` and **only**
  `name`/`count=8`/`language` params. No coordinates, cookies, auth headers or identifiers.
- **SEC-14** ✅ — grep for `http(s)://host` over shipped files returns exactly:
  `index.html:9` + `geocoder.js:42` = `https://geocoding-api.open-meteo.com` (allow-listed),
  `favicon.svg:1` = `xmlns="http://www.w3.org/2000/svg"` — an XML **namespace identifier**,
  never fetched (and any fetch would be blocked by `default-src 'none'`) -> Informational F5,
  no loadable `http://` reference exists. No analytics, trackers, `sendBeacon`, `XHR`,
  webfonts or CDN URLs (grep for `XMLHttpRequest|sendBeacon|WebSocket|EventSource` -> 0 hits).
- **SEC-15** ✅ — verified live in the DOM: the US-17 privacy one-liner is rendered both in
  the city-search sheet (`.sheet-privacy`) and the footer, and the footer attribution
  "Geocoding by Open-Meteo / GeoNames" + "कोई अकाउंट नहीं · कोई ट्रैकिंग नहीं · कोई बैकएंड नहीं"
  are present.

**Privacy-claim reality check (US-17, brief "Data & compliance")** — the claims match:

| Claim (UI / brief) | Reality (verified) |
|---|---|
| "शहर खोजने पर लिखा गया नाम Open-Meteo/GeoNames को भेजा जाता है" (the typed city name is sent to Open-Meteo/GeoNames) | ✅ exactly the typed `name` crosses, to `geocoding-api.open-meteo.com` only. *Nuance (F4, Low):* the request also carries fixed `count=8` and the UI `language` — not user-identifying, but the one-liner mentions only the name |
| "लोकेशन सेव नहीं होती" (location is not saved) | ✅ grep for `localStorage|sessionStorage|document.cookie|indexedDB|caches.|history.pushState|location.hash/search` over shipped files -> **0 hits**; nothing persists at all (ADR-007) |
| Location stays on-device except the optional geocode call (brief) | ✅ geolocation coordinates are consumed by local `choghadiya.js` math only; **zero** request URLs contain coordinates (browser pass §4: `'lat'/'lon'` scan of all resource URLs -> `[]`) |
| "कोई अकाउंट नहीं · कोई ट्रैकिंग नहीं · कोई बैकएंड नहीं" | ✅ no accounts/storage/backend exist; the only third-party call is the user-initiated geocode |

### 3.5 Supply chain (SEC-16..SEC-18)

- **SEC-16** ✅ — **re-verified against the live registry** (not just the recorded hash).
  Fresh `https://registry.npmjs.org/suncalc/-/suncalc-2.1.1.tgz` download at audit time:

  ```text
  tarball sha256:        622773ca53a9dd0da08f2380fa4ed49d901f57d7aa74caba744769163ca17fb5  (= DO-01 record)
  package/index.js:      f5e86948d59268d23496fa919a4a32ed99e1e25c465c7b978a1bd5945e4a197f
  vendor/suncalc-2.1.1.js: f5e86948d59268d23496fa919a4a32ed99e1e25c465c7b978a1bd5945e4a197f
  cmp package/index.js vendor/suncalc-2.1.1.js -> BYTE-IDENTICAL
  registry dist.shasum:  642f9c0bbd2d1dddf7907a1800f0b234343e61dc   (= DO-01 record)
  registry dist.integrity: sha512-ufMOPzYRk5aomEs3g+qeJGdCPZWC3TL94E0HQagoSusFnNXCvfuewWBroY3lxRHqA7IA8UGvgg7dcrSSDJsuEg==  (= DO-01 record)
  ```

  Upstream `LICENSE` in the tarball is the BSD-2-Clause text (matches ADR-003). The
  vendor file is additionally **CI-locked**: `tests/choghadiya.test.js:380-391` asserts the
  sha256 on every `make test`. Never edited by hand (git history of the file = 1 commit).
- **SEC-17** ✅ *with note F6* — the only dependency is dev-only `axe-core@4.10.2`, pinned
  **exact** (no `^`/`~`/`latest`; `npm ls --all` shows exactly that one package), and it is
  never referenced from shipped files (grep over shipped files for `axe|node_modules|scripts/|tests/`
  -> only two comment mentions of test filenames). *Note F6 (Informational):* `axe-core` is
  **MPL-2.0** (weak copyleft), not strictly "permissive only" as SEC-17 words it — accepted
  because it is dev-only, never shipped, and never distributed with the artifact
  (`suncalc` itself is BSD-2-Clause, the only runtime code).
- **SEC-18** ⚠️ **partially unmet (F1, Medium)** — `.github/workflows/ci.yml` has
  top-level `permissions: contents: read` ✅, receives no secrets ✅, and **never deploys**
  ✅ (deploy is the manual `gh` step in `t_169d64f7`). **But** the actions are pinned to
  mutable tags, not full commit SHAs: `ci.yml:18 uses: actions/checkout@v4`,
  `ci.yml:21 uses: actions/setup-node@v4`. SEC-18 requires SHA pins (RK10). Severity
  **Medium**: the workflow is read-only, secretless and non-deploying, so a tag-rewrite
  attack yields at most ephemeral `contents:read` + runner abuse; this matches the threat
  model's own §4.7 Medium rating for "CI workflow modified". Fix is two lines.

### 3.6 Secrets & release ops (SEC-19, SEC-20)

- **SEC-19** ⏳ *release-card scope (`t_169d64f7`)* — the audit verifies the "never committed"
  half (below); live PAT hygiene at deploy time is the release card's checklist item.
  The client-authorized scope note ("authenticated as vishalnagda1, repo + workflow scopes")
  exists in `docs/00-brief.md` as **text only** — no token value exists anywhere.
- **SEC-20** ✅ — `gitleaks 8.30.1` over **all 31 commits** (`--log-opts="--all"`):
  **no leaks found**; a second targeted pattern grep over `git log -p --all` for
  `ghp_/github_pat_/gho_/ghs_/AKIA/private-key/xox?-/sk-/api_key/password/secret` assignments
  -> 0 hits; `git ls-files` shows **no** `.env`/`.pem`/`.key`/credential files (`.gitignore`
  covers `.env`); `git remote -v` shows no remote URL at all in this workspace (so no
  embedded-credential remote either; see ops note F7).

### 3.7 Logging & verification hooks (SEC-21..SEC-24)

- **SEC-21** ✅ — grep for `console.` over shipped files -> **0 hits**. Error paths surface
  bare codes only (`geocode-network`/`geocode-http`/`geocode-*` taxonomy, `geocoder.js:67`);
  no log pipeline, no error/analytics SDK. Security-relevant events appear only as the
  user-visible S5/S6/S7 states.
- **SEC-22** ⚠️ **partially unmet (F3, Low)** — the SEC-05/03/14 greps were executed in this
  audit (§3.1/§3.2/§3.4, all clean), which satisfies "or the audit script" once — but no
  **persistent failing gate** exists in `make check`: `scripts/smoke.mjs` contains no
  sink/inline-style/origin assertions (grep of smoke for `innerHTML|sink|SEC-0|origin|style=`
  shows only server/URL plumbing). The gate should live in smoke so any future hit fails CI.
- **SEC-23** ✅ — the suite is network-free: `tests/geocoder.test.js` injects `fetchImpl`
  (24 mock cases, zero real fetches), smoke runs against a local `http.createServer` on
  127.0.0.1, and the browser pass (§4) confirms the app itself performs **no** request the
  user did not initiate. (REV-M2 independently reproduced the boundary.)
- **SEC-24** ✅ — manual browser pass executed at the release commit (§4).

## 4. SEC-24 manual browser pass (live evidence)

Served the tree (`python3 -m http.server 8082`) and drove real flows in headless Chrome with
pre-load instrumentation (`securitypolicyviolation` listener + `fetch`/`XHR`/`sendBeacon`
wrappers + `performance.getEntriesByType('resource')`).

**Load (geolocation denied path):** 7 subresource requests, **all self-origin**
(`style.css`, `app.js`, `choghadiya.js`, `i18n.js`, `geocoder.js`, `vendor/suncalc-2.1.1.js`,
`favicon.svg`, each with `?v=2.1.0` where applicable). `window.__cspViolations = []`;
0 `fetch`/`XHR`/`beacon` calls. App degrades correctly to S5 notice + S1 empty state.

**Hostile-response probe (AL2, the primary threat):** `window.fetch` mocked to return an
adversarial payload — `name="<img src=x onerror=alert(1)>"`, `admin1="<script>alert(2)</script>"`,
`country="javascript:alert(3)"`, a record with `timezone:"Evil/Zone"`, a record with
`latitude:999`, 500-char strings, plus `"__proto__"`/`"constructor"` keys. Observed:
exactly 1 request (`name=London&count=8&language=hi`, `credentials:'omit'`); **2 of 4**
records rendered (invalid tz + out-of-range dropped per SEC-11); hostile markup rendered as
**literal text** (`#results img/script/svg` count = 0, no alert fired); strings capped at
200 chars; `({}).polluted === undefined` (no prototype pollution); 0 CSP violations.

**Real-network flow:** search "Mumbai" -> exactly **one** request,
`https://geocoding-api.open-meteo.com/v1/search?name=Mumbai&count=8&language=hi`; select ->
chip `बम्बई, महाराष्ट्र, भारत` (textContent), 16 rows, `सूर्योदय 06:32`, `NaN|Invalid Date|undefined`
scan = **0**. Language toggle + date nav produced **zero** requests (core calculation is
network-free). Full resource list = 6 self-origin assets + that one geocode call;
`non-self hosts = ['geocoding-api.open-meteo.com']` — the ONLY external call is N1, and
**no request URL contains coordinates** (searched for lat/lon values and `lat=`/`lon=`).

**Geolocation path:** with the CDP geolocation override granted the page did not receive a
position in this harness (headless `getCurrentPosition` limitation already documented by
FE-04/REV-M2) and degraded to S5 — again with **zero** non-self requests and no coordinate
URLs. The success path (chip "My location") is covered by `scripts/smoke.mjs`
("the device-fix chip shows the localised 'My location' label", PASS in `make check`);
real-device geolocation remains QA item MAN-03.

**CSP enforcement proof:** after the flows, an inline `<script>` was injected programmatically
-> `securitypolicyviolation {directive: "script-src-elem", blocked: "inline"}` was recorded
and `window.__inlineRan === false`. `script-src 'self'` is demonstrably enforcing, not just
present. **Zero CSP violations occurred during all normal flows** (the only violation in the
session was this deliberate probe).

## 5. Supply-chain summary (ADR-003)

Re-verified at byte level against a fresh registry download (§3.5 SEC-16): vendored
`suncalc-2.1.1.js` is byte-identical to `package/index.js` of `suncalc@2.1.1`
(sha256 `f5e86948…e4a197f`, tarball `622773ca…ca17fb5`, dist.shasum/integrity match the
DO-01 commit record), BSD-2-Clause upstream license confirmed, CI test locks the checksum.
No other runtime third-party code exists; no CDN fetch of any library (ADR-003 honored).

## 6. Threat-model drift check (docs/06 §1 assumptions & §8 changes)

| Assumption / change | Status at audit time |
|---|---|
| A1 (Pages HTTPS + HSTS; CSP via `<meta>`, no `frame-ancestors`) | Holds — unchanged; deployment is `t_169d64f7`'s step |
| A2 (browser honest) | Holds |
| A3 (Open-Meteo responses = hostile input) | Holds — proven in §4 probe (validation + text-only rendering) |
| A4 (repo / `gh` PAT / DNS are trust roots) | Holds — no credential in repo/history (§3.6); *ops note F7: this workspace has no `git remote`, and branch protection on `main` is still only "recommended" (SEC-19 note to CTO)* |
| A5 (no SW / postMessage / iframes / URL-driven state) | Holds — grep for `serviceWorker|postMessage|<iframe|<embed|<object|location.(hash|search)|URLSearchParams(location|window.name` -> 0 hits |
| §1.1 "exactly one network request type (N1)" | Holds — verified live (§4): the geocode GET is the only non-self request; geolocation is on-device |
| §8 CH1 (referrer meta) / CH2 (placement) / CH3 (no inline styles) / CH4 (64-cap, 200-cap, `credentials:'omit'`) / CH5 (tz/lat/lon validation) | All implemented and verified (§3) — **including SEC-08/11/12 + RK9**, which the M2 fix `6a41384` closed and this audit re-verified live (REV-M3 follow-up completed) |
| §4.7 CI controls (SEC-18 assumed in place) | **Drift (F1)** — implementation uses tag pins, not SHA pins; RK10 stays at Medium until fixed |
| §6 checklist wording (SEC-07 "no `name` attributes"; SEC-22 "make check greps") | **Drift (F2, F3)** — see §7; checklist letters not fully met by the implementation/tooling |

## 7. Findings

| ID | Severity | Finding | Location | Fix | Disposition |
|----|----------|---------|----------|-----|-------------|
| F1 | **Medium** | GitHub Actions pinned to mutable tags (`actions/checkout@v4`, `actions/setup-node@v4`) instead of full commit SHAs — SEC-18 unmet, RK10 residual stays Medium. Mitigating: `permissions: contents: read`, no secrets, CI never deploys | `.github/workflows/ci.yml:18`, `:21` | Pin both `uses:` to the current release commit SHAs (2 lines) | Fix card → devops-engineer (with F3). **Should land before GATE 2**; if not, GATE 2 must surface it to the client as a known issue |
| F2 | **Low** | Form control carries `name="city"`; SEC-07 requires no `name` attributes (DOM-clobbering hygiene). No exploitable path exists (module scope, no bare-global reads, form never submits natively, `form-action 'none'`) | `index.html:190` | Remove `name="city"` (the form is JS-only) | Fix card → frontend-dev. Alternative: amend SEC-07 wording to permit names on never-submitted controls (threat-model owner = me, would be a v1.0.1 note) |
| F3 | **Low** | SEC-05/03/14 grep gates are not persisted in `make check` — they passed in this audit only because the audit ran them manually; `scripts/smoke.mjs` has no sink/inline-style/origin failing assertions | `scripts/smoke.mjs` | Add the three grep assertions to smoke so any future hit fails the gate | Fix card → devops-engineer (same card as F1) |
| F4 | **Low** (accepted) | Privacy one-liner (US-17) discloses only the typed city name; the request also carries fixed `count=8` and the UI `language`. No identity/PII content; all other claims match reality exactly | `index.html:163,187` (`privacy.line`) | Optionally extend copy (dictionary + `docs/03-ux.md` §6 + the 58-key i18n gate would all need a coordinated change) | **Accepted** — route to CTO/tech-writer as a copy-deck question, not a code fix |
| F5 | **Informational** | `favicon.svg` contains `http://www.w3.org/2000/svg` — an XML namespace identifier, never fetched (and `default-src 'none'` would block any fetch) | `favicon.svg:1` | none | Accepted — SEC-14's "no `http://` at all" is satisfied in intent (zero loadable http references) |
| F6 | **Informational** | devDependency `axe-core@4.10.2` is MPL-2.0 (weak copyleft), not strictly "permissive only" per SEC-17's license clause | `package.json:24` | none (dev-only, never shipped/distributed) | Accepted |
| F7 | **Informational** | The audit workspace repo has **no git remote configured**, and branch protection on `main` is only recommended | repo config | Release card `t_169d64f7` must point/push the remote; CTO should enable branch protection (SEC-19 ops note) | Accepted — ops note to release card |

## 8. Residual risk (post-audit)

1. **RK3 (release credential / `main` compromise) stays Medium** — inherent to the
   client-authorized operator deploy model (R3); no code change can reduce it further.
   Branch protection on `main` is recommended before the release push.
2. **RK10 (CI supply chain) stays Medium until F1 lands** — then Low.
3. **R1 clickjacking (no `frame-ancestors` via `<meta>`)** — accepted as designed (Low);
   revisit if hosting gains response-header control.
4. **Geolocation success path was not exercised with a real device** in this audit (headless
   limitation; smoke covers the chip path, QA MAN-03 covers real devices). Network-privacy
   evidence holds regardless: coordinates are only ever consumed locally and appear in no
   request URL.
5. **`semgrep` was not run** (not installed; see §2) — applicable sink rules were covered by
   the targeted greps; a future audit should add the semgrep run when the tool is available.
6. **F4 disclosure nuance** accepted (Low) — the one-liner under-describes the request
   params (name + fixed count + UI language).

## 9. Verdict

**VERDICT: PASS-with-accepted-risks (0 Critical · 0 High · 1 Medium · 2 Low)**

Per the audit contract (`docs/06` §10) the FAIL trigger is an open Critical/High finding —
**none exists**. Every NFR-S\* acceptance item is verified in real code and a live browser:
CSP byte-exact with enforcing `script-src 'self'` and zero shipped dev tooling; all dynamic
text via `textContent`/`createElement` (hostile-payload probe neutralized end-to-end);
core calculation network-free; the **only** network call is the optional Open-Meteo geocode
plus the site's own hosting; privacy claims match reality. Supply chain: vendored
`suncalc@2.1.1` byte-identical to the live registry artifact, full-history secret scan
clean (gitleaks, 31 commits), devDeps exact-pinned and unshipped.

Open items at verdict time: **F1 (Medium, fix card, should land before GATE 2)**, F2/F3
(Low, fix cards), F4–F7 (Low/Informational, accepted and documented). If GATE 2 wants a
strict zero-open-findings release, wait for the two fix cards; otherwise release may
proceed with F1–F3 shown to the client as known issues. **No High/Critical finding is
being softened**: had the geocoder hardening (`6a41384`) not landed, this audit would have
failed on SEC-08/11/12.

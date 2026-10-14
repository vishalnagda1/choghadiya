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
| Shipped-code base | `303f682` — verified: `git diff --name-only 303f682..HEAD` over `index.html app.js choghadiya.js geocoder.js i18n.js style.css favicon.svg vendor .github scripts tests package.json` returns **0 files**; commits after `303f682` (DOCS `238cb02`, tech-lead status `a170fd0`, QA `6112405`) are documentation only |
| Inputs | `docs/06-threat-model.md` v1.0 (SEC-01..SEC-24 checklist), `docs/04-architecture.md` §5.2/§5.3, `docs/adr/003`, `docs/00-brief.md` "Data & compliance", the integrated codebase |
| Fix cards created | `SEC-FIX-1` devops-engineer = `t_899c4547` (F1+F3, Medium/Low), `SEC-FIX-2` frontend-dev = `t_9ec675d1` (F2, Low) — see §7 |

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

---
---

# V2.3.0 ADDENDUM — delta re-audit (storage, attribution, new surfaces)

**VERDICT: PASS-with-accepted-risks (0 Critical · 0 High · 2 Medium · 1 Low · 1 Informational)**

*Superseded in part by the fix-wave delta sign-off (§10.12, 2026-10-14): the GATE-2
conditions F8/F9 are **closed**, F10/F12 are **fixed** — the §10.12 verdict is the
current one. The paragraph below is preserved as the SEC-1 point-in-time record.*

*SEC-1 card `t_174049d9`, security-engineer, 2026-10-14. This addendum audits the
v2.3.0 delta (docs/00-brief.md change-log items 1–7) on top of the v2.2.0 audit above.
Findings are numbered F8–F12, continuing this document's F-sequence. **Two GATE 2
conditions attach to this verdict** — see §10.9.*

## 10.1 Scope & audited tree

- **Audited tree:** `main` @ `c68d00a` (`docs(qa): v2.3.0 test plan + report [t_e4d61d3a]`),
  with the working tree clean except an **uncommitted `docs/00-brief.md` CTO edit**
  (the client-confirmed localStorage change, §10.3/F9 — deliberately NOT part of the
  audited code).
- **Delta surface vs the v2.2.0 audit:** `session-store.js` + `inauspicious.js` (new
  modules), `geocoder.js` cacheStore contract + persistence (item 7b), `app.js`
  settings hydration/persist + cacheStore wiring (`068681c`), FE-2..FE-6 UI surfaces
  (items 2–6), FE-4 attribution/privacy copy (items 3/7), quality gates in
  `scripts/security-greps.mjs`/`smoke.mjs`.
- **NOT covered:** the localStorage scope flip (not implemented), real-device
  geolocation (QA MAN-03), the release/deploy step (SEC-19, release card).

## 10.2 Gate runs at the audited tree (real output)

| Gate | Command | Result |
|---|---|---|
| unit/contract tests | `make test` (node --test tests/) | **100 pass / 0 fail** |
| SEC-22 source greps | `npm run greps` (scripts/security-greps.mjs) | **PASS — 0 hits across 4 gates** (SEC-05, SEC-03, SEC-14, SEC-STORAGE) |
| browser smoke | `node scripts/smoke.mjs` | **66 passed / 0 failed** (incl. 12 new item-7b cache checks) |
| axe accessibility | `node scripts/axe-check.mjs` | **PASS**, 5 states, 0 critical/serious |
| dependency audit | `npm audit` (incl. dev) | **found 0 vulnerabilities** |
| secret scan | `gitleaks detect --source .` | **no leaks found** (87 commits, ~1.26 MB) |
| vendored suncalc | fresh `npm pack suncalc@2.1.1` → `diff -q package/index.js vendor/suncalc-2.1.1.js` | **BYTE-IDENTICAL**, sha256 `f5e86948…e4a197f` (= v2.2.0 record) |

## 10.3 Item 7 — storage posture change (the privacy delta)

**SEC-STORAGE containment.** Grep over shipped files for `localStorage|sessionStorage`
→ hits **only** `session-store.js` (its own docs + the `STORAGE_SCOPE` constant);
`scripts/security-greps.mjs` SEC-STORAGE gate enforces this persistently (0 hits, all
other modules exempt-free). `geocoder.js` contains no storage tokens — it receives the
store via injection (`cacheStore`, app.js:763 adapter exposing only get/set/remove).

**Envelope parsing / injection safety — probed, not assumed** (node harness importing
the real `session-store.js` + live browser seeding; 17/17 probe classes):

- Malformed JSON, non-envelope shapes (`[]`, `""`, missing `t`/`v`, non-finite `t`),
  and expired envelopes → **dropped and the key deleted**; never surfaced to the app.
- Prototype-pollution payloads (`{"__proto__":{…}}` inside `v`, own `__proto__` at top
  level, `constructor.prototype`) → `JSON.parse` own-property semantics + the envelope
  guard mean **`Object.prototype` stays clean** in every case; no stored value is ever
  merged via `Object.assign`/spread — `hydrateSettings` allow-lists (`'hi'|'en'`,
  `'12h'|'24h'`) and `normaliseStoredLocation` destructures fixed fields onto a fresh
  object with IANA-validation (bad `lat` type, `Evil/Zone`, wrong shape → rejected).
- **Gap found (F10, Low):** the geocache read path (`geocoder.js` `persistGet`) accepts
  any stored **array** without re-validating elements (mapResult runs only on network
  data). Live probe: a seeded entry with `timezone:"Not/AZone"` + `latitude:999`
  rendered inert (HTML payloads in `name`/`admin1` are textContent — no execution),
  but **selecting** it threw an uncaught `RangeError: Invalid time zone specified`
  that aborted `render()` (empty date label, 0 rows). Local-tamper DoS of the UI —
  not remotely reachable (the network path is validated), so Low; fix = run persisted
  entries through the mapResult validation on read (or guard `selectResult`).

**Fallback (storage throwing).** Live: `sessionStorage` accessor overridden to throw
`SecurityError` before any page script → app renders, language toggle + 24h toggle +
sheet all work, **no failure text leaks into the DOM** (regex scan for
`SecurityError|storage blocked|undefined` over `body.innerText` → false). Node probes
additionally cover per-operation throws (getItem/setItem/removeItem), QuotaExceeded on
write (memory shadow serves reads), and a throwing accessor. `session-store.js` never
throws at the call site — contract held.

**What is actually written (live run, real API).** After a full flow (search → select →
reload → repeat search → toggles) `sessionStorage` contained **only**:

```text
choghadiya.settings.location   {"t":null,"v":{"lat":26.91962,"lon":75.78781,"timezone":"Asia/Kolkata","label":"जयपुर, राजस्थान, भारत"}}
choghadiya.geocache.index      {"t":null,"v":["hi\u0000jaipur"]}
choghadiya.geocache.entry.hi\u0000jaipur  {"t":<now+24.00h>,"v":[…8 mapped results…]}
```

plus `settings.timeFormat` / `settings.lang` when toggled. Exactly the client-specified
fields; **no history/favourites/keys creep**; every key namespaced `choghadiya.*`;
envelope TTL = 24.00 h as designed. **US-17 invariant re-verified live:** with a
device geolocation fix applied AND a search, every request URL in the page is
self-origin except
`https://geocoding-api.open-meteo.com/v1/search?name=Pune&count=8&language=hi` —
**no coordinate value or `lat`/`lon` parameter appears in any URL** (string scan of
the full resource list). Cache-hit behaviour verified: repeat query after
`location.reload()` renders 8 rows with **0** geocoding requests.

**Privacy disclosure truth audit (post FE-4, byte-level).** Rendered strings match
`i18n.js` values (the i18n test asserts byte-verbatim) —
"Your searched city name is sent to Open-Meteo to find coordinates. No server storage —
settings and recent searches stay only in this browser tab." (+ Hindi).

| Claim | Reality at the audited tree | Verdict |
|---|---|---|
| city name sent to Open-Meteo | exactly `name=<query>` + fixed `count=8` + UI `language` to geocoding-api only (v2.2.0 F4 nuance stands) | ✅ truthful |
| "No server storage" | no backend exists; nothing is sent but the query | ✅ truthful |
| "settings and recent searches stay only in this browser tab" | sessionStorage per-tab; geocache = recent queries+results | ✅ truthful **only because** FE-FIX (`068681c`) wired the cache — before it, "recent searches" over-claimed (TL-1 F1, now fixed and verified above) |
| TTL / expiry not disclosed | cache expires at 24 h; settings never (in-tab) | ⚠️ **incomplete** (F9) |
| "this browser tab" under the **pending localStorage flip** | flip = data survives browser restarts, settings without expiry | ❌ becomes **false** if the flip lands without a copy change (F9) |

## 10.4 Item 3 — attribution / licence compliance (RS-3)

**Applied option = B** (the RS-3 recommendation), implemented by FE-4 — verified live:
the two v2.2.0 body lines are gone; one footer credit
`स्थान खोज Open-Meteo द्वारा · डेटा GeoNames से · CC BY 4.0` /
`Location search by Open-Meteo · Data from GeoNames · CC BY 4.0` plus the rewritten
`privacy.line`, both byte-equal to the RS-3 §13.6 B1/B2 dictionary values. This is
NOT the client's literal request (full removal, option A) — RS-3 proved A is a
CC BY 4.0 breach, and GATE 2 must surface the divergence (TL-1 handoff, unchanged).

**BUT the B1 hyperlinks are missing (F8, Medium).** RS-3 §13.6 is explicit: *"the
licence requires links, not just text"* — targets `open-meteo.com`, `geonames.org`,
`creativecommons.org/licenses/by/4.0/` with `rel="noopener noreferrer"`. Live DOM
probe: **zero `<a>` elements on the page**; the credit ships as plain text. Against
the quoted terms this is not yet compliant: Open-Meteo requires *"a link next to any
location Open-Meteo data are displayed"*, GeoNames asks for credit *"with a link or
another reference"*, and CC BY 4.0 §3(a) requires the licence *"URI or hyperlink"*
(the bare words "CC BY 4.0" are neither). The deferral rationale recorded by FE-4
(SEC-14 allow-list rejects new origins) is a **self-imposed grep gate, not a CSP
constraint** — top-level navigation links are not restricted by the shipped CSP
(`default-src`/`connect-src` govern subresource loads; the live CSP probes in §10.6
show what enforcement actually blocks). RS-3 itself sanctions the fix: extend
`ALLOWED_ORIGINS` in `scripts/security-greps.mjs` with the three hosts and render the
three links. **GATE 2 must either land the links (FE fix + DO gate tweak) or record
the client's explicit acceptance of an attribution-terms breach** — do not ship
silently.

## 10.5 New attack surfaces (items 2, 4, 5, 6 + i18n expansion)

- **Date picker (item 4).** Native `type="date"`, `min`/`max` = location civil date
  ±10 (live: `2026-10-04`..`2026-10-24`). `onPickDate` re-validates on every event:
  ISO-regex **and** range check (`app.js:519-525`); `clampISO` for the buttons. Live
  tamper probes: out-of-range `2030-01-01` → reverted to the viewed date; `0001-01-01`
  → reverted; garbage string → native control neutralises it (value `''`; `change`
  snaps back per design, `input` deliberately doesn't fight the keystroke). No `NaN`
  anywhere in the DOM after any probe. min/max bypass via DOM writes cannot leave the
  ±10 window (single clamp rule).
- **Detail panel / all rendering (items 5–6).** SEC-05 gate: **0 hits** for
  `innerHTML|outerHTML|insertAdjacentHTML|document.write|eval(|new Function|javascript:|setAttribute('style'`
  across all 10 shipped files. Live hostile-payload probe (HTML/script/svg in cached
  `name`/`admin1`) rendered as **literal text** (`window.__xss`/`__xss2` never set).
  Panel content (dictionary strings, `panel.note.overlay.*`) enters via `t()` +
  `textContent` only — NFR-S2 holds on every new surface.
- **Geolocation button (item 2).** No auto-prompt when a stored location exists
  (FE-1); the manual button is single-fire: 3 rapid clicks → **exactly 1**
  `getCurrentPosition` call (call-counter probe), button `disabled` + `aria-busy`
  while in flight; a hard **denial** re-enables the button and offers the S5
  copy + city fallback (no dead end, no prompt loop). Success path verified with a
  stub (chip `मेरी लोकेशन`); coordinates stay on-device (§10.3 URL scan).
- **i18n expansion.** Dictionary is a static object literal in `i18n.js` (122 keys,
  `tests/i18n.test.js` asserts byte-verbatim both languages + every `data-i18n` hook
  resolves); `t()` interpolates `{vars}` via `String()` into `textContent`/`setAttribute`
  sinks only; research-derived key/data strings enter through the dictionary, never as
  dynamic HTML. No dynamic key computation exists.

## 10.6 Standing gates re-verified (CSP, greps, scanners, suncalc)

- **CSP meta byte-exact + enforcing.** `content` is byte-identical (whitespace-
  normalised) to `04-architecture.md` §5.3; placement verified: first element of
  `<head>` (only a comment precedes it), ahead of `<meta charset>` and every
  `<link>/<script>`. **Enforcement probed live:** injected inline `<script>` did not
  execute; injected external `https://example.com/evil.js` refused (`onerror`,
  `transferSize: 0`, `responseStatus: 0` — no bytes fetched); `fetch('https://example.com/')`
  blocked by `connect-src` (TypeError) while the allow-listed geocoder fetch succeeds
  (HTTP 200). Zero CSP violations during normal flows.
- **`make greps` SEC-03/05/14 + the new storage rule:** 0 hits / 4 gates (§10.2),
  now a persistent failing gate in `make check` (v2.2.0 F3 closed).
- **`make check`** green at `c68d00a` (tests 100/100, greps, smoke 66/66, axe 5/5).
- **gitleaks** clean over 87 commits; **npm audit** 0 vulnerabilities.
- **Vendored suncalc unchanged:** sha256 `f5e86948…e4a197f` matches the v2.2.0 record
  AND a fresh `suncalc@2.1.1` registry download (`diff -q` byte-identical).

## 10.7 SEC-01..SEC-24 delta ticks

| Gate | v2.3.0 delta status |
|---|---|
| SEC-01 CSP meta | ✅ re-verified byte-exact + first-in-head + enforcing (3 live vectors) |
| SEC-02 referrer | ✅ `no-referrer` meta present (index.html:12) |
| SEC-03 no inline style/handlers | ✅ 0 hits; gate covers the two new modules |
| SEC-04 assets same-origin+versioned | ✅ **with note F12**: `inauspicious.js:24` imports `./choghadiya.js` WITHOUT `?v=` → duplicate unversioned fetch (live resource list shows both `choghadiya.js?v=2.2.0` and bare `choghadiya.js`) |
| SEC-05 no HTML sinks | ✅ 0 hits + hostile-payload probe inert |
| SEC-06 t() via textContent | ✅ dictionary + panel + rows all textContent |
| SEC-07 DOM-clobbering hygiene | ✅ now fully met (v2.2.0 F2 `name="city"` removed; grep 0 hits) |
| SEC-08 query validation | ✅ unchanged (control chars rejected, no request) |
| SEC-09 URL building | ✅ unchanged; live URLs carry only `name/count/language` |
| SEC-10 allow-listed mapping | ✅ unchanged on the network path; **read path gap → F10** |
| SEC-11 third-party validation | ✅ network path unchanged; **F10 = persisted records skip it** |
| SEC-12 caps | ✅ persisted cache inherits FIFO-64 (`persistSet`) + 24 h TTL |
| SEC-13 single fetch + omit credentials | ✅ live-verified; geocache adds query+results **at rest** (disclosed) |
| SEC-14 origin allow-list | ✅ 0 hits; **gate too narrow for the licence links → F8** |
| SEC-15 privacy claims | ⚠️ truthful for the shipped session scope; TTL undisclosed + flip hazard → **F9** |
| SEC-16 suncalc byte-identity | ✅ fresh-registry re-verified |
| SEC-17 pinned deps | ✅ unchanged (axe-core 4.10.2 exact, dev-only) |
| SEC-18 CI hardening | ✅ now SHA-pinned (`.github/workflows/ci.yml:23,26`) — v2.2.0 F1 closed |
| SEC-19 release ops | ⏳ release-card scope, unchanged |
| SEC-20 secrets | ✅ gitleaks clean (87 commits) |
| SEC-21 no logging | ✅ `console.`/beacon/XHR grep 0 hits |
| SEC-22 persistent greps | ✅ `scripts/security-greps.mjs` in `make check` — v2.2.0 F3 closed |
| SEC-23 test-suite network-free | ✅ tests mocked, smoke fixture-intercepted (item-7b checks included) |
| SEC-24 manual browser pass | ✅ executed for this addendum (§10.3–10.6) |

## 10.8 Threat-model drift check

See the new **docs/06 §11** (v2.3.0 delta, written in this card): ADR-007 superseded
in part by ADR-009; new boundary **TB5 (same-origin web storage = untrusted input on
read)**; storage STRIDE delta; SEC-STORAGE + read-path-validation + disclosure-
truthfulness requirement deltas. v2.2.0 drift items F1/F2/F3 are **closed**; A5
(no SW/postMessage/iframes/URL-state) re-greps to 0 hits; §1.1 "one network request
type" holds.

## 10.9 Findings (F8–F12)

| ID | Severity | Finding | Location | Fix | Disposition |
|----|----------|---------|----------|-----|-------------|
| F8 | **Medium** | Attribution credit ships WITHOUT the hyperlinks RS-3 §13.6 B1 requires ("the licence requires links, not just text"); Open-Meteo's terms require a link next to displayed location data and CC BY 4.0 §3(a) requires the licence URI/hyperlink. The SEC-14 deferral is a self-imposed grep gate — CSP does not block navigation links | `index.html:298-300`, `i18n.js:84,208`, `scripts/security-greps.mjs:72-75` | Add 3 `<a rel="noopener noreferrer" target="_blank">` links (open-meteo.com / geonames.org / creativecommons.org/by/4.0) to `attribution.geocoding`; extend `ALLOWED_ORIGINS` with exactly those 3 link-only hosts (RS-3 explicitly sanctions this) | **CLOSED — v2.3.0 fix wave.** FE-FIX `0cc4144` shipped the three anchors (DOM-API `renderAttribution()`); DO-FIX `c7fc4ad` extended `ALLOWED_ORIGINS` with exactly these 3 hosts + a `LINK_ONLY_ORIGINS` href-context guard. Live re-verified (§10.12) |
| F9 | **Medium** | Disclosure-vs-storage truthfulness is time-bombed: (a) `privacy.line` does not disclose the 24 h cache TTL/expiry; (b) the client-confirmed localStorage flip (uncommitted `docs/00-brief.md` edit) would make "this browser tab" **false** and extends settings-at-rest lifetime to indefinite (shared-device exposure) | `i18n.js:83,207`, `index.html:299,336`, `session-store.js:38` | If the flip lands, same commit must reword `privacy.line` ("this browser tab"→"this browser", add "TTL-gated cache" wording per the brief), update ADR-009 + docs/06 §11.4, and re-run this delta. Consider adding the TTL to the copy regardless | **CLOSED — v2.3.0 fix wave.** BE-FIX-1 `20fe1c1` flipped `STORAGE_SCOPE` to `'local'`; FE-FIX `0cc4144` rewrote `privacy.line` EN+HI (tab claim dropped, settings-no-expiry + 24 h cache TTL disclosed) + `index.html` fallbacks; docs/06 §11.4 updated to the landed posture (this delta). Verified truthful live (§10.12) |
| F10 | **Low** | Geocache read path returns stored arrays without re-validating records (mapResult runs only on network data): a tampered/legacy entry with an invalid IANA tz or non-finite coords reaches `selectResult`, throws uncaught `RangeError`, and blanks the render (live-proven). TextContent rendering prevents any XSS (verified) | `geocoder.js:244-253` (`persistGet`), `app.js:937-955` (`selectResult`) | Run persisted entries through the same validation as `mapResult` (drop bad records on read), or guard `selectResult`'s `timezone` with the existing `isValidTimeZone` fallback to `deviceTimeZone()` | **FIXED — BE-FIX-2 `d8b5cdc`:** `persistGet` re-validates every at-rest record (`mapPersisted` → `mapResult` rules, stricter on coordinates than the network path); wholly invalid entry degrades to a cache miss and self-heals on the next fetch. Re-verified (§10.12) |
| F11 | *(informational, carried)* | The v2.2.0 F4 nuance stands: `privacy.line` names only the typed city name; the request also carries fixed `count=8` and the UI `language` | `i18n.js:83,207` | optionally widen copy (coordinated UX + i18n-gate change) | Accepted, unchanged — carried into the fix-wave sign-off as the sole accepted informational (§10.12) |
| F12 | *(informational)* | `inauspicious.js:24` imports `./choghadiya.js` with no `?v=` token → the module is fetched twice (versioned + bare) and the bare specifier bypasses cache-busting (version-skew risk on redeploy; US-19 AC3 letter). Smoke's assetVersions() checks token *values*, not token *presence* | `inauspicious.js:24` | add `?v=${ASSET_VERSION}`-style token to the import (and extend smoke to assert every internal specifier carries one) | **FIXED — BE-FIX-2 `d8b5cdc`:** `inauspicious.js:27` now imports `./choghadiya.js?v=2.3.0`; DO-FIX `c7fc4ad` added the smoke presence check (every internal specifier carries `?v=` — 7 specifiers, green) |

## 10.10 Residual risk (post v2.3.0 delta)

1. **F8 licence exposure is the top GATE 2 item** — enforcement risk is realistically
   low (small non-commercial tool) but the breach is formal and the fix is tiny;
   RS-3's own recommendation ships with links.
2. **F9 flip sequencing** — if the localStorage flip lands after this audit (or after
   QA-1/TW-1), every report citing "this browser tab"/session semantics needs a delta
   pass; the disclosure must not ship wrong even briefly.
3. **F10** is local-tamper-only (extensions / shared device / devtools): worst case a
   blank render until TTL expiry or tab close; no code-execution or data-leak path.
4. Shared-device exposure of the geocache (recent queries visible in the tab for 24 h)
   is inherent to item 7 as specified and disclosed; per-tab lifetime bounds it.
5. The smoke reload scenarios still rely on `sessionStorage` surviving `Page.reload`
   in one target (DO-1 residual, unchanged); the new item-7b checks share it.

## 10.11 Verdict

**VERDICT: PASS-with-accepted-risks (0 Critical · 0 High · 2 Medium · 1 Low · 1 Informational)**

Per the audit contract (docs/06 §10) the FAIL trigger is an open Critical/High —
none exists. The v2.3.0 privacy-posture delta is soundly built: storage is confined to
`session-store.js` behind a persistent gate, envelope parsing is injection-safe under
malformed and prototype-polluting payloads (probed), the throwing-storage fallback
keeps the app fully functional with zero leakage into the DOM, live inspection shows
exactly the client-specified fields and a working 24 h TTL cache with no coordinate
ever in a URL, and every new rendering surface (panel, picker, geolocation, i18n)
stays textContent-only under hostile payloads. **GATE 2 conditions: F8 (attribution
links — fix or explicitly accept) and F9 (storage-scope/disclosure sequencing).**
F10–F12 are Low/informational and non-blocking. No finding here is being softened:
had the FE-FIX cache wiring not landed (`068681c`) or the disclosure been left
over-claiming, item 7 would have failed this audit.

---

## 10.12 v2.3.0 fix-wave delta sign-off (2026-10-14, `t_7b42e0d0`)

**VERDICT: PASS-with-accepted-risks (0 Critical · 0 High · 0 Medium · 1 Low · 3 Informational)** — the two GATE-2 conditions (F8, F9) are satisfied and **closed**.

*SEC-FIX card `t_7b42e0d0`, security-engineer, 2026-10-14. Small delta re-audit of
the v2.3.0 fix wave — NOT a full re-audit; §10.1–§10.11 remain the baseline record.
Audited tree: `main` @ `61282a8`, working tree clean. Fix wave under sign-off:
BE-FIX-1 `20fe1c1` (storage flip), FE-FIX `0cc4144`+`f14bc80` (F9/F8/F3 copy + the 3
attribution links), DO-FIX `c7fc4ad`+`61282a8` (SEC-14 allow-list + smoke/a11y gates),
BE-FIX-2 `d8b5cdc` (geocache read validation + versioned import). Scope: docs/09 +
docs/06 only — no code was changed by this card; new findings are filed for the CTO.*

### 10.12.1 Gate runs at the sign-off tree (real output)

| Gate | Command | Result |
|---|---|---|
| unit/contract tests | `make test` | **108 pass / 0 fail** |
| SEC-22 source greps | `make greps` | **PASS — 0 hits across 4 gates** (SEC-05, SEC-03, SEC-14, SEC-STORAGE) |
| browser smoke | `node scripts/smoke.mjs` | **67 passed / 0 failed** (incl. the migrated item-7a/7b localStorage pins + the new `?v=`-presence check, 7 specifiers) |
| axe accessibility | `node scripts/axe-check.mjs` | **PASS**, 0 critical/serious (1 incomplete rule: color-contrast — pre-existing) |
| dependency audit | `npm audit` | **found 0 vulnerabilities** |
| secret scan | `gitleaks detect --source .` | **no leaks found** (102 commits, ~1.44 MB) |

### 10.12.2 GATE-2 condition closure — verified on the post-wave tree (live)

Live Chromium probe on a locally served build of the committed tree (real network):
load → toggle EN → real search `Jaipur` (real Open-Meteo request) → select the first
result → dump storage + the full resource list.

**F8 — attribution links (CLOSED).**

- Exactly **3** anchors on the entire page, all in `#footer-credit`, carrying the
  RS-3 B1 targets in order and nothing else:
  `https://open-meteo.com/` · `https://www.geonames.org/` ·
  `https://creativecommons.org/licenses/by/4.0/` — each `rel="noopener noreferrer"`
  `target="_blank"`, no other attributes (verified attribute-by-attribute).
- Built with DOM APIs only (`app.js:1397-1419` `createElement`/`createTextNode`/
  `replaceChildren`; child nodes are `#text,A,#text,A,#text,A`). `index.html` ships a
  plain-text fallback (`index.html:302`), so the anchors exist only after `app.js`
  runs — no HTML sink anywhere (SEC-05 gate 0 hits).
- `credit.textContent` is **byte-equal** to `DICT[lang]['attribution.geocoding']` in
  both HI and EN — compared in-page against the real `i18n.js` module (dynamic
  import), not by eye.
- `ALLOWED_ORIGINS` grew by **exactly** the 3 sanctioned hosts versus the audited
  tree (`git diff c68d00a..HEAD -- scripts/security-greps.mjs`: no other origin
  added anywhere). Each of the three is additionally in `LINK_ONLY_ORIGINS`, so a
  `fetch`/`import`/`src` use of any of them **fails** SEC-14 despite the allow-list
  (DO-FIX negative control NC1 proved the guard fires). In shipped code the three
  origins appear **only** as the href literals `app.js:1392-1394` (plus the gate
  script's two lists and README/doc prose) — nowhere as a request.

**F9 — storage/disclosure truthfulness (CLOSED).**

- `STORAGE_SCOPE = 'local'` (`session-store.js:40`). After the full flow,
  `sessionStorage` is **empty** and `localStorage` holds exactly 4 namespaced keys —
  `settings.lang`, `settings.location`, `geocache.index`,
  `geocache.entry.en\u0000jaipur` — no key creep beyond the client-specified fields.
- Settings envelopes carry **`t:null` (no expiry)** → "settings stay in this browser
  with no expiry" is truthful. The geocache envelope carries `t` = write-time +
  **86,400,000 ms** (`CACHE_TTL_MS` = 24 h exactly) → "expire after 24 hours" is
  truthful (the smoke 20c renewal pin asserts the same ≈24 h envelope). With
  `localStorage` as the backing store, at-rest lifetime now spans browser restarts:
  settings indefinitely, the cache inside its 24 h TTL. docs/06 §11.4 is rewritten to
  this landed posture (shared-device exposure + controls recorded).
- `privacy.line` rendered in the footer AND the location sheet is **byte-equal** to
  `DICT[lang]` in HI and EN (in-page comparison against the real module; footer ==
  sheet). "No server storage" holds: the only thing that crosses the wire is the
  typed query (below). The brief's stance — "no server storage; local TTL-gated cache
  only" — is satisfied as written, with the disclosed exception that settings (the
  user's own choices + chosen location) carry no TTL, exactly as item 7 specifies.

**US-17 no-egress invariant (holds).** After search + selection (stored location
`26.91962 / 75.78781`), the complete performance-resource list contains exactly one
external URL:
`https://geocoding-api.open-meteo.com/v1/search?name=Jaipur&count=8&language=en`
— no `lat`/`lon` parameter and **no coordinate value appears in any URL** (string
scan of every resource entry). The 3 licence links are **never fetched**: they are
user-initiated navigation only and show up in no request. All 9 self-origin resources
carry `?v=2.3.0`.

**F10/F12 (FIXED by BE-FIX-2 `d8b5cdc`).** `geocoder.js` `persistGet` re-validates
every at-rest record (`mapPersisted` → the `mapResult` rules, stricter on coordinates
than the network path — real finite numbers required) and degrades a wholly invalid
entry to a cache miss that self-heals on the next fetch;
`inauspicious.js:27` now imports `./choghadiya.js?v=2.3.0`. Source-verified; both
behaviours green inside the 67/67 smoke run.

**QA-1 F2 (docs/08 §13) — CLOSED.** The QA re-audit's "client-confirmed localStorage
vs shipped sessionStorage" mismatch is resolved by the same wave: flip (`20fe1c1`) +
disclosure rewrite (`0cc4144`) + smoke pin migration (`c7fc4ad`).

### 10.12.3 Findings-table dispositions after this delta (§10.9 updated in place)

| ID | Severity | Disposition after the fix wave |
|----|----------|-------------------------------|
| F8 | Medium | **CLOSED** — FE-FIX `0cc4144` + DO-FIX `c7fc4ad`, live-verified above |
| F9 | Medium | **CLOSED** — BE-FIX-1 `20fe1c1` + FE-FIX `0cc4144` + docs/06 §11.4 (this delta), live-verified above |
| F10 | Low | **FIXED** — BE-FIX-2 `d8b5cdc` (read-path re-validation) |
| F11 | Informational | **Accepted, carried** — unchanged (v2.2.0 F4 nuance) |
| F12 | Informational | **FIXED** — BE-FIX-2 `d8b5cdc` + smoke presence check (`c7fc4ad`) |
| QA-1 F2 (docs/08) | Medium | **CLOSED** — same wave |

Where §10.7's SEC-04/SEC-14/SEC-15 "with note" cells or §10.10's residual list
conflict with this section, this section governs (they are preserved as the SEC-1
point-in-time record).

### 10.12.4 New delta findings (found during this sign-off — for the CTO to route)

| ID | Severity | Finding | Location | Fix |
|----|----------|---------|----------|-----|
| F13 | **Low** | The axe gate does not pin `prefers-color-scheme`, so its verdict depends on the host theme — the wave's own anchor-contrast defect was only visible in dark mode (DO-FIX caught it; a light-mode host would have passed it silently). No security impact; the a11y gate can hide theme-scoped regressions | `scripts/axe-check.mjs` | emulate + scan both light and dark themes (DO follow-up candidate) |
| F14 | *(informational)* | The dark-theme link-contrast fix (`style.css:920` `footer.app a { color: inherit }`, `61282a8`) is an out-of-lane product change shipped inside the DO-FIX card. Security-wise sound (it closed an a11y defect), but UX has not blessed the token choice | `style.css:920` | UX/CTO bless or replace with a design-system `--link` token (isolated commit, trivially supersedable) |
| F15 | *(informational)* | The smoke item-7a pin "12h/24h persists across a reload" asserts DOM state only and would also pass under `sessionStorage` — the language-key and geocache-key pins are the real session-vs-local discriminators. QA-2 also still owes the direct browser-relaunch persistence test | `scripts/smoke.mjs` (§19) | QA-2 (`t_087f8775`) may tighten; not a product defect |

### 10.12.5 Residual risk & honest limits (post sign-off)

1. **F11** (informational, accepted): `privacy.line` names only the typed city name
   while the request also carries fixed `count=8` + the UI `language` — unchanged
   client-scoped copy decision.
2. **QA-2 (`t_087f8775`, open child) still owes two regression pins**: the
   `credit.textContent === t('attribution.geocoding', lang)` smoke assertion and a
   true browser-process-relaunch persistence test. This sign-off verified both
   behaviours directly (in-page byte-compare; `localStorage` + `t:null` semantics +
   the suite's same-tab reload persistence), but they are not yet pinned in the
   suite — a future regression could pass `make check` until QA-2 lands.
3. **F13** stands until the axe gate is theme-deterministic.
4. **Shared-device exposure** — settings.location (indefinite) and recent queries
   (≤24 h) are readable by anyone with access to the browser profile. Inherent to the
   client-confirmed item 7, now truthfully disclosed; no server copy exists and
   extensions/devtools users are inside TB5's trust rule.
5. **F14** is product polish pending UX sign-off, listed here only so the delta is
   complete.

**Bottom line:** both GATE-2 conditions are discharged with live evidence, the two
Medium and one Low finding from §10.9 are closed/fixed, and what remains is one
accepted informational (F11) plus one Low gate-hardening item (F13) and two
informationals (F14, F15). No Critical/High exists, so no fix cards are required
from this delta; F13–F15 are filed above for ordinary CTO routing.

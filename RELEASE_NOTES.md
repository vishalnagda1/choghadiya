# Release Notes — Choghadiya v2.3.0

**Release:** v2.3.0 (semver minor, bumping the `package.json` baseline `2.2.0`)
**Date:** 2026-10-14
**Target:** GitHub Pages — <https://time.gitick.com/>
**Status:** released — GATE 2 rev 2 client sign-off 2026-10-14; tagged `v2.3.0`
(release commit `1a13519`) and pushed to `vishalnagda1/choghadiya` `main`; GitHub
Pages rebuilt for that commit and <https://time.gitick.com/> serves the new build
(post-deploy verification below).
**Deploy runbook:** [docs/DEPLOY.md](docs/DEPLOY.md)

> **Versioning note.** The package baseline is `2.2.0`; this release is cut as
> **`v2.3.0`**. The release step bumps `package.json` to `2.3.0`, updates every
> asset `?v=` token (now covering all shipped JS modules), re-runs the full
> `make check` gate green on the release commit, and creates the annotated tag
> `v2.3.0` in the same commit.

> **Earlier release notes.** v2.2.0 notes are preserved in git history and in
> [CHANGELOG.md](CHANGELOG.md); this file describes the current release.

---

## What this release is

The **v2.3.0 feature wave** on top of the v2.2.0 refactor. It makes the clock
**12-hour by default** with a toggle, reworks date selection into a **calendar
picker (±10 days)**, adds a **manually re-triggerable location button**, computes
and explains the **inauspicious periods** (Vaar Vela / Kaal Vela / Kaal Ratri),
adds a **choghadiya detail panel** explaining each slot, and — for the first time
— **persists settings and caches geocode results in the browser** (`localStorage`:
settings survive a full browser restart; the geocode cache keeps a 24 h TTL). That
last item relaxes the v2.2.0 "no storage ever" stance to **"no server storage;
local TTL-gated cache only"**.

---

## Highlights

- **12-hour by default (new), 24-hour on demand.** Every time reads `06:32 am`;
  a header 12h/24h toggle switches the whole app to `06:32` instantly, and the
  choice is remembered across browser restarts.
- **Calendar date picker (±10 civil days).** The date label itself is the picker:
  any date from 10 days before to 10 days after the viewed location's today,
  clamped at the edges. `‹ / ›`, `Alt + ← / →` and the polar escape hatch all
  share the same clamp.
- **"Use my current location" button.** A button inside the location sheet
  re-triggers geolocation on demand — handy after a denial or when switching back
  to the device fix. Its own denied/timeout state is reported inline in the sheet.
- **Inauspicious periods, explained.** **Vaar Vela**, **Kaal Vela** and **Kaal
  Ratri** are computed for the selected date and location and listed below the
  slot lists with their ranges and a one-line explanation. Definitions follow the
  verified research tables (§11 — Vaar Vela is *not* Yamagandam, Kaal Ratri is
  *not* Rahu Kaalam on 6 of 7 weekdays). A cross-midnight period carries the
  civil-date suffix; Saturday's legitimate double periods render in full. The UI
  states these are traditional beliefs, not astronomical facts.
- **Choghadiya detail panel.** Below the periods block, a card shows the shown
  slot's meaning, what it is good for, what to avoid, a day/night nuance and a
  contextual note. It defaults to the **current** slot; tapping another row
  selects it, tapping it again (or reloading) returns to the current slot. If an
  inauspicious period overlaps the shown slot, the panel warns and **names it**.
- **Remembers your settings, caches your searches.** Time format, language and
  last location survive a **reload and a full browser restart**; successful city
  searches are cached for **24 hours** so a repeat search or reload does not
  re-hit the geocoder. Settings never expire; cached searches expire after 24 h.
  All of it is browser-local `localStorage` — **nothing is ever sent to a
  server**.
- **Everything from v2.2.0 still holds.** Real solar timings, location awareness
  with correct IANA timezone/DST rendering, bilingual Hindi-default UI (now
  **122 keys**), colour-independent quality tiers, the current-slot highlight,
  graceful degradations, and the WCAG 2.2 AA / responsive baseline.
- **Attribution reduced, not removed — and now linked.** Full removal of the
  geocoder attribution would breach Open-Meteo's and GeoNames' CC BY 4.0 terms, so
  v2.3.0 keeps **one minimal footer credit** ("Location search by Open-Meteo ·
  Data from GeoNames · CC BY 4.0") and rewrites the privacy line to the new
  storage stance. The three key words are **real hyperlinks** — `Open-Meteo` →
  open-meteo.com, `GeoNames` → geonames.org, `CC BY 4.0` →
  `creativecommons.org/licenses/by/4.0/` — each with
  `rel="noopener noreferrer" target="_blank"`, built with DOM APIs only (never
  `innerHTML`).

---

## Notable fixes

- **Geocode cache wiring (item 7b).** The 24 h geocode cache shipped in code but
  `app.js` initially never handed the cache store to the geocoder, so repeat
  searches still refetched. The cache store is now injected — verified live: the
  cache survives a reload and a repeat query sends no request.
- **CI/gate honesty carried forward** from v2.2.0: the SEC-05/03/14 source greps
  now include a **SEC-STORAGE** gate (web-storage tokens allowed only in
  `session-store.js`), so the new storage path is held to the same standard.

**Fix wave (the GATE 2 rev 2 delta).** After the first gate, the client confirmed
item 7 as `localStorage`, and the QA-1 / SEC-1 findings from both gate reports were
fixed on `main`:

- **Item-7 scope flipped `sessionStorage` → `localStorage`** (client-confirmed):
  settings now survive full browser restarts with **no expiry**; the geocode cache
  keeps its **24 h TTL** (F2 / SEC F9).
- **Privacy disclosure reworded** so it stays truthful under `localStorage` — the
  now-false "only in this browser tab" claim is gone, and the copy discloses
  settings-no-expiry plus the 24 h cache TTL (F9).
- **Attribution credit rendered with 3 live licence links** (SEC F8, above).
- **Overlap-warning copy made tier-neutral** — no longer calls an inauspicious
  slot "otherwise-good" (QA F3).
- **Geocode-cache read path re-validates persisted entries** — a tampered/legacy
  entry can no longer blank the render (SEC F10).
- **Every internal module specifier carries `?v=`** — no unversioned module edge
  (SEC F12).
- **Architecture doc corrected** — §16.2/§16.3 match the shipped key layout and
  `createGeocoder` signature (QA F5).
- **Gate honesty:** the SEC-14 origin allow-list gains exactly three **link-only**
  licence hosts with a non-`href` guard, and the smoke gate now asserts every
  internal specifier has a `?v=` token.

---

## Known issues & limitations

> **Reconciliation.** The GATE 2 rev 2 fix wave landed on `main` after the first
> gate: the client confirmed item 7 as `localStorage`, the attribution credit was
> rendered with links, and QA-1 / SEC-1 findings **F2, F3, F4, F5, F8, F9, F10 and
> F12 were all fixed** (see *Notable fixes* above). Those findings are therefore
> **moved out of this section** — they are fixed on `main` and **cleared by QA-2's
> re-test verdict**, [docs/08-test-report.md](docs/08-test-report.md) §14 (**PASS**,
> no open Critical/High/Medium) and the SEC-1 delta re-sign-off,
> [docs/09-security-audit.md](docs/09-security-audit.md) (**PASS-with-accepted-risks**,
> 0 Critical / 0 High / 0 Medium).
> The gate is green on the post-wave tree — `make check` **exit 0** at HEAD
> `61282a8` (tests 108/108, greps 0 hits/4 gates, smoke 67/67, axe PASS 5 states).
> No QA finding remains open above Informational; the informational residuals
> (F13/F14/F15) are carried to the post-release backlog.

Remaining known issues (no open code defect; both are product decisions, not bugs):

1. **±1–2 min vs a printed panchang.** Expected and disclosed in the UI footer;
   suncalc uses the upper-limb + refraction convention (also verified by QA-1
   MAN-01 M3: max **1 min** delta for the three new periods vs live Drik Panchang).
2. **English slot-name spellings.** `Labh / Amrit / Kaal / Char / Rog / Udveg /
   Shubh` are deliberately shorter than Drik Panchang's long forms — a product
   decision fixed by [docs/02-prd.md](docs/02-prd.md) US-2 AC5 / US-11 AC4 and
   [docs/03-ux.md](docs/03-ux.md) §6.

Items carried from v2.2.0 that remain open as post-release verification (not
defects): the real-device geolocation *grant* path (MAN-03) and a live
screen-reader pass (MAN-05); the city-sheet loading/`recent cities` polish was
formally **cut** at the v2.2.0 GATE 2 and remains on the post-release backlog.
QA-1's residual risks for v2.3.0 are in docs/08 §13.8 (item-7b hit/expiry paths
rest on smoke + unit tests; no real-device geolocation; no real screen reader; the
M6 Lighthouse FCP is owned by the release/publish step). Carried into the wave by
DO-FIX: the axe gate is host-theme-dependent (`scripts/axe-check.mjs` does not pin
an emulated `prefers-color-scheme`), so a light-mode CI host would not have caught
the footer-link dark-theme contrast defect the wave fixed in `style.css`; the
footer link colour is a one-rule product change a follow-up UX card may replace
with a design-system token.

---

## Security

Pre-release audit for v2.3.0: **PASS-with-accepted-risks** (SEC-1,
[docs/09-security-audit.md](docs/09-security-audit.md) §10) — **0 Critical · 0 High
· 2 Medium · 1 Low · 1 Informational**, audited tree `c68d00a`, **0**
vulnerabilities (`npm audit`, incl. dev) and no secret leaks (`gitleaks`, 87
commits). Both Medium findings — the attribution hyperlinks (F8) and the
storage-scope disclosure (F9) — were the audit's **GATE 2 conditions** and were
**landed by the fix wave**, as were the Low finding (F10, geocode-cache read path)
and the Informational item (F12, bare-`?v=`-less import). The SEC-1 delta
re-sign-off updates [docs/09](docs/09-security-audit.md). What is relevant to
v2.3.0:

- The **CSP is unchanged** (`script-src 'self'`); the local cache adds no network
  origin and never transmits stored data — the geocoder still calls **only**
  `geocoding-api.open-meteo.com`, and no coordinates ever appear in a URL (US-17,
  probed live). The three attribution licence links are navigation-only and sit in
  a **link-only** SEC-14 allow-list entry that fails the gate in any non-`href`
  context (`fetch` / `import` / `src`).
- A new **SEC-STORAGE** grep gate fails `make check` if a web-storage token
  appears outside `session-store.js`; every module reaches storage only through
  that module's `get/set/remove` (envelope-parsed, injection-safe, throw-tolerant).
- The geocode cache **re-validates persisted entries on read** (F10), so a
  tampered or legacy entry cannot reach the renderer.

---

## Verification summary

> **Gate re-run on the post-wave tree.** The fix-wave gate is green at HEAD
> `61282a8` — `make check` **exit 0**: tests **108/108**, security greps **0 hits
> across 4 gates**, smoke **67/67**, axe **PASS (5 states)**, 0 critical/serious.
> These figures supersede QA-1's (§13, HEAD `d45fef1`, 100/100 · 66/66), which
> predate the fix wave; the authoritative post-wave verdict is **QA-2's
> [docs/08](docs/08-test-report.md) §14 (PASS — no open Critical/High/Medium)**, with the SEC-1 delta
> re-sign-off (**PASS-with-accepted-risks**, 0 Critical / 0 High / 0 Medium) in
> [docs/09](docs/09-security-audit.md). The release commit was **HEAD of `main`
> at publish time** (`1a13519`) — see
> [docs/releases/v2.3.0-publish-staged.md](docs/releases/v2.3.0-publish-staged.md).

| Check | Command | Result |
|-------|---------|--------|
| Unit + contract suites | `make test` | **108 tests / 108 pass / 0 fail** (Node's built-in runner; includes the 122-key bilingual i18n contract, the pinned 112-assertion sequence lock and the F10 tampered-entry tests) |
| Headless render smoke | `make smoke` | **67 / 67 checks pass** (16 rows from the Mumbai fixture, 12h default + 24h toggle, S8 periods fixture, S9 panel default/select/revert/reload, ±10-day picker, `localStorage` persistence across reload, cache-busting, `?v=` presence on every internal specifier, plus 12 item-7b geocode-cache checks) |
| Accessibility gate | `make axe` | **0 critical/serious** and **0 moderate/minor** across 5 states (base, city dialog, row selected with panel, off-today + picker focused, base @320 px) |
| Security greps | `make greps` | **PASS — 0 hits across 4 gates** (SEC-05 HTML sinks, SEC-03 inline styles/handlers, SEC-14 origins, SEC-STORAGE) |
| Full gate | `make check` | **exit 0** at HEAD `61282a8` (test + greps + smoke + axe) |
| Dependency audit | `npm audit` (incl. dev) | **0 vulnerabilities** |
| Secret scan | `gitleaks detect --source .` | **no leaks found** (87 commits) |
| Perf budget | (printed by smoke) | shipped JS **184.9 KB raw / 58.5 KB gzip** upper bound (7 files) < 60 KB min+gzip (NFR-P3) |

### Post-deploy verification (deployed URL)

Executed by the release step (`DO-3`, `t_0a7a35b6`) against the live
<https://time.gitick.com/> after the v2.3.0 push and Pages rebuild:

| Check | Result |
|-------|--------|
| Pages build for the release commit `1a13519` | **built** (GitHub Pages API: `status=built`, `duration=66.7 s`, no error) |
| Tag on the remote | `refs/tags/v2.3.0` → annotated object `7612422…` → commit `1a13519` |
| Deployed shell is the new build | `?v=2.3.0` on `favicon.svg`/`style.css`/`app.js`; full module graph (`app.js` → `choghadiya.js`, `inauspicious.js`, `i18n.js`, `geocoder.js`, `session-store.js`; `choghadiya.js` → `vendor/suncalc-2.1.1.js`) — **every asset HTTP 200** with `?v=2.3.0`, none versionless |
| v2.3.0 surfaces live (real Chrome) | 12-hour default (`06:32 am`) with a working 12h↔24h toggle (`06:32`), "use my current location" button, native date picker `min=2026-10-04 / max=2026-10-24 / value=2026-10-14` (= today ∓10), inauspicious-periods block (Vaar Vela / Kaal Vela / Kaal Ratri incl. the cross-midnight civil-date suffix), choghadiya detail panel (current slot + meaning/good-for), **0 console errors** |
| `localStorage` semantics live | `choghadiya.settings.*` written as `{"t":null,"v":…}` envelopes (no expiry); the 24h choice and the location survived a reload; no `sessionStorage` use |
| Attribution credit live | 3 real hyperlinks in the footer — open-meteo.com / geonames.org / creativecommons.org/licenses/by/4.0/ — each `rel="noopener noreferrer" target="_blank"` |
| Deployed smoke | The `scripts/smoke.mjs` harness serves the repo files from its own local static server and pins a fixture clock/geolocation, so it has **no remote-URL mode**; the shipped-file gate was re-run green on the release commit (`make check` **exit 0** @ `1a13519` — tests 108/108, greps 0 hits/4 gates, smoke 67/67, axe PASS 5 states) and the deployed URL was covered by the live browser probe above instead |
| M6 mobile FCP gate (Lighthouse 12.8.2, mobile + simulated throttling) | **1496 ms / 1127 ms / 1127 ms** over 3 runs → **max 1496 ms < 1500 ms gate: PASS**; LCP 1.60/1.28/1.28 s, TBT 20/0/0 ms, performance score 0.99/0.92/0.92. (Informational: CLS 0 in run 1, 0.178 in runs 2–3 — the geolocation-prompt layout shift on a first visit; not a v2.3.0 gate, flagged as a possible follow-up.) |

---

## Deploy / rollback

Deployed to GitHub Pages (`vishalnagda1/choghadiya`, `main`) with the annotated
tag `v2.3.0`, after GATE 2. The full runbook — pre-flight gate, release
bump/tag/push commands, Pages verification, the post-deploy smoke + Lighthouse
FCP gate, and rollback — is [`docs/DEPLOY.md`](docs/DEPLOY.md). This app is a
static bundle, so rollback is a `git revert` of the release commit plus a
redeploy (the `?v=` bump busts the Pages cache on the next deploy).

---

## Attribution & licence

- `suncalc` 2.1.1 — BSD-2-Clause (vendored, checksum-pinned).
- Open-Meteo Geocoding API — data from GeoNames, **CC BY 4.0**. In-app credit
  (three key words hyperlinked to open-meteo.com / geonames.org /
  creativecommons.org): "Location search by Open-Meteo · Data from GeoNames ·
  CC BY 4.0".
- Project licence: MIT.

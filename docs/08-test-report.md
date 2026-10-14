# 08 — Test Report (QA execution & release verdict)

Project: **Choghadiya Refactor** · Owner: `qa-engineer` · Date: **2026-10-14** · Version v1.0
Card: `t_99cbf2df` (QA · Execute test plan & regression)
Plan executed: `docs/07-test-plan.md` v1.0 (`t_5fad74cc`) · Bug taxonomy: `07-test-plan.md` §7

---

## VERDICT: PASS-WITH-KNOWN-ISSUES

**All MVP acceptance criteria (US-1 … US-19, `docs/02-prd.md` §5) PASS.** No Critical, High or
Medium *defect* is open. All three measurable quality gates that can be measured on this machine are
green: **M1** 112/112 sequence assertions, **M4** 58/58 keys × 2 languages, **M7** axe 0
critical/serious. **M3** (±2 min panchang) and **M6** (mobile FCP < 1.5 s) were measured with real
numbers (§5, §6) — M3 passes with a margin of 1 min, M6 passes on the release candidate.

Two open items are carried as **known issues, not defects** (KI-1, KI-2 in §7). KI-1 is an
unimplemented `docs/03-ux.md` §S2 *presentation state* with no PRD acceptance criterion behind it and
no key in the 58-key copy deck; two tech-lead reviews already routed the implement-or-cut decision to
the CTO, who owns it at GATE 2. Nothing was softened to reach this verdict: everything that was
executed passed, and everything that could not be executed on this machine is listed as untested in
§8.

HEAD tested: `a170fd0` — the shipped code is byte-identical to the tree REV-M3 reviewed
(`303f682`/`6a41384`); the only commits after it touch `CHANGELOG.md`, `README.md`,
`RELEASE_NOTES.md` and `docs/STATUS.md`.

---

## 1. Environment

| Item | Value |
|------|-------|
| Repo / workspace | `/Users/vishu/hermes-company/projects/choghadiya` (git, branch `main`) |
| Commit under test | `a170fd0e833dbc4dd5b24a99ce7b23eee34400c1` (`docs(status): REV-M2-fix re-review verdict — PASS`) |
| Code commit (unreviewed-unchanged) | `6a41384` (fix/geocoder SEC-08/11/12) on top of `3b83fbf` (DO-02 tooling) |
| Working tree | clean before and after the run (`git status --short` empty) |
| Node / npm | v26.7.0 / 11.19.0 |
| OS | macOS 26.5.2 (arm64) |
| Browser engine | Google Chrome 155.0.8059.40 (headless) — used by `scripts/smoke.mjs`, `scripts/axe-check.mjs`, Lighthouse and the exploratory pass |
| axe-core | 4.10.2 (pinned devDependency, dev-only, never shipped) |
| Lighthouse | 12.8.2 (`npx`, mobile preset = Moto-G-class + simulated 4G/150 ms RTT) |
| Static servers | `make dev` → `python3 -m http.server 8080` (plan-defined entry point) and a QA gzip+`Cache-Control` static server on `:8091` that mirrors what GitHub Pages serves (§6) |
| Live site (pre-deploy) | `https://time.gitick.com/` — still serves the **pre-refactor legacy build**, see KI-2 |

Plan rule honoured: **no test touched the network.** All suites run offline (`tests/*.test.js` inject
a fake `fetchImpl`; smoke/axe hit `http://127.0.0.1:8080` only). Network egress happened only in the
*manual* items of §5–§7, which is what the plan specifies for them (`07-test-plan.md` §6 L4).

---

## 2. Automated suites — executed cases vs. plan

### 2.1 `make test` (S-SEQ, S-SCHED, S-GEO, S-I18N) — **PASS**

```
$ make test
ℹ tests 64 · suites 0 · pass 64 · fail 0 · cancelled 0 · skipped 0 · todo 0 · duration_ms 595
```

| Plan suite | Plan case(s) | Executed | Result |
|------------|--------------|----------|--------|
| S-SEQ — pinned-sequence lock | `SEQ-01` day (56), `SEQ-02` night (56), `SEQ-03` membership, 8th-slot repeat | `daySequence matches the research §5.2 table for all 7 weekdays (56 assertions)`, `nightSequence matches the research §5.3 table for all 7 weekdays (56 assertions)`, `the sequence lock is exactly 7 x (8 day + 8 night) = 112 slot assertions`, `each half returns 8 slots, and the 8th slot repeats the 1st` | **PASS — 112/112 assertions** (M1) |
| S-SCHED — engine/boundaries/tz/degradations | `SCH-01` continuity, `SCH-02` half-length sum, `SCH-03` no hardcoded clock, `SCH-04` Mumbai §8 fixture, `SCH-05`/`SCH-06` 82/98 min, `SCH-07` date boundary, `SCH-09` `todayIn`, `SCH-10` polar, `SCH-11` DST-London, `SCH-12` tz rendering, `SCH-13`/`SCH-14` current slot, `SCH-15` tiers, `SCH-16` `addDays` | 18 tests incl. `buildSchedule(Mumbai 2026-10-14) is the 03-ux §8 fixture`, `continuity invariant: slot[n].end === slot[n+1].start`, `day-slot length tracks the real solar day, ≈82 min mid-Dec and ≈98 min mid-Jun`, `no fixed 06:00/18:00 boundary values exist in the calculation path`, `night half crossing midnight is attributed to its start date, Wednesday`, `polar input returns defined:false … never throws`, `DST fixture: London renders GMT before and BST after the spring transition`, `formatTime renders in the location IANA zone, 24-hour, identical in both locales`, `resolveCurrentSlot returns null for non-today dates`, `vendored suncalc 2.1.1 is byte-identical to the pinned checksum` | **PASS** (M2 = 0 hardcoded boundaries) |
| S-GEO — geocoder client (mock `fetchImpl`) | `GEO-01`…`GEO-11` | 29 tests incl. `request shape: exact §5.2 URL …`, `bad-query: empty, whitespace, <2 chars, >64 chars … no request sent`, `empty or absent results resolves [] — never an error`, `non-2xx maps to GeocoderError{code:"http"}`, `a rejected fetch maps to GeocoderError{code:"network"}`, `per-query cache: one request for repeats`, `debounce: N keystrokes → exactly one request per quiet period`, `supersede: … aborts the in-flight request`, `SEC-08/11/12` hardening tests | **PASS** |
| S-I18N — dictionary coverage (M4) | `I18N-01` 58 keys × 2, `I18N-02` interpolation, `I18N-03` unknown key, `I18N-04` slot names | `03-ux §6 declares exactly 58 dictionary keys`, `every 03-ux §6 key exists in both dictionaries (58 keys x 2 languages = 116 assertions)`, `every string matches the 03-ux §6 table verbatim in both languages`, `index.html data-i18n* hooks all resolve to a dictionary key`, `t() interpolates {n}`, `t() fails loudly on an unknown key` | **PASS — 58/58 × 2, 0 fallbacks** (M4) |

### 2.2 `make check` (L1+L2 + S-SMOKE + S-AXE) — **PASS**

```
$ make check          # tests 64/64 ✔  then smoke then axe
SMOKE RESULT: 31 passed, 0 failed
AXE RESULT: PASS
```

**S-SMOKE (`scripts/smoke.mjs`) — 31/31 passed, 0 failed**

| Plan case | Evidence from the run |
|-----------|----------------------|
| `SMK-01` render 16 rows | `PASS 16 rows render (8 day + 8 night) from the Mumbai fixture`; `PASS day rows are the 8 fixture day slots in order (Labh…Labh)`; `PASS night rows are the 8 fixture night slots in order (Udveg…Udveg)` |
| `SMK-02` toggle | `PASS EN toggle flips <html lang> to "en"`; `PASS every [data-i18n] node renders its EN dictionary string (19 dictionary nodes)`; `PASS the toggle re-translated every language-varying node (18 nodes)`; `PASS HI toggle flips <html lang> back to "hi"` |
| `SMK-03` Hindi default | `PASS …` (suite runs the first load in `hi`; re-verified live in §3) |
| `SMK-06` non-colour quality | `PASS every row has a Hindi+English name, a HH:MM – HH:MM range and a tier word` |
| `SMK-07` no horizontal scroll | `PASS no horizontal scroll at 320px / 390px / 430px / 1024px` |
| `SMK-08` no broken values | `PASS no "NaN" or "Invalid Date" anywhere in the rendered DOM` |
| `SMK-10`/`SMK-15` keyboard & sheet | `PASS every row is a collapsed disclosure control (aria-expanded=false + aria-controls)`; focus/shortcut checks in §3 |
| `SMK-12` asset hygiene | `PASS GET /favicon.svg -> 200`; `PASS favicon.svg parses as SVG`; `PASS favicon.svg carries no <script>, <image> or external reference`; `PASS favicon.svg is emoji-free`; `PASS every ?v= asset version equals the package.json version (2.1.0)` |
| `SMK-13` console clean | `PASS no console error / uncaught exception on load`; `PASS favicon caused no console error` |
| NFR-P3 perf budget | `PERF BUDGET: shipped JS 5 files, raw 98.4 KB, gzip 32.3 KB` — `PASS … under the 60 KB min+gzip budget` |

Not separately hit by the smoke script but covered by the executed exploratory pass in §4: `SMK-04`
current-slot highlight (verified live for Tokyo), `SMK-05` date nav, `SMK-09` degradation states,
`SMK-11` semantics, `SMK-16` touch targets, `SMK-14` disclosure/footer copy.

**S-AXE (`scripts/axe-check.mjs`, M7) — PASS**

| Scan | Result |
|------|--------|
| base page @1024px | 0 critical/serious, **0 moderate/minor**, 34 rules passed |
| city-search dialog open | 0 critical/serious, 0 moderate/minor, 24 rules passed |
| slot row expanded | 0 critical/serious, 0 moderate/minor, 34 rules passed |
| base page @320px | 0 critical/serious, 0 moderate/minor, 34 rules passed |

Each scan reports **1 incomplete rule: `color-contrast`**. Investigated, not a defect: the only
incomplete node is `.chev` — `<span class="chev" aria-hidden="true">⌄</span>`, flagged only because
its content is a non-text glyph; it is decorative and `aria-hidden`. `axe.run` for `color-contrast`
in the same page returns **0 violations**. Manual computed-ratio check of six real text pairs:
slot name/time **17.4:1**, day-edge meta **6.69:1**, footer smallprint **6.26:1**, date label
**16.29:1**, quality badge **8.02:1** (light theme) and slot text **14.11:1**, edge meta **7.43:1**
(dark theme, `prefers-color-scheme: dark`) — all above the 4.5:1 NFR-A3 floor (§5, MAN-04).

---

## 3. Reacting to the plan: **no divergence** — the plan was followed as written

No plan update was needed during execution: every suite named in `07-test-plan.md` §6 exists, runs and
behaves as predicted; no case had to be added, dropped or re-scoped. Two *method refinements* (not
divergences) are recorded for the reader in §6.

---

## 4. Exploratory pass (L4) — real browser, real states

Served from `make dev` (`http://127.0.0.1:8080/`), driven over CDP with a real Chrome and real
pointer/keyboard events. In **every** state below, a scan of the whole rendered text for
`NaN` / `Invalid Date` / `undefined` returned **0 hits**.

| # | State / probe | Observed |
|---|---------------|----------|
| 1 | **S4 → S5 (no geolocation)** | Initial skeleton (16 rows, `aria-busy="true"`, live region `लोकेशन पता कर रहे हैं…`). At the 12 s watchdog the app degrades cleanly: notice `लोकेशन उपलब्ध नहीं — शहर लिखें` + `शहर चुनें` action, empty state `आज का चौघड़िया देखने के लिए शहर चुनें`, panes `display:none`, 0 skeleton rows, 0 bad tokens. **No permanent-skeleton dead end** (US-8 AC1/AC2, S5). |
| 2 | **S2 sheet open** | `<dialog>` opens with focus in `#city`, privacy one-liner visible above the field, Esc closes it and focus returns to the location chip (US-17 AC1, US-18 AC2). |
| 3 | **City search "London"** | 8 results, live status `8 परिणाम मिले`, first row `लंदन · इंग्लैण्ड, यू॰के॰ · 06:57` (rendered as `textContent`, no HTML injection). Selecting it sets the chip to `लंदन, इंग्लैण्ड, यू॰के॰`. |
| 4 | **S1 London rendered** | 16 rows, `बुधवार, 14 अक्टूबर 2026`, `सूर्योदय 07:22` / `सूर्यास्त 18:09`, day `लाभ · Labh 07:22 – 08:43 …`, night `उद्वेग · Udveg 18:09 – 19:48 …` — city clock, not IST (US-5 AC3, US-7 AC1). |
| 5 | **S7 no results** (`zzzqxxkltv`) | `role="alert"` inline message `कोई शहर नहीं मिला — वर्तनी जाँचें`, **no** Retry button, field keeps its value, sheet stays open, last location (London) still rendered behind the sheet (US-5 AC5). |
| 6 | **S6 geocoder unreachable** (CDP offline, query `Paris`) | `role="alert"` `खोज नहीं हो सकी। दोबारा कोशिश करें` + `दोबारा` Retry, last location and date label preserved (US-10 AC1). |
| 7 | **S6 → Retry** (back online, click Retry) | Error clears, results render, query preserved — `दोबारा` re-submits the same query. |
| 8 | **S3 not-defined (polar)** | `Longyearbyen` selected, `›` × 12 → `सोमवार, 26 अक्टूबर 2026`: panel `इस जगह और इस तारीख पर चौघड़िया उपलब्ध नहीं` **and** the English line `Choghadiya is not defined at this location/date`, 0 day + 0 night rows, both escape-hatch buttons visible; `‹ पिछला दिन` restores 8 rows for 25 Oct (US-9 AC1/AC2). |
| 9 | **US-14 current-slot highlight** (Tokyo, local ~14:5x) | Exactly 1 element with `aria-current="true"` — `day:6`, `चर · Char 14:17 – 15:42 ●अभी`; correct slot for the location clock. London/other cities off-slot correctly showed 0 highlights. |
| 10 | **Date navigation** | `‹`/`›` re-render the adjacent date + label; `आज` pill appears off-today and hides on today; **Alt+←/→** shortcuts advance/return the date (Wed → Thu → Wed) and are ignored while the sheet is open (US-13, US-18 AC2). |
| 11 | **Responsive bands** | `scrollWidth === clientWidth` (0 overflow) at **320, 390, 430, 768, 1024, 1920** px in the rendered state; row height 56–57 px at 640 CSS px; primary controls ≥ 44 px (US-16 AC1/AC3, NFR-A5). |
| 12 | **200 % zoom** (`640 CSS px` with a 1280 px window) | 0 horizontal overflow, no clipped control, rows keep 56–57 px, controls still 44 px (NFR-A6, MAN-07). |
| 13 | **Reduced motion** (`prefers-reduced-motion: reduce`) | max `transition-duration` **0 s**, **0** animated elements (NFR-A6, MAN-07). |
| 14 | **Dark theme** (`prefers-color-scheme: dark`) | Body background `rgb(18,18,18)`, 0 overflow, contrast 14.11:1 (slot text), 7.43:1 (meta), 0 bad tokens (MAN-04). |
| 15 | **Bilingual toggle in-state** | `हिं`/`EN` flips `<html lang>`, the date label, the section headings, row names, tier words and the tier announcements; the S3 panel shows both languages by design (US-11). |

---

## 5. Manual item MAN-01 — **M3 ±2 min panchang comparison** → PASS (max observed delta **1 min**)

Method: sunrise/sunset for each city/date computed with the *shipped* code
(`choghadiya.js#computeSunTimes`, suncalc 2.1.1, upper-limb + refraction convention) and compared
against **Drik Panchang** (the mainstream panchang the research names), fetched live today. Slot
boundaries are derived arithmetically from sunrise/sunset, so they were additionally compared against
Drik Panchang's published Choghadiya table, boundary by boundary.

| City / civil date | TZ | Reference (Drik Panchang) | Shipped app | Δ sunrise / Δ sunset | Slot-boundary check |
|-------------------|----|---------------------------|-------------|----------------------|---------------------|
| Mumbai, 2026-10-14 | Asia/Kolkata | sunrise 06:32, sunset 18:16 | 06:32, 18:16 | **0 / 0 min** | All 8 day + 8 night boundaries **identical** to Drik's Choghadiya table: day 06:32/08:00/09:28/10:56/12:24/13:52/15:20/16:48/18:16; night 18:16/19:48/21:20/22:52/00:24/01:56/03:28/05:00/06:32 |
| London, 2026-10-14 | Europe/London | sunrise 07:23, sunset 18:09 | 07:22, 18:09 | **1 / 0 min** | day/night boundaries match within 1 min (max Δ 1 min at 19:49 vs 19:48, 23:08 vs 23:07, 00:47 vs 00:46, 04:06 vs 04:05) |
| New York, 2026-10-14 | America/New_York | sunrise 07:06, sunset 18:17 | 07:06, 18:17 | **0 / 0 min** | one boundary Δ 1 min (15:29 vs 15:30), rest exact |
| Sydney, 2026-10-14 | Australia/Sydney | sunrise 06:16, sunset 19:07 | 06:15, 19:07 | **1 / 0 min** | derived boundaries within 1 min |
| Mumbai, 2026-12-15 | Asia/Kolkata | sunrise 07:04, sunset 18:03 | 07:03, 18:03 | **1 / 0 min** | winter case; derived boundaries within 1 min |

**Max observed delta across 4 cities × 5 city-date combinations: 1 minute** → inside the ±1–2 min
tolerance and well inside the ±2 min M3 gate (US-6 AC2). Sources: Drik Panchang day-panchang pages
(`?geoname-id=…&date=dd/mm/yyyy`, geonames 1275339 Mumbai, 2643743 London, 5128581 New York, 2147714
Sydney) and the Drik Panchang Choghadiya table for Mumbai and London on 2026-10-14.

*Observation (not a defect):* Drik Panchang renders the names as `Labha / Amrita / Kala / Chara /
Roga / Udvega / Shubha`; the product deliberately uses the short canonical spellings
`Labh / Amrit / Kaal / Char / Rog / Udveg / Shubh` fixed by `docs/02-prd.md` US-2 AC5 / US-11 AC4 and
`docs/03-ux.md` §6. The mapping is 1:1 and intentional.

---

## 6. Manual item MAN-02 — **M6 mobile FCP gate (< 1500 ms)** → PASS on the release candidate

Measured with Lighthouse 12.8.2, `formFactor: mobile`, simulated 4G throttling (the preset the plan
names: mid-range Android / 4G).

| Target | Runs | FCP | LCP | Speed Index | Perf score | Byte weight |
|--------|------|-----|-----|-------------|------------|-------------|
| **Release candidate** over a gzip static origin (`:8091`) | 3 | **1130 / 1142 / 1137 ms** | ~1506–1518 ms | 1.1 s | 0.93 | 47 KiB |
| Release candidate over `make dev` (python `http.server`, **no gzip**, no HTTP/2) | 1 | **1466 ms** | 1964 ms | 1.5 s | 0.92 | 137 KiB |
| Live `https://time.gitick.com/` today — **pre-refactor legacy build**, see KI-2 | 2 | 2142 / 1747 ms | same | 2.0–2.6 s | 0.96/0.99 | 43 KiB |

**Result: FCP 1.13–1.14 s, consistently under the 1.5 s gate across three runs.**

Method refinements (recorded because they matter for interpreting the number):

1. The plan assumes "the deployed release candidate", but the release has not been published yet —
   `time.gitick.com` still serves the *legacy* pre-refactor build (its `index.html` has no `?v=`
   asset versioning, no `data-i18n` hooks). Measuring that URL would measure the wrong artifact, so the
   release candidate was measured on this machine instead. The gzip origin (`:8091`) reproduces what
   GitHub Pages does to text assets (gzip + `Cache-Control`); the raw `make dev` origin is a
   *conservative* variant that ships 98.4 KB of uncompressed JS and still lands at 1466 ms.
2. Wall-clock latency to a CDN is *not* simulated (local origin), so the honest reading is: the page's
   own critical path is ~1.1 s on simulated 4G. **Re-measuring the gate against the deployed v2.2.0
   URL belongs to the release card `t_169d64f7`** (post-deploy smoke) — flagged as KI-2.

---

## 7. Other manual checks (L4)

| ID | Check | Result |
|----|-------|--------|
| MAN-04 | Contrast, light + dark | **PASS** — ratios in §2.2; min 6.26:1 (light) / 7.43:1 (dark) against the 4.5:1 floor. axe reports 0 violations; its single `incomplete` node is a decorative `aria-hidden` chevron. |
| MAN-05 | Screen reader | **PARTIAL** — no live screen reader in this environment. Accessibility-tree proxy: 22 buttons all carry full accessible names (`हिं`, `EN`, `पिछला दिन`, `अगला दिन`, `लोकेशन बदलें`, `लोकेशन हटाएँ`, and every slot as `अमृत, Amrit, 07:11 – 08:36, सर्वश्रेष्ठ` with the current slot adding `अभी`); one `h1`; day/night are `heading`s (`दिन सूर्योदय 05:46` / `रात सूर्यास्त 17:07`); a `भाषा` group. `aria-current="true"` is on exactly one slot. |
| MAN-06 | Privacy / network inspection | **PASS** — over a full session (load, 6 searches, 5 selected cities) the only off-origin requests were `https://geocoding-api.open-meteo.com/v1/search?name=<typed name>&count=8&language=hi`: one per **explicit** submit, name only. No analytics, beacons, fonts or CDNs. `localStorage`/`sessionStorage` keys: none; `document.cookie`: empty; no coordinates are ever transmitted (geolocation is used on-device only). |
| MAN-07 | 200 % zoom / reduced motion | **PASS** — see §4 rows 12–13. |

---

## 8. Manual items **not** executed (honest gaps)

| ID | Item | Why not | Residual risk |
|----|------|---------|---------------|
| MAN-03 | Real-device geolocation grant/deny | No physical Android device or real geolocation provider available to this worker. The *denied/unavailable* path (S5) was exercised (§4 row 1); the **grant** path (device coords + device tz → slots) is covered only by unit-level contracts and the S5 watchdog. | Grant-path rendering on a real phone is unverified by QA. Low: the same code path is exercised by city selection, and `todayIn`/`formatTime` are unit-tested per IANA zone. |
| — | Real screen-reader pass (NVDA/VoiceOver) | No SR available headless. | Pronunciation/order of the announcements is unverified beyond the AX-tree proxy. |

---

## 9. Defects

**No defects at Critical, High or Medium severity were found.** Every automated suite is green, every
exploratory state behaved as specified, and no `NaN` / `Invalid Date` / `undefined` appeared in any
state. Consequently **no fix cards are filed from this report** and no re-test card is needed.

### Known issues (not defects — no PRD acceptance criterion fails)

| ID | Severity | Item | Disposition |
|----|----------|------|-------------|
| **KI-1** | Medium (spec-vs-build, no AC behind it) | `docs/03-ux.md` §S2 defines two states that the build does not implement: **(a)** the sheet's *Empty* state ("show 3 recent cities from an in-memory session list, no request") — verified live: opening the sheet shows 0 rows / 0 recent cities; **(b)** the sheet's *Loading* state ("submit button shows a text+spinner state, `aria-busy="true"`") — verified live with a 2.5 s-latency network: the submit button stayed `खोजें` with no `aria-busy`, no disabled state and no other feedback for the whole in-flight window. | Outside every M1–M3 ticket AC; **no PRD AC covers it** (`docs/02-prd.md` §5 has no "recent cities"/"loading" criterion) and *3 recent cities* has no key in the 58-key copy deck, so implementing it needs a copy-deck/scope decision. REV-M2 and REV-M3 both routed "implement or formally cut" to the CTO. **QA did not file a fix card** because the remaining decision (new copy keys + scope) belongs to the CTO, not to a developer. Recommendation: **cut it for v2.2.0** and record it as post-release backlog, or decide it at GATE 2 — either way it should not hold the release. |
| **KI-2** | Info / release-process | `https://time.gitick.com/` still serves the pre-refactor legacy build, so **US-19 AC2 (works end-to-end on the deployed URL, no console errors)** and the deployed M6 FCP number can only be verified after `t_169d64f7` publishes v2.2.0. | Handled by the release card: post-deploy smoke + FCP re-measure on the deployed v2.2.0 (the plan already assigns this to `t_169d64f7`). |
| **KI-3** | Low / cosmetic (by design) | English slot-name spellings differ from Drik Panchang's long forms (`Labh` vs `Labha`, etc.). | Product decision (`02-prd.md` US-2 AC5/US-11 AC4, `03-ux.md` §6). No action. |

### Harness artefacts — explicitly **not** app defects (would otherwise look like bugs)

| Symptom | Truth |
|---------|-------|
| `document.title` read back as `🐴 चौघड़िया — …` | The browser harness prepends a `U+1F434` glyph to **every** page title — a control page (`data:text/html,<title>CONTROL</title>`) reported `🐴 CONTROL`. The shipped `index.html` `<title>`, `i18n.js` `app.title` and the `document.title` assignment (`app.js:785`) contain no emoji. **Not an app bug.** |
| `document.getElementById('sheet').open` false but the app still treats the sheet as open (Alt+←/→ ignored) | HeadlessChrome 155 over CDP **never dispatches the `<dialog>` `close` event** (already documented at `app.js:355-371`); `state.ui.sheetOpen` therefore stays `true` in this harness. Using a real `Escape` (trusted CDP key) the sheet closes natively and focus returns to the chip; after dispatching the spec-mandated `close` event, Alt+→/← work exactly as specified (§4 row 10). Spec-correct browsers are unaffected. **Residual risk, not a defect.** |

---

## 10. Quality-gate scoreboard (final)

| Gate | Metric | Measured | Expected | Result |
|------|--------|----------|----------|--------|
| M1 | Algorithm correctness | 112/112 slot assertions + membership + tiers | 112/112 | **PASS** |
| M2 | Dynamic slots, no hardcoded clock | `no fixed 06:00/18:00 boundary values exist in the calculation path` + fixture checks | 0 hardcoded | **PASS** |
| M3 | ±2 min vs mainstream panchang | max Δ **1 min** (5 city-date combos vs Drik Panchang) | ≤ 2 min | **PASS** |
| M4 | Bilingual coverage | **58/58** keys in `hi` + `en` (116 assertions), 0 fallbacks | 58/58 | **PASS** |
| M5 | No blocking path | S3/S4/S5/S6/S7 + empty exercised; 0 `NaN`/`Invalid Date`/`undefined` in every state | 0 broken values | **PASS** |
| M6 | Mobile FCP < 1.5 s | **1130–1142 ms** (3 runs, release candidate, simulated 4G) | < 1500 ms | **PASS** (re-measure post-deploy, KI-2) |
| M7 | Accessibility | axe 0 critical/serious **and 0 moderate/minor** on 4 states; contrast ≥ 6.26:1 | 0 critical/serious | **PASS** |
| M8 | Release gate | this report's verdict: **PASS-WITH-KNOWN-ISSUES** — all MVP acceptance criteria pass | verdict PASS | **PASS (with KI-1/KI-2)** |

All 19 user stories trace to executed tests or named manual checks per the plan's §9 matrix; the two
explicitly-manual measurements (MAN-01, MAN-02) carry real numbers above; MAN-03/MAN-05 are the only
partially-executed items and are declared in §8.

---

## 11. Verification commands (reproducible)

```
QA_SCRATCH="$HOME/.hermes/profiles/qa-engineer/cache/scratch"

make test                                   # 64/64 pass, 0 fail (~0.60 s)
make check                                  # tests 64/64 + SMOKE 31/31 + AXE PASS
node --test "tests/**/*.test.js"            # same suite, named-test list
make dev                                    # http://localhost:8080 (python3 http.server)
node "$QA_SCRATCH/gzserver.mjs" <repo> 8091 # QA gzip static origin for the M6 measurement
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  npx -y lighthouse@12 http://127.0.0.1:8091/ --only-categories=performance \
  --output=json --output-path=/tmp/lh/gz.json --chrome-flags="--headless=new --no-sandbox"
python3 "$QA_SCRATCH/lighthouse_report.py" /tmp/lh/gz.json "release candidate"   # prints FCP/LCP
node "$QA_SCRATCH/m3_panchang.mjs"          # M3 slot-boundary computation
```

The three QA-written helper scripts (`gzserver.mjs`, `m3_panchang.mjs`, `lighthouse_report.py`) live in
the QA scratch dir, **not** in the repo: `scripts/` is devops-owned and the shipped site must stay
dependency-free (`make check` is the only target that needs dev dependencies).

Reference data (fetched live 2026-10-14): Drik Panchang —
`.../panchang/day-panchang.html?geoname-id={1275339,2643743,5128581,2147714}&date=…` and
`.../muhurat/choghadiya.html?geoname-id={1275339,2643743,5128581}&date=14/10/2026`.

---

## 12. Revision log

| Version | Date | Author | Change |
|---------|------|--------|--------|
| v1.0 | 2026-10-14 | qa-engineer | First execution of `docs/07-test-plan.md` v1.0 on `a170fd0`: `make test` 64/64, `make check` smoke 31/31 + axe PASS, exploratory S3/S4/S5/S6/S7/empty + 320–1920 px + zoom/reduced-motion/dark/contrast/network, MAN-01 panchang (±1 min vs Drik Panchang, 5 combos), MAN-02 Lighthouse mobile FCP 1.13 s. Verdict **PASS-WITH-KNOWN-ISSUES** (KI-1 `03-ux` §S2 states, KI-2 post-deploy M6/US-19 AC2, KI-3 naming). No defects → no fix cards, no re-test card. |

---

# v2.3.0 section (appended — the v2.2.0 report above is preserved unchanged)

Project: **Choghadiya Refactor** · Owner: `qa-engineer` · Date: **2026-10-14**
Card: `t_e4d61d3a` (QA-1 · v2.3.0 test plan addendum + regression execution)
Plan executed: `docs/07-test-plan.md` **§12 v2.3.0 addendum** (`QA230-*` cases; base plan §1–§10 still governs)

---

## 13. VERDICT: PASS-WITH-KNOWN-ISSUES

**All seven v2.3.0 change items (CR1–CR7) are implemented and verified by real execution.** Every
automated gate is green on the tested commit — **`make test` 100/100**, **`make check` exit 0**
(greps 4 gates · smoke **66/66** · axe **5 states PASS**) — and a live Chromium pass reproduces
the 12h default, the manual-geolocation button, the picker ±10, the S8 periods (exact RS-1 Mumbai
fixture), the S9 selection/overlap semantics and item-7 persistence on the running app. The
**M3 ±2 min panchang comparison** for the three new periods is **PASS** (max observed delta **1 min**,
4 location/date combos incl. a Saturday double-period case, vs live Drik Panchang).

**No Critical or High defect is open.** Four findings are carried, none blocking:
**F2** (Medium, the one that matters) — the brief's item 7 is now *client-confirmed `localStorage`*,
but the shipped build is `STORAGE_SCOPE='session'`, so settings do **not** survive a full browser
restart; **F3** (Low, UX copy), **F4** (Low, attribution hyperlinks deferred to SEC-1/GATE 2),
**F5** (Low, a stale `docs/04` §16.3 key-layout line). The one **quality-gate gap** flagged while
this card ran — item-7b had no smoke coverage (`F6`) — was **closed mid-run**: the DO-FIX card
`t_7ed6b2ab` landed (`192951e`/`d45fef1`, smoke 54→66) and the gate now guards the geocode cache.
Nothing was softened to reach this verdict: everything executed passed, and everything not
executable here is listed in §13.8.

HEAD tested: **`d45fef1`** = the v2.3.0 wave at `9693f10` (TL-1 review) **+** the item-7b wiring fix
`068681c` **+** the item-7b smoke coverage `192951e`/`d45fef1`. The exploratory pass ran on
`068681c`; `make test` / `make check` were **re-run on `d45fef1`** after the DO-FIX card completed
mid-run (both green). Working tree: `docs/00-brief.md` modified (the CTO's item-7 `localStorage`
edit, uncommitted — see F2), plus this card's two doc edits.

---

## 13.1 Environment

| Item | Value |
|------|-------|
| Repo / workspace | `/Users/vishu/hermes-company/projects/choghadiya` (git, branch `main`) |
| Commit under test | `d45fef180358094a1f51a58e7d3d482927d1019b` (gate re-run); exploratory pass on `068681c` |
| Baseline reviewed by TL-1 | `9693f10` (v2.3.0 wave) — this run adds `068681c` (item-7b wiring) and `192951e`/`d45fef1` (item-7b smoke) |
| Working tree | `docs/00-brief.md` modified (uncommitted CTO edit, item 7 → `localStorage`); all code committed |
| Node / npm | v26.7.0 / 11.19.0 |
| OS | macOS 26.5.2 (arm64) |
| Browser engine | Google Chrome (headless, CDP) — `scripts/smoke.mjs`, `scripts/axe-check.mjs` and the exploratory pass |
| axe-core | 4.10.2 (pinned devDependency, dev-only) |
| Static server | `make dev` → `python3 -m http.server 8080` (repo root) |
| Network | `geocoding-api.open-meteo.com` reachable (used for the real city searches in the exploratory pass); **Drik Panchang fetched live via the browser** for MAN-01 (a `curl` is 403-blocked, a real browser is not) |

Plan rule honoured for the automated suites: **no `tests/*` suite touches the network** (fake
`fetchImpl`); smoke/axe hit `127.0.0.1:8080` only. Network egress happened only in the *manual*
L4 items (live city searches + the Drik comparison), which is what the plan specifies for them.

---

## 13.2 Automated suites — executed vs. plan

### 13.2.1 `make test` — **PASS (100/100)**

```
$ make test
ℹ tests 100 · pass 100 · fail 0 · duration_ms 560
```

100 tests = the v2.2.0 64 (now with the 122-key i18n contract and the 12h/24h `formatTime` pins)
+ 12 `inauspicious` + 12 `session-store` + 7 `geocoder` cacheStore, etc. The suites named in
`07-test-plan.md` §6 all run; the v2.3.0 additions live in `tests/inauspicious.test.js`,
`tests/session-store.test.js`, the `cacheStore` block of `tests/geocoder.test.js` and the
`i18n.test.js` 122-key lock.

### 13.2.2 `make check` — **PASS (exit 0)**

```
$ make check          # tests 100/100  then greps then smoke then axe   (HEAD d45fef1, exit 0)
GREPS  : PASS — 0 hits across 4 gates (SEC-05 innerHTML, SEC-03 inline handlers,
         SEC-14 origin allow-list, SEC-STORAGE web-storage-only-in-session-store.js)
SMOKE  : SMOKE RESULT: 66 passed, 0 failed
AXE    : AXE RESULT: PASS — 5 states, 0 critical/serious, 0 moderate/minor
```

Smoke now covers the v2.3.0 surfaces (`QA230-*`): 12h row ranges (strict), the manual geolocation
button, the S8 periods block with the **exact Mumbai 2026-10-14 12h fixture**, the S9 panel
(default = live current + वर्तमान badge; tap-select → `aria-pressed` + `panel.note.tapAgain`;
same-tap revert; reload revert), the ±10 picker (`type=date`, min 2026-10-04 / max 2026-10-24,
off-today drops the highlight), the 24h→12h re-render of rows + S8 + S9, and settings persistence
across a real in-tab reload (checks 19–21). **Section 20 adds 12 item-7b checks** (`t_7ed6b2ab`,
landed mid-run): a CDP `Fetch` interceptor fulfills the geocoding request with a fixed payload, so
the suite proves the cache is written (`{t,v}` envelope, `t` ≈ now + 24 h), that a **same-tab reload
makes the identical query cost 0 geocoding requests** while results still render from the cache, and
that a **past-`t` entry is not served** (refetch + renewal) — all with no live network. The suite
went **54 → 66** checks, so the gate now guards the item-7b fix.

Axe scans **5 states** (base @1024, city sheet, row selected + S9 panel, off-today + S8 + picker
focused, base @320): 0 critical/serious, 0 moderate/minor in every state; the single `incomplete`
`color-contrast` rule is the same decorative `aria-hidden` chevron as v2.2.0 (not a violation).

---

## 13.3 Exploratory pass (L4) — real browser, real states

Served from `make dev`, driven over CDP with a real Chrome. `NaN` / `Invalid Date` / `undefined`
scan of the whole rendered DOM returned **0 hits in every state below** unless noted.

| # | Change item / probe | Observed |
|---|---------------------|----------|
| 1 | **Item 1 — 12h default** | Fresh session: `#b-h12 aria-pressed="true"`, `#b-h24 "false"`; every row `hh:mm am|pm` (`लाभ · Labh 06:32 am – 08:00 am`), S8 ranges and the S9 range all 12h; the S2 result-row city time (`03:55 pm`) too. (`QA230-1a`) |
| 2 | **Item 1 — toggle ↔ 24h** | Click 24h → all 16 ranges `HH:MM` (`06:32 – 08:00`), S8 → `12:24 – 13:52`, S9 range → `15:20 – 16:48`, in place, no reload; 12h restores it. (`QA230-1b/1c`) |
| 3 | **Item 1 — reload persistence** | 24h chosen then `location.reload()` → 24h + EN both survive. (`QA230-1d`) |
| 4 | **Item 2 — button present** | `#use-current` inside S2, first control, full-width, label `मेरी वर्तमान लोकेशन उपयोग करें` / `Use my current location`, idle + enabled. (`QA230-2a`) |
| 5 | **Item 2 — grant** | CDP geolocation override (19.076, 72.8777) + granted permission → click: chip → `📍 My location`, sheet closes, live region `Location found` (`loc.granted`), 8 rows re-render for the device coords + device tz. (`QA230-2b`) |
| 6 | **Item 2 — denied** | With permission denied → sheet-local `role="status"` line `ℹ Location permission denied — type a city or allow it in your browser` (`loc.denied`) above the field; button returns to rest, still tappable; the typed path works; **no** page-level `geo.denied` banner. (`QA230-2c`) |
| 7 | **Item 2 — double-press idempotence** | Slow counting `getCurrentPosition` stub: three rapid clicks → **exactly 1** call (button disabled + `aria-busy` in flight). (`QA230-2e`) |
| 8 | **Item 3 — copy** | Footer + sheet: `privacy.line` = "Your searched city name is sent to Open-Meteo to find coordinates. No server storage — settings and recent searches stay only in this browser tab." and one credit `attribution.geocoding` = "Location search by Open-Meteo · Data from GeoNames · CC BY 4.0" (byte-equal to §6, both languages). The two v2.2.0 body lines are **gone**; a DOM + source scan finds no stale string; **no `<a>`** on the credit (F4). (`QA230-3a/3b/3c/3d`) |
| 9 | **Item 4 — picker** | `input type=date`, `min 2026-10-04` / `max 2026-10-24` / `value 2026-10-14`, `aria-label तारीख चुनें`; picking 2026-10-10 re-renders both lists + S8 + S9 + the label, drops `aria-current` and shows `panel.selectPrompt`; the Today pill returns. (`QA230-4a/4b`) |
| 10 | **Item 4 — edges** | At `min` `‹` is `disabled` + `aria-disabled="true"` (next enabled); at `max` `›` is; clicking a disabled arrow is inert; Alt+→ at `max` is clamped (stays 24 Oct). (`QA230-4c`) |
| 11 | **Item 4 — Alt-arrows** | (After dispatching the `<dialog>` `close` event the harness never fires — the documented v2.2.0 artifact) Alt+→ 14→15→16 Oct, Alt+← back to 15 Oct. (`QA230-4d`) |
| 12 | **Item 4 — location change** | London via search → `min/max` recomputed from the location's today (2026-10-04…24), label `बुधवार, 14 अक्टूबर 2026`; London periods render (`वार वेला 12:46 pm – 02:06 pm`). (`QA230-4e/4f`) |
| 13 | **Item 5 — 3 periods** | Mumbai 2026-10-14: `वार वेला 12:24 pm – 01:52 pm`, `काल वेला 09:28 am – 10:56 am`, `काल रात्रि 03:28 am – 05:00 am · गुरुवार, 15 अक्टूबर 2026` — **exact** RS-1 §11.5 / Drik fixture, each with its one-line desc. (`QA230-5a/5b/5c`) |
| 14 | **Item 5 — Saturday doubles** | 2026-10-10 (Sat): **5 rows** — 1 Vaar Vela, **2 Kaal Vela**, **2 Kaal Ratri** (the second Kaal Ratri carries `· रविवार, 11 अक्टूबर 2026`). (`QA230-5d`) |
| 15 | **Item 5 — polar hidden** | 89 N (geolocation override): 0 day + 0 night rows, S8 block **hidden**, S9 panel hidden, S3 not-defined copy shown, no `NaN`/`Invalid Date`/empty row. (`QA230-5e`) |
| 16 | **Item 5 — re-render triggers** | S8 refreshes in place on date nav/picker, location change, language toggle and time-format toggle (observed across rows 2/9/12/17). (`QA230-5g`) |
| 17 | **Item 6 — default = current** | Panel shows the live slot (`चर · Char 03:20 pm – 04:48 pm`), `वर्तमान` badge, `panel.note.current`, the tier note and all four fields; exactly **1** `aria-current="true"` (the live row). (`QA230-6a`) |
| 18 | **Item 6 — tap / same-tap** | Tap `रोग · Rog` → row `aria-pressed="true"` + `aria-controls="choghadiya-panel"`, panel shows Rog, badge gone, `panel.note.tapAgain`; **`aria-current` stays on the live row**; same tap reverts to current. (`QA230-6b/6c`) |
| 19 | **Item 6 — overlap names the period** | Rog → `panel.note.overlay.vaarVela` ("…वार वेला पड़ रही है"); Kaal → `.kaalVela`; night Labh → `.kaalRatri`; a non-overlapped Labh slot → **no** warning (`panel__warn` hidden, empty). ⚠ paired with text. (`QA230-6e`) |
| 20 | **Item 6 — off-today** | 2026-10-10: no `aria-current` anywhere, `panel.selectPrompt` shown until a tap, then that slot renders. (`QA230-6d`) |
| 21 | **Item 6 — bilingual / format re-render** | EN toggle re-renders panel headings/fields/notes (`Choghadiya details`); 24h re-renders the panel range; the tapped selection is **preserved** across both toggles (TL-1 ruling) and cleared on a date change. (`QA230-6f`) |
| 22 | **Item 6 — a11y shape** | Panel = `<section aria-labelledby="panel-h">`, **no** `aria-live`, **0** focusable descendants; no horizontal scroll at 320 px with panel + warning open. (`QA230-6g/6h`) |
| 23 | **Item 7a — settings persistence** | After a reload: `timeFormat`, `lang`, stored location all survive; `sessionStorage` keys are `choghadiya.settings.timeFormat/.lang/.location` (all `choghadiya.*`). (`QA230-7a1`) |
| 24 | **Item 7a — prompt suppression** | With a stored location, overriding the device geolocation to London and reloading still renders the **stored** Mumbai fixture (sunrise 06:32, not London 07:22) → the auto-prompt did **not** run. (`QA230-7a3`) |
| 25 | **Item 7b — geocode cache** | Real "Mumbai" search → `sessionStorage` holds `choghadiya.geocache.index` = `{t:null,v:["hi\u0000mumbai"]}` and `choghadiya.geocache.entry.hi\u0000mumbai` = `{t:1792059933448, v:[…8 results]}`, `t` ≈ now + 24 h. (**FE-FIX `068681c` confirmed live; now also guarded by smoke §20.**) (`QA230-7b1`) |
| 26 | **Item 7c — storage-failure degradation** | `Storage.prototype.setItem` forced to throw → the 24h toggle still re-renders, a "Paris" search still returns 8 results, 0 `NaN`/`Invalid Date`/`undefined`. (`QA230-7c`) |
| 27 | **Item 3 / 5 — honesty scan** | Banned labels (`Yamagandam`, `Gulika`, `Rahu Kaal`, `Rahu Kalam`, `यमगंड`, `गुलिक`) appear **nowhere** in the rendered DOM. (`QA230-5h`) |
| 28 | **Responsive** | 320 px: `scrollWidth === clientWidth` (0 overflow) with the S8 block + S9 panel + overlap warning all visible. (`QA230-6h`) |

---

## 13.4 Regression — the v2.2.0 bar holds

| Area | Result |
|------|--------|
| **S3** not-defined (polar) | PASS — S3 panel + both-language copy, 0 rows, S8/S9 hidden, no `NaN` (§13.3 row 15) |
| **S5** geolocation-denied/unavailable | PASS — page-level `ℹ लोकेशन उपलब्ध नहीं — शहर लिखें` + `शहर चुनें`, empty state, no dead end (§13.3 row 6; watchdog observed) |
| **S6** geocoder unreachable | PASS — CDP offline → `role="alert"` `Search failed. Try again` + `Retry`; last location kept |
| **S7** no city found | PASS — `zzzqxxkltv` → `role="alert"` `No city found — check the spelling`, field keeps its value, sheet stays open |
| **`aria-current` "Now" exclusivity** | PASS — exactly 1 live row in every state; selection uses `aria-pressed` and never sets `aria-current` (rows 17/18/20) |
| Night-after-midnight attribution | PASS — Wed 2026-10-14 night rows `… 03:28 am – 05:00 am` belong to Wednesday's night list; Kaal Ratri carries the `·` next-day suffix |
| DST / IANA tz rendering | PASS — `make test` DST-London fixtures + `formatTime` per IANA zone (12h & 24h) green |
| CSP / `textContent`-only | PASS — `make greps` 0 hits / 4 gates; no new origins; no `innerHTML` |
| 320 px no-scroll · 44×44 · reduced-motion | PASS — §13.3 row 28; smoke `SMK-07`/`SMK-16`; axe 320 state; reduced-motion unchanged |
| Night/language/date/format re-render | PASS — no reloads observed on any toggle or nav |

---

## 13.5 MAN-01 (v2.3.0) — **M3 ±2 min panchang comparison** for the three new periods → **PASS (max Δ 1 min)**

Method: `inauspicious.js#computeInauspicious` (shipped code, run via Node) vs **live Drik Panchang**
Choghadiya table (fetched 2026-10-14 through a real browser — `curl` is 403-blocked). Drik labels
Vaar Vela / Kaal Vela / Kaal Ratri on its table, so this is a boundary-by-boundary comparison.

| # | Location / date | Shipped (Vaar Vela / Kaal Vela / Kaal Ratri) | Live Drik | Δ |
|---|-----------------|----------------------------------------------|-----------|---|
| 1 | **Mumbai 2026-10-14** (Wed) | 12:24–13:52 / 09:28–10:56 / 03:28–05:00 (Oct 15) | 12:24–13:52 / 09:28–10:56 / 03:28–05:00 | **0 / 0 / 0 min** |
| 2 | **Mumbai 2026-10-17** (Sat) | 13:51–15:19 / 06:33–08:00 + 16:46–18:14 / 18:14–19:46 + 05:01–06:33 (Oct 18) | 13:51–15:19 / 06:33–08:01 + 16:47–18:14 / 18:14–19:47 + 05:01–06:33 | **≤ 1 min** (4 double boundaries) |
| 3 | **London 2026-10-14** (Wed) | 12:46–14:06 / 10:04–11:25 / 04:05–05:45 (Oct 15) | 12:46–14:07 / 10:04–11:25 / 04:06–05:45 | **≤ 1 min** |
| 4 | **New York 2026-10-14** (Wed) | 12:41–14:05 / 09:53–11:17 / 03:54–05:31 (Oct 15) | 12:42–14:06 / 09:54–11:18 / 03:55–05:31 | **≤ 1 min** |

**Max observed delta 1 minute** across 4 combos (11 boundaries + 4 Saturday doubles) → well inside
the ±2 min M3 gate (US-6 AC2). The Saturday case also confirms the double periods and the Kaal Ratri
`Oct 18` cross-midnight suffix. Sunrise/sunset on the shipped side agree with Drik to ≤ 1 min
(Mumbai 06:32/18:16, London 07:22/18:09, New York 07:06/18:17).

---

## 13.6 Findings (no fix cards filed — the CTO routes from this report)

The task assigns defect routing to the CTO; this report lists every finding with severity, repro and
owner lane. **No Critical/High defect.**

| ID | Sev | Owner lane | Finding | Repro / evidence |
|----|-----|-----------|---------|------------------|
| **F2** | **Medium** | CTO (GATE 2) → BE/`session-store.js` + FE copy + ARCH | **Item 7 storage scope: the client-confirmed requirement is `localStorage`, the build is `sessionStorage`.** `docs/00-brief.md` change-log item 7 now reads *"Persistence & caching via **localStorage (client-confirmed)** — persist user settings across full browser restarts … settings persist indefinitely with no expiry"*. Shipped `STORAGE_SCOPE='session'` (`session-store.js:38`) → settings **do not survive tab close / browser restart**; they survive an in-tab reload only. | `git diff docs/00-brief.md` (uncommitted CTO edit); `session-store.js:38`; §13.3 row 23 (reload OK) vs no cross-restart persistence. **Decision needed at GATE 2:** flip `STORAGE_SCOPE` to `'local'` (one line + settings no-expiry + `privacy.line` "this browser tab" → "this browser" + ADR-009 status) **or** re-confirm `sessionStorage` with the client. Sequence against SEC-1/TW-1 (their reports assume session semantics). |
| **F3** | Low | UX (`03-ux.md` §6 / §3.9) → FE | **`panel.note.overlay.*` copy is wrong for an inauspicious overlapped slot.** The string is "इस **शुभ** चौघड़िया के भीतर वार वेला पड़ रही है …" / "… inside this **otherwise-good** choghadiya …", but the warning fires for **any** slot (`03-ux` §3.9 says the copy is neutral about the slot's tier). Live: the inauspicious `रोग · Rog` slot shows "इस शुभ चौघड़िया के भीतर वार वेला पड़ रही है". FE implemented §6 verbatim, so the fix is UX-owned (one key + `i18n.js` value + `index.html` fallback; the byte-locked i18n test follows). | §13.3 row 19; `03-ux.md` §6 `panel.note.overlay.vaarVela`. (Matches TL-1's F3.) |
| **F4** | Low | SEC-1 / CTO (GATE 2) → FE | **Attribution hyperlinks deferred.** RS-3 §13.6 B1 requires `Open-Meteo` / `GeoNames` / `CC BY 4.0` to be real `<a>` links; the shipped credit is **plain text** (`footerLinks: []`), because the SEC-14 origin allow-list admits only the geocode API + SVG namespace and `data-i18n-html` is barred by SEC-05. Attribution is *present* (both providers + licence named); only the link form is pending. | §13.3 row 8; `grep href index.html` shows only `favicon.svg`/`style.css`. (Matches TL-1's F4.) |
| **F5** | Low | architect (`docs/04-architecture.md` §16.3) | **Stale geocode-cache key layout in the architecture doc.** §16.3 says `choghadiya.geocode.<normalized-query>.<lang>`; the shipped key is `choghadiya.geocache.entry.<lang>\u0000<normalized query>` + `choghadiya.geocache.index` (geocoder.js). Also §16.2 documents `createGeocoder({ fetchImpl, cacheStore })` while `app.js` calls it with `{ lang, cacheStore }`. Docs-only inconsistency; code is self-consistent and unit-tested. | `geocoder.js:233-241`; `04-architecture.md` §16.2/§16.3. |
| **F6** | ~~Low (gate gap)~~ **CLOSED** | devops-engineer (`t_7ed6b2ab`) | **Item-7b smoke coverage — landed mid-run.** While QA-1 was executing, `t_7ed6b2ab` completed: `scripts/smoke.mjs` section 20 adds 12 deterministic item-7b checks (write / 0-network-after-reload / TTL-expiry refetch) behind a CDP `Fetch` fixture, and the DO card recorded two negative controls that fail on broken copies. `make check` on `d45fef1` is green at **smoke 66/66**. **No action for QA.** | `scripts/smoke.mjs` §20; `make check` smoke 66/66 on `d45fef1` (§13.2.2). |

**Resolved since TL-1:** **F1** (item-7b cache unwired) is **fixed** by `068681c` and verified live
(§13.3 row 25) — recorded here for the audit trail, not as an open finding.

---

## 13.7 Quality-gate scoreboard (v2.3.0)

| Gate | Metric | Measured | Expected | Result |
|------|--------|----------|----------|--------|
| M1 | Algorithm correctness | 112/112 slot assertions (unchanged) | 112/112 | **PASS** |
| M2 | No hardcoded clock | `SCH-03` + fixture checks | 0 hardcoded | **PASS** |
| M3 | ±2 min vs mainstream panchang | max Δ **1 min** (4 combos, 3 new periods, live Drik) | ≤ 2 min | **PASS** |
| M4 | Bilingual coverage | **122/122** keys × 2 languages, 0 fallbacks | 122/122 | **PASS** |
| M5 | No blocking path | S3/S5/S6/S7 + empty + polar exercised; 0 `NaN`/`Invalid Date`/`undefined` | 0 broken values | **PASS** |
| M6 | Mobile FCP < 1.5 s | not re-measured this wave (no perf-affecting change beyond ~1 KB of JS; owned by DO-2/release) | < 1500 ms | **DEFERRED** to release card |
| M7 | Accessibility | axe **5 states**, 0 critical/serious, 0 moderate/minor | 0 critical/serious | **PASS** |
| M8 | Release gate | this report's verdict: **PASS-WITH-KNOWN-ISSUES** | verdict | **PASS (with F2–F5)** |

---

## 13.8 Honest gaps (not executed / not fully verified here)

| Item | Why | Residual risk |
|------|-----|---------------|
| Item-7b **0-network-across-reload** and **TTL-expiry refetch** | **Now covered** — `scripts/smoke.mjs` §20 (12 checks, `t_7ed6b2ab`) proves both deterministically behind a CDP `Fetch` fixture; `make check` on `d45fef1` is green at smoke 66/66. QA's live pass additionally confirmed the cache **is written** (§13.3 row 25) and read `t` ≈ now + 24 h. | **Closed** (was the `F6` gate gap). |
| **F2 cross-restart persistence** | The build is `sessionStorage`; a true "browser restart" test would need a fresh profile, and the shipped scope makes the outcome known (settings lost). | Medium — this *is* F2; recorded rather than worked around. |
| Real-device geolocation (grant on a phone) | No physical device; the grant path was exercised with a CDP override + granted permission (worked once, §13.3 row 5). The harness later reported permission-denied across origin navigations — a **harness artifact**, not an app defect (FE-2's 29/29 CDP probe and TL-1's live probe both pass the grant path). | Low — same code path as the city search; device-tz resolution unit-tested. |
| Real screen reader (NVDA/VoiceOver) | Not available headless. | Pronunciation/order unverified beyond the AX-tree + axe. |
| M6 Lighthouse FCP | No perf-affecting change in the v2.3.0 surfaces (a few KB of JS/CSS); the release card re-measures on the deployed build. | Low. |

---

## 13.9 Verification commands (reproducible)

```
make test                                   # 100/100 pass, 0 fail
make check                                  # tests 100/100 + greps 4 gates + SMOKE 54/54 + AXE PASS (exit 0)
make dev                                    # http://127.0.0.1:8080 (python3 http.server)
node "$HOME/.hermes/profiles/qa-engineer/cache/scratch/m3_v230.mjs"   # MAN-01: shipped computeInauspicious
# live Drik reference (browser, 2026-10-14): https://www.drikpanchang.com/muhurat/choghadiya.html?geoname-id={1275339,2643743,5128581}&date={14,17}/10/2026
```

The MAN-01 helper (`m3_v230.mjs`) lives in the QA scratch dir, not the repo (`scripts/` is
devops-owned).

---

## 13.10 v2.3.0 revision log

| Version | Date | Author | Change |
|---------|------|--------|--------|
| v2.3.0 | 2026-10-14 | qa-engineer | Executed `07-test-plan.md` §12 (`QA230-*`) on the v2.3.0 tree: exploratory pass on `068681c`, gate re-run on `d45fef1` — `make test` 100/100, `make check` exit 0 (greps 4 gates · smoke 66/66 · axe 5 states), live pass over all 7 change items + the v2.2.0 regression set (S3/S5/S6/S7, `aria-current` exclusivity, night-after-midnight, DST, CSP, 320 px), MAN-01 M3 **±1 min** for the three new periods (4 combos, live Drik). Verdict **PASS-WITH-KNOWN-ISSUES** — F2 (Medium, item-7 `localStorage` client-confirmed vs shipped `sessionStorage`), F3/F4/F5 (Low). F1 (item-7b unwired) fixed by `068681c`; F6 (item-7b gate gap) closed mid-run by `t_7ed6b2ab`. No fix cards filed (CTO routes from this report). |

---

## 14. v2.3.0 fix-wave re-test (QA-2)

Card: `t_087f8775` (QA-2 · fix-wave re-test & regression → v2.3.0 release verdict).
Plan executed: `docs/07-test-plan.md` §12.12 (`QA230-R*`); baselines `docs/08` §13 (QA-1
`PASS-WITH-KNOWN-ISSUES`) and `docs/07` §12 (`QA230-*`).

## VERDICT: PASS

**No open Critical, High or Medium finding. All MVP acceptance criteria (US-1 … US-19) pass, and
every `QA230-R*` re-test case passes.** The fix wave closed all four QA-1 findings — **F2** (Medium,
item-7 `localStorage` scope) plus **F3/F4/F5** (Low) — and the two SEC-FIX GATE-2 conditions
**F8/F9**. The gate is green on the post-wave tree (`make test` 108/108, `make check` exit 0). The
only open items are the CTO-routed **informational** residuals from SEC-FIX (F13/F14/F15) and the
two standing product decisions; none is a defect and none blocks release. Nothing was softened to
reach this verdict: every check below ran on the committed tree, and everything not executed is
listed as a gap in §14.7.

HEAD tested: `5706752` (working tree clean) — the shipped code is `61282a8`/`c7fc4ad` (DO-FIX gate +
a11y) on top of `d8b5cdc` (BE-FIX-2), `0cc4144` (FE-FIX), `20fe1c1` (BE-FIX-1); the commits after
those touch docs only (`docs/07`/`docs/08` for this card).

---

### 14.1 Environment

| Item | Value |
|------|-------|
| Repo / workspace | `/Users/vishu/hermes-company/projects/choghadiya` (git, branch `main`) |
| Commit under test | `5706752da1f6116a08861c3491be9979d1da260e` |
| Shipped code commit | `61282a8` (DO-FIX a11y) on `c7fc4ad` (DO-FIX gates) ← `d8b5cdc` (BE-FIX-2) ← `0cc4144` (FE-FIX) ← `20fe1c1` (BE-FIX-1) |
| Working tree | clean before and after the run (`git status --short` empty) |
| Node / npm | v26.7.0 / 11.19.0 |
| OS | macOS 26.5.2 (arm64) |
| Browser engine | Google Chrome 155.0.8059.40 (headless, CDP) — `scripts/smoke.mjs`, `scripts/axe-check.mjs` and the QA-2 probes |
| axe-core | 4.10.2 (pinned devDependency, dev-only, never shipped) |
| Network | no live network in any automated suite (fake `fetchImpl`; a CDP `Fetch` fixture fulfils the one geocode call). The QA-2 probes are offline too. |

### 14.2 Quality gate on the post-wave tree — **`make test` 108/108 · `make check` exit 0**

```
$ make test    →  ℹ tests 108 · pass 108 · fail 0 · duration_ms 625
$ make check   →  exit 0
   greps : PASS — 0 hits across 4 gates (SEC-05, SEC-03, SEC-14, SEC-STORAGE)
   smoke : SMOKE RESULT: 67 passed, 0 failed
   axe   : AXE RESULT: PASS — 5 states, 0 critical/serious, 0 moderate/minor
```

`make check` exit 0 is the M7/M8 gate. Smoke **67/67** (was 66 at QA-1; +1 = DO-FIX's new F12
specifier-presence check 10b) and greps **0 hits / 4 gates** (SEC-14 now admits exactly the three
link-only licence hosts). Axe scans 5 states with 0 critical/serious and 0 moderate/minor; the single
`incomplete` `color-contrast` rule is the same decorative `aria-hidden` chevron as v2.2.0 (not a
violation). Perf (smoke `PERF BUDGET`): shipped JS 7 files, **184.9 KB raw / 58.5 KB gzip** —
under the 60 KB min+gzip budget (NFR-P3).

### 14.3 Targeted flip verification — `QA230-R1 … R7`

Each row is a live check on the post-wave tree; scratch harnesses are listed in §14.8.

| Case | What was verified | Evidence | Result |
|------|-------------------|----------|--------|
| `QA230-R1` | **Full browser-process restart.** Chrome #1 (persistent profile) wrote `timeFormat=24h` + `lang=en` **through the real UI**; the process was then **killed and relaunched** (new PID, same `--user-data-dir`, same origin) — Chrome #2 hydrated both: `#b-h24 aria-pressed="true"`, `<html lang="en">`, and the three `choghadiya.settings.*` keys present | `qa2_restart.mjs` — 3/3 write checks, then after restart: `h24=true h12=false`, `lang=en`, keys `["…location","…lang","…timeFormat"]` | **PASS** |
| `QA230-R2` | **Scope + expiry semantics** (shipped `session-store.js` probed in-page via dynamic import): `STORAGE_SCOPE==='local'`; a no-expiry entry (`t:null`) persisted **across the process restart**; a `past-t` entry returned `null` (not served); a 24 h entry returned its value with `t ≈ page-now + 86 400 000 ms`; settings envelopes carry `t:null` | `qa2_restart.mjs` — `scope=local`, `persisted=X`, `expiredRead=null`, `ttlRead=Z`, `ttlRaw={"t":1792033200000,"v":"Z"}` | **PASS** |
| `QA230-R3` | **Privacy truth audit.** Rendered `privacy.line` in the footer **and** the city sheet, in **HI and EN**, is **byte-equal** to the `docs/03-ux.md` §6 cell and to the `i18n.js` dictionary; the false "this browser tab" / "टैब" claim is absent; settings-no-expiry and the 24 h cache TTL are disclosed | `qa2_surfaces.mjs` — footer==sheet==§6==DICT in both languages; `/this browser tab/` and `/टैब/` not found | **PASS** |
| `QA230-R4` | **Attribution links.** `#footer-credit` renders **exactly 3 real `<a>`** — `Open-Meteo`→`https://open-meteo.com/`, `GeoNames`→`https://www.geonames.org/`, `CC BY 4.0`→`https://creativecommons.org/licenses/by/4.0/` — each `rel="noopener noreferrer" target="_blank"` with **no other attributes** (`href,rel,target` only); concatenated `textContent` byte-equal to the dictionary in **EN and HI**; the node's children are `text,A,text,A,text,A` (DOM-API build, no `innerHTML`); `make greps` SEC-05 0 hits | `qa2_surfaces.mjs` — 3 anchors exact; HI text `स्थान खोज Open-Meteo द्वारा · डेटा GeoNames से · CC BY 4.0`, EN `Location search by Open-Meteo · Data from GeoNames · CC BY 4.0` | **PASS** |
| `QA230-R5` | **F3 overlay copy tier-neutral** (row-19 repro). The inauspicious `रोग · Rog` slot, overlapped by Vaar Vela, shows a warning that **names the period** and is neutral about the slot tier: HI `इस चौघड़िया के भीतर वार वेला पड़ रही है — इस समय शुभ काम शुरू न करें।` (no "इस शुभ चौघड़िया"), EN `Vaar Vela falls inside this choghadiya — do not begin auspicious work now.` (no "otherwise-good") | `qa2_surfaces.mjs` — both languages | **PASS** |
| `QA230-R6` | **F10 tampered geocache is render-safe.** Seeded a **wholly-invalid** entry (non-finite coords via `null` + invalid IANA tz `Evil/Zone`) → treated as a **miss**, refetched (1 request, healed) and the render was **not blanked** (3 results); seeded a **mixed** entry (1 valid + 1 tampered) → served from cache (0 refetch) rendering **only the valid record**; 0 `NaN`/`Invalid Date`/`undefined`; 0 console errors | `qa2_surfaces.mjs` — case1 `rows=3 requests=1`, case2 `rows=1 requests=0`, `consoleErrors=[]` | **PASS** |
| `QA230-R7` | **F12 cache-busting.** All **7** internal module specifiers in the shipped graph carry `?v=`; every `?v=` token in `index.html` + the modules equals `2.3.0`; `inauspicious.js → ./choghadiya.js?v=2.3.0` is versioned | `qa2_surfaces.mjs` (uses smoke's `internalModuleSpecifiers()`/`assetVersions()`) + smoke check 10b | **PASS** |

### 14.4 v2.2.0 regression bar — `QA230-R8` (holds)

| Area | Result |
|------|--------|
| **S3** not-defined (polar, 89.9 N) | PASS — `#not-defined` visible, **0** slot rows, S8 periods block hidden, no `NaN`/`Invalid Date`/`undefined` |
| **S5** geolocation-denied/unavailable | PASS — page-level `ℹ लोकेशन उपलब्ध नहीं — शहर लिखें` + `शहर चुनें`, empty state, 0 rows, no dead end |
| **S6** geocoder unreachable | PASS — `role="alert"` `खोज नहीं हो सकी। दोबारा कोशिश करें` (network reject) |
| **S7** no city found | PASS — `role="alert"` `कोई शहर नहीं मिला — वर्तनी जाँचें`, field keeps its value, sheet stays open |
| `aria-current` "Now" exclusivity | PASS — exactly **1** live row at rest and after selecting another row (US-14) |
| Night-after-midnight attribution | PASS — night list starts at sunset (`06:16 pm`) and ends next-morning (`06:32 am`); `SCH-*` unit fixtures unchanged (112-assertion lock green) |
| DST / IANA tz · CSP / textContent-only | PASS — `make test` DST-London fixtures; `make greps` 0 hits / 4 gates |
| 320 px no-scroll | PASS — `scrollWidth === clientWidth` (305 = 305) with S8/S9/panel visible |
| 12h default / toggle / persistence | PASS — smoke 12h/24h assertions + `QA230-R1` restart hydration |

### 14.5 Findings — disposition (no fix cards filed; CTO routes)

| ID | Sev | Status | Note |
|----|-----|--------|------|
| **F2** | Medium | **CLOSED** | Item-7 scope is now `localStorage` (`STORAGE_SCOPE='local'`, BE-FIX-1 `20fe1c1`); settings survive a full browser restart (`QA230-R1/R2`). |
| **F3** | Low | **CLOSED** | `panel.note.overlay.vaarVela`/`.kaalVela` reworded tier-neutral (UX-FIX + FE-FIX); `QA230-R5` repro clean. |
| **F4** | Low | **CLOSED** | Attribution now renders 3 real links (FE-FIX `0cc4144`, DO-FIX allow-list `c7fc4ad`); `QA230-R4` clean. |
| **F5** | Low | **CLOSED** | `docs/04-architecture.md` §16.2/§16.3 corrected to the shipped key layout + `createGeocoder({lang, cacheStore})` (ARCH-FIX `80fd25a`). |
| **F8** | Medium (SEC) | **CLOSED** | Attribution hyperlinks landed; SEC-FIX `t_7b42e0d0` re-signed; `QA230-R4`. |
| **F9** | Medium (SEC) | **CLOSED** | `privacy.line` rewritten truthful (localStorage, no tab claim, TTL disclosed); `QA230-R3`. |
| **F10** | Low (SEC) | **CLOSED** | Geocache read-path re-validation (BE-FIX-2 `d8b5cdc`); `QA230-R6`. |
| **F12** | Info (SEC) | **CLOSED** | Every internal specifier versioned (BE-FIX-2); `QA230-R7`. |
| **F13** | Low | **OPEN (informational, CTO-routed)** | `scripts/axe-check.mjs` does not pin an emulated `prefers-color-scheme`, so a contrast regression can hide on a light-mode host (this machine is dark). A **gate** blind spot, not a product defect; no MVP AC affected. |
| **F14** | Info | **OPEN (informational)** | The `style.css` footer-link colour rule (`footer.app a { color: inherit }`) is an out-of-lane a11y fix (DO-FIX `61282a8`) pending a UX design-token blessing. |
| **F15** | Info | **OPEN (informational)** | Smoke item-7a's "12h/24h persists across reload" pin also passes under `sessionStorage`; the language-key and geocache-key checks are the strong discriminators. |
| **F11** | Info | **OPEN (carried, accepted)** | Carried from SEC-1; accepted, no action. |

### 14.6 Quality-gate scoreboard (v2.3.0 post-wave)

| Gate | Metric | Measured | Expected | Result |
|------|--------|----------|----------|--------|
| M1 | Algorithm correctness | 112/112 slot assertions (unchanged) | 112/112 | **PASS** |
| M2 | No hardcoded clock | `SCH-03` + fixture checks | 0 hardcoded | **PASS** |
| M3 | ±2 min vs mainstream panchang | max Δ 1 min (QA-1 §13.5, 4 combos, live Drik) — no calc-path change in the wave | ≤ 2 min | **PASS** (carried) |
| M4 | Bilingual coverage | 122/122 keys × 2 languages, 0 fallbacks; byte-lock green | 122/122 | **PASS** |
| M5 | No blocking path | S3/S5/S6/S7 + polar + tampered-cache exercised; 0 `NaN`/`Invalid Date`/`undefined` | 0 broken values | **PASS** |
| M6 | Mobile FCP < 1.5 s | not re-measured (no perf-affecting change beyond the wave's ~1 KB JS/CSS); owned by the release card | < 1500 ms | **DEFERRED** to release card |
| M7 | Accessibility | axe **5 states**, 0 critical/serious, 0 moderate/minor | 0 critical/serious | **PASS** |
| M8 | Release gate | this report's verdict: **PASS** | verdict | **PASS** |

### 14.7 Honest gaps (not executed / not fully verified here)

| Item | Why | Residual risk |
|------|-----|---------------|
| Real screen reader (NVDA/VoiceOver) | Not available headless. | Pronunciation/order unverified beyond the AX-tree + axe. |
| M6 Lighthouse FCP | No perf-affecting change in the wave; the release card re-measures on the deployed build. | Low. |
| Real-device geolocation grant (physical phone) | No physical device; the grant path was exercised with a CDP override + granted permission (and a stubbed `getCurrentPosition` for the polar/denied states). | Low — same code path as the city search; device-tz resolution unit-tested. |
| F13 axe theme determinism | The gate runs on the host theme (dark here); a light-mode CI run would not catch an anchor-contrast regression. Recorded, not fixed (Low, CTO-routed). | Low — gate blind spot, not a shipped defect. |
| MAN-01 M3 (three new periods) | Not re-measured this wave — the wave touched no solar/period calculation (only storage, copy, links, gates); QA-1's §13.5 measurement (±1 min, 4 combos) stands. | Low. |

### 14.8 Reproducible commands

```
make test                                   # 108/108 pass, 0 fail
make check                                  # tests 108/108 + greps 0/4 + SMOKE 67/67 + AXE PASS (exit 0)
node scripts/smoke.mjs                      # SMOKE RESULT: 67 passed, 0 failed (+ PERF BUDGET line)
node scripts/axe-check.mjs                  # AXE RESULT: PASS (5 states)
node scripts/security-greps.mjs             # SECURITY GREPS RESULT: PASS — 0 hits across 4 gates

# QA-2 live probes (QA scratch dir, not the repo — scripts/ is devops-owned):
node "$HOME/.hermes/profiles/qa-engineer/cache/scratch/qa2_restart.mjs"     # QA230-R1/R2 — 12/12 (two Chrome processes, one profile)
node "$HOME/.hermes/profiles/qa-engineer/cache/scratch/qa2_surfaces.mjs"    # QA230-R3..R7 — 42/42 (real Chrome, offline)
node "$HOME/.hermes/profiles/qa-engineer/cache/scratch/qa2_regression.mjs"  # QA230-R8 — 13/13 (S3/S5/S6/S7 + bar)
```

### 14.9 v2.3.0 fix-wave re-test revision log

| Version | Date | Author | Change |
|---------|------|--------|--------|
| v2.3.0 QA-2 | 2026-10-14 | qa-engineer | Executed `docs/07-test-plan.md` §12.12 (`QA230-R*`) on the post-wave tree `5706752`: `make test` 108/108, `make check` exit 0 (greps 0/4 · smoke 67/67 · axe 5 states), plus 67 live checks across three probes — full browser-process-restart persistence (12/12), privacy/attribution/F3/F10/F12 surfaces (42/42), v2.2.0 bar S3/S5/S6/S7 + `aria-current` + 320 px (13/13). Verdict **PASS** — no open Critical/High/Medium; QA-1 F2/F3/F4/F5 and SEC F8/F9/F10/F12 closed. Informational residuals F13/F14/F15 + F11 carried (CTO-routed). No fix cards filed. |

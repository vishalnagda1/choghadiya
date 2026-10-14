# Choghadiya — चौघड़िया

A single-page, backend-free web app that computes **today's 16 Vedic Choghadiya
time slots** (8 day + 8 night) from the **real sunrise/sunset** of a chosen
location, and displays them in **Hindi (default) or English**.

> **Live:** <https://time.gitick.com/> (GitHub Pages)

Unlike the previous version of this app, the slot boundaries are **not hardcoded**
to 06:00–18:00 — they are derived client-side from the actual solar day, so the
timings are correct in every season and for every latitude. See
[What changed in v2.3.0](#what-changed-in-v230) and
[What changed in v2.2.0](#what-changed-in-v220).

- **Docs language:** these docs are English. The **UI is Hindi by default** with a
  one-tap EN toggle — every user-facing string ships in both languages (122 keys,
  contract-tested). See [docs/02-prd.md](docs/02-prd.md) §5 and
  [docs/03-ux.md](docs/03-ux.md) §6 for the bilingual copy deck.

---

## Features

- **Dynamic day & night schedule** — day = sunrise → sunset ÷ 8; night = sunset →
  next sunrise ÷ 8, computed from real solar times (not fixed blocks).
- **Today view** with day + night lists (8 + 8 rows, name + time range).
- **Date navigation** — a **calendar picker** selects any date within **±10 civil
  days** of today (past and future, clamped at the edges), and **‹ / ›** buttons
  plus the **Alt + ← / →** shortcut step a day at a time; a **Today** pill resets.
  (New in [v2.3.0](#what-changed-in-v230).)
- **12-hour clock by default** — every time is shown as `06:32 am`; a **12h / 24h
  toggle** in the header switches the whole app (`06:32`) with no reload. The
  choice is remembered across browser restarts. (New in
  [v2.3.0](#what-changed-in-v230).)
- **Location-aware** — asks the browser Geolocation API first; if that is
  unavailable or denied, search any city by name.
- **Use-my-current-location button** — an explicit button inside the location
  sheet re-triggers geolocation on demand (useful after a denial or on a device
  that needs a fresh prompt). (New in [v2.3.0](#what-changed-in-v230).)
- **City search** — free, keyless **Open-Meteo Geocoding** lookup (city, region,
  country + the city's local time), using the **city's own IANA timezone** and
  DST rules (e.g. London renders on `Europe/London`, not your device clock).
- **Inauspicious periods** — for the selected date and location the app computes
  and lists **Vaar Vela**, **Kaal Vela** and **Kaal Ratri** below the slot lists,
  each with its time range in the active clock and a one-line explanation, and
  says plainly in the UI that these are traditional beliefs, not astronomical
  facts. A period that crosses midnight carries the civil-date suffix so the night
  it belongs to is unambiguous. (New in [v2.3.0](#what-changed-in-v230).)
- **Choghadiya detail panel** — a card below the lists shows the details of a
  slot: what it is **good for**, what to **avoid**, its **meaning**, and a
  contextual note. It defaults to the **current** choghadiya; tapping any other
  row shows that one, and tapping it again (or reloading) returns to the current
  slot. When an inauspicious period falls inside the shown slot, the panel warns
  and **names the overlapping period**. (New in
  [v2.3.0](#what-changed-in-v230).)
- **Bilingual EN ⇄ HI toggle** — instant, no page reload; updates `<html lang>`,
  labels and every rendered string, including the periods and the detail panel.
- **Current-slot highlight** — the slot containing "now" (on the viewed
  location's clock) is marked with `aria-current` + a visible "अभी / Now" badge,
  refreshed every ≤ 60 s (paused while the tab is hidden). The highlight stays
  exclusive to the live slot even when another row is selected in the panel.
- **Qualities legible without colour** — every row carries a quality *word* and a
  glyph (✓✓ Amrit / ✓ auspicious / ○ neutral / ✕ inauspicious), and selecting a
  row opens its detail panel.
- **Remembers your settings (in this browser)** — the time format, language and
  last chosen location survive a **reload and a full browser restart** (in
  `localStorage`), and successful city searches are cached for **24 hours**, so a
  reload or a repeat search does not re-hit the geocoder. Settings never expire;
  cached searches do, after 24 h. Nothing is written to a server. See
  [Privacy & data](#privacy--data). (New in [v2.3.0](#what-changed-in-v230).)
- **Graceful degradations** — geolocation denied, geocoder failure (with Retry),
  no city found, and polar locations with no sunrise/sunset all show a clear
  message; the periods block hides when the sun data is undefined. The app never
  renders `NaN`, `Invalid Date` or an empty row.
- **Responsive, mobile-first** — no horizontal scroll from 320 px up; full
  keyboard operability and WCAG 2.2 AA baseline.

The intended MVP feature surface (and what is deliberately *not* included —
countdown, favourites, PWA, panchang detail, …) is specified in
[docs/02-prd.md](docs/02-prd.md) §4 and [docs/05-plan.md](docs/05-plan.md) §6.

---

## Quick start (local)

There is **no build step**. The site is a static bundle of ES modules; serve the
repo root and open it.

```bash
git clone https://github.com/vishalnagda1/choghadiya.git
cd choghadiya
make dev            # serves the repo root at http://localhost:8080
```

`make dev` uses Python 3's stdlib HTTP server. Open <http://localhost:8080> and
allow location access (or tap the location chip and search a city). Equivalent:
`npm run dev`.

> A local server is required — the app uses ES modules and `fetch`, which do not
> work over a `file://` URL.

### Requirements

- Any evergreen browser (Chrome/Edge, Firefox, Safari incl. iOS Safari, Android
  Chrome) with JavaScript and ES modules enabled.
- **Python 3** for `make dev`.
- **Node.js ≥ 22** (LTS) to run the test suite / quality gate.

---

## Testing & quality gate

The site has no runtime dependencies; the tests use Node's built-in test runner,
so `make test` needs **no install**.

```bash
make test           # unit + contract suites (Node's built-in runner)
```

The full pre-release gate adds the SEC-05/03/14/STORAGE source greps, a
headless-Chromium render smoke test and an axe-core accessibility scan. The
smoke/axe steps need dev-only tooling (`axe-core` is pinned in `package.json`
and is **never shipped** — the deployed page keeps `script-src 'self'`); the
greps step is pure Node with no dependencies:

```bash
npm ci              # once — installs the dev-only axe-core
make check          # = make test + security greps + headless smoke + axe-core scan
```

Exit codes are CI-honest: **0** green, **1** a real failure (red test, a failed
grep assertion, a failed smoke assertion, or a critical/serious axe violation),
**2** the harness could not run (no Chrome / axe-core missing) — never a silent
pass.

Individual targets and how to run a single suite are listed under
[Scripts](#scripts). The test plan (levels, environments, expected results and
the US-1..US-19 traceability matrix) lives in
[docs/07-test-plan.md](docs/07-test-plan.md) and
[tests/README.md](tests/README.md).

---

## Configuration

**None.** There are no environment variables, API keys or secrets. The app is
fully static and keyless:

- The `version` field in `package.json` is the single source of truth for the
  **asset version** (`ASSET_VERSION`). It is appended as a `?v=` cache-busting
  query to every asset URL and internal module import, so a version bump is what
  busts the GitHub Pages CDN cache on redeploy (there are no hashed filenames).
- To cut a release, bump the version everywhere in one step, re-check, and tag:

  ```bash
  make bump VERSION=2.3.0    # rewrites package.json + every ?v= token (index.html + all shipped JS)
  make check                 # smoke asserts every ?v= == package.json version
  git commit -am "chore(release): v2.3.0" && git tag -a v2.3.0
  ```

- The Content-Security-Policy is a `<meta>` tag in `index.html`; the only allowed
  network origin is `https://geocoding-api.open-meteo.com`.

---

## Privacy & data

- **No accounts, no cookies, no analytics, no trackers, no backend.**
- **Your coordinates never leave your device.** Geolocation is used only in the
  browser to compute the schedule.
- The **only outbound user-derived data** is the city name you type into the
  search sheet, which is sent to the **Open-Meteo Geocoding API** to resolve a
  location. Sunrise/sunset math itself is fully offline (vendored `suncalc`).
- **No server storage — local cache only.** Since v2.3.0 the app keeps a small
  amount of data in the browser's **`localStorage`** under the `choghadiya.*`
  namespace. Nothing is ever sent to us; there is no server to send it to.
  - **What is stored:** (1) your **settings** — time format (12h/24h), language,
    and the last chosen location (coordinates + timezone + label); and (2) the
    **geocode responses** for city names you have searched.
  - **Settings never expire** — the time format, language and last location
    survive a **reload and a full browser restart**; `localStorage` is not
    per-tab and is not cleared when the tab closes.
  - **Geocode cache TTL: 24 hours** — a cached search is reused for 24 h and then
    refetched; the cache holds at most 64 entries (oldest evicted first).
  - The app degrades silently to an in-memory cache if the browser blocks or
    disables web storage, and every access is wrapped so nothing ever throws.
  - Clearing this origin's site data (via your browser's storage settings) is what
    removes it — these are not cookies, and there is no toggle for them in the app.
- Grep-able in the UI: the footer and the search sheet both carry the disclosure
  line, verbatim from `i18n.js`:

  > Your searched city name is sent to Open-Meteo to find coordinates. No server
  > storage — settings stay in this browser with no expiry; recent searches and
  > cached results expire after 24 hours.

  The same surfaces carry the geocoder credit — see
  [Attribution & licence](#attribution--licence). The old v2.2.0 "location is
  never stored" wording was retired in v2.3.0, because it was no longer true.

See [docs/02-prd.md](docs/02-prd.md) §6.3 for the privacy requirements and
[docs/adr/009-session-scoped-storage.md](docs/adr/009-session-scoped-storage.md)
for the storage decision.

---

## Accessibility

WCAG 2.2 AA is the target and a quality gate, not an afterthought:

- Semantic landmarks, a single `<h1>`, headings per section.
- Full keyboard operation (the city sheet is a native `<dialog>`; `Esc` closes
  it; the date picker is a native `<input type="date">`; `Alt` + `←`/`→` steps
  days), visible focus, and 44×44 px touch targets.
- Quality is never conveyed by colour alone (word + glyph).
- `<html lang>` flips with the language toggle; live regions announce status.
- Respects `prefers-reduced-motion` and text zoom up to 200 %.

`make check` fails on any **critical or serious** axe-core violation. The
accessibility notes are in [docs/03-ux.md](docs/03-ux.md) §7.

---

## Tech notes

- **Vanilla JavaScript, ES modules — no framework, no bundler, no build step.**
  The repo root is deployed verbatim to GitHub Pages.
- **`suncalc` 2.1.1, pinned and vendored** at
  [`vendor/suncalc-2.1.1.js`](vendor/suncalc-2.1.1.js) (BSD-2-Clause; a byte copy
  of the npm package, verified by checksum in the test suite). It is never
  fetched from a CDN at runtime.
- **Solar convention:** suncalc's default sunrise/sunset (upper-limb + refraction)
  matches the mainstream Indian panchang convention. Display timings may differ
  from a printed panchang by **±1–2 minutes** — this is expected and disclosed in
  the UI footer.
- **Timezones:** results for a searched city render in that city's IANA timezone
  using `Intl.DateTimeFormat` (no fixed UTC offsets, DST-correct). Geolocation
  uses the device's resolved timezone.
- **Module split:** `index.html` + `style.css` + `app.js` (state/render) +
  `choghadiya.js` (pure solar/schedule math, Node-importable) +
  `inauspicious.js` (pure Vaar Vela / Kaal Vela / Kaal Ratri math) +
  `geocoder.js` (Open-Meteo client) + `session-store.js` (namespaced
  `localStorage` wrapper) + `i18n.js` (dictionary + `t()`).
- **Performance:** shipped JS is **184.9 KB raw / 58.5 KB gzip** (upper bound,
  7 files), inside the 60 KB min+gzip budget (NFR-P3); the smoke test prints the
  measured figure.
- **Dev-only tooling:** `axe-core@4.10.2` (MPL-2.0), pinned exact, used only by
  `make check` and never referenced from any shipped file.

Architecture and the decision records are in
[docs/04-architecture.md](docs/04-architecture.md) and
[docs/adr/](docs/adr/).

---

## Project structure

```text
choghadiya/                     # repo root — deployed verbatim to GitHub Pages
├── index.html                  # static shell, CSP <meta>, landmarks, city <dialog>
├── style.css                   # design tokens, responsive bands, [hidden] reset
├── app.js                      # app state, orchestration, rendering (DOM access)
├── choghadiya.js               # pure solar + schedule math (Node-importable, no DOM)
├── inauspicious.js             # pure Vaar Vela / Kaal Vela / Kaal Ratri engine
├── geocoder.js                 # Open-Meteo geocoding client (cache, debounce, abort)
├── session-store.js            # namespaced, TTL-capable localStorage wrapper
├── i18n.js                     # 122-key Hindi/English dictionary + t()
├── vendor/
│   └── suncalc-2.1.1.js        # vendored ESM build, checksum-pinned
├── favicon.svg                 # minimal, emoji-free sun icon
├── CNAME                       # time.gitick.com (GitHub Pages custom domain)
├── package.json                # version (ASSET_VERSION), scripts, dev-only axe-core
├── Makefile                    # dev / test / smoke / axe / check / bump
├── .github/workflows/ci.yml    # CI: `make test` + `make greps` on every push and PR
├── tests/                      # unit + contract suites (fixtures, sequences, i18n)
├── scripts/                    # smoke.mjs, axe-check.mjs, security-greps.mjs (dev-only tooling)
└── docs/                       # brief, research, PRD, UX, architecture, ADRs, plan,
                                # test plan, threat model, STATUS log
```

---

## Scripts

All via the `Makefile` (equivalents exist as `npm run <name>` for
`dev`, `test`, `smoke`, `axe`, `check`):

| Command | What it does |
|---------|--------------|
| `make dev` | Serve the repo root at `http://localhost:8080` (`PORT=…` to override). |
| `make test` | Run the Node built-in test runner over `tests/` (unit + contract suites; no install, no network). |
| `make smoke` | Headless-Chromium render smoke: 16 rows from the deterministic Mumbai fixture, EN/HI toggle, the S8 periods block, the S9 detail panel, the ±10-day picker, the 12h/24h toggle + localStorage-backed persistence, the item-7b geocode cache (write / 0-network-after-reload / TTL expiry), no `NaN`, no horizontal scroll, cache-busting + perf budget. |
| `make axe` | axe-core accessibility scan (fails on any critical/serious violation). |
| `make greps` | SEC-05/03/14/STORAGE source gate: fails on any HTML sink, inline style/handler, non-allow-listed origin, or a web-storage token outside `session-store.js` (pure Node, no deps). |
| `make check` | The full gate: `test` + `greps` + `smoke` + `axe` (needs `npm ci` once). |
| `make bump VERSION=x.y.z` | Set `ASSET_VERSION` in `package.json` and every `?v=` token in `index.html` and all shipped JS modules. |
| `make help` | List targets. |
| `node --test tests/<file>` | Run one suite (e.g. `tests/geocoder.test.js`) during a fix. |

---

## Deployment

The app is a static site deployed to **GitHub Pages** at
<https://time.gitick.com/> (custom domain via [`CNAME`](CNAME)). Delivery is
"push the files": CI runs `make test` on every push/PR, and each release is cut
with a semantic-version bump and a git tag (see
[Configuration](#configuration) for the `make bump` procedure).

The **deploy runbook** — pre-flight gate, release bump/tag/push commands,
Pages verification, post-deploy smoke + Lighthouse FCP gate, and rollback — is
[`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## Attribution & licence

- **Sunrise/sunset:** [`suncalc`](https://github.com/mourner/suncalc) 2.1.1 —
  BSD-2-Clause (vendored, checksum-pinned).
- **Geocoding:** [Open-Meteo](https://open-meteo.com/) Geocoding API — data from
  [GeoNames](https://www.geonames.org/), both under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Both licences
  require attribution while the location data is displayed, so the app ships one
  minimal visible credit line in the footer:
  "Location search by Open-Meteo · Data from GeoNames · CC BY 4.0". Attribution
  cannot be removed (the v2.2.0 two-line wording was reduced, not dropped, in
  v2.3.0). In the shipped v2.3.0 build the three key words are **real
  hyperlinks**: `Open-Meteo` → open-meteo.com, `GeoNames` → geonames.org and
  `CC BY 4.0` → the licence deed (`creativecommons.org/licenses/by/4.0/`), each
  with `rel="noopener noreferrer" target="_blank"` and built with DOM APIs only —
  never `innerHTML`.
- **Project licence:** MIT (see `package.json`).

---

## What changed in v2.3.0

The v2.3.0 release adds features and relaxes the privacy stance:

- **12-hour clock by default**, with a **12h / 24h toggle** in the header.
- An explicit **"Use my current location"** button in the location sheet.
- A **calendar date picker** with a selectable range of **±10 civil days**
  (replacing prev/next-only navigation).
- **Inauspicious periods** — **Vaar Vela**, **Kaal Vela** and **Kaal Ratri** —
  computed per date and location and shown with explanations (with an honest
  "traditional beliefs, not astronomical facts" disclaimer).
- A **choghadiya detail panel** showing each slot's meaning, what it is good for,
  what to avoid, and a contextual note — with an overlap warning naming the
  inauspicious period that falls inside the shown slot.
- **Browser-persistent settings** (time format, language, last location) and a
  **24-hour geocode cache**, both in `localStorage` — settings survive a full
  browser restart and **never expire**; cached searches expire after 24 h.
- **Attribution credit now carries live licence links** — the footer credit's
  three key words hyperlink to Open-Meteo, GeoNames and the CC BY 4.0 deed.
- **Privacy stance updated:** from v2.2.0's "no storage ever" to **"no server
  storage; local TTL-gated cache only"** (see [Privacy & data](#privacy--data) and
  [ADR-009](docs/adr/009-session-scoped-storage.md), which supersedes ADR-007 in
  part).

---

## What changed in v2.2.0

The v2.2.0 refactor replaces the previous hardcoded-timing page:

- timings are now computed from **real sunrise/sunset** instead of fixed
  06:00–18:00 blocks;
- the app is **location-aware** (geolocation + city search) with correct IANA
  timezone / DST rendering;
- the UI is **bilingual (Hindi default, English toggle)** and responsive;
- accessibility and graceful degradations are built in.

Full details are in [CHANGELOG.md](CHANGELOG.md) and
[RELEASE_NOTES.md](RELEASE_NOTES.md).

# 02 — Product Requirements Document (PRD)

Project: **Choghadiya Refactor** · Owner: product-manager · Date: 2026-10-14 · Version: **v1.0 (initial)**
Sources: `docs/00-brief.md` (client intent, source of truth), `docs/01-research.md` (pinned algorithm + stack), `docs/TEAM_CHARTER.md`.
Release target: static site on GitHub Pages at `https://time.gitick.com/`.

---

## 1. Problem & goals

### 1.1 Problem

Choghadiya is a traditional Vedic "quick muhurat" aid: the span **sunrise → sunset** and the span **sunset → next sunrise** are each split into **8 equal periods**, each labelled with one of 7 qualities (Amrit, Shubh, Labh, Char, Rog, Kaal, Udveg). People consult it reactively — "is *now* a good time to leave / sign / start something, and when is the next good window?" — for their own location.

The current single-page app at `time.gitick.com` fails this job in four concrete ways (verified in research §Executive summary):

1. **Stale times.** Slots are hardcoded 90-minute blocks from a fixed 06:00–06:00 day. Real day length varies with latitude and season (Mumbai ~11 h in December, ~13 h in June), so the displayed window boundaries are visibly wrong for most of the year and for any city other than the one assumed. *(The 7-name sequence itself is already correct — it must be preserved and locked by tests, not "fixed".)*
2. **Single assumed location.** No geolocation, no city lookup — the user cannot get *their* location's times.
3. **Hindi-only.** No way to switch to English.
4. **Legacy layout.** A large 7-column all-weekday matrix rather than a mobile-first "today" view; broken favicon.

### 1.2 Goals (v1.0)

- **G1 — Correct, dynamic slots.** Compute the 16 daily slots from the *real local* sunrise/sunset for the viewed location and date; no fixed clock blocks.
- **G2 — Location-aware.** Work for the user's actual location (browser geolocation) and for any named city (manual search fallback).
- **G3 — Bilingual EN/HI.** Instant, no-refresh toggle; **Hindi is the default language**.
- **G4 — Modern, responsive, mobile-first** layout, deployable as a static site with no backend.
- **G5 — Preserve the correct sequence.** Reproduce the standard 7-name day/night sequence exactly (pinned in research §5) and lock it with unit tests.

### 1.3 Product thesis / differentiator

Accuracy is table stakes and is contested by heavyweight, ad-supported, English-first incumbents (Drik Panchang, Swiss-Ephemeris apps). We do **not** compete on precision or feature depth. Our wedge is a **dead-simple, genuinely bilingual (Hindi-default), privacy-first, no-account, no-backend, instant** web tool with a proper mobile "today" view. `tithi.app` is closest in spirit but is English-only; the incumbent is Hindi-only — **instant EN↔HI toggle is the real differentiator in this niche.**

---

## 2. Target users & personas

### P1 — "Priya", the mobile-first Hindi-speaking user *(primary)*
- 28–55, in Gujarat / Rajasthan / Maharashtra / North India; Android phone; comfortable in Hindi, can read basic English.
- Opens the app on the go, one-handed, often on mobile data.
- **Job:** "It's 10:40 AM — is now a good time to leave for the market, and when's the next good window? For *where I am right now*."
- **Needs:** opens to Hindi by default; shows today's day **and** night slots; highlights the current slot; loads instantly, no login, no install.

### P2 — "Rohan", the city-lookup user *(secondary)*
- NRI / traveller / planner outside India, or someone checking a city other than their own.
- **Job:** "Show me Choghadiya for London today — but I want to check it *for London's clock*, and also look at tomorrow."
- **Needs:** city-name search, correct timezone rendering for the *searched city*, prev/next date navigation, can switch to English.

### P3 — "Meera", the privacy-conscious / accessibility user *(secondary, and a quality bar we hold for everyone)*
- Distrusts apps that phone home or require accounts; may use a screen reader or need non-colour cues.
- **Needs:** no account, location stays on-device, clear disclosure of the one optional network call (city search), high-contrast legible UI, quality coded by text/icon and not colour alone, keyboard-operable controls.

---

## 3. Success metrics

Because v1 is a no-backend static site with **no analytics**, all v1 metrics are **functional/verification metrics** (measurable from the build and QA). Business/analytics metrics are explicitly deferred until a later, consent-aware decision.

| ID | Metric | Target (v1.0) | How measured |
|----|--------|---------------|--------------|
| M1 | Algorithm correctness | 100% — all 7 weekdays × (8 day + 8 night) slots match the pinned tables in research §5 | Unit tests (US-1) |
| M2 | Dynamic-slot correctness | 100% — slot boundaries derived from real sunrise/sunset for the location/date; zero hardcoded clock times in shipped code | Unit tests + code review/inspection |
| M3 | Slot-boundary accuracy vs a mainstream panchang | Within ±2 minutes for sunrise/sunset-based boundaries | Manual QA against Drik Panchang for 3+ cities/dates |
| M4 | Bilingual coverage | 100% of user-facing strings present in both EN and HI dictionaries; **zero** untranslated fallbacks on screen | Automated string-coverage check + QA |
| M5 | No-blocking-path coverage | Geolocation denied, geocode failure, and polar/no-sunrise cases each show a clear message and never render `NaN` / `Invalid Date` | QA scenarios (US-8, US-9) |
| M6 | Performance (mobile) | First Contentful Paint < **1.5 s** on a mid-range Android over 4G; interaction (date change / language toggle) < **100 ms** locally | Lighthouse mobile run + manual |
| M7 | Accessibility | Automated axe check: **0 critical/serious** violations; all slot qualities distinguishable without colour | axe + manual keyboard/screen-reader pass |
| M8 | Release gate | Deployed and working at `https://time.gitick.com/` satisfying all MVP acceptance criteria and QA pass | QA release verdict (US-11) |

---

## 4. Scope — MVP (v1.0) vs. later

### 4.1 MVP (v1.0) — in scope, must ship

1. **Dynamic binary day/night schedule.** Day = sunrise→sunset ÷ 8 nearly-equal parts; night = sunset→next sunrise ÷ 8 parts, computed from real local solar times. *(Brief MVP 1)*
2. **Correct sequence, pinned + unit-tested.** Cycle `[Udveg, Char, Labh, Amrit, Kaal, Shubh, Rog]`; `daySlot(i)=cycle[(dayStart+i)%7]`; `nightSlot(i)=cycle[(dayStart+5*(i+1))%7]`; `dayStart` per weekday Sun 0, Mon 3, Tue 6, Wed 2, Thu 5, Fri 1, Sat 4. *(Brief algorithm section; research §5)*
3. **Location — geolocation primary.** Browser Geolocation API. *(MVP 2)*
4. **Location — manual city fallback.** City-name input → coordinates + IANA timezone via **Open-Meteo Geocoding API** (keyless, CORS-friendly); Nominatim only as an explicit-submit fallback, never type-ahead. *(MVP 2; research §7)*
5. **Client-side solar computation** via **pinned `suncalc@2.1.1`** (BSD-2-Clause); no network call needed for the core calculation. *(MVP 3)*
6. **Bilingual EN/HI, instant no-refresh toggle, Hindi default**, including the 7 Choghadiya names (Devanagari + familiar EN). *(MVP 4)*
7. **"Today" view.** Day **and** night slot lists for the current date, with **prev/next date navigation**. *(MVP 5)*
8. **Current-slot highlight.** The slot containing "now" (at the *viewed location's* clock) is visually highlighted. *(MVP 6)*
9. **Responsive, modern, mobile-first layout.**
10. **Graceful degradations** (from research, folded into MVP because they are correctness, not polish): geolocation denied/unavailable → city input; geocode failure → clear retry/manual path; polar/no-sunrise → explicit "not defined at this location/date" message; never `NaN`/`Invalid Date`.
11. **Correct timezone rendering** for searched cities (use the **location's** IANA timezone; device timezone only for geolocation), and daylight-saving correctness.
12. **Privacy + attribution line**: one line disclosing that city search sends the typed city name to a third-party geocoder (Open-Meteo / GeoNames), plus a geocoder credit; no PII stored, no analytics.
13. **Accessibility baseline (WCAG 2.2 AA)** — see §6.
14. **Static, no-backend delivery** — `index.html` + `style.css` + `app.js` + i18n dictionary; deployable to GitHub Pages.

### 4.2 Later (post-v1.0) — explicitly deferred

- **Live countdown** to the end of the current slot (high user value; cheap; competitors lead with it). *(Brief "later")*
- "Next auspicious slot / window" hint.
- Shareable/bookmarkable URL encoding city + date.
- Location favorites / search history.
- Offline service worker / PWA install.
- Notifications / alarms / muhurat alerts.
- Panchang detail (Tithi/Nakshatra/Yoga/Karana) and muhurat beyond Choghadiya.
- Rahu Kaal / Yamagandam / Gulika.
- Gujarati or other Indic languages.
- Analytics (requires a fresh consent/privacy decision).

### 4.3 Explicitly out of scope for v1.0

See §8.

---

## 5. User stories & acceptance criteria

Legend: **P0** = release blocker for v1.0; **P1** = in v1 but could be dropped only by a client decision. Every story has testable Given/When/Then criteria. Stories are grouped by epic.

### EPIC A — Schedule computation (correctness core)

#### US-1 (P0) — Dynamic day & night schedule from real solar times
**As a** user, **I want** my slots computed from the real sunrise/sunset at my location **so that** the window boundaries are correct for my date and latitude.

- **AC1** Given a location and date, **When** the app computes the schedule, **Then** the 8 day slots span sunrise→sunset in 8 equal parts and the 8 night slots span sunset→next-day-sunrise in 8 equal parts, with no hardcoded clock times used.
- **AC2** Given Mumbai on a mid-December date (day ≈ 11 h), **When** slots render, **Then** day-slot lengths are ≈ 11h/8 ≈ 82 min, *not* the legacy 90 min.
- **AC3** Given Mumbai on a mid-June date (day ≈ 13 h), **When** slots render, **Then** day-slot lengths are ≈ 13h/8 ≈ 98 min.
- **AC4** Given any two consecutive day slots, **When** compared, **Then** slot *n*'s end equals slot *n+1*'s start (no gaps, no overlaps); same for night.
- **AC5** Given the app source, **When** shipped, **Then** no fixed 06:00/18:00 boundary values exist in the calculation path (verifiable by inspection/unit test).

#### US-2 (P0) — Correct 7-name sequence (day and night)
**As a** user, **I want** the traditional sequence preserved **so that** the names are trusted and never regress.

- **AC1** Given each of the 7 weekdays, **When** the day slots are generated, **Then** they exactly match the day table in research §5.2.
- **AC2** Given each of the 7 weekdays, **When** the night slots are generated, **Then** they exactly match the night table in research §5.3.
- **AC3** Given Sunday, **When** day slots are generated, **Then** slot 1 = Udveg and slot 8 = Udveg (the 8th repeats the 1st).
- **AC4** Given the implementation, **When** tests run, **Then** a test asserts all 7 weekdays × (8+8) slots (112 assertions) against the pinned tables and all pass.
- **AC5** Given a slot name, **When** displayed, **Then** it maps to exactly one of the 7 accepted names (Amrit, Shubh, Labh, Char, Rog, Kaal, Udveg); "Char" is the canonical EN key.

#### US-3 (P0) — Date-boundary (sunrise→sunrise) semantics
**As a** user, **I want** a slot after midnight to belong to the day it started on **so that** the night list is not mislabelled.

- **AC1** Given a slot at 02:00 on Thursday, **When** attributed, **Then** it belongs to **Wednesday's night** list and uses Wednesday's weekday sequence.
- **AC2** Given a viewed date D, **When** the schedule is built, **Then** the weekday driving both halves is the weekday **of the sunrise** that starts D (per the viewed **location's** local date).
- **AC3** Given geolocation resolves to a far-away timezone, **When** "today" is determined, **Then** today is the **location's** local date, not the device's.

### EPIC B — Location & solar data

#### US-4 (P0) — Use my current location
**As a** mobile user, **I want** the app to use my current location **so that** I don't have to type anything.

- **AC1** Given the app opens with no location set, **When** geolocation permission is granted, **Then** the app computes and shows slots for the device's coordinates, and uses the device's timezone for rendering.
- **AC2** Given geolocation permission is denied or unavailable, **When** the app opens, **Then** it does **not** block or show an error wall; it shows the manual city input and a one-line explanation. *(US-8 AC1)*
- **AC3** Given a successful geolocation fix, **When** the request completes, **Then** the coordinates are used **only** on-device and are never sent to any server.

#### US-5 (P0) — Look up any city
**As a** city-lookup user (P2), **I want** to type a city name **so that** I can see its Choghadiya.

- **AC1** Given the city input, **When** I submit a city name, **Then** the app calls the Open-Meteo Geocoding API and shows matching results (city, region/country) for me to pick.
- **AC2** Given a city result is selected, **When** slots render, **Then** the coordinates **and the returned IANA timezone** are used.
- **AC3** Given I search "London" from India, **When** slot times render, **Then** they display in **Europe/London** time, not IST.
- **AC4** Given I type in the city field, **When** I have not submitted, **Then** the app does **not** issue per-keystroke requests (explicit submit or ≥400 ms debounce; never type-ahead against Nominatim).
- **AC5** Given a query returns no matches, **When** results render, **Then** a clear "no city found" message is shown and the app remains usable.

#### US-6 (P0) — Client-side solar computation with pinned library
**As the** product, **I want** the core calculation to need no network **so that** it is fast, private, and reliable.

- **AC1** Given a location and date, **When** the schedule is computed, **Then** a pinned `suncalc@2.1.1` (vendored or versioned CDN URL — never floating `latest`) supplies sunrise/sunset; no other network call is required for the core calculation.
- **AC2** Given the sunrise convention, **When** documented, **Then** the app states it uses the upper-limb + refraction convention (suncalc default, ≈ −0.833°) matching mainstream Indian panchang, and accepts ±1–2 min variance.

#### US-7 (P0) — Correct timezone & DST handling
**As a** user checking a city in another timezone, **I want** times in that city's clock **so that** I'm not misled.

- **AC1** Given a selected city with an IANA timezone, **When** times render, **Then** all slot times are formatted with `Intl.DateTimeFormat` using that IANA zone.
- **AC2** Given a DST-observing city (e.g. London) on a date within DST, **When** times render, **Then** the offset reflects DST for that date (IANA handles it; no fixed UTC offsets used).
- **AC3** Given geolocation is used, **When** the location has no explicit IANA zone supplied by us, **Then** the device's `Intl` resolved timezone is used.

### EPIC C — Degradations (never break)

#### US-8 (P0) — Geolocation denied / unavailable
- **AC1** Given permission is denied, **When** the app loads, **Then** it shows the city input plus a plain-language note ("Location unavailable — enter a city"), with no crash and no dead end.
- **AC2** Given the page runs in an insecure context (no geolocation), **When** it loads, **Then** it falls back to the city input without throwing.

#### US-9 (P0) — Polar / undefined sunrise or sunset
- **AC1** Given a location/date where `suncalc` returns no sunrise or sunset, **When** slots would render, **Then** the app shows a clear "Choghadiya is not defined at this location/date (no sunrise/sunset)" message.
- **AC2** Given that case, **When** the page is inspected, **Then** no `NaN`, `Invalid Date`, or empty slot row is rendered.

#### US-10 (P0) — Geocode failure / limits
- **AC1** Given the geocoder is unreachable or returns an error, **When** I search, **Then** a clear retry message appears and the last successful location remains usable.
- **AC2** Given repeated searches, **When** the app calls the geocoder, **Then** it does not exceed fair-use expectations (debounced/explicit-submit, cached last result).

### EPIC D — Bilingual UX

#### US-11 (P0) — Instant EN↔HI language toggle, Hindi default
**As a** Hindi-speaking user, **I want** the app in Hindi by default and an instant English toggle **so that** I can read it in my language.

- **AC1** Given a first visit, **When** the app loads, **Then** all user-facing text is in **Hindi** by default.
- **AC2** Given the language toggle, **When** I switch language, **Then** all visible strings update **without a page reload**, within ~100 ms.
- **AC3** Given any visible string, **When** either language is active, **Then** it comes from the i18n dictionary with no missing-key fallback visible on screen.
- **AC4** Given the 7 slot names, **When** English is active, **Then** they read `Amrit, Shubh, Labh, Char, Rog, Kaal, Udveg`; **When** Hindi is active, **Then** they read `अमृत, शुभ, लाभ, चर, रोग, काल, उद्वेग`.
- **AC5** Given language switches, **When** the `<html>` element updates, **Then** its `lang` attribute changes (`hi`/`en`) for screen readers.

### EPIC E — Today view & navigation

#### US-12 (P0) — Today view with day + night lists
**As a** user, **I want** today's day and night slots on one screen **so that** I can see everything at a glance.

- **AC1** Given the app loads with a location, **When** the view renders, **Then** it shows the viewed date and a **day** list of 8 slots and a **night** list of 8 slots, each with its name and start–end times.
- **AC2** Given a slot row, **When** rendered, **Then** it shows the slot name and its time range in the viewed location's timezone.

#### US-13 (P0) — Prev / next date navigation
**As a** user, **I want** to step to adjacent dates **so that** I can plan slightly ahead.

- **AC1** Given the today view, **When** I tap "next day", **Then** the view shows the next date's day+night slots and the date label updates.
- **AC2** Given "previous day", **When** tapped repeatedly, **Then** the app can step back across dates without error.
- **AC3** Given I navigate away from today, **When** the view renders, **Then** no slot is marked as "current" unless the viewed date is today at the viewed location. *(US-14 AC3)*

#### US-14 (P0) — Highlight the current slot
**As a** user, **I want** the current slot highlighted **so that** I instantly know if now is auspicious.

- **AC1** Given the viewed date is today at the viewed location and a slot contains "now", **When** the view renders, **Then** that slot is visibly highlighted.
- **AC2** Given "now" falls in the night half (after sunset, before next sunrise), **When** highlighted, **Then** the highlight is on the correct night slot (and the correct day's night list — US-3).
- **AC3** Given the viewed date is not today, **When** rendered, **Then** no slot is highlighted as current.
- **AC4** Given the app is left open across a slot boundary, **When** the slot changes, **Then** the highlight updates (poll/refresh ≤ 60 s) — *or* the next load reflects it; the app must not show a stale highlight indefinitely.

#### US-15 (P0) — Quality is legible without colour
**As an** accessibility user, **I want** auspicious/inauspicious/neutral to be clear without relying on colour.

- **AC1** Given any slot row, **When** rendered, **Then** its quality is conveyed by a **text label and/or icon in addition to** colour.
- **AC2** Given a colour-blind user, **When** viewing, **Then** they can distinguish all three quality tiers from the non-colour cues alone.

### EPIC F — UX quality, i18n plumbing, delivery & compliance

#### US-16 (P0) — Responsive, mobile-first layout
- **AC1** Given a 360 px-wide viewport, **When** rendered, **Then** no horizontal scroll and all controls are reachable one-handed.
- **AC2** Given a desktop viewport, **When** rendered, **Then** the layout is centred/readable and does not stretch awkwardly.
- **AC3** Given any viewport 320 px–1920 px, **When** rendered, **Then** the app remains usable and legible.

#### US-17 (P0) — Privacy disclosure & attribution
- **AC1** Given the city-search feature, **When** the user opens it, **Then** a one-line disclosure states that the typed city name is sent to a third-party geocoder (Open-Meteo / GeoNames) and that location is not stored.
- **AC2** Given the shipped site, **When** the footer/about area is read, **Then** a geocoding attribution line is present ("Geocoding by Open-Meteo / GeoNames").
- **AC3** Given the app, **When** network traffic is inspected, **Then** no analytics, no PII, and no location coordinates are transmitted.

#### US-18 (P0) — Accessibility baseline (WCAG 2.2 AA)
- **AC1** Given an automated axe scan, **When** run on the shipped page, **Then** there are 0 critical/serious violations.
- **AC2** Given keyboard-only navigation, **When** the user tabs, **Then** the language toggle, city input, and date navigation are reachable and operable, with a visible focus state.
- **AC3** Given text/background pairs, **When** measured, **Then** contrast meets WCAG 2.2 AA (≥ 4.5:1 normal text).
- **AC4** Given the page structure, **When** inspected, **Then** headings are semantic and controls have accessible names/labels.

#### US-19 (P0) — Static delivery to GitHub Pages
**As the** team, **I want** a no-backend static build **so that** it deploys to GitHub Pages simply.

- **AC1** Given the repo, **When** built, **Then** the site consists of `index.html` + `style.css` + `app.js` + an i18n dictionary (plus assets) and requires no server, no API key, and no build step beyond what's documented.
- **AC2** Given a deploy, **When** loaded at `https://time.gitick.com/`, **Then** the app works end-to-end without console errors.
- **AC3** Given the release, **When** the page loads, **Then** a valid favicon is present (the legacy stray "🐴" issue is resolved) and static assets are cache-busted/versioned so a redeploy is picked up (research R7).
- **AC4** Given the release, **When** QA verifies, **Then** all MVP acceptance criteria above pass.

---

## 6. Non-functional requirements

### 6.1 Performance
- **NFR-P1** First Contentful Paint < 1.5 s on a mid-range Android over 4G (M6).
- **NFR-P2** Language toggle and date navigation respond in < 100 ms locally (no network).
- **NFR-P3** Total shipped JS (incl. `suncalc`) should stay small (< ~60 KB minified gzip target); keep dependencies to one.
- **NFR-P4** The core calculation is synchronous and offline-capable (no network needed once the page loads); only city search touches the network.

### 6.2 Security
- **NFR-S1** No backend, no accounts, no secrets in the repo; any API usage is keyless.
- **NFR-S2** All rendered user-supplied / third-party text (city names from the geocoder) must be inserted as **text, not HTML**, to prevent XSS/injection.
- **NFR-S3** All third-party calls are HTTPS; a strict Content-Security-Policy (at least `default-src 'self'` plus the specific geocoder origin and CDN origin if used) is recommended and to be validated by security.
- **NFR-S4** Only pinned, permissively licensed dependencies (`suncalc@2.1.1`, BSD-2-Clause); no floating `latest`.
- **NFR-S5** Security review passes before release (security-engineer gate).

### 6.3 Privacy
- **NFR-PR1** No PII stored, transmitted, or logged. Geolocation coordinates never leave the device.
- **NFR-PR2** The only outbound user-derived data is the **typed city name** in a manual search; this is disclosed in one line (US-17).
- **NFR-PR3** No cookies, no analytics, no trackers in v1.0. Any future addition requires a fresh privacy/consent decision.
- **NFR-PR4** Geocoder attribution present (Open-Meteo / GeoNames CC-BY; OSM ODbL if Nominatim used).

### 6.4 Accessibility — WCAG 2.2 AA *(charter baseline is 2.1 AA; we target 2.2 AA as a superset)*
- **NFR-A1** Conformance target: WCAG 2.2 AA.
- **NFR-A2** Quality must not be colour-only — text/icon cues required (US-15).
- **NFR-A3** Colour contrast ≥ 4.5:1 for normal text, ≥ 3:1 for large text and UI components.
- **NFR-A4** Full keyboard operability with visible focus; semantic landmarks/headings; `lang` attribute set and updated on language switch.
- **NFR-A5** Touch targets ≥ 44×44 CSS px for primary controls.
- **NFR-A6** Respect user text-sizing / zoom up to 200% without loss of content or function.

### 6.5 Browser & device support
- **NFR-B1** Target: current evergreen browsers — Chrome/Edge, Firefox, Safari (incl. iOS Safari), and Android Chrome, latest two major versions.
- **NFR-B2** Device support: mobile-first from 320 px width up; tablets and desktop.
- **NFR-B3** Requires JavaScript enabled (acceptable for this static tool); show a `<noscript>` message.
- **NFR-B4** Legacy browsers (IE, pre-ESM) are **not** supported — no UMD fallback required (mobile-first modern target).

---

## 7. Assumptions

- **A1** The client accepts the **pinned algorithm** in research §5 as correct (verified against 5 independent sources + the incumbent); it is the source of truth for US-2.
- **A2** `suncalc@2.1.1`'s default sunrise/sunset convention (upper-limb + refraction) is acceptable to the client; ±1–2 min variance from a printed panchang is tolerated (research R1).
- **A3** **Hindi is the default language** and the 7 names use "Char" (चर) as the canonical EN key (per brief; Gujarat "Chal" variant not needed).
- **A4** Free, keyless geocoding (**Open-Meteo Geocoding API**, Nominatim as explicit-submit fallback) is acceptable and within its fair-use terms (<10,000 calls/day, non-commercial) (research §7).
- **A5** The target host is **GitHub Pages** with the existing custom domain `time.gitick.com`; no server-side capability is available or needed.
- **A6** Non-commercial / personal-project usage (matters for geocoder terms and attribution).
- **A7** The client accepts a **one-line disclosure** about the optional city-search geocoder call rather than a full consent flow.
- **A8** "Today" is determined by the **viewed location's** local date, not the device's (needed for correctness; recorded as an engineering decision, flag to client).
- **A9** Slot boundaries are computed as exact equal divisions of the actual day/night length (not rounded to whole minutes in memory); display may round to the nearest minute.
- **A10** No user accounts, history, or personalization are required for v1.

---

## 8. Out of scope (v1.0)

- Any backend, server-side rendering, database, or user accounts/authentication.
- Panchang detail (Tithi, Nakshatra, Yoga, Karana), any muhurat beyond Choghadiya, Hora, Rahu Kaal/Yamagandam/Gulika.
- Live countdown timer, alarms, push notifications, lock-screen widgets.
- Location favorites/history, shareable URLs, "next auspicious window" hints.
- Offline service worker / PWA installability.
- Analytics, ads, tracking, or any data collection.
- Gujarati or languages beyond English + Hindi.
- Native mobile apps (App Store / Play).
- Account-based sync or personalization.
- Supporting legacy browsers (IE, non-ESM).

---

## 9. Open questions for the client

Each has my **recommended default**; if no answer is given, the team proceeds with the default so work is not blocked.

| # | Question | Recommended default |
|---|----------|---------------------|
| Q1 | Confirm the term for the 2nd Choghadiya in English: **"Char"** or the Gujarat/Marathi **"Chal"**? | **"Char"** (EN) / **चर** (HI), per the brief. |
| Q2 | Should the current-slot highlight auto-advance while the page stays open, or refresh on next load? | **Auto-update** with a light poll (≤ 60 s); cheap and matches user expectation (US-14 AC4). |
| Q3 | Show sunrise / sunset times explicitly on the page? | **Yes**, as small secondary text — it builds trust in the dynamic computation. |
| Q4 | Where should the privacy/attribution line live: footer, an "About" link, or inline near city search? | **Inline one-liner near city search** + a short footer credit line. |
| Q5 | Is commercial use ever intended (affects geocoder terms/attribution)? | Assume **non-commercial**; if commercial, revisit geocoder terms before release (A6). |
| Q6 | Confirm whether it's acceptable to state the sunrise convention (±1–2 min variance) in the UI/about. | **Yes** — transparency matches the "trust" positioning. |
| Q7 | Should a new favicon/brand mark be designed, or keep it minimal/emoji-free? | **Minimal, valid, emoji-free favicon** now; branded art can be a later design task. |

---

## 10. Traceability (brief → PRD)

| Brief item | Covered by |
|------------|-----------|
| MVP 1 — dynamic day/night | US-1, US-6 (NFR-P4) |
| MVP 2 — geolocation + city fallback | US-4, US-5, US-8, US-10 |
| MVP 3 — suncalc client-side | US-6 |
| MVP 4 — bilingual EN/HI + 7 names | US-11 |
| MVP 5 — today view + prev/next | US-12, US-13 |
| MVP 6 — highlight current slot | US-14 |
| Algorithm section — pinned sequence | US-2, US-3 |
| Constraints — frontend-only, GitHub Pages, split files | US-19, NFR-S1 |
| Data & compliance — no stored/transmitted data | NFR-PR1..3, US-17 |
| Release definition — merged, deployed, QA-passed | US-19 AC4, M8 |
| Open questions + agreed defaults | §7 Assumptions (A2, A3, A4, A5) |

---

## 11. Revision log

| Version | Date | Author | Change |
|---------|------|--------|--------|
| v1.0 (initial) | 2026-10-14 | product-manager | Initial PRD from `00-brief.md` + `01-research.md`. Pinned algorithm, MVP cut, 19 user stories across 6 epics, NFRs, open questions. |

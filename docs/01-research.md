# 01 — Research: Market, Competitors & Technology Landscape

Project: **Choghadiya Refactor** · Author: researcher · Date: 2026-10-14
Scope: de-risk the product and tech decisions in `docs/00-brief.md`. All URLs accessed **2026-10-14** unless noted.

---

## Executive summary (read this first)

1. **The product is a small, well-bounded utility, not a platform.** Dynamic Choghadiya for a location + bilingual EN/HI + prev/next date navigation is realistically a few hundred lines of vanilla JS, no backend, fully static-hostable on GitHub Pages. The brief's architecture constraints are sound.
2. **The single biggest unknown — the "correct" Choghadiya sequence — is now pinned** (see §5). This is the algorithmic heart of the product and it is no longer a risk.
3. **Surprising finding:** the *existing* app at `time.gitick.com` already uses the **standard 7-slot sequence correctly** (Sunday day starts Udveg, night starts Shubh; Monday day Amrit, night Char; …). Its real defects are (a) **hardcoded 90-minute slots from a fixed 06:00–06:00 day** instead of real local sunrise/sunset, (b) **Hindi-only** with no toggle, (c) a large 7-column weekday matrix where a single-location "today" view is what users actually want, and (d) a broken favicon. The refactor is justified, but the team should not expect to "fix" the sequence — it should be **verified and preserved**.
4. **Algorithm in one line:** cycle = `[Udveg, Char, Labh, Amrit, Kaal, Shubh, Rog]`; day slot *i* = `cycle[(dayStart(weekday) + i) mod 7]`; night slot *i* = `cycle[(dayStart + 5*(i+1)) mod 7]`. `dayStart` per weekday: Sun 0 (Udveg), Mon 3 (Amrit), Tue 6 (Rog), Wed 2 (Labh), Thu 5 (Shubh), Fri 1 (Char), Sat 4 (Kaal).
5. **Competitors set the bar high on accuracy** (Drik Panchang, Swiss-Ephemeris apps) but most are heavyweight, English-first, ad-supported, and account/ad driven. Our defensible wedge: **dead-simple, bilingual (Hindi default), privacy-first, no backend, instant, works for any location**.
6. **Library choice confirmed:** `suncalc` **v2.1.1** (BSD-2-Clause, ~0 runtime deps, ships ESM + UMD). Its default sunrise/sunset (`−0.833°`, upper-limb + refraction) **matches the mainstream Indian panchang convention**, so no custom astronomy is required.
7. **Geocoding confirmed:** **Open-Meteo Geocoding API** (`geocoding-api.open-meteo.com/v1/search`) — free, keyless, CORS-friendly, **returns the location's IANA timezone**, fair-use limit <10,000 calls/day, non-commercial. **Nominatim** is the fallback but has a strict policy (max 1 req/s, valid Referer/User-Agent, no autocomplete/bulk). See §7.
8. **Two hidden-but-important risks:** (i) **timezone rendering** for manually searched cities (must use the *city's* IANA timezone, not the device's); (ii) **polar / extreme-latitude days** where the sun does not rise or set, so `suncalc` can return `null`/`Invalid Date`. Both need explicit handling (see §9).
9. **No compliance blockers.** No accounts, no stored PII, location stays on-device. Only disclosure needed: the optional city search sends the *typed city name* to a third-party geocoder.
10. **Recommendation:** proceed with the brief's plan, adding (a) a pinned sequence table + unit tests, (b) explicit timezone handling, (c) geolocation-denied and geocode-failure fallbacks, (d) a one-line privacy note. No architectural change required.

---

## 1. Problem & target users

**Problem.** Choghadiya (चौघड़िया / ચોઘડિયું) is a traditional Vedic "quick muhurat" system: the day from sunrise to sunset and the night from sunset to next sunrise are each split into 8 equal periods, each labelled with one of 7 qualities. People use it to pick an auspicious moment to travel, sign deals, start new work, or avoid an inauspicious window — a *reactive, on-the-spot* decision aid (as opposed to a full muhurat analysis). It is most popular in **Gujarat, Rajasthan, Maharashtra and North India**.

**Why the current app fails them.** Published/print tables assume fixed clock times (e.g. 06:00–18:00), but real day length varies by latitude and season — in Mumbai the day is ~11 h in December and ~13 h in June. A static table gives visibly wrong window boundaries for most of the year and for any city other than the one assumed.

**Target users (from brief).**
- Primary: **Hindi-speaking Indian users, mobile-first**, wanting *today's* day + night slots for *their own* location.
- Secondary: any user who wants a city's slots (NRIs, travellers, other Indic-language readers who can navigate EN).

**Primary user job-to-be-done:** "It's 10:40 AM, I want to know if *now* is a good time to leave / sign / start, and when the next good window is — for where I am."

---

## 2. Comparable products / competitors

All accessed 2026-10-14. "Pricing" = consumer-facing; most are freemium with ads.

| # | Product | Type | Features | Pricing model | What users love | What users dislike |
|---|---------|------|----------|---------------|-----------------|--------------------|
| 1 | **Drik Panchang** (`drikpanchang.com`, Android app `com.drikpanchang.choghadiya`) | Website + app | Location-based Choghadiya, full Panchang (Tithi/Nakshatra/Yoga/Karana), festivals, planetary positions; Drik Ganita engine; configurable sunrise convention | Free with ads; paid ad-free | Accuracy/authority; depth; city + timezone handling | Dense/overwhelming UI; "not the most modern"; a Play reviewer reports the **night-time current-slot indicator is buggy** ("after 24h… top right always shows Labh") |
| 2 | **Choghadiya & Muhurat 2026** (`myoracular.com`, App Store id6757258774 / Play `com.myoracular.chogadiya.app`) | App | Day/night cycles, live indicator, "One-Tap Muhurat" day-rating across 9 life categories, Rahu Kaal/Yamagandam/Gulika alerts, Panchang, GPS+timezone auto-detect, **EN/HI/GU/BN** | Freemium | Clean, precise, action-oriented ("is now good for X?"); multilingual; privacy claim | Some features gated; marketing-heavy; broad scope may dilute the core |
| 3 | **Hindu Calendar 2026 – Panchang** (Play `com.hindustan.hinducalendar`) | App | Location-based Panchang, Rahu Kaal, Chaughadiya day & night, Hora, Kundali, 34 languages, offline, ad-free | Free (no ads) | Free, offline, no login, huge feature set | Very large download; "kitchen sink" scope; Choghadiya is one of many features |
| 4 | **Pocket Pandit** (Play `com.synchsoft.pocketpandit`) | App | **Live Choghadiya countdown timer**, colour-coded timeline, muhurat alarms, Rahu Kaal alerts, Swiss Ephemeris, iOS Live Activity (lock-screen timer) | Freemium | The live timer + lock-screen + alarms; on-device calculation; privacy | Feature-heavy for a "just show me the slots" need |
| 5 | **tithi.app** | Website | Panchang (Tithi/Nakshatra/Yoga/Karana), 16 Choghadiya periods anchored to local sunrise/sunset, global, free, no sign-up, "your coordinates stay on your device" | Free | Privacy-first, clean, global | **English-only** (explicitly) — no Hindi; read-only, no timer/alarms |
| 6 | **Shubh Panchang** (from shubhpanchang.com review) | App | Panchang + Muhurat emphasis, EN/Indic | Freemium | Clean, intuitive, muhurat-focused | Accuracy "generally reliable" per reviewer (weaker than Drik) |
| 7 | Web calculators: `gergeant.com`, `numroq.com`, `astroyatra.in`, `mydestinypath.in`, `bhaktiangan.com`, `devdarsha.com` etc. | Web | Location-aware day/night Choghadiya tables, some city-based | Free / ad/SEO | Instant, no install, good for one-off look-ups | Ad-heavy, SEO-farm quality varies, English-first, tables not "today" views |

**Competitive read.**
- **Accuracy is table stakes and is contested** — Drik Panchang and Swiss-Ephemeris apps (Pocket Pandit, Hindu Calendar) own the "authoritative" claim. We will *not* win on precision; we should match the mainstream convention (§9, risk R1) and be transparent.
- **The underexploited gap is a genuinely bilingual, privacy-first, no-frills, no-backend web tool** with a proper mobile "today" view. `tithi.app` is closest in spirit but is **English-only**; the current app is **Hindi-only**. **Instant EN↔HI toggle is a real differentiator in this niche.**
- **Live "current slot" highlighting and a countdown are the features users visibly value** (Pocket Pandit, the Oracular app, brief MVP item 6). Brief has highlighting; a countdown is a cheap, high-value later addition.

### Must-have vs differentiating

**Must-have (parity / correctness — without these the product is wrong or unusable):**
- Correct 7-slot sequence (see §5).
- Real local sunrise/sunset → dynamic, unequal slot lengths.
- Location via geolocation **and** manual city fallback (permission can be denied).
- Day + night slots with correct date-boundary semantics (night belongs to the day it started on).
- Bilingual EN/HI toggle, Hindi default.
- "Today" view + prev/next date navigation; highlight current slot.
- Responsive, mobile-first layout; works on GitHub Pages.

**Differentiating (nice-to-have, keep v1 lean but note for later):**
- Instant no-refresh language toggle (brief already requires) with the 7 names transliterated + Devanagari.
- Privacy-first, no-backend, no-account — explicitly stated in the UI.
- Current-slot highlight driven by the *viewed location's* clock (see R2).
- Later: live countdown to slot end; "next auspicious window" hint; shareable URL for a city/date; offline service worker (explicitly out of scope for v1).

---

## 3. Relevant regulations / compliance

Assessed 2026-10-14. Choghadiya handles **no health, payment, or identity data** — the brief's "no data stored or transmitted" posture removes most exposure.

- **India — Digital Personal Data Protection Act, 2023 (DPDP).** Geolocation is personal data. If it never leaves the device (our design), there is no "processing" by us, so no consent/notice machinery is triggered beyond the browser's own geolocation permission prompt. The **optional city search does send the typed text to a third-party geocoder**, so a **one-line disclosure** ("city search uses Open-Meteo / OpenStreetMap; location is not stored") is prudent. Verify exact wording with security before release.
- **EU/UK GDPR** (if EU users use it): precise geolocation is personal data; again, **not transmitted = not processed by us**. Keep it that way; if we later add analytics, that changes the analysis and needs a cookie/consent decision.
- **Geocoding third-party terms.** Open-Meteo geocoding free tier is **non-commercial, <10,000 calls/day, fair use** (open-meteo.com pricing/docs; github.com/open-meteo/geocoding-api). Nominatim's policy is strict (max 1 req/s, identifying Referer/User-Agent, no autocomplete, no bulk) — a public web tool with per-keystroke autocomplete would violate it, so **do not use Nominatim for type-ahead**; use it only for an explicit submit, or prefer Open-Meteo.
- **Attribution/data licences.** If Nominatim/OSM is used, OSM data is **ODbL** and requires attribution. Open-Meteo geocoding is built on the GeoNames database — check its attribution terms (GeoNames is CC-BY 4.0). A small "Geocoding: Open-Meteo / GeoNames" credit line covers it. **Action for architect/security: pin the attribution wording.**
- **Accessibility.** No single statute binds a personal web tool in India, but WCAG 2.2 AA is the sensible bar (public utility, mobile-first): colour must not be the *only* signal for auspicious/inauspicious (add text/icon), sufficient contrast, keyboard-operable toggle, semantic headings. (India's GIGW guidelines apply to government sites only — not us — but are a good reference.)
- **No app-store / payment / health-data rules apply.** No App Store, Play, RBI/payment, HIPAA, or medical-device regimes.

**Verdict:** no compliance blocker for v1. Two housekeeping items only: (a) a geocoding attribution + privacy line, (b) WCAG 2.2 AA basics baked into the design.

---

## 4. Technology landscape

| Need | Candidate | Maturity / version | Licence | Cost | Notes |
|------|-----------|--------------------|---------|------|-------|
| Sunrise/sunset | **`suncalc` (mourner/suncalc)** | **v2.1.1** (2026-10-05); v2.0 was a precision rewrite matching timeanddate.com & USNO | **BSD-2-Clause** | Free | ~3.5k★, ~0.45M weekly npm downloads, dependency-free, ESM + UMD/CDN build. `getTimes(date, lat, lng)` → `sunrise`, `sunset`, `solarNoon`, twilight phases. **Recommended.** |
| Sunrise/sunset (alt) | `solar-calculator`, `sun-position`, hand-rolled NOAA equations | Various | MIT/BSD | Free | Only needed if we must exactly match a specific panchang convention; adds risk. Not recommended for v1. |
| Geocoding (primary) | **Open-Meteo Geocoding API** | Live, v1 | Data: GeoNames (CC-BY 4.0) | Free, non-commercial, <10k/day | Keyless, CORS-friendly, **returns `timezone`**, multilingual (`language=` supports Hindi via translating results), `count`, `countryCode` filters. **Recommended primary.** |
| Geocoding (fallback) | **Nominatim (OSM)** | Live | ODbL data | Free, strict policy | Keyless; 1 req/s, identifying UA/Referer, no autocomplete/bulk. Use only on explicit submit. |
| Geocoding (other) | BigDataCloud client reverse-geocode, geocode.maps.co, LocationIQ/Geoapify/Mapbox/Google | Live | Mixed | Some free tiers w/ key | All require keys or have tighter limits; adds a secret to a static site. Keep as later options only. |
| Timezone rendering | **`Intl.DateTimeFormat` (`.resolvedOptions().timeZone`, `timeZone` option)** — native | Built into browsers | — | Free | Use the *location's* IANA tz (from Open-Meteo) to format slot times; device tz only when geolocation is used. |
| i18n | Plain JS dictionary + `data-i18n` attributes, or tiny libs (`i18next` client, `@lingui` runtime) | Native / mature | MIT | Free | For 2 languages and ~40 strings, a **hand-rolled dictionary + `data-i18n`** is simpler and avoids a build step. **Recommended.** |
| Hosting/CI | **GitHub Pages** | Live | — | Free | Static only; supports custom domain (brief target `time.gitick.com`). |
| Testing | `node --test` (built-in) or Vitest | Native / mature | MIT | Free | Pure calc functions (`assignSlots`, `buildSchedule`) are trivially unit-testable; snapshot the 7-weekday × 8-slot tables. |

**Version pinning (recommendation):** pin `suncalc@2.1.1`. If loaded via CDN, use a **versioned** URL (e.g. `https://cdn.jsdelivr.net/npm/suncalc@2.1.1/+esm`) or vendor the file locally; never a floating `latest`. Note the **v1→v2 breaking change** (units/conventions) — do not mix API versions in examples.

**Browser support / risks of the stack:** `Intl.DateTimeFormat` with `timeZone` and the Geolocation API are supported in all current evergreen browsers. `suncalc` v2 ships ESM; keep a UMD fallback only if legacy support is required (not needed for a modern mobile-first tool).

---

## 5. Choghadiya algorithm — pinned (source of truth)

The brief flags that the current hardcoded 7×8 grid "is a simplified and possibly inaccurate sequence and is NOT the source of truth." **Research result: the current grid's sequence is actually the standard one.** The real problem is the *fixed times*, not the names. Nonetheless, this section is the authoritative reference the PRD/architecture must use.

### 5.1 The 7 types and their planets (fixed cycle order)

Cycle order (never changes): **Udveg (Sun) → Char (Venus) → Labh (Mercury) → Amrit (Moon) → Kaal (Saturn) → Shubh (Jupiter) → Rog (Mars)** → repeat.

This is the classical **Chaldean/hora planetary order** (Sun, Venus, Mercury, Moon, Saturn, Jupiter, Mars) — which is also the order behind the seven-day week.

| Index | Name (EN) | Hindi | Planet | Quality | Traditional use |
|-------|-----------|-------|--------|---------|-----------------|
| 0 | Udveg | उद्वेग | Sun | Inauspicious | anxiety; only government work |
| 1 | Char (also "Chal") | चर | Venus | Neutral | travel, movement, routine |
| 2 | Labh | लाभ | Mercury | Auspicious | business, trade, finance, learning |
| 3 | Amrit | अमृत | Moon | Most auspicious | anything, esp. travel/business |
| 4 | Kaal | काल | Saturn | Inauspicious | loss/delay; avoid new starts |
| 5 | Shubh | शुभ | Jupiter | Auspicious | ceremonies, weddings, religious |
| 6 | Rog | रोग | Mars | Inauspicious | conflict/illness; avoid |

> Naming note: **"Char" (चर) vs "Chal" (ચલ)** — Gujarat/Marathi sources say "Chal", North-Indian/Hindi usage says "Char". The brief uses **"Char"**. Keep "Char" as the EN key and localise (HI: चर). Confirm with the client if Gujarati is ever added.

### 5.2 Day sequence (sunrise → sunset, 8 equal parts)

The first daytime slot is the one ruled by the weekday's own planet:

| Weekday | Ruler | 1st day slot (index) |
|---------|-------|----------------------|
| Sunday | Sun | Udveg (0) |
| Monday | Moon | Amrit (3) |
| Tuesday | Mars | Rog (6) |
| Wednesday | Mercury | Labh (2) |
| Thursday | Jupiter | Shubh (5) |
| Friday | Venus | Char (1) |
| Saturday | Saturn | Kaal (4) |

Then step **+1** through the cycle for each subsequent slot. Formula:

```
daySlot(i) = cycle[(dayStart[weekday] + i) % 7]   // i = 0..7
```

Full day table (verified, e.g. Monday = Amrit, Kaal, Shubh, Rog, Udveg, Char, Labh, Amrit):

| Day | Day slots (1→8) |
|-----|-----------------|
| Sunday | Udveg, Char, Labh, Amrit, Kaal, Shubh, Rog, Udveg |
| Monday | Amrit, Kaal, Shubh, Rog, Udveg, Char, Labh, Amrit |
| Tuesday | Rog, Udveg, Char, Labh, Amrit, Kaal, Shubh, Rog |
| Wednesday | Labh, Amrit, Kaal, Shubh, Rog, Udveg, Char, Labh |
| Thursday | Shubh, Rog, Udveg, Char, Labh, Amrit, Kaal, Shubh |
| Friday | Char, Labh, Amrit, Kaal, Shubh, Rog, Udveg, Char |
| Saturday | Kaal, Shubh, Rog, Udveg, Char, Labh, Amrit, Kaal |

Note the **8th slot repeats the 1st** (8 slots over a 7-name cycle).

### 5.3 Night sequence (sunset → next sunrise, 8 equal parts)

The night set runs the **same cycle** but each step advances **+5** positions (equivalently, retreats 2), and the first night slot is **5 steps on from the day's start**. Formula:

```
nightStart      = (dayStart[weekday] + 5) % 7
nightSlot(i)    = cycle[(dayStart[weekday] + 5 * (i + 1)) % 7]   // i = 0..7
```

Full night table (verified):

| Day | Night slots (1→8) |
|-----|-------------------|
| Sunday | Shubh, Amrit, Char, Rog, Kaal, Labh, Udveg, Shubh |
| Monday | Char, Rog, Kaal, Labh, Udveg, Shubh, Amrit, Char |
| Tuesday | Kaal, Labh, Udveg, Shubh, Amrit, Char, Rog, Kaal |
| Wednesday | Udveg, Shubh, Amrit, Char, Rog, Kaal, Labh, Udveg |
| Thursday | Amrit, Char, Rog, Kaal, Labh, Udveg, Shubh, Amrit |
| Friday | Rog, Kaal, Labh, Udveg, Shubh, Amrit, Char, Rog |
| Saturday | Labh, Udveg, Shubh, Amrit, Char, Rog, Kaal, Labh |

**Date-boundary rule (important for the "today" view and current-slot highlight):** the night set belongs to the day it **started** on. A slot at 02:00 on Thursday belongs to **Wednesday night**, not Thursday. So the 24-hour Vedic day runs **sunrise → next sunrise**, and the weekday that drives both halves is the weekday **of the sunrise** that begins the day.

### 5.4 Time formula

```
sunrise   = suncalc.getTimes(date, lat, lng).sunrise   // Date (UTC-based)
sunset    = suncalc.getTimes(date, lat, lng).sunset
dayLen    = sunset - sunrise
nightLen  = nextSunrise - sunset        // nextSunrise = sunrise for date + 1 day
slotStart(i) = base + i * len / 8       // base = sunrise (day) or sunset (night)
```

### 5.5 Cross-check against primary sources

The pinned sequence was reconciled across **five independent sources** (all agree; accessed 2026-10-14):
- kaalpanchang.com/panchang-concepts/day-and-night-choghadiya — fixed cycle + weekday start.
- myastrology.in/blog/choghadiya-calculation-math-cycle-en — hora sequence (Sun→Venus→Mercury→Moon→Saturn→Jupiter→Mars); night = "sixth in hora-order from the day's first".
- progujarati.com/guides/choghadiya-explained.html — full weekday table incl. "night steps five places along the cycle".
- bhaktiangan.com/choghadiya/maharashtra — complete day **and** night order tables for all 7 weekdays.
- dekhopanchang.com/en/learn/choghadiya — weekday-lord rule + quality tiers.

**Also verified against the live incumbent** `time.gitick.com`: its hardcoded grid reproduces exactly these day and night sequences for all seven weekdays. **One low-quality source** (`choghadiyatoday.com/how-to-calculate-choghadiya`) publishes a **wrong** day-start mapping (Monday→Char, Wednesday→Amrit, etc.) that contradicts everyone else — treat it as unreliable and do not cite it. This is a good illustration of why the sequence must be **unit-tested**, not trusted from a single blog.

---

## 6. Key risks & unknowns

| ID | Risk | Likelihood | Impact | Mitigation / owner |
|----|------|-----------|--------|--------------------|
| **R1** | **Sunrise convention mismatch.** Different panchangs use upper-limb vs middle-limb sunrise (±1–4 min), vary refraction, and may/may not correct for elevation. Our times may differ by a minute or two from a user's printed panchang. | High (will happen) | Low–Med | `suncalc`'s default (`−0.833°)` = **upper-limb + refraction = the mainstream Indian convention** (matches Drik Panchang's default). State the convention in the UI/docs; accept ±1–2 min. Owner: architect; note in PRD. |
| **R2** | **Timezone rendering.** If a user searches "London" from India, slot times must be shown in **London's** clock (Europe/London), not the device's. Rendering in device tz would be wrong. | Med | High | For manual search, use the `timezone` returned by Open-Meteo with `Intl.DateTimeFormat(..., {timeZone})`. Device tz only for geolocation. Owner: architect/frontend. |
| **R3** | **Polar / extreme latitudes.** Above ~66.5°, on some dates `suncalc` returns no sunrise/sunset (`Invalid Date`/`null`), so day or night length is undefined. | Low (niche users) | Med | Detect invalid times and show a clear "No sunrise/sunset at this location/date — Choghadiya not defined" message; never render `NaN`. Owner: frontend + QA. |
| **R4** | **Geolocation denied / unavailable.** Permission prompt declined, or insecure context. | High | Med | Always offer the manual city fallback (brief already requires it); never block on geolocation. Handle errors/`PERMISSION_DENIED`. Owner: frontend. |
| **R5** | **Geocoder limits/outage.** Open-Meteo fair use <10k/day; Nominatim 1 req/s; network failure. | Med | Med | Debounce (no per-keystroke calls), cache last successful result, graceful error, prefer Open-Meteo over Nominatim. Owner: architect/frontend. |
| **R6** | **DST correctness** for cities in DST zones (e.g. London/New York). `suncalc` returns the correct instant; display must apply the location's tz incl. DST — `Intl` handles this if we use IANA names. | Med | Med | Rely on IANA `timeZone`, not fixed UTC offsets. QA test a DST-transition date. Owner: frontend/QA. |
| **R7** | **GitHub Pages caching / no build step.** Stale JS/CSS after deploy; `index.html+style.css+app.js` must be cache-busted or versioned. | Med | Low | Add cache-busting query/hashes; keep it simple (brief prefers no build step). Owner: devops. |
| **R8** | **Sequence regressions.** A wrong table silently ships (see the bad source in §5.5). | Low | High | **Unit-test all 7 weekdays × day+night** against the §5 tables. Owner: backend/QA (pure-fn tests). |
| **R9** | **Accessibility.** Colour-only coding of auspicious/inauspicious. | Med | Med | Text label + icon + colour; WCAG 2.2 AA contrast. Owner: UX. |
| **R10** | **Data-source attribution.** OSM/ODbL and GeoNames/CC-BY attribution requirements if we ship geocoding. | Low | Low | Add a credit line + privacy note. Owner: tech-writer/security. |

**Unknowns to resolve (non-blocking, engineering decisions):**
- Exact Hindi labels for all 7 names + UI strings (should include both Devanagari name and familiar transliteration). — product/UX.
- Whether the day used for a slot is determined by **local** weekday at the location or by the device's — **must be the location's local date/weekday** (ties to R2). Confirm in PRD.
- Favicon/emoji brand mark (current app uses a stray "🐴"); brand asset not in scope for research.

---

## 7. Geocoding — detailed read

**Recommended primary: Open-Meteo Geocoding API** (open-meteo.com/en/docs/geocoding-api, accessed 2026-10-14)
- Endpoint: `https://geocoding-api.open-meteo.com/v1/search?name=<query>&count=<n>&language=<lang>`
- Keyless; CORS-friendly (usable directly from the browser).
- Returns per result: `latitude`, `longitude`, `elevation`, **`timezone` (IANA)**, `country`, `admin1`, `population`, `feature_code`.
- `name` supports `"City, Country"`; supports `countryCode` filter; `language` localises names.
- **Licence/terms:** free for **non-commercial** use, **<10,000 calls/day** fair use; contact for commercial. Data from **GeoNames** (CC-BY 4.0) — attribution required. Phrase from GitHub README: "…free for open-source developer and non-commercial use. We do not restrict access, but ask for fair use. If your application exceeds 10'000 requests per day, please contact us."
- **Why primary:** returns the timezone (solves R2), no key (static-site friendly), permissive CORS, multilingual result names.

**Fallback: Nominatim (OpenStreetMap)** (operations.osmfoundation.org/policies/nominatim, accessed 2026-10-14)
- Endpoint: `https://nominatim.openstreetmap.org/search?q=<query>&format=json`.
- Keyless but **strict**: absolute max **1 request/second**, **valid HTTP Referer or User-Agent identifying the app** (stock library UAs rejected), **no autocomplete**, **no bulk geocoding**, runs on donated hardware.
- Does **not** return an IANA timezone in the same convenient way → we'd need a second call or a bundled tz lookup. Another reason to prefer Open-Meteo.
- Data licence **ODbL** → attribution required.

**Design implication:** debounce the input and call on explicit submit (or a 400 ms+ debounce), cache the last query result, and **never wire Nominatim to type-ahead**.

---

## 8. Compliance, privacy & accessibility checklist for v1

- [ ] Location never leaves the device for the core calculation (geolocation → suncalc, client-side only).
- [ ] City search sends only the **typed query** to the geocoder — disclose this in one line in the UI or footer.
- [ ] Geocoder attribution ("Geocoding by Open-Meteo / GeoNames") + OSM attribution if Nominatim used.
- [ ] No analytics/PII in v1 (if added later, revisit consent).
- [ ] WCAG 2.2 AA: not colour-only, sufficient contrast, keyboard-operable toggle, semantic markup, responsive.
- [ ] `lang` attribute / dynamic `lang` switch on the `<html>` element for screen readers.

---

## 9. Recommendations

1. **Adopt the pinned algorithm in §5 as the single source of truth.** Put the two lookup tables + the `nightSlot(i) = cycle[(dayStart+5*(i+1))%7]` formula in the code and cover all 7 weekdays with unit tests (R8).
2. **Use `suncalc@2.1.1`, pinned**, ESM import (or vendored UMD). Rely on its default sunrise/sunset convention (upper-limb + refraction), which matches mainstream Indian panchang (R1); document the convention.
3. **Geocoding: Open-Meteo Geocoding API as primary, Nominatim only as an explicit-submit fallback.** Never use Nominatim for autocomplete (R5).
4. **Handle timezone explicitly** (R2/R6): format slot times with `Intl.DateTimeFormat` using the **location's** IANA timezone; determine the weekday from the location's local date.
5. **Handle graceful degradations:** geolocation denied → city input; invalid sunrise/sunset (polar) → clear message; geocode failure → retry/manual. Never render `NaN`/`Invalid Date` (R3/R4/R5).
6. **i18n as a plain dictionary + `data-i18n` attributes** (no framework); Hindi default, instant toggle; include the 7 names in both scripts.
7. **Keep the brief's architecture** (index.html + style.css + app.js + i18n dict, no backend, GitHub Pages). No architectural change is warranted by this research.
8. **Add a small "about/privacy + attribution" line** and WCAG 2.2 AA basics; these are cheap and remove the only compliance items.
9. **Nice-to-have (later):** live countdown to the end of the current slot and a "next auspicious slot" hint — high user value (competitors lead with it), low cost, but **out of v1 scope** per the brief.

---

## 10. Sources (all accessed 2026-10-14)

**Algorithm**
- Kaal Panchang — Day and Night Choghadiya — https://kaalpanchang.com/panchang-concepts/day-and-night-choghadiya
- MyAstrology — Mathematical Cycle of Choghadiya — https://myastrology.in/blog/choghadiya-calculation-math-cycle-en
- Pro Gujarat — Choghadiya Explained — https://progujarati.com/guides/choghadiya-explained.html
- Bhakti Angan — Choghadiya (Maharashtra) full day/night tables — https://bhaktiangan.com/choghadiya/maharashtra/
- Dekho Panchang — Choghadiya Guide — https://dekhopanchang.com/en/learn/choghadiya
- (Unreliable — do not cite) https://www.choghadiyatoday.com/how-to-calculate-choghadiya

**Incumbent product**
- Live app being refactored — https://time.gitick.com/ (title "चौघड़िया"; Hindi-only; static 06:00–06:00, 90-min slots; sequence verified standard)

**Competitors**
- Drik Panchang Choghadiya (Google Play) — https://play.google.com/store/apps/details?hl=en_US&id=com.drikpanchang.choghadiya
- Choghadiya & Muhurat 2026 (App Store) — https://apps.apple.com/in/app/choghadiya-muhurat-2026/id6757258774
- Choghadiya & Muhurat 2026 (Google Play) — https://play.google.com/store/apps/details?hl=en_GB&id=com.myoracular.chogadiya.app
- Hindu Calendar 2026 – Panchang (Google Play) — https://play.google.com/store/apps/details?hl=en_IN&id=com.hindustan.hinducalendar
- Pocket Pandit (Google Play) — https://play.google.com/store/apps/details?hl=en_US&id=com.synchsoft.pocketpandit
- tithi.app — https://tithi.app/
- Shubh Panchang — Top 5 Panchang Apps review — https://shubhpanchang.com/blog/top-5-panchang-apps-in-india-a-users-honest-review

**Technology**
- suncalc (GitHub) — https://github.com/mourner/suncalc · npm (v2.1.1) — https://www.npmjs.com/package/suncalc · Releases — https://github.com/mourner/suncalc/releases
- Open-Meteo Geocoding API docs — https://open-meteo.com/en/docs/geocoding-api · repo/terms — https://github.com/open-meteo/geocoding-api
- Nominatim usage policy — https://operations.osmfoundation.org/policies/nominatim/
- MDN — Intl.DateTimeFormat — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat

**Sunrise convention**
- Drik Panchang — Sunrise/sunset timings used in Panchang — https://www.drikpanchang.com/panchang/sunrise/panchang-sunrise.html
- VedicSpace — sunrise definitions compared — https://vedicspace.com/learn/why-two-panchangs-disagree-about-todays-tithi
- Dekho Panchang — calculation accuracy (upper limb, −0.8333°) — https://dekhopanchang.com/en/accuracy
- Kaal Panchang — How Sunrise Is Calculated — https://kaalpanchang.com/panchang-concepts/how-sunrise-is-calculated

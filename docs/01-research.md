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

> **v2.3.0 addendum (added 2026-10-14):** **§11** pins the definitions and the exact
> per-weekday calculation for **Vaar Vela / Kaal Vela / Kaal Ratri** (v2.3.0
> change-request item 5), with a live Drik Panchang cross-check for Mumbai 2026-10-14
> and all 7 weekdays verified to ±2 min. Headline: these three are **not** Yamagandam /
> Gulika Kaal / night Rahu Kaal — that assumption in the ticket is wrong for 6 of the 7
> weekdays. Read §11.0 before implementing.

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

---

## 11. v2.3.0 addendum — inauspicious periods (Vaar Vela / Kaal Vela / Kaal Ratri)

Added 2026-10-14 for v2.3.0 change-request item 5 (`docs/00-brief.md` change log).
All URLs accessed **2026-10-14**. Research only — no product code.

### 11.0 Headline: the card's parenthetical mapping is wrong

Card t_f4a46203 asked for the three periods as **"Vaar Vela (Yamagandam) / Kaal Vela
(Gulika Kaal) / Kaal Ratri (night Rahu Kaal)"**. Research says that equation is **not
supported by any source found**, and is wrong for **6 of 7 weekdays**.

| Period | What the card assumed | What it actually is | Authority |
|--------|----------------------|---------------------|-----------|
| **Vaar Vela** | = Yamagandam | a *fixed weekday-specific eighth of the day* — **≠ Yamaganda** on all days except Saturday | Shuddhidipika (Shrinivasa) 4.45–46 |
| **Kaal Vela** | = Gulika Kaal | the day's **"Kaal" (Saturn) Choghadiya** — **≠ Gulika** on all days | Shuddhidipika; Drik Panchang |
| **Kaal Ratri** | = night Rahu Kaal | the night's **"Labh" (Mercury) Choghadiya** — Rahu Kalam is a *daytime-only* rule in these sources | Shuddhidipika; Drik Panchang |

Evidence for the non-equivalence (Mumbai, week of 2026-10-12, "eighth of the day"
counted 1..8 from sunrise):

| Weekday | Vaar Vela | Yamaganda | Kaal Vela | Gulika | same? |
|---------|-----------|-----------|-----------|--------|-------|
| Sunday | 4th | 5th | 5th | 7th | no |
| Monday | 7th | 4th | 2nd | 6th | no |
| Tuesday | 2nd | 3rd | 6th | 5th | no |
| Wednesday | 5th | 2nd | 3rd | 4th | no |
| Thursday | 8th | 1st | 7th | 3rd | no |
| Friday | 3rd | 7th | 4th | 2nd | no |
| Saturday | 6th | **6th** | 1st + 8th | 1st | only Sat for Vaar Vela |

Two practical consequences worth the CTO's attention:

1. **Wednesday Vaar Vela == Wednesday Rahu Kalam** (both the 5th eighth) and
   **Saturday Vaar Vela == Saturday Yamaganda** (both the 6th eighth). Every other
   day they are three different windows. Shipping the card's mapping as written would
   make the app disagree with Drik Panchang — the project's own comparison bar — on
   6/7 weekdays.
2. **Rahu Kalam (day) is a fourth, separate period.** Item 6's contextual note
   ("Rahu Kaal overlaps this otherwise-good choghadiya") needs *Rahu Kalam*, which is
   **not** one of the three periods in this card. §11.6 gives its table so the decision
   is implementable either way. **Routing note for CTO:** decide whether Rahu Kalam
   ships alongside the three named periods (recommended — it is the period users
   actually search for, and item 6 quotes it).

### 11.1 What each period is, authority, and what it is believed to affect

Drik Panchang states the shared belief, verbatim:

> "It is believed that no auspicious work should be done during Vaar Vela, Kaal Vela
> and Kaal Ratri. Vaar Vela and Kaal Vela prevail during daytime while Kaal Ratri
> prevails during night time. It is believed that all Manglik works done during these
> timings are not fruitful."
> — https://www.drikpanchang.com/muhurat/choghadiya.html?geoname-id=1275339&date=14/10/2026

> "It is quite possible that auspicious Choghadiya might overlaps with Vara Vela, Kala
> Vela and Kala Ratri. While selecting Choghadiya Muhurta, the adverse time of Vara
> Vela, Kala Vela and Kala Ratri should be rejected."
> — same page ("What if auspicious Choghadiya overlaps with Vara, Kala and Ratri Vela?")

| Period | Hindi | What it is | Traditional attribution | Affects |
|--------|-------|-----------|------------------------|---------|
| **Vaar Vela** | वार वेला | A weekday-specific **eighth of the daylight** ("vaar" = weekday), i.e. the "weekday's flawed time" | `Shuddhidipika` (Shrinivasa), ch. 4 *Varadi nirnaya*, vv. 45–46 — cited via Mokshology (§11.8) | Beginnings of auspicious/manglik work; it **cancels an otherwise-good Choghadiya** it overlaps |
| **Kaal Vela** | काल वेला | The day's **"Kaal"** Choghadiya — Saturn's eighth — named separately as a "death-time" marker | Same Shuddhidipika passage; Drik Panchang labels it on the table | Same as Vaar Vela; Drik/bharatarticles treat it as the *more* adverse of the two day windows |
| **Kaal Ratri** | काल रात्रि | The night's **"Labh"** Choghadiya — a *benefic* name over an *inauspicious* marker, which is why almanacs warn that "Labh at night" is a trap | Same Shuddhidipika passage; Drik Panchang labels it on the night table | Same as Vaar Vela, but at night; explicitly overrides the good reading of the Labh slot |

Secondary corroboration of the belief/no-auspicious-work reading:
bharatarticles ("Vara Vela – Prevalent during the day. Kaal Vela – Also prevalent during
the day but considered more adverse. Kaal Ratri – Prevalent during the night and
considered highly inauspicious."), mpanchang §3–4, astroved, astroica, prokerala
("Amrit, shubh, labh and char are good choghadiya **(except when overlapped by vaar
vela, kaal vela or kaal ratri)**").

**Authority split.** The Vaar Vela / Kaal Vela / Kaal Ratri triad is *not* the
Rahu/Yamaganda/Gulika (trikalam) family: it comes from the **Shuddhidipika**, and Drik
Panchang publishes it as part of its **Choghadiya table**. The Rahu Kalam / Yamaganda /
Gulika family comes from **Brihat Parashara Hora Shastra** 3.66–69 (the day's eight
parts given in turn to the weekday lords; *Saturn's part is Gulika, Jupiter's is
Yamaghantaka*) plus later practice for Rahu. **They are two different systems**, and
Drik publishes both — the triad on the Choghadiya page, the trikalam on the Panchang
page.

### 11.2 The exact calculation (anchored to sunrise/sunset instants only)

**No fixed clock times anywhere.** Both anchors are the location's own solar instants:

```
sunrise       = suncalc.getTimes(date, lat, lng).sunrise            // instant
sunset        = suncalc.getTimes(date, lat, lng).sunset             // instant
nextSunrise   = suncalc.getTimes(date + 1 day, lat, lng).sunrise    // instant
D = dayLength   = sunset      - sunrise      // ms
N = nightLength = nextSunrise - sunset       // ms

// eighth j (1..8) of the DAY, fractions of D:
//   start = sunrise + (j-1)/8 * D      end = sunrise + j/8 * D
// eighth j (1..8) of the NIGHT, fractions of N:
//   start = sunset  + (j-1)/8 * N      end = sunset  + j/8  * N
```

**Vaar Vela — fixed day eighth (hard table; cannot be derived from the schedule):**

| Weekday | day eighth | start | end |
|---------|-----------|-------|-----|
| Sunday | 4th | sunrise + (3/8)·D | sunrise + (4/8)·D |
| Monday | 7th | sunrise + (6/8)·D | sunrise + (7/8)·D |
| Tuesday | 2nd | sunrise + (1/8)·D | sunrise + (2/8)·D |
| Wednesday | 5th | sunrise + (4/8)·D | sunrise + (5/8)·D |
| Thursday | 8th | sunrise + (7/8)·D | sunrise + (8/8)·D |
| Friday | 3rd | sunrise + (2/8)·D | sunrise + (3/8)·D |
| Saturday | 6th | sunrise + (5/8)·D | sunrise + (6/8)·D |

Source of the index table, verbatim (Kundli Milan Jyotish, Gujarati):

> "વાર વેળા — દિવસનો એક નક્કી ભાગ: રવિવારે ચોથો, સોમવારે સાતમો, મંગળવારે બીજો,
> બુધવારે પાંચમો, ગુરુવારે આઠમો, શુક્રવારે ત્રીજો અને શનિવારે છઠ્ઠો."
> ("Vaar Vela — one fixed part of the day: Sunday the 4th, Monday the 7th, Tuesday the
> 2nd, Wednesday the 5th, Thursday the 8th, Friday the 3rd, Saturday the 6th.")

**Kaal Vela — the day's "Kaal" Choghadiya (derivable, no extra table needed):**

`k = every index where daySequence(weekday)[k] === 'kaal'`; the period is the day's
`k`-th eighth.

| Weekday | day "Kaal" slot | start | end |
|---------|----------------|-------|-----|
| Sunday | 5th | sunrise + (4/8)·D | sunrise + (5/8)·D |
| Monday | 2nd | sunrise + (1/8)·D | sunrise + (2/8)·D |
| Tuesday | 6th | sunrise + (5/8)·D | sunrise + (6/8)·D |
| Wednesday | 3rd | sunrise + (2/8)·D | sunrise + (3/8)·D |
| Thursday | 7th | sunrise + (6/8)·D | sunrise + (7/8)·D |
| Friday | 4th | sunrise + (3/8)·D | sunrise + (4/8)·D |
| Saturday | **1st and 8th** | sunrise + 0·D **and** sunrise + (7/8)·D | sunrise + (1/8)·D **and** sunrise + (8/8)·D |

**Kaal Ratri — the night's "Labh" Choghadiya (derivable, no extra table needed):**

`r = every index where nightSequence(weekday)[r] === 'labh'`; the period is the night's
`r`-th eighth.

| Weekday | night "Labh" slot | start | end |
|---------|------------------|-------|-----|
| Sunday | 6th | sunset + (5/8)·N | sunset + (6/8)·N |
| Monday | 4th | sunset + (3/8)·N | sunset + (4/8)·N |
| Tuesday | 2nd | sunset + (1/8)·N | sunset + (2/8)·N |
| Wednesday | 7th | sunset + (6/8)·N | sunset + (7/8)·N |
| Thursday | 5th | sunset + (4/8)·N | sunset + (5/8)·N |
| Friday | 3rd | sunset + (2/8)·N | sunset + (3/8)·N |
| Saturday | **1st and 8th** | sunset + 0·N **and** sunset + (7/8)·N | sunset + (1/8)·N **and** sunset + (8/8)·N |

Rule statements, verbatim (Kundli Milan Jyotish, Gujarati):

> "કાળ વેળા — દિવસનું દરેક 'કાળ' ચોઘડિયું. શનિવારે તે દિવસનું પહેલું અને આઠમું,
> બંને હોય છે." ("Kaal Vela — every 'Kaal' Choghadiya of the day. On Saturday it is
> both the first and the eighth of the day.")
> "કાળ રાત્રિ — રાત્રિનું દરેક 'લાભ' ચોઘડિયું. રાત્રિમાં લાભ નામથી શુભ લાગે, પણ પરંપરા
> આ ભાગને કાળ રાત્રિ માનીને નવી શુભ શરૂઆત ટાળે છે." ("Kaal Ratri — every 'Labh'
> Choghadiya of the night. At night Labh sounds auspicious by name, but tradition
> treats this part as Kaal Ratri and avoids new auspicious beginnings in it.")

Mokshology independently states the same rule and its textual basis:

> "The Shuddhidipika names three more eighths by the weekday: the Vaar Vela and the
> Kaal Vela in the daylight and the Kaal Ratri in the night… The Kaal Vela always
> falls on the day's Kaal, but the Kaal Ratri falls on the night's Labh."
> "Shuddhidipika (Shrinivasa), chapter 4 (Varadi nirnaya), verses 45–46. For each
> weekday, the eighths of the day and the night named Vaar Vela, Kaal Vela and Kaal
> Ratri."

**Which Choghadiya slot each marker lands on** (useful for the "overlap" UI of item 6):

| Weekday | Vaar Vela on | Kaal Vela on | Kaal Ratri on |
|---------|--------------|--------------|----------------|
| Sunday | Amrit | Kaal | Labh |
| Monday | Labh | Kaal | Labh |
| Tuesday | Udveg | Kaal | Labh |
| Wednesday | Rog | Kaal | Labh |
| Thursday | Shubh | Kaal | Labh |
| Friday | Amrit | Kaal | Labh |
| Saturday | Labh | Kaal (×2) | Labh (×2) |

Recommended implementation shape (mirrors the existing engine, no new magic table for
two of the three):

```js
const VAAR_VELA_DAY_EIGHTH = { 0:3, 1:6, 2:1, 3:4, 4:7, 5:2, 6:5 }; // 0=Sunday, 0-based
// Kaal Vela / Kaal Ratri need NO table:
daySlots(weekday).flatMap((s, k)   => s.name === 'kaal' ? [k] : [])  // day eighths
nightSlots(weekday).flatMap((s, r) => s.name === 'labh' ? [r] : [])  // night eighths
// periods may legitimately be an ARRAY (Saturday has two of each).
```

Note `docs/04-architecture.md` §4.2 keeps the night half attached to its start date, so
`nightSlots(weekday)` here is already the correct (Wednesday-started) night list.

### 11.3 Which night Kaal Ratri belongs to, and Vedic-day consistency

**Answer: the night that starts at the selected civil date's sunset** — i.e. for civil
date `D`, Kaal Ratri is an eighth of `sunset(D) → sunrise(D+1)`, and therefore its
*clock* time may fall **after midnight on `D+1`**.

Live proof (Drik, Mumbai, Wednesday 2026-10-14): Wednesday's night Choghadiya runs
`18:16 → 06:32 (Oct 15)` and Wednesday's **Kaal Ratri is 03:28–05:00 on Oct 15** —
before Thursday's sunrise, so still "Wednesday's Kaal Ratri".

This is exactly the app's sunrise-anchored Vedic day, so the addition is **fully
consistent with `docs/04-architecture.md` §4.2 and ADR-005**:

- ADR-005 §3: "the night half is attributed to `date` even where it extends past
  midnight; the weekday driving both sequences is the weekday of `date` at the
  location." → Kaal Ratri uses `nightSequence(weekday(date))`, and its `Labh` index is
  Sunday..Saturday as tabulated above. No new date logic is required.
- Corroborated by Kundli Milan Jyotish: *"The weekday changes at sunrise, so after
  midnight, until sunrise, the previous weekday's night Choghadiya runs."*
- For a "today" view on civil date `D`, the displayed Kaal Ratri may therefore be a
  `D+1` early-morning window (and, symmetrically, `D`'s early-morning hours belong to
  `D-1`'s Kaal Ratri). The row should be labelled with the date, exactly as the night
  rows already are.
- Only Saturday can contain **two** of a given period: Saturday's night `Labh` is both
  the 1st and the 8th night slot (two Kaal Ratris), and Saturday's day `Kaal` is both
  the 1st and the 8th day slot (two Kaal Velas). Vaar Vela always occurs exactly once.
  The UI must tolerate a *list* of periods, not a single interval.

### 11.4 Polar / undefined-sun handling (recommendation)

Mirror the existing degradation in `docs/04-architecture.md` §5 (`defined:false,
reason:"solar-undefined"`), per period rather than only per schedule:

1. **Vaar Vela and Kaal Vela require only `sunrise` and `sunset`.** If either is
   `null`/`Invalid Date` (polar day or polar night at the location/date), mark both
   `defined:false, reason:'solar-undefined'` and render the existing bilingual
   not-defined copy for those two rows — **never** compute from a substitute or a
   device-local clock.
2. **Kaal Ratri requires `sunset` and `nextSunrise`.** It can therefore be *defined*
   when the day half is not (and vice versa) — e.g. a polar-day date with no sunset has
   no Kaal Ratri, while a date with a sunset but no next sunrise must not silently use
   `NaN`. Evaluate the two anchors independently and expose one flag per period.
3. Do not throw. Guard with the same `assertRenderable()` idea: no `NaN`,
   `Invalid Date`, `undefined`, or empty row may reach the DOM (US-9 AC2).
4. Recommended data shape (drop-in for the existing `Schedule`):

```js
inauspicious: {
  vaarVela:  { periods: [{ start, end }], defined: true,  reason: null },
  kaalVela:  { periods: [{ start, end }], defined: true,  reason: null },
  kaalRatri: { periods: [{ start, end }], defined: false, reason: 'solar-undefined' }
}
```
   (`periods` is an array because Saturday legitimately yields two.)
5. When `Schedule.defined === false` (the whole day is undefined), all three must also
   be `defined:false` — keep that implication and unit-test it.

### 11.5 Cross-check against live panchang — Mumbai, 2026-10-14 (Wednesday)

Sunrise/sunset used by each source (they differ slightly — see the disagreement note):

- **Drik Panchang** (comparison bar): sunrise **06:32**, sunset **18:16**, `Dinamana`
  11 h 44 m 14 s, `Ratrimana` 12 h 16 m 03 s.
- Prokerala: sunrise 06:36, sunset 18:12 (a ~4 min later sunrise convention).

| Period | Formula applied (D = 11 h 44 m) | Computed | **Drik Panchang (live)** | Δ | Prokerala (live) |
|--------|--------------------------------|----------|--------------------------|---|------------------|
| **Vaar Vela** | sunrise + 4/8·D → 5/8·D | 12:24–13:52 | **12:24 PM – 01:52 PM** | 0 min | 12:24 – 13:51 |
| **Kaal Vela** | sunrise + 2/8·D → 3/8·D | 09:28–10:56 | **09:28 AM – 10:56 AM** | 0 min | 09:30 – 10:57 |
| **Kaal Ratri** | sunset + 6/8·N → 7/8·N (N = 12 h 16 m) | 03:28–05:00 (Oct 15) | **03:28 AM – 05:00 AM, Oct 15** | 0 min | 03:30 – 05:03 |

Both live sources place the three markers on the same Choghadiya slots
(Day: `Labh, Amrit, **Kaal→Kaal Vela**, Shubh, **Rog→Vaar Vela**, Udveg, Char, Labh`;
Night: `…, **Labh→Kaal Ratri**, Udveg`). ✅ Well inside the project's ±2 min bar.

**Full-week verification (all 7 weekdays).** I recomputed all three periods for Mumbai
for 2026-10-12 … 2026-10-18 from sunrise/sunset/next-sunrise and compared against the
values Drik Panchang published on those seven pages:

```
Vaar Vela  : Sun/Mon/Tue/Wed/Thu/Fri/Sat — 7/7 OK (within ±2 min)
Kaal Vela  : 8 intervals (Sat has two)   — 8/8 OK
Kaal Ratri : 8 intervals (Sat has two)   — 8/8 OK
total 23 checks, 0 mismatches
```

Worst observed delta was 1 minute (rounding of the printed clock times); e.g. Tuesday
Kaal Vela computed `13:52–15:20` vs Drik `01:53 PM–03:21 PM`, and Friday Kaal Ratri
computed `21:19–22:51` vs Drik `21:19–22:52`. Saturday confirmed the double occurrence:
Drik printed `Kaal Vela` at both `06:33–08:01` and `16:47–18:14`, and `Kaal Ratri` at
both `18:14–19:47` and `05:01–06:33 (Oct 18)`.

### 11.6 The other, separate triad — Rahu Kalam / Yamaganda / Gulika (for the CTO's call)

These are the periods the card's parenthetical names refer to. They are **not** the
three requested periods, but item 6 explicitly quotes "Rahu Kaal", so they are recorded
here as implementable in case the CTO decides to ship them too (recommended for Rahu
Kalam at least).

Rule: daylight `sunrise → sunset` divided into **8 equal parts**; one fixed eighth per
period per weekday (table shared by every source checked):

| Weekday | Rahu Kalam | Yamaganda | Gulika |
|---------|-----------|-----------|--------|
| Sunday | 8th | 5th | 7th |
| Monday | 2nd | 4th | 6th |
| Tuesday | 7th | 3rd | 5th |
| Wednesday | 5th | 2nd | 4th |
| Thursday | 6th | 1st | 3rd |
| Friday | 4th | 7th | 2nd |
| Saturday | 3rd | 6th | 1st |

**Live check, Mumbai 2026-10-14 (Wednesday)** — Drik Panchang day-panchang page:
`Rahu Kalam 12:24 PM – 01:52 PM`, `Yamaganda 08:00 AM – 09:28 AM`,
`Gulikai Kalam 10:56 AM – 12:24 PM`. Dividing 06:32→18:16 into eight 88-min parts
reproduces all three exactly (5th / 2nd / 4th). ⚠️ Note that **Rahu Kalam (12:24–13:52)
is identical to Wednesday's Vaar Vela** — the two systems genuinely coincide on
Wednesday, which makes a UI that shows both unambiguous only if each is labelled.

Derivation note (for the record): Yamaganda = *Jupiter's* eighth and Gulika =
*Saturn's* eighth when the day's eight parts are handed in turn to the weekday lords in
the order Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, starting with the day's own
lord — this is `Brihat Parashara Hora Shastra` 3.66–69 as cited by Mokshology.
Rahu Kalam's eighth is "later practice" and has no such derivation.

**Night variants (optional, lower confidence).** Rahu Kalam is a **daytime-only** rule
in Drik, Prokerala, Mokshology and Kundli Milan Jyotish; there is no "night Rahu Kaal"
on the pages checked, which is the other reason the card's "(night Rahu Kaal)" label
should be dropped. One secondary source (mysmartcopilot) does offer night Yamaganda and
night Gulika by giving the night's eight parts to the weekday-lord order starting with
the lord of the *fifth* weekday from the day (so "Sunday night starts with Jupiter"),
Jupiter's part = night Yamaganda, Saturn's = night Gulika; it explicitly says "Rahu
kalam is given for the daytime only". **Recommendation: do not ship a night Rahu
Kalam.** If a night trikalam is ever wanted, that rule needs its own research pass.

### 11.7 Confidence, disagreements, and recommendation

**Confidence**

| Claim | Confidence | Basis |
|-------|-----------|-------|
| Vaar Vela = the fixed day-eighth table in §11.2 | **High** | Drik live values reproduce it on all 7 weekdays; explicit rule text from Kundli Milan Jyotish; two more sites agree on Wednesday |
| Kaal Vela = the day's "Kaal" Choghadiya | **High** | 5 independent sources incl. Drik live ×7, prokerala, astroica, mpanchang, kundlimilanjyotish |
| Kaal Ratri = the night's "Labh" Choghadiya | **High** | same 5 sources; note the deliberate "good name, avoid anyway" warning |
| Attribution to `Shuddhidipika` 4.45–46 | **Medium** | cited by Mokshology and consistent with every live source, but I could **not** read the Sanskrit primary text (no digital edition found in this pass) — flagged, not verified |
| The card's mapping (Vaar Vela=Yamagandam etc.) | **Wrong** | refuted by the day-eighth tables; only Saturday coincides |
| "Night Rahu Kaal" exists as a standard period | **Low / rejected** | no mainstream source defines one; four sources say Rahu Kalam is daytime-only |

**Disagreements between sources**

- *Sunrise convention, not the rule.* Prokerala puts Mumbai sunrise at 06:36 vs Drik's
  06:32 (≈4 min); kundlimilanjyotish's Delhi page uses 06:21/17:53 vs Drik's own Delhi
  values. This is the pre-existing R1 risk (`§6`), and it is why the project's ±2 min bar
  must be measured against **Drik specifically**, never as "the truth". The *rule*
  (§11.2) is identical everywhere.
- *Segment-up rounding.* Kundli Milan Jyotish rounds boundaries "on the inauspicious
  side" so a good slot never touches an inauspicious moment (its own note). Our
  implementation divides exact instants, so we may differ by ≤1 min at a boundary —
  inside tolerance.
- *One outlier to ignore.* `webjyotishi.com/vaar.jsp` prints Monday "Vaar Vela
  00:05–03:05" (a 3-hour midnight window) and makes Kaal Vela and Rahu Kal identical on
  all days. That is arithmetically incompatible with every other source and with Drik's
  live output; treat it as unreliable and do not cite it (same treatment as the bad
  Choghadiya source in §5.5).

**Recommendation (for a general-public, Hindi-first, North-Indian audience)**

1. **Implement the Shuddhidipika/Drik set exactly as in §11.2** — Vaar Vela as the
   fixed day-eighth table, Kaal Vela as the day's Kaal slot, Kaal Ratri as the night's
   Labh slot. Reason: it is what the *name* the client asked for means, it is what Drik
   Panchang (the most-cited authority and our comparison bar) publishes on its
   Choghadiya page, and it is what a user will verify against. Gujarati and most
   North-Indian panchangs use the same three names this way.
2. **Rename nothing; do not label them "Yamagandam / Gulika / night Rahu Kaal"** in UI
   copy, docs, or code identifiers. That labelling would be wrong on 6/7 weekdays.
3. **Add Rahu Kalam (day) as a fourth period** and let item 6's overlap note reference
   it (§11.6 table). It is cheap (same eighth mechanic), it is the period users search
   for, and item 6 already promises the note. CTO to confirm scope.
4. Ship **Yamaganda and Gulika only if the client asks**; they are a different
   tradition's triad and add three more rows for no requested benefit.
5. Give each period its own `defined` flag and allow **multiple intervals per period**
   (§11.4/§11.3) so Saturday and polar dates cannot produce a wrong or empty row.
6. Suggested i18n keys/labels (product/UX to finalise): EN `Vaar Vela`, `Kaal Vela`,
   `Kaal Ratri`, `Rahu Kaal`; HI `वार वेला`, `काल वेला`, `काल रात्रि`, `राहु काल`.
   Disclosure copy should say plainly that these are tradition, not astronomical
   fact, and that a good Choghadiya overlapped by any of them is traditionally avoided
   (Drik's own wording).

### 11.8 Sources for this addendum (all accessed 2026-10-14)

**Primary / live panchang**
- Drik Panchang — Choghadiya table, Mumbai, 14 Oct 2026 (live badges + "About Vaar
  Vela, Kaal Vela and Kaal Ratri") — https://www.drikpanchang.com/muhurat/choghadiya.html?geoname-id=1275339&date=14/10/2026 ; same page for 12–18 Oct 2026 (all seven weekdays) ; Algoma/other-city variants used only for orientation.
- Drik Panchang — day-panchang, Mumbai, 14 Oct 2026 (Sunrise/Sunset/Dinamana/Ratrimana, Rahu Kalam, Yamaganda, Gulikai Kalam, Dur Muhurtam) — https://www.drikpanchang.com/panchang/day-panchang.html?geoname-id=1275339&date=14/10/2026
- Drik Panchang — Choghadiya Muhurat tutorial ("…along with Vaar Vela, Kaal Vela and Kaal Ratri for each day") — https://www.drikpanchang.com/tutorials/muhurat/daily/choghadiya-muhurat.html
- Prokerala — Choghadiya Today, Mumbai, 14 Oct 2026 (labels + times) — https://www.prokerala.com/astrology/choghadiya.php
- Kundli Milan Jyotish — Today's Choghadiya (English, live, Delhi 14 Oct 2026) — https://www.kundlimilanjyotish.com/en/aaj-ka-choghadiya.html ; **rules page (Gujarati)** with the literal Vaar Vela index table and the Saturday double-occurrence note — https://www.kundlimilanjyotish.com/gu/aaj-ka-choghadiya.html
- Astroica — Choghadiya (live "Vaar Vela"/"Kaal Vela"/"Kaal Ratri" slot labels) — https://www.astroica.com/vedic-astrology/choghadiya.php

**Classical-text citation trail (secondary — primary text not read)**
- Mokshology Academy — Choghadiya, Hora and Rahu Kaal (quotes `Shuddhidipika` 4.45–46 for Vaar/Kaal Vela & Kaal Ratri, and `Brihat Parashara Hora Shastra` 3.66–69 for Yamaghantaka/Gulika; states "The Kaal Vela always falls on the day's Kaal, but the Kaal Ratri falls on the night's Labh") — https://mokshology.com/learn/choghadiya-hora-rahu-kaal

**Belief / interpretation**
- Bharat Articles — Choghadiya Muhurta ("Vara Vela – prevalent during the day. Kaal Vela – also prevalent during the day but considered more adverse. Kaal Ratri – prevalent during the night and considered highly inauspicious.") — https://bharatarticles.com/choghadiya-muhurta-for-auspicious-inauspicious-time/
- mpanchang — Choghadiya, Wednesday 14 Oct 2026 ("Vaar Vela, Kaal Vela and Kaal Ratri are the times during the day when no auspicious work should be done…") — https://www.mpanchang.com/muhurat/choghadiya/
- AstroVed — Aaj Ka Choghadiya (inauspicious-time framing) — https://www.astroved.com/astropedia/en/choghadiya-today
- Bhavnagar.city — Choghadiya Muhurat (Gujarati; "if a good Choghadiya coincides with Vaar Vela, Kaal Vela or Kaal Ratri its auspicious effect is destroyed") — https://bhavnagar.city/choghadiya-muhurat/

**Rahu Kalam / Yamaganda / Gulika (the separate triad)**
- PanchangTime — How Rahu Kalam Is Calculated (eighth-part method + 7-weekday table) — https://panchangtime.com/methodology/rahu-kalam
- Vedic Matters — Rahukalam (7-weekday table incl. Gulika/Yamaghanta) — https://vedicmatters.com/rahukalam
- Jathaka — Rahu Kalam and Yamagandam, explained simply — https://jathaka.com/articles/rahu-kalam-and-yamagandam/
- Bela — Rahu Kaal, Yamaganda & Gulika ("live Delhi week" worked example) — https://bela.so/learn/rahu-kaal-yamaganda-gulika/
- MySmartCoPilot — Rahu Kaal timings (Rashtriya Panchang sunrise rule; night Yamaganda/Gulika rule; "Rahu kalam is given for the daytime only") — https://mysmartcopilot.com/tools/rahu-kaal-timings/
- Kartama — Rahu Kalam Calculator (formula + 7-weekday segment table) — https://kartama.com/app/rahu-kalam-calculator/
- (Unreliable — do not cite) https://www.webjyotishi.com/vaar.jsp

---

## 12. v2.3.0 addendum — choghadiya meanings (EN/HI)

Content for the current-choghadiya detail panel (brief change-request item 6). Research
only — no code. Everything below is written to be transcribed **verbatim** into the UX
copy deck (`docs/03-ux.md` §6.1) and then into `i18n.js`. Hindi is authored as natural
Hindi UI prose (not a literal translation of the English) — see the caveat in §12.11.

### 12.0 Executive summary

- All **7 names × 4 fields** (meaning, goodFor, badFor, nuance) are complete in Hindi and English, in §12.2–§12.8.
- The **quality tiers** match `docs/01` §5.1 and Drik Panchang: Amrit/Shubh/Labh are auspicious, **Char** is neutral-to-good (Drik counts it as the 4th *good* one), Rog/Kaal/Udveg are avoided. ✅
- Each *avoided* name has a **traditional exception** — Udveg → government/administrative work; Rog → competition, debate and dispute settlement; Kaal → wealth accumulation, saving, repaying loans (Drik: "recommended for those activities which are performed to accumulate wealth"). All three are sourced, not invented.
- **Day vs night: the seven names keep the same quality in both halves** — every live panchang checked labels the night slots with the same ✓/✗ as the day slots (Drik, muhuratchoghadiya, ganeshaspeaks). The genuine differences are (a) the night sequence, (b) the *overlay* periods (Vaar Vela/Kaal Vela/Rahu Kalam are daytime-only; **Kaal Ratri** is the night overlay — RS-1 §11.1–11.4), and (c) typical use: the night grid is consulted for night travel and night-shift beginnings, and the pre-dawn Amrit (Brahma Muhurta) is for meditation/sadhana.
- Overlap precedence is **well attested**: an inauspicious overlay beats an auspicious choghadiya ("even an Amrit Choghadiya during Rahu Kaal should be treated with caution — the inauspicious overlay takes precedence"). The item-6 note copy in §12.9 encodes exactly that.
- **Contextual-note copy** for the panel (current-marker, the three-tier quality notes, the overlap warning, the "select a slot" prompt) is in §12.9, including a parameterised `panel.note.overlay` key that takes the period name so the four overlap variants share one string.
- **Proposed i18n keys** use `panel.<name>.<field>` (§12.1); ~40 new keys in total — the UX card merges them into §6.1 and FE-0 into the dictionary.
- **Nothing here contradicts RS-1.** Item 5's period names are Vaar Vela / Kaal Vela / Kaal Ratri (+ optional Rahu Kaal); this section only *references* them in note copy.
- Every claim carries a source cell; full URLs in §12.12. No unsourced claim ships.
- **Residual risk (flagged):** the Hindi strings are a single author's idiomatic draft — they need one native-speaker proofread before release (they are UI copy, so a stylistic slip is cosmetic, but the i18n test locks strings byte-for-byte and re-editing them later costs a re-lock).

### 12.1 The i18n key contract proposed here

Convention (matches the existing §6 style — dotted, lower-camel):

```
panel.<name>.meaning    panel.<name>.goodFor    panel.<name>.badFor    panel.<name>.nuance
```

with `<name>` ∈ `amrit | shubh | labh | char | rog | kaal | udveg` (English slug, matching
`quality.<name>` in §6). Labels/notes use `panel.label.*` and `panel.note.*`.

Two implementation contracts the copy deck must carry:

1. **`goodFor` / `badFor` are single strings** with items separated by ` · ` (space,
   U+00B7 MIDDLE DOT, space). If the FE prefers an array, split on ` · ` — do not re-word
   the items. One string per field keeps the i18n contract test simple (one key = one
   verbatim value).
2. **`panel.note.overlay` is parameterised** with `{period}` (interpolation already exists
   in `t()`); `{period}` is filled with the *period-name* key (`period.vaarVela` etc.).
   Four concrete fallback strings are provided in case the CTO prefers no interpolation.

### 12.2 Amrit — अमृत (Moon, most auspicious)

| field | hi | en | source |
|-------|----|----|--------|
| `panel.amrit.meaning` | अमृत का अर्थ है अमृत यानी सर्वोत्तम — चंद्रमा का यह चौघड़िया सबसे शुभ माना जाता है, और इसमें शुरू किया गया काम अमृत जैसा मीठा व स्थायी फल देता है। | Amrit means "nectar" — ruled by the Moon, it is the most auspicious choghadiya, and a beginning made in it is said to give lasting, nectar-sweet results. | Drik tutorial "Amrit (Nectar) · Good · All type of works"; astronaad hi (सबसे शुभ, चंद्र स्वामी) |
| `panel.amrit.goodFor` | कोई भी शुभ कार्य · यात्रा · व्यापार व हस्ताक्षर · दुकान या दफ़्तर का उद्घाटन · खरीदारी · पूजा-पाठ व मांगलिक कार्य · विवाह, सगाई व गृह प्रवेश | any auspicious work · travel · business and signing · opening a shop or office · purchases · worship and ceremonies · weddings, engagements and house-warming | Drik tutorial ("all type of works"); mpanchang 14-Oct-2026 slot labels (all works); muhuratchoghadiya hi (महत्वपूर्ण कार्य, यात्रा, पूजा-पाठ, विवाह); astronaad hi (यात्रा, हस्ताक्षर, खरीदारी, उद्घाटन, नया कार्य) |
| `panel.amrit.badFor` | इसमें करने से बचने वाला कोई विशेष काम परंपरा में नहीं बताया गया; एकमात्र सावधानी यह है कि यदि इसी समय राहु काल, वार वेला, काल वेला या काल रात्रि पड़े तो शुभ कार्य टालें। | No activity is traditionally ruled out here; the one real caution is that an inauspicious overlay (Rahu Kaal, Vaar Vela, Kaal Vela or Kaal Ratri) cancels this window. | dekhopanchang (inauspicious overlay takes precedence); amrutkaal ("a Labh choghadiya can overlap Rahu Kaal, in which case most practitioners wait") |
| `panel.amrit.nuance` | दिन और रात दोनों में अमृत शुभ माना जाता है। रात का अमृत ध्यान-साधना, शांति पाठ और मांगलिक चर्चा के लिए विशेष रूप से उत्तम कहा गया है; भोर का अमृत ब्रह्म मुहूर्त का समय है। | Amrit is auspicious in both halves. The night Amrit is singled out for meditation, sadhana, peace chanting and auspicious discussions, and the pre-dawn Amrit is the classic Brahma Muhurta hour. | srimandir hi (रात का अमृत: मांगलिक चर्चा, शांति पाठ, पूजा; तड़के 04:14–05:35 "ब्रह्म मुहूर्त का यह समय ध्यान और साधना के लिए सर्वोत्तम"); Drik (day and night both divided into eight) |

### 12.3 Shubh — शुभ (Jupiter, auspicious)

| field | hi | en | source |
|-------|----|----|--------|
| `panel.shubh.meaning` | शुभ का अर्थ है मंगलकारी। गुरु (बृहस्पति) के स्वामित्व वाला यह चौघड़िया संस्कार, पूजा और शुभ अवसरों के लिए अत्यंत उपयुक्त माना जाता है। | Shubh means "auspicious" — ruled by Jupiter, it is held to be most suitable for sacraments, worship and fortunate occasions. | Drik tutorial "Shubh (Auspicious) · Good · Marriage, Religious activities"; bhaktilok hi; bhaktiarohan |
| `panel.shubh.goodFor` | पूजा व धार्मिक अनुष्ठान · विवाह, सगाई व मुंडन · गृह प्रवेश व भूमि पूजन · विद्यारंभ और पढ़ाई · व्रत-उपवास का आरंभ · परिवार से जुड़े शुभ निर्णय | worship and religious rituals · weddings, engagements and mundan · house-warming and bhumi pujan · beginning education · starting vows or fasts · auspicious family decisions | Drik tutorial (marriage, religious); mpanchang (marriage, religious, education); bhaktilok hi (विवाह, धार्मिक अनुष्ठान, गृह प्रवेश, विद्यारंभ, यज्ञ) |
| `panel.shubh.badFor` | कोई कठोर निषेध नहीं, पर व्यापार-लेन-देन के लिए लाभ और यात्रा के लिए चर या अमृत को प्राथमिकता दी जाती है; अशुभ काल से टकराव पर शुभ कार्य टालें। | No hard prohibition, but trade and transactions traditionally prefer Labh and travel prefers Char or Amrit; an inauspicious overlay still cancels it. | Drik tutorial (per-name recommended works differ); dekhopanchang (overlay precedence) |
| `panel.shubh.nuance` | दोनों अर्धों में शुभ शुभ ही रहता है; रात के शुभ को आध्यात्मिक कार्य और अगले दिन की योजना बनाने के लिए अच्छा बताया गया है। | Shubh stays auspicious in both halves; the night Shubh is described as good for spiritual work and for planning the next day. | srimandir hi (तड़के का शुभ: "नए दिन की योजना या आध्यात्मिक कार्यों के लिए शुभ"); muhuratchoghadiya hi (रात्रि-कार्य: रात का अमृत व शुभ) |

### 12.4 Labh — लाभ (Mercury, auspicious)

| field | hi | en | source |
|-------|----|----|--------|
| `panel.labh.meaning` | लाभ का अर्थ है प्राप्ति या मुनाफ़ा। बुध के स्वामित्व वाला यह चौघड़िया व्यापार, धन और विद्या से जुड़ी शुरुआतों के लिए शुभ माना जाता है। | Labh means "gain" — ruled by Mercury, it is the choghadiya of profit, trade and learning. | Drik tutorial "Labh (Profit) · Good · Start Business, Education, etc."; astromedha |
| `panel.labh.goodFor` | नया व्यापार या उद्यम · नया खाता, निवेश या लेन-देन · नौकरी और साक्षात्कार · पढ़ाई या कोर्स का आरंभ · खरीद-बिक्री व अनुबंध · हिसाब-किताब और बिक्री | starting a business or venture · opening an account, investing, transactions · jobs and interviews · beginning study or a course · buying, selling and contracts · accounts and sales | mpanchang slot labels ("Start new business, Education"); Drik tutorial; muhuratchoghadiya hi (व्यापार, निवेश, धन-सम्बन्धी कार्य); srimandir hi (व्यापार, धन लाभ, व्यावसायिक बैठकें); bhaktilok hi (नया खाता खोलना, निवेश, क्रय-विक्रय) |
| `panel.labh.badFor` | विवाह या पूजा जैसे मांगलिक कार्यों के लिए यह पहली पसंद नहीं माना जाता (उनके लिए अमृत या शुभ); राहु काल या काल वेला जैसे अशुभ काल से टकराव पर शुभ कार्य टालें। | Not the first choice for ceremonials such as weddings or worship (those prefer Amrit or Shubh); an inauspicious overlay (Rahu Kaal, Kaal Vela) still cancels it. | Drik tutorial (per-name mapping); dekhopanchang (overlay precedence) |
| `panel.labh.nuance` | दोनों अर्धों में शुभ; रात के लाभ को व्यापारिक हिसाब-किताब और योजना बनाने के लिए अनुकूल बताया गया है। | Auspicious in both halves; the night Labh is described as favourable for business accounts and planning. | srimandir hi (रात का लाभ: "व्यापारिक हिसाब-किताब या योजना बनाने के लिए अनुकूल"); ganeshaspeaks hi (रात चौघड़िया: लाभ-उन्नति) |

### 12.5 Char — चर (Venus, neutral-to-good)

| field | hi | en | source |
|-------|----|----|--------|
| `panel.char.meaning` | चर का अर्थ है चलता हुआ यानी गतिशील। शुक्र के स्वामित्व वाला यह चौघड़िया यात्रा और गमन के लिए सर्वोत्तम है, और बाकी कामों के लिए सामान्य-से-अच्छा माना जाता है। | Char means "moving" — ruled by Venus, it is the classic window for travel and movement, and neutral-to-good for everything else. | Drik tutorial "Char (Moving) · Good · Travel"; astronaad hi (चर — तटस्थ, स्वामी शुक्र) |
| `panel.char.goodFor` | यात्रा का आरंभ · वाहन खरीदना या चलाना · स्थान बदलना · बैठकें · नियमित रोज़मर्रा के काम · कला, संगीत और नृत्य | starting a journey · buying or running a vehicle · relocation · meetings · routine everyday work · art, music and dance | Drik tutorial (travel); mpanchang slot labels ("Travel, Beauty/Dance/Cultural activities"); srimandir hi (वाहन खरीदना, मशीनरी चालू करना); astronaad hi (दैनिक कार्य, बैठकें) |
| `panel.char.badFor` | स्थायी या दीर्घकालीन कामों तथा विवाह व गृह प्रवेश जैसे मांगलिक कार्यों के लिए यह पहली पसंद नहीं है — उनके लिए अमृत या शुभ चुनें। | Not the first choice for permanent, long-term commitments or for ceremonies such as weddings and house-warming — those prefer Amrit or Shubh. | astronaad hi (चर का प्रबल उपयोग यात्रा/गमन; शेष काम सामान्य); Drik tutorial (mapping) |
| `panel.char.nuance` | दिन का चर चार शुभ चौघड़ियों में गिना जाता है, और रात का चर भी यात्रा व गतिशील कामों के लिए उपयुक्त बताया जाता है — कुछ पंचांग इसे रात में सामान्य कहते हैं, वर्जित नहीं। | Day Char is counted among the four good windows, and night Char is also used for travel and movement — some panchangs call it neutral at night, never forbidden. | Drik choghadiya page ("There are four good Choghadiya, Amrit, Shubh, Labh and Char"); astronaad hi (रात चर = तटस्थ, यात्रा); srimandir hi (रात्रिकालीन यात्रा या गतिशीलता) |

### 12.6 Rog — रोग (Mars, inauspicious)

| field | hi | en | source |
|-------|----|----|--------|
| `panel.rog.meaning` | रोग का अर्थ है बीमारी। मंगल के स्वामित्व वाला यह चौघड़िया अशुभ है; इसमें शुरू किया गया काम बीमारी, अड़चन या विवाद ला सकता है। | Rog means "disease" — ruled by Mars, it is inauspicious; work begun here is said to bring illness, obstruction or conflict. | Drik tutorial "Rog (Illness) · Bad"; srimandir hi (रोग काल में शुरू किए कार्य बीमारी, रुकावटें या विवाद) |
| `panel.rog.goodFor` | शत्रु पर विजय और प्रतिस्पर्धा · वाद-विवाद, बहस और विवाद निपटाना · खेल या मुकाबले · (कुछ मत) युद्ध या आपात शल्य चिकित्सा | defeating enemies and competition · arguments, debate and dispute settlement · sports and contests · (some schools) warfare or emergency surgery | Drik tutorial ("Attack, War, Fights, Debate"); mpanchang slot labels ("Debate, Contest, Dispute Settlement"); dekhopanchang/astromangal (warfare, surgery, competitive activities); bhaktilok hi (शत्रु दमन, वाद-विवाद शांति कार्य) |
| `panel.rog.badFor` | विवाह, पूजा, गृह प्रवेश, यात्रा, नया व्यापार या निवेश और हस्ताक्षर — किसी भी शुभ या मांगलिक कार्य की शुरुआत | weddings, worship, house-warming, travel, new business or investment and signing — any auspicious or ceremonial beginning | bhaktilok hi ("शुभ कार्य सर्वथा वर्जित"); muhuratchoghadiya hi; srimandir hi (बीमारी, रुकावटें या विवाद) |
| `panel.rog.nuance` | दोनों अर्धों में अशुभ; रात के रोग में शारीरिक कष्ट और तनाव से बचकर आराम करने की सलाह है, और किसी भी पंचांग में इसकी अशुभता घटती नहीं बताई गई। | Inauspicious in both halves; the night Rog is described as a time to rest and avoid stress, and no source consulted lifts the ban on new beginnings. | srimandir hi (रात का रोग: "शारीरिक कष्ट और तनाव से बचने के लिए आराम करें"); muhuratchoghadiya hi (रात रोग = ✗ अशुभ) |

### 12.7 Kaal — काल (Saturn, inauspicious)

| field | hi | en | source |
|-------|----|----|--------|
| `panel.kaal.meaning` | काल का अर्थ है समय या मृत्यु। शनि के स्वामित्व वाला यह चौघड़िया अशुभ है — देरी, हानि और बाधा का समय, जिसमें नए शुभ काम वर्जित माने जाते हैं। | Kaal means "time/death" — ruled by Saturn, it is inauspicious, associated with delay, loss and obstruction, so auspicious beginnings are avoided. | Drik tutorial "Kaal (Death) · Bad"; srimandir hi (धन हानि, दुर्घटना का भय) |
| `panel.kaal.goodFor` | धन संचय, बचत और निवेश · उधार चुकाना और दीर्घकालीन योजना · पहले से चल रहे काम को आगे बढ़ाना · कुछ परंपराएँ इसे पितृ कार्य या श्राद्ध के लिए स्वीकार करती हैं | accumulating wealth — savings and investments · repaying loans and long-term planning · continuing work already underway · some traditions accept it for ancestor rites (pitru karma / shraddh) | Drik choghadiya page ("Kala Choghadiya is recommended for those activities which are performed to accumulate wealth"); muhuratchoghadiya hi (धन-संचय, निवेश, उधार चुकाना, दीर्घकालीन बचत); astronaad hi (कुछ परंपराएँ इसे पितृ कार्यों के लिए स्वीकार करती हैं); ganeshaspeaks hi (धनोपार्जन हेतु लाभदायक) |
| `panel.kaal.badFor` | यात्रा · विवाह व अन्य मांगलिक कार्य · नया काम या उद्घाटन · हस्ताक्षर · जोखिम भरे निवेश के निर्णय | travel · weddings and other ceremonials · new ventures or openings · signing · risky investment decisions | muhuratchoghadiya hi (काल में नया शुभ कार्य, यात्रा या विवाह-सम्बन्धी कार्य टालें); bhaktilok hi; srimandir hi (जोखिम भरे कामों से बचें) |
| `panel.kaal.nuance` | दोनों में अशुभ; रात के काल में नए समझौते या रात्रिकालीन शुरुआत से बचने की सलाह है, और दिन के काल में जोखिम भरे काम से धन हानि का भय बताया जाता है। | Inauspicious in both halves; the night Kaal is specifically flagged for not making new agreements or starting anything overnight, while the day Kaal carries the traditional fear of financial loss. | srimandir hi (रात का काल: "किसी भी प्रकार के नए समझौते या रात्रिकालीन शुरुआत से बचें"); srimandir hi (दिन का काल: धन हानि की आशंका) |

### 12.8 Udveg — उद्वेग (Sun, inauspicious)

| field | hi | en | source |
|-------|----|----|--------|
| `panel.udveg.meaning` | उद्वेग का अर्थ है बेचैनी या घबराहट। सूर्य के स्वामित्व वाला यह चौघड़िया अशुभ है; कहा जाता है कि इस समय किए काम में मानसिक तनाव और अड़चनें बढ़ती हैं। | Udveg means "agitation" — ruled by the Sun, it is inauspicious; work done in it is said to increase mental stress and friction. | Drik tutorial "Udveg (Anxiety) · Bad"; astronaad hi (चिंता — घर्षण); srimandir hi (मानसिक तनाव और परेशानियां) |
| `panel.udveg.goodFor` | सरकारी और प्रशासनिक काम · सरकारी दफ़्तर या अधिकारियों से भेंट · अधिकार या नियम-कायदे से जुड़े काम | government and administrative work · visiting government offices or officials · work that needs authority or official process | Drik tutorial ("Government related work"); mpanchang slot labels; muhuratchoghadiya hi (सरकारी कार्य व अधिकारियों से भेंट); bhaktilok hi (सरकारी कार्य को छोड़कर अन्य निजी मांगलिक कार्यों से बचें) |
| `panel.udveg.badFor` | विवाह, पूजा और गृह प्रवेश जैसे मांगलिक कार्य · नया व्यापार या उद्घाटन · यात्रा और निवेश · घरेलू शुभ कार्य | ceremonials such as weddings, worship and house-warming · new business or openings · travel and investment · auspicious domestic work | bhaktilok hi; srimandir hi (नए काम से बचें); muhuratchoghadiya hi (उद्वेग में नए कार्य टालें) |
| `panel.udveg.nuance` | दोनों में अशुभ; रात के उद्वेग में मानसिक तनाव और घरेलू विवादों से बचने तथा जल्दबाज़ी न करने की सलाह दी जाती है। | Avoided in both halves; the night Udveg is advised specifically for staying clear of mental tension and domestic disputes, and for not rushing anything. | srimandir hi (रात का उद्वेग: "मानसिक तनाव और घरेलू विवादों से दूर रहें"); aajtak hi (रात्रि उद्वेग: जल्दबाज़ी से बचें) |

### 12.9 Panel labels, badges and contextual notes

Labels (one key each; the badge reuses the existing §6 key rather than duplicating it):

| field | hi | en | source |
|-------|----|----|--------|
| `panel.heading` | चौघड़िया का विवरण | Choghadiya details | UX-1 prose (this card's deliverable; no external claim) |
| `panel.label.meaning` | अर्थ | Meaning | UX-1 prose |
| `panel.label.goodFor` | इसके लिए शुभ | Good for | UX-1 prose |
| `panel.label.badFor` | इससे बचें | Avoid | UX-1 prose |
| `panel.label.nuance` | दिन व रात | Day & night | UX-1 prose |
| `panel.selectPrompt` | विवरण देखने के लिए कोई चौघड़िया चुनें | Select a choghadiya to see its details | item 6 off-today behaviour (brief §Change log 6) |
| `panel.note.tapAgain` | उसी चौघड़िया को दोबारा टैप करने पर आप वर्तमान चौघड़िया पर लौट आएँगे | Tap the same choghadiya again to return to the current one | item 6 interaction rule (brief §Change log 6) |

Quality notes (tier-driven, shown with every selection):

| field | hi | en | source |
|-------|----|----|--------|
| `panel.note.current` | यह चौघड़िया अभी चल रहा है। | This choghadiya is running now. | item 6 (default = current ongoing choghadiya) |
| `panel.note.auspicious` | यह शुभ चौघड़िया है — नया या मांगलिक काम शुरू करने के लिए अच्छा समय है। | This is an auspicious choghadiya — a good time to begin new or ceremonial work. | Drik choghadiya page (four good / three bad); astronaad hi |
| `panel.note.neutral` | यह सामान्य चौघड़िया है — यात्रा और रोज़मर्रा के कामों के लिए ठीक है। | This is a neutral choghadiya — fine for travel and routine work. | astronaad hi (चर — तटस्थ, यात्रा) |
| `panel.note.inauspicious` | यह अशुभ चौघड़िया है — नए या मांगलिक काम की शुरुआत टालें; जो काम चल रहा है वह जारी रखा जा सकता है। | This is an inauspicious choghadiya — avoid beginning new or ceremonial work; work already underway may continue. | getmuhurta (routine work already underway does not need to stop); Drik choghadiya page |

Overlap warnings (the item-6 "Rahu Kaal overlaps this otherwise-good choghadiya" note).
**Recommended single parameterised key**, `{period}` filled with a period-name key
(`period.vaarVela` / `period.kaalVela` / `period.kaalRatri` / `period.rahuKaal` — names
owned by RS-1/UX-1):

| field | hi | en | source |
|-------|----|----|--------|
| `panel.note.overlay` | इस शुभ चौघड़िया के भीतर {period} पड़ रहा है — इस समय शुभ काम शुरू न करें। | {period} overlaps this otherwise-good choghadiya — do not begin auspicious work now. | Drik tutorial ("adverse time of Vaar Vela, Kaal Vela and Kaal Ratri should be rejected as these might overlap with auspicious Muhurat timings"); dekhopanchang ("the inauspicious overlay takes precedence"); bhavnagar.city ("if a good Choghadiya coincides with Vaar Vela, Kaal Vela or Kaal Ratri its auspicious effect is destroyed") |

Day-only vs night-only overlays are **not** a language detail but a data detail — the
copy should name the period that actually overlaps (RS-1 §11.1: Vaar Vela and Kaal Vela are
daytime, Kaal Ratri is the night overlay, Rahu Kalam is daytime-only). If the CTO prefers
no interpolation, use these four concrete strings verbatim:

| field | hi | en | source |
|-------|----|----|--------|
| `panel.note.overlay.rahuKaal` | इस शुभ चौघड़िया के भीतर राहु काल पड़ रहा है — इस समय शुभ काम शुरू न करें। | Rahu Kaal overlaps this otherwise-good choghadiya — do not begin auspicious work now. | as `panel.note.overlay` |
| `panel.note.overlay.vaarVela` | इस शुभ चौघड़िया के भीतर वार वेला पड़ रही है — इस समय शुभ काम शुरू न करें। | Vaar Vela falls inside this otherwise-good choghadiya — do not begin auspicious work now. | as `panel.note.overlay` |
| `panel.note.overlay.kaalVela` | इस शुभ चौघड़िया के भीतर काल वेला पड़ रही है — इस समय शुभ काम शुरू न करें। | Kaal Vela falls inside this otherwise-good choghadiya — do not begin auspicious work now. | as `panel.note.overlay` |
| `panel.note.overlay.kaalRatri` | इस रात के चौघड़िया के भीतर काल रात्रि पड़ रही है — इस समय शुभ काम शुरू न करें। | Kaal Ratri falls inside this night choghadiya — do not begin auspicious work now. | as `panel.note.overlay` |

Key count for the UX card: **28 content keys** (7 names × 4 fields) + **7 labels/prompts** + **4 quality notes** + **1 parameterised overlay key** (or 4 concrete ones) ≈ **40** new keys.

### 12.10 Day-half vs night-half — the honest answer

Checked question: does the tradition treat the *day* instance and the *night* instance of
the same name differently? Findings:

1. **Quality is the same.** Drik divides both halves into eight parts and publishes the same
   good/bad verdict per name; the live night tables of muhuratchoghadiya and ganeshaspeaks
   mark night Amrit/Shubh/Labh/Char ✓ and night Rog/Kaal/Udveg ✗ exactly as the day.
   **No source consulted states that a name changes its quality between day and night.**
2. **The differences that do exist are real and worth surfacing in the panel (they are the
   `nuance` strings in §12.2–§12.8):**
   - **Sequence/start** — the night grid is generated from a different starting point, so the
     same name lands in different slots (already implemented; `docs/01` §5.3).
   - **Which overlay can hit it** — daytime good slots can be overlaid by Vaar Vela,
     Kaal Vela or Rahu Kalam; a *night* good slot can only be overlaid by **Kaal Ratri**
     (RS-1 §11.1–11.4). This is the single most useful day/night distinction for the panel.
   - **Typical use** — the day grid governs business, travel, worship, purchases and
     new starts; the night grid is consulted mainly for **night travel and night-shift
     beginnings** (amrutkaal), and the late-night/pre-dawn Amrit is the **meditation /
     sadhana / planning** window (srimandir: the 04:14–05:35 slot is called Brahma Muhurta).
   - **Practical weight** — many families only ever look at the day half; a "bad" night
     slot is rarely disruptive because ceremonial work is hardly ever scheduled at night
     (ganeshaspeaks/muhuratchoghadiya list both halves, but their guidance is day-centric).
3. **Recommendation:** keep one meaning/goodFor/badFor set per name (no day/night
   duplication) and put the difference entirely in `panel.nuance` + the overlay note. This
   keeps the copy deck small and the i18n contract honest.

### 12.11 Confidence, disagreements, and residual risk

| Claim | Confidence | Basis |
|-------|-----------|-------|
| Quality tiers per name (Amrit/Shubh/Labh good, Char neutral-but-counted-good, Rog/Kaal/Udveg avoided) | **High** | Drik choghadiya page + tutorial, mpanchang live labels, bhaktilok, muhuratchoghadiya, ganeshaspeaks, aajtak — all agree |
| The three "exceptions" (Udveg→government, Rog→competition/debate/surgery, Kaal→wealth accumulation) | **High** | Drik tutorial + Drik choghadiya page for all three; four more sites independently repeat them |
| Overlay precedence (inauspicious period beats an auspicious choghadiya) | **High** | Drik tutorial, dekhopanchang, bhavnagar.city, amrutkaal, vidhata — five sources, same rule |
| Night instances judged by the same quality words | **High** | published night tables (Drik, muhuratchoghadiya, ganeshaspeaks, astroyogi) |
| The specific night-use notes (night Amrit = sadhana/planning, night Rog = rest, night Kaal = no new agreements, night Udveg = tension/disputes, 04:14 slot = Brahma Muhurta) | **Medium** | one detailed editorial panchang (srimandir) plus aajtak; these are interpretive elaborations, not classical rules — they are written as "described as / advised", never as fact |
| Kaal accepted for pitru karma / shraddh | **Medium–Low** | astronaad hi states "कुछ परंपराएँ इसे पितृ कार्यों के लिए स्वीकार करती हैं"; no second source found — the copy says "some traditions accept", which is exactly what the source claims |
| Hindi wording itself | **Medium** | idiomatic draft by a single author; needs one native-speaker proofread before release (see §12.0 last bullet) |
| Content-farm contamination | **Avoided** | `choghadiya-meaning`-type SEO pages were read for orientation only; every shipped claim traces to Drik (primary comparison bar), mpanchang, ganeshaspeaks, astroyogi, bhaktilok or srimandir, plus the classical-text trail already recorded in RS-1 §11.8. `vedhoroscope.com` (one of the trendiest search hits) was **excluded** — its deployment returned "temporarily paused" and it could not be read. |

### 12.12 Sources for this addendum (all accessed 2026-10-14)

**Primary / live panchang (comparison bar: Drik)**
- Drik Panchang — Choghadiya Muhurat tutorial: definition, "Choghadiya Lord and suggested activities" table (Udveg→government; Amrit→all works; Rog→attack/war/fights/debate; Labh→business/education; Shubh→marriage/religious; Char→travel; Kaal→wealth accumulation) — https://www.drikpanchang.com/tutorials/muhurat/daily/choghadiya-muhurat.html
- Drik Panchang — Choghadiya page ("There are four good Choghadiya, Amrit, Shubh, Labh and Char, to start an auspicious work. Three bad Choghadiya, Rog, Kaal and Udveg, should be avoided."; "Kala Choghadiya is recommended for those activities which are performed to accumulate wealth.") — https://www.drikpanchang.com/muhurat/choghadiya.html
- mpanchang — Choghadiya, New Delhi 14 Oct 2026 (per-slot "Recommended Activity" labels; Kaal Vela / Vaar Vela badges) — https://www.mpanchang.com/muhurat/choghadiya/
- Ganeshaspeaks (Hindi) — आज का चौघड़िया, New Delhi 14 Oct 2026 (day+night tables with quality words; "सरकारी कार्यों को किया जा सकता है"; "काल चौघड़िया … धनोपार्जन हेतु लाभदायक"; Vaar Vela/Kaal Vela day, Kaal Ratri night) — https://www.ganeshaspeaks.com/hindi/choghadiya/
- Muhurat Choghadiya (Hindi) — आज का चौघड़िया / कल का चौघड़िया (per-name exceptions: रोग→प्रतिस्पर्धा, काल→धन संचय, उद्वेग→सरकारी कार्य; यात्रा guidance) — https://www.muhuratchoghadiya.com/hi/choghadiya ; https://www.muhuratchoghadiya.com/hi/kal-ka-choghadiya
- MyPandit (Hindi) — आज का चौघड़िया (same exception trio; उद्वेग/काल notes) — https://www.mypandit.com/hindi/choghadiya/
- AstroYogi (Hindi) — कल का चौघड़िया (यात्रा → चर; नए कार्य → शुभ/लाभ/अमृत) — https://hindi.astroyogi.com/panchang/kal-ka-choghadiya
- Aaj Tak (Hindi) — Shirdi Choghadiya (night Udveg "जल्दबाज़ी से बचें"; day/night classification) — https://www.aajtak.in/astrology/choghadiya/maharashtra/shirdi-choghadiya-today
- Srimandir (Hindi) — आज का चौघड़िया, 16 July 2026 (per-slot day+night "कार्य के लिए उपयुक्तता", incl. the night-use notes and the 04:14 brahma-muhurta Amrit) — https://www.srimandir.com/hi/articles/choghadiya/aaj-ka-choghadiya-16-july-2026
- Bhakti Lok (Hindi) — आज का चौघड़िया (per-name "फल व उपयुक्त कार्य"; रोग "शुभ कार्य सर्वथा वर्जित"; उद्वेग "सरकारी कार्य को छोड़कर … बचें") — https://www.bhaktilok.in/pages/choghadiya

**Interpretation / usage guidance**
- Astronaad (Hindi) — चौघड़िया का अर्थ (7 types with "सर्वोत्तम:" lines; रात चर तटस्थ; काल — "कुछ परंपराएँ इसे पितृ कार्यों के लिए स्वीकार करती हैं"; रोग — चिकित्सा प्रक्रियाओं के लिए प्रयुक्त) — https://astronaad.com/hi/learn/what-is-choghadiya
- Dekho Panchang — Choghadiya: Auspicious Time Periods (per-name usage, "an inauspicious overlay takes precedence"; Muhurta Chintamani / Brihat Samhita Ch. 97 named as the classical basis) — https://dekhopanchang.com/en/learn/choghadiya
- Amrutkaal — Choghadiya: Meaning and How to Use It ("night choghadiya matters for late travel and night-shift beginnings"; Rahu Kaal stronger than a good choghadiya) — https://www.amrutkaal.com/choghadiya-meaning/
- Bhakti Arohan — Choghadiya: Reading the Day's Good and Bad Hours (7 kinds; four good / three avoided; day+night tables) — https://www.bhaktiarohan.com/en/muhurat/choghadiya
- AstroMedha — Choghadiya (three auspicious / three inauspicious / one movable; "shopkeepers and travellers") — https://astromedha.in/insights/muhurat/choghadiya
- Getmuhurta — Kaal, Rog, Udveg: Choghadiya Windows to Plan Around (routine work already underway need not stop; Kaal ≠ Rahu Kaal) — https://www.getmuhurta.com/blog/kaal-rog-udveg-in-choghadiya-how-to-plan
- Vidhata (Hindi) — चौघड़िया बनाम राहुकाल ("राहुकाल चौघड़िया से ऊपर है"; myth-vs-reality framing) — https://vidhata.app/hi/blog/choghadiya-vs-rahu-kaal-which-window
- HinduTone (Hindi) — चौघड़िया मुहूर्त: दिन-रात की तालिका कैसे पढ़ें (standard classification table; "अलग-अलग पंचांग छोटी-छोटी टिप्पणियाँ जोड़ते हैं, जैसे कुछ उद्वेग को सरकारी कार्य के लिए स्वीकार्य मानते हैं") — https://hindi.hindutone.com/astrology/choghadiya-muhurat-explained-how-to-read/
- Bhavnagar.city — Choghadiya Muhurat (Gujarati; "if a good Choghadiya coincides with Vaar Vela, Kaal Vela or Kaal Ratri its auspicious effect is destroyed") — https://bhavnagar.city/choghadiya-muhurat/

**Classical-text trail**
- Muhurta Chintamani (Hindi edition, Internet Archive) — named as the classical basis by Dekho Panchang; **not read** for this card (401 MB scan) — https://archive.org/details/muhurta-chintamani-hindi

**Excluded / not usable**
- vedhoroscope.com — Choghadiya: 8 Segments Explained — search hit, deployment "temporarily paused", page unreadable; **not cited** — https://www.vedhoroscope.com/articles/choghadiya-8-segments-explained
- astrologydivine.com choghadiya guide — HTTP 403 — **not cited**

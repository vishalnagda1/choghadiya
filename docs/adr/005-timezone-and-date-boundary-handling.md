# ADR-005 — Location IANA timezone + sunrise→sunrise Vedic day

- **Status:** Accepted (2026-10-14)
- **Deciders:** architect (research R2/R6, PRD US-3/US-7, assumption A8 adopted)
- **Impacts:** `choghadiya.js` date/time helpers, current-slot highlight, tests

## Context

Two distinct clocks exist: the **device's** timezone and the **viewed location's**
timezone. Rendering "London" slots in IST would be wrong (R2). Separately, the
Choghadiya day runs **sunrise → next sunrise**, so night slots after midnight
belong to the previous civil date's night list (research §5.3 date-boundary rule;
PRD US-3). DST-observing cities must render correct offsets (R6).

## Decision

1. **All displayed times are formatted with `Intl.DateTimeFormat` using the
   location's IANA timezone.** Source of that zone: the geocoder's returned
   `timezone` for city search; `Intl.DateTimeFormat().resolvedOptions().timeZone`
   for geolocation. Never a fixed UTC offset, never `getTimezoneOffset()` math.
2. **Dates are modelled as civil-date strings (`YYYY-MM-DD`) at the location**;
   instants are `Date`/epoch ms. "Today" is `todayIn(location.timezone)` — the
   location's local date (PRD A8/US-3 AC3).
3. **The Vedic day is sunrise→next sunrise.** `Schedule(date)` holds the day half
   (sunrise→sunset) and the night half (sunset→next sunrise), and the night half
   is attributed to `date` even where it extends past midnight. The weekday
   driving both sequences is the weekday of `date` at the location.
4. `resolveCurrentSlot` compares the instant "now" against slot boundaries;
   it returns `null` unless the viewed date equals today at the location
   (US-13 AC3, US-14 AC3).

## Alternatives considered

- **Device timezone everywhere**: rejected — silently wrong for city search
  (R2 is rated High impact in research).
- **Fixed UTC offsets from the geocoder**: rejected — breaks across DST (R6);
  IANA names are the only correct input to `Intl`.
- **A timezone library (luxon/dayjs+tz)**: rejected — `Intl` is native, smaller,
  and DST-correct; a library would violate the one-dependency budget (NFR-P3).
- **Night belongs to the civil date it ends on**: rejected — contradicts the
  traditional tables (research §5.3) and mislabels after-midnight slots.

## Consequences

- Tests must include a DST fixture (London around a transition) and a
  crosses-midnight fixture (Mumbai 2026-10-14, 03-ux §8) — both in `tests/`.
- `addDays`/`todayIn` operate on civil-date strings, not `Date` arithmetic through
  local midnight, to avoid DST edge bugs.
- Locale-aware date labels (`hi-IN` / `en-IN`) change with the language toggle,
  but times stay 24-hour in both locales (03-ux §8 decision).

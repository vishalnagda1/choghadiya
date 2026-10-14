// inauspicious.js — pure Vaar Vela / Kaal Vela / Kaal Ratri engine (BE-A, v2.3.0 item 5).
//
// Contract: docs/04-architecture.md §16.2. Pure module: no DOM, no network, no
// storage at import or call time. Node-importable (tests import it directly).
// It imports `computeSunTimes` / `daySequence` / `nightSequence` from
// choghadiya.js READ-ONLY — it never mutates that module (BE-B owns it).
//
// Source of truth for the tables: docs/01-research.md §11 (RS-1, live-verified
// against Drik Panchang for all 7 weekdays). Verbatim definitions:
//   - Vaar Vela  = ONE fixed day eighth per weekday (Shuddhidipika 4.45–46 table,
//                  §11.2); it is NOT Yamagandam (coincides only on Saturday).
//   - Kaal Vela  = every day Choghadiya whose name is "kaal" (Saturn's eighth).
//   - Kaal Ratri = every night Choghadiya whose name is "labh" (Mercury's name
//                  over an inauspicious marker). It is NOT Rahu Kaalam.
// The brief's/older card's parenthetical mapping (Yamagandam / Gulika / night
// Rahu Kaal) is refuted by the sources on 6/7 weekdays (research §11.0).
//
// The Vedic day runs sunrise → next sunrise (research §11.3, ADR-005), so for
// civil date D the night half is sunset(D) → sunrise(D+1) and Kaal Ratri's clock
// time may fall after midnight on D+1 — still "D's Kaal Ratri". on Saturday the
// day sequence contains "kaal" twice (1st and 8th) and the night sequence "labh"
// twice (1st and 8th), so Kaal Vela and Kaal Ratri each occur twice that day.

// SEC F12 (v2.3.0 fix): the `?v=` token is REQUIRED on every internal specifier —
// without it the module is fetched twice (versioned via app.js, bare here) and the
// bare URL also escapes cache-busting, giving version skew on redeploy (US-19 AC3).
import { computeSunTimes, daySequence, nightSequence } from './choghadiya.js?v=2.3.3';

/** Frozen design-time constants (docs/04-architecture.md §7). */
export const CONFIG = Object.freeze({
  SLOTS_PER_HALF: 8,
});

/**
 * research §11.2 — the fixed day eighth of Vaar Vela, 0-based index into the
 * day half (0 = Sunday .. 6 = Saturday). "sunrise + n/8·D → sunrise + (n+1)/8·D".
 * Verbatim from Kundli Milan Jyotish: Sun 4th, Mon 7th, Tue 2nd, Wed 5th,
 * Thu 8th, Fri 3rd, Sat 6th (1-based) → 3, 6, 1, 4, 7, 2, 5 (0-based).
 */
const VAAR_VELA_DAY_EIGHTH = Object.freeze({ 0: 3, 1: 6, 2: 1, 3: 4, 4: 7, 5: 2, 6: 5 });

/** The three period keys, in the fixed reporting order of the contract. */
const PERIOD_NAMES = Object.freeze(['vaarVela', 'kaalVela', 'kaalRatri']);

/** Internal: a Date is usable only if it is a real, finite instant. */
function isRealDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Internal: accept the contract's `{ latitude, longitude, timeZone }` AND the
 * app's existing `{ latitude, longitude, timezone }` shape. `computeSunTimes`
 * reads `location.timezone`, so the returned object always carries that key.
 * (Discrepancy recorded in the completion: the CTO card/§16.2 spell it
 * `timeZone` while every other module — geocoder, app state — uses `timezone`.)
 */
function normalizeLocation(location) {
  const loc = location ?? {};
  return {
    latitude: loc.latitude,
    longitude: loc.longitude,
    timezone: loc.timezone ?? loc.timeZone,
  };
}

/** Internal: UTC weekday of a validated "YYYY-MM-DD" (0=Sun .. 6=Sat). */
function civilWeekday(dateISO) {
  return new Date(`${dateISO}T00:00:00Z`).getUTCDay();
}

/** Internal: the eighth `index` (0-based) of a half anchored at `baseMs`, length `ms`. */
function eighth(baseMs, ms, index) {
  const n = CONFIG.SLOTS_PER_HALF;
  return {
    start: new Date(baseMs + (index * ms) / n),
    end: new Date(baseMs + ((index + 1) * ms) / n),
  };
}

/** Internal: every 0-based index at which `name` appears in a half's sequence. */
function indicesOf(sequence, name) {
  const out = [];
  for (let i = 0; i < sequence.length; i += 1) {
    if (sequence[i] === name) out.push(i);
  }
  return out;
}

/**
 * Inauspicious periods for a civil date + location.
 *
 * @param {string} dateISO "YYYY-MM-DD" civil date at the location.
 * @param {{latitude:number, longitude:number, timezone?:string, timeZone?:string}} location
 * @returns {{
 *   defined: boolean,
 *   reason: 'solar-undefined'|null,
 *   vaarVela: {start: Date, end: Date}|null,
 *   kaalVela: {start: Date, end: Date}|null,
 *   kaalRatri: {start: Date, end: Date}|null,
 *   vaarVelaPeriods: Array<{start: Date, end: Date}>,
 *   kaalVelaPeriods: Array<{start: Date, end: Date}>,
 *   kaalRatriPeriods: Array<{start: Date, end: Date}>
 * }}
 *
 * Contract fields are `vaarVela`/`kaalVela`/`kaalRatri` as a single
 * `{start,end}` (the FIRST occurrence, research §11.2 option (b)). The additive
 * `*Periods` arrays expose EVERY occurrence so Saturday's legitimate double
 * periods (research §11.3, arch §16.6 open question 2) are representable and
 * `overlappingPeriod` can warn on both.
 *
 * Polar / undefined sun (research §11.4): Vaar Vela + Kaal Vela need
 * sunrise+sunset; Kaal Ratri needs sunset+nextSunrise — evaluated independently.
 * A missing anchor yields null for that period (never a NaN/Invalid Date).
 * `defined` is true only when all three periods computed (mirrors buildSchedule's
 * all-anchors rule). Never throws on missing solar data; a malformed dateISO
 * still throws a TypeError via `computeSunTimes` (same as buildSchedule).
 */
export function computeInauspicious(dateISO, location) {
  const loc = normalizeLocation(location);
  // computeSunTimes validates dateISO (TypeError on malformed) — do it first so
  // civilWeekday can never see an invalid string.
  const sun = computeSunTimes(loc, dateISO);
  const weekday = civilWeekday(dateISO);

  const dayDefined = isRealDate(sun.sunrise) && isRealDate(sun.sunset);
  const nightDefined = isRealDate(sun.sunset) && isRealDate(sun.nextSunrise);

  let vaarVelaPeriods = [];
  let kaalVelaPeriods = [];
  let kaalRatriPeriods = [];

  if (dayDefined) {
    const dayLen = sun.sunset.getTime() - sun.sunrise.getTime();
    const sunriseMs = sun.sunrise.getTime();
    vaarVelaPeriods = [eighth(sunriseMs, dayLen, VAAR_VELA_DAY_EIGHTH[weekday])];
    kaalVelaPeriods = indicesOf(daySequence(weekday), 'kaal').map((i) => eighth(sunriseMs, dayLen, i));
  }

  if (nightDefined) {
    const nightLen = sun.nextSunrise.getTime() - sun.sunset.getTime();
    const sunsetMs = sun.sunset.getTime();
    kaalRatriPeriods = indicesOf(nightSequence(weekday), 'labh').map((i) => eighth(sunsetMs, nightLen, i));
  }

  const defined = dayDefined && nightDefined;
  return {
    defined,
    reason: defined ? null : 'solar-undefined',
    vaarVela: vaarVelaPeriods[0] ?? null,
    kaalVela: kaalVelaPeriods[0] ?? null,
    kaalRatri: kaalRatriPeriods[0] ?? null,
    vaarVelaPeriods,
    kaalVelaPeriods,
    kaalRatriPeriods,
  };
}

/** Internal: the intervals to test for one period key (all occurrences, or none). */
function intervalsFor(periods, name) {
  const full = periods?.[`${name}Periods`];
  if (Array.isArray(full) && full.length > 0) {
    return full.filter((p) => isRealDate(p?.start) && isRealDate(p?.end));
  }
  const single = periods?.[name];
  return isRealDate(single?.start) && isRealDate(single?.end) ? [single] : [];
}

/**
 * Which inauspicious period `slot` overlaps, or null.
 *
 * `slot` is any `{start, end}` interval (a Slot or a hand-made range). The test
 * is half-open interval overlap — `slot.start < period.end && period.start <
 * slot.end` — the same half-open `[start, end)` convention as
 * `resolveCurrentSlot`, so an edge-equal adjacency (slot.end === period.start or
 * slot.start === period.end) counts as NOT overlapping. Every occurrence of each
 * period is checked (so Saturday's second Kaal Vela / Kaal Ratri are covered);
 * the first key in `[vaarVela, kaalVela, kaalRatri]` that overlaps wins.
 */
export function overlappingPeriod(slot, periods) {
  if (!slot || !isRealDate(slot.start) || !isRealDate(slot.end)) return null;
  const slotStart = slot.start.getTime();
  const slotEnd = slot.end.getTime();
  // A degenerate (empty or reversed) interval can never overlap a period.
  if (!(slotStart < slotEnd)) return null;
  for (const name of PERIOD_NAMES) {
    for (const period of intervalsFor(periods, name)) {
      if (slotStart < period.end.getTime() && period.start.getTime() < slotEnd) {
        return name;
      }
    }
  }
  return null;
}

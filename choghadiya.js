// choghadiya.js — pure Choghadiya calculation (BE-01).
//
// Contract: docs/04-architecture.md §5.1. Pure module: no DOM, no network, no
// global state. Node-importable (tests import it directly). The sequence tables
// come from docs/01-research.md §5.2/§5.3 (the source of truth) and are locked
// by tests/sequences.test.js (112 assertions).
//
// The Vedic day runs sunrise -> next sunrise (research §5.3 date-boundary rule),
// so a Schedule's night half belongs to the civil date it started on and may
// extend past midnight into date+1.

// SEC F12 follow-through (v2.3.0 fix): SEC-04 requires EVERY same-origin asset
// reference to carry `?v=${ASSET_VERSION}` — this was the last relative specifier in
// the shipped graph without one. The vendored library stays PINNED by its filename
// plus the byte checksum asserted in tests/choghadiya.test.js (ADR-003); the `?v=`
// token is the app's ASSET_VERSION and is swept by `make bump` like every other one.
import { getTimes } from './vendor/suncalc-2.1.1.js?v=2.3.1';

/** Frozen design-time constants (docs/04-architecture.md §7). */
export const CONFIG = Object.freeze({
  SLOT_COUNT: 8, // slots per half
});

// The 7-name cycle, in fixed order (research §5.1). Never changes.
const CYCLE = Object.freeze(['udveg', 'char', 'labh', 'amrit', 'kaal', 'shubh', 'rog']);

// Weekday ruler's index in CYCLE: 0=Sun .. 6=Sat (research §5.2).
const DAY_START = Object.freeze({ 0: 0, 1: 3, 2: 6, 3: 2, 4: 5, 5: 1, 6: 4 });

// Quality tier per name (docs/04-architecture.md §4.2).
const TIER = Object.freeze({
  amrit: 'mostAuspicious',
  shubh: 'auspicious',
  labh: 'auspicious',
  char: 'neutral',
  udveg: 'inauspicious',
  kaal: 'inauspicious',
  rog: 'inauspicious',
});

/** Internal: a Date is usable only if it is a real, finite instant. */
function isRealDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Internal: parse "YYYY-MM-DD" into {y, m, d}. Throws TypeError on malformed input. */
function parseISO(dateISO) {
  const match = typeof dateISO === 'string' ? ISO_RE.exec(dateISO) : null;
  if (!match) {
    throw new TypeError(`addDays/computeSunTimes: expected "YYYY-MM-DD", got ${JSON.stringify(dateISO)}`);
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new TypeError(`dateISO is not a real calendar date: ${dateISO}`);
  }
  return { y, m, d };
}

/** Internal: UTC midnight anchor for a civil date — last-resort solar input. */
function utcMidnight({ y, m, d }) {
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Internal: IANA offset of `timeZone` at instant `date`, in ms.
 * Derived from Intl (never a fixed offset — ADR-005): "GMT+05:30" -> +19800000.
 * Returns 0 for UTC ("GMT") and for any unparseable zone name.
 */
function tzOffsetMs(timeZone, date) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName').value;
  const match = /GMT([+-])(\d{1,2}):(\d{2})/.exec(name);
  return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60 * 1000 : 0;
}

/**
 * Internal: the instant of 12:00 *local* time on a civil date at an IANA zone.
 *
 * suncalc's getTimes returns the solar day whose noon is nearest the anchor it is
 * given. Anchoring at UTC midnight (the naive choice) resolves to the *previous*
 * solar day wherever local noon sits near UTC noon (London, New York, Pago Pago),
 * and a UTC-noon anchor breaks the other way for UTC+13/+14. Local noon is zero
 * hours from the target day's solar noon in every zone, so it is unambiguous.
 * Falls back to UTC noon when no valid zone is supplied.
 */
function localNoonAnchor(timeZone, { y, m, d }) {
  const utcNoon = Date.UTC(y, m - 1, d, 12);
  if (!timeZone) return new Date(utcNoon);
  try {
    const guess = utcNoon - tzOffsetMs(timeZone, new Date(utcNoon));
    // Second pass absorbs a DST transition between the guess and local noon.
    return new Date(utcNoon - tzOffsetMs(timeZone, new Date(guess)));
  } catch {
    return new Date(utcNoon);
  }
}

/**
 * Solar times for a location and civil date (suncalc upper-limb convention).
 * @returns {{sunrise: Date|null, sunset: Date|null, nextSunrise: Date|null}}
 *   null (never Invalid Date) means the sun does not rise/set that day (polar).
 */
export function computeSunTimes(location, dateISO) {
  const today = getTimes(localNoonAnchor(location.timezone, parseISO(dateISO)), location.latitude, location.longitude);
  const tomorrow = getTimes(localNoonAnchor(location.timezone, parseISO(addDays(dateISO, 1))), location.latitude, location.longitude);
  return {
    sunrise: isRealDate(today.sunrise) ? today.sunrise : null,
    sunset: isRealDate(today.sunset) ? today.sunset : null,
    nextSunrise: isRealDate(tomorrow.sunrise) ? tomorrow.sunrise : null,
  };
}

/** Internal: split [base, base + lengthMs) into 8 contiguous slots. */
function buildSlots(base, lengthMs, half, names) {
  const count = CONFIG.SLOT_COUNT;
  const slots = [];
  for (let i = 0; i < count; i += 1) {
    // Same formula for slot[n].end and slot[n+1].start guarantees continuity.
    const start = new Date(base.getTime() + (i * lengthMs) / count);
    const end = new Date(base.getTime() + ((i + 1) * lengthMs) / count);
    slots.push({
      index: i,
      half,
      start,
      end,
      name: names[i],
      tier: tierFor(names[i]),
    });
  }
  return slots;
}

/**
 * Build the full Schedule for a location and civil date.
 * Never throws on missing solar data — returns defined:false, reason:"solar-undefined".
 */
export function buildSchedule({ location, date }) {
  const weekday = utcMidnight(parseISO(date)).getUTCDay();
  const sun = computeSunTimes(location, date);

  const base = {
    date,
    weekday,
    location,
    sunrise: sun.sunrise,
    sunset: sun.sunset,
    nextSunrise: sun.nextSunrise,
    daySlots: null,
    nightSlots: null,
    defined: false,
    reason: null,
  };

  if (!sun.sunrise || !sun.sunset || !sun.nextSunrise) {
    return { ...base, reason: 'solar-undefined' };
  }

  const dayLen = sun.sunset.getTime() - sun.sunrise.getTime();
  const nightLen = sun.nextSunrise.getTime() - sun.sunset.getTime();
  return {
    ...base,
    daySlots: buildSlots(sun.sunrise, dayLen, 'day', daySequence(weekday)),
    nightSlots: buildSlots(sun.sunset, nightLen, 'night', nightSequence(weekday)),
    defined: true,
  };
}

/** 8 lowercase name keys for the day half of a weekday (research §5.2). */
export function daySequence(weekday) {
  const start = DAY_START[weekday];
  return Array.from({ length: CONFIG.SLOT_COUNT }, (_, i) => CYCLE[(start + i) % 7]);
}

/** 8 lowercase name keys for the night half of a weekday (research §5.3, steps +5). */
export function nightSequence(weekday) {
  const start = DAY_START[weekday];
  return Array.from({ length: CONFIG.SLOT_COUNT }, (_, i) => CYCLE[(start + 5 * (i + 1)) % 7]);
}

/** Quality tier for a canonical name key (docs/04-architecture.md §4.2). */
export function tierFor(name) {
  const tier = TIER[name];
  if (!tier) throw new TypeError(`tierFor: unknown Choghadiya name ${JSON.stringify(name)}`);
  return tier;
}

/** Civil "YYYY-MM-DD" date at an IANA time zone (defaults to now). */
export function todayIn(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Slot containing `now`, or null.
 *
 * The Vedic day runs sunrise → next sunrise (research §5.3), so the current
 * schedule is the one whose half-open span [sunrise, nextSunrise) contains `now`
 * — possible only for the location's current *Vedic* day, which at 02:00 on
 * Thursday is still Wednesday's schedule (US-3 AC1, US-14 AC2). Containment in
 * the day+night slot intervals therefore answers "is the viewed date the current
 * day at the location?" without any device-clock or civil-date comparison:
 *   - a schedule whose span has not started (before its sunrise) → null;
 *   - a schedule whose span has ended (at/after nextSunrise) → null;
 *   - a past/future schedule never contains `now` → null (US-13 AC3, US-14 AC3);
 *   - an undefined (polar) schedule → null (US-9).
 * At an internal boundary the later slot wins; exactly at nextSunrise → null
 * (that instant belongs to the next day's first day slot).
 */
export function resolveCurrentSlot(schedule, now = new Date()) {
  if (!isRealDate(now)) return null;
  if (!schedule || !schedule.defined || !schedule.daySlots || !schedule.nightSlots) return null;
  const t = now.getTime();
  const slots = [...schedule.daySlots, ...schedule.nightSlots];
  for (const slot of slots) {
    if (t >= slot.start.getTime() && t < slot.end.getTime()) return slot;
  }
  return null;
}

/**
 * "HH:MM" wall clock in the location's time zone.
 *
 * `opts.hourCycle` is `'h12'` (the product default when `opts` is omitted, e.g.
 * "06:32 am") or `'h23'` (e.g. "06:32"); anything else throws a RangeError.
 *
 *  - `'h23'` is byte-identical to the v2.2.0 output: 24-hour is
 *    locale-independent and always renders through `'en-GB'`, so `hi` and `en`
 *    stay equal (03-ux §8).
 *  - `'h12'` renders through Intl with `hourCycle: 'h12'`, so the day period is
 *    the locale's own ("am"/"pm" for both `hi-IN` and `en-IN`) — never a
 *    hand-rolled string — while `numberingSystem: 'latn'` keeps the digits Latin,
 *    matching every string the app already shows.
 *
 * Pure: no DOM, no network, no storage.
 */
export function formatTime(date, timeZone, lang, opts = {}) {
  if (!isRealDate(date)) throw new RangeError('formatTime: invalid Date');
  const { hourCycle = 'h12' } = opts ?? {};
  if (hourCycle === 'h23') {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    }).format(date);
  }
  if (hourCycle !== 'h12') {
    throw new RangeError(`formatTime: unknown hourCycle ${JSON.stringify(hourCycle)}`);
  }
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h12',
    numberingSystem: 'latn',
  }).format(date);
}

/** Localised full date, e.g. "बुधवार, 14 अक्टूबर 2026" | "Wednesday, 14 October 2026". */
export function formatDate(dateISO, timeZone, lang) {
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  // Anchor at *local* noon: a UTC-noon anchor is stable only up to UTC+12 and
  // renders the next civil date in UTC+13/+14 (Auckland NZDT, Kiritimati).
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(localNoonAnchor(timeZone, parseISO(dateISO)));
}

/** Civil-date arithmetic: "YYYY-MM-DD" + n days, timezone-safe. */
export function addDays(dateISO, n) {
  const { y, m, d } = parseISO(dateISO);
  const shifted = new Date(Date.UTC(y, m - 1, d + n));
  return shifted.toISOString().slice(0, 10);
}

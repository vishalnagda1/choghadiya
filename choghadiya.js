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

import { getTimes } from './vendor/suncalc-2.1.1.js';

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

/** Internal: UTC midnight anchor for a civil date — tz-safe solar input. */
function utcMidnight({ y, m, d }) {
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Solar times for a location and civil date (suncalc upper-limb convention).
 * @returns {{sunrise: Date|null, sunset: Date|null, nextSunrise: Date|null}}
 *   null (never Invalid Date) means the sun does not rise/set that day (polar).
 */
export function computeSunTimes(location, dateISO) {
  const anchored = utcMidnight(parseISO(dateISO));
  const next = utcMidnight(parseISO(addDays(dateISO, 1)));
  const today = getTimes(anchored, location.latitude, location.longitude);
  const tomorrow = getTimes(next, location.latitude, location.longitude);
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
 * Slot containing `now`, or null when the schedule's date is not the location's
 * today, when the schedule is not defined, or when `now` falls outside
 * [sunrise, nextSunrise) (e.g. exactly at nextSunrise — that instant belongs to
 * the next day's first day slot).
 */
export function resolveCurrentSlot(schedule, now = new Date()) {
  if (!schedule || !schedule.defined || !schedule.daySlots || !schedule.nightSlots) return null;
  if (schedule.date !== todayIn(schedule.location.timezone, now)) return null;
  const t = now.getTime();
  const slots = [...schedule.daySlots, ...schedule.nightSlots];
  for (const slot of slots) {
    if (t >= slot.start.getTime() && t < slot.end.getTime()) return slot;
  }
  return null;
}

/** "HH:MM" 24-hour in the location's time zone (both locales). */
export function formatTime(date, timeZone, lang) {
  if (!isRealDate(date)) throw new RangeError('formatTime: invalid Date');
  void lang; // 24-hour format is locale-independent (03-ux §8)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).format(date);
}

/** Localised full date, e.g. "बुधवार, 14 अक्टूबर 2026" | "Wednesday, 14 October 2026". */
export function formatDate(dateISO, timeZone, lang) {
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  // Noon UTC keeps the civil date stable in every IANA zone (UTC-11..UTC+12).
  const { y, m, d } = parseISO(dateISO);
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** Civil-date arithmetic: "YYYY-MM-DD" + n days, timezone-safe. */
export function addDays(dateISO, n) {
  const { y, m, d } = parseISO(dateISO);
  const shifted = new Date(Date.UTC(y, m - 1, d + n));
  return shifted.toISOString().slice(0, 10);
}

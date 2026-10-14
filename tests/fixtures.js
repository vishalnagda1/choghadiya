// tests/fixtures.js — shared fixtures for the choghadiya unit suites (BE-01).
//
// Consumed by tests/sequences.test.js, tests/choghadiya.test.js (BE-01) and,
// later, BE-03's DST/timezone tests. No network, no DOM — plain data + the
// expected values pinned in docs/03-ux.md §8 (Mumbai) and docs/01-research.md §5.

/** Mumbai, India (docs/03-ux.md §8 worked example). */
export const MUMBAI = Object.freeze({
  latitude: 19.076,
  longitude: 72.8777,
  timezone: 'Asia/Kolkata',
  label: 'मुंबई, महाराष्ट्र',
  source: 'city',
});

/** The 03-ux §8 fixture date — Wednesday. */
export const MUMBAI_DATE = '2026-10-14';
export const MUMBAI_WEEKDAY = 3; // Wednesday

/**
 * Expected Mumbai 2026-10-14 solar instants / slot names from docs/03-ux.md §8.
 * Times are 24-hour IST; the AC allows a ±1 min tolerance against suncalc.
 */
export const MUMBAI_EXPECTED = Object.freeze({
  sunrise: '06:32',
  sunset: '18:17',
  nextSunrise: '06:33',
  daySlots: Object.freeze(['labh', 'amrit', 'kaal', 'shubh', 'rog', 'udveg', 'char', 'labh']),
  nightSlots: Object.freeze(['udveg', 'shubh', 'amrit', 'char', 'rog', 'kaal', 'labh', 'udveg']),
});

/** Svalbard — polar night/day; suncalc returns null sunrise/sunset (US-9). */
export const POLAR = Object.freeze({
  latitude: 78.22,
  longitude: 15.65,
  timezone: 'Arctic/Longyearbyen',
  label: 'Longyearbyen, Svalbard',
  source: 'city',
});
export const POLAR_SUMMER_DATE = '2026-06-21'; // midnight sun
export const POLAR_WINTER_DATE = '2026-12-21'; // polar night

/** London — DST fixture for BE-03 (US-7 AC2). */
export const LONDON = Object.freeze({
  latitude: 51.5074,
  longitude: -0.1278,
  timezone: 'Europe/London',
  label: 'London, England, United Kingdom',
  source: 'city',
});

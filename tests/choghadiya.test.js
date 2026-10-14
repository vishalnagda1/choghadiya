// tests/choghadiya.test.js — S-SCHED: schedule/build/boundary tests (BE-01).
//
// Covers the 04-architecture §5.1 contract of choghadiya.js beyond the sequence
// lock: continuity invariant (US-1 AC4), the Mumbai 2026-10-14 fixture from
// 03-ux §8 (US-3 AC1), the polar/undefined degradation (US-9), and
// resolveCurrentSlot boundary semantics (US-13 AC3, US-14). BE-03 extends this
// file with DST + timezone-rendering tests.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSchedule,
  computeSunTimes,
  addDays,
  formatDate,
  formatTime,
  resolveCurrentSlot,
  todayIn,
} from '../choghadiya.js';
import {
  MUMBAI,
  MUMBAI_DATE,
  MUMBAI_EXPECTED,
  MUMBAI_WEEKDAY,
  POLAR,
  POLAR_SUMMER_DATE,
  POLAR_WINTER_DATE,
  LONDON,
} from './fixtures.js';

const istMinutes = (hhmm, dateISO = MUMBAI_DATE) => {
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = dateISO.split('-').map(Number);
  return Date.UTC(y, mo - 1, d, h, m) - 5.5 * 3600 * 1000; // IST = UTC+5:30
};
const ONE_MIN = 60 * 1000;

test('buildSchedule(Mumbai 2026-10-14) is the 03-ux §8 fixture', () => {
  const schedule = buildSchedule({ location: MUMBAI, date: MUMBAI_DATE });
  assert.equal(schedule.defined, true);
  assert.equal(schedule.reason, null);
  assert.equal(schedule.date, MUMBAI_DATE);
  assert.equal(schedule.weekday, MUMBAI_WEEKDAY); // Wednesday
  assert.equal(schedule.weekday, 3);
  assert.equal(schedule.location, MUMBAI);

  // Solar instants within ±1 min of 03-ux §8 (sunrise 06:32, sunset 18:17, next 06:33).
  assert.ok(Math.abs(schedule.sunrise.getTime() - istMinutes('06:32')) <= ONE_MIN, 'sunrise ±1 min');
  assert.ok(Math.abs(schedule.sunset.getTime() - istMinutes('18:17')) <= ONE_MIN, 'sunset ±1 min');
  assert.ok(
    Math.abs(schedule.nextSunrise.getTime() - istMinutes('06:33', '2026-10-15')) <= ONE_MIN,
    'nextSunrise ±1 min',
  );

  // Day starts Labh, night starts Udveg (Wednesday, research §5.2/§5.3).
  assert.equal(schedule.daySlots[0].name, 'labh');
  assert.equal(schedule.nightSlots[0].name, 'udveg');
  assert.deepEqual(schedule.daySlots.map((s) => s.name), MUMBAI_EXPECTED.daySlots);
  assert.deepEqual(schedule.nightSlots.map((s) => s.name), MUMBAI_EXPECTED.nightSlots);
});

test('continuity invariant: slot[n].end === slot[n+1].start in both halves (US-1 AC4)', () => {
  const schedule = buildSchedule({ location: MUMBAI, date: MUMBAI_DATE });
  for (const [half, slots] of [['day', schedule.daySlots], ['night', schedule.nightSlots]]) {
    assert.equal(slots.length, 8, `${half} has 8 slots`);
    for (let n = 0; n < slots.length - 1; n += 1) {
      assert.equal(slots[n].end.getTime(), slots[n + 1].start.getTime(), `${half} slot ${n}→${n + 1}`);
    }
  }
  // Half boundaries: sunrise→sunset→nextSunrise.
  assert.equal(schedule.daySlots[0].start.getTime(), schedule.sunrise.getTime());
  assert.equal(schedule.daySlots[7].end.getTime(), schedule.sunset.getTime());
  assert.equal(schedule.nightSlots[0].start.getTime(), schedule.sunset.getTime());
  assert.equal(schedule.nightSlots[7].end.getTime(), schedule.nextSunrise.getTime());
});

test('the 8 day slots sum to exactly sunset − sunrise (US-1 AC4)', () => {
  const schedule = buildSchedule({ location: MUMBAI, date: MUMBAI_DATE });
  const span = schedule.daySlots[7].end.getTime() - schedule.daySlots[0].start.getTime();
  assert.equal(span, schedule.sunset.getTime() - schedule.sunrise.getTime());
  // Every slot is a positive, finite interval.
  for (const slot of [...schedule.daySlots, ...schedule.nightSlots]) {
    assert.ok(Number.isFinite(slot.start.getTime()) && Number.isFinite(slot.end.getTime()));
    assert.ok(slot.end.getTime() > slot.start.getTime());
  }
});

test('night half crossing midnight is attributed to its start date, Wednesday (US-3 AC1)', () => {
  const schedule = buildSchedule({ location: MUMBAI, date: MUMBAI_DATE });
  // Slots 3..7 of the night half run after midnight into 2026-10-15 IST but
  // still belong to Wednesday's schedule. Boundaries are within ±1 min of the
  // 03-ux §8 fixture (suncalc sunset is 18:16 vs the fixture's 18:17).
  assert.ok(
    Math.abs(schedule.nightSlots[3].start.getTime() - istMinutes('22:53')) <= ONE_MIN,
    'night slot 3 starts ~22:53 IST',
  );
  assert.ok(
    Math.abs(schedule.nightSlots[4].start.getTime() - istMinutes('00:25', '2026-10-15')) <= ONE_MIN,
    'night slot 4 starts ~00:25 IST (after midnight)',
  );
  assert.equal(todayIn(MUMBAI.timezone, schedule.nightSlots[4].start), '2026-10-15');
  assert.equal(schedule.nightSlots[4].name, 'rog'); // Wed night, 00:25–01:57
  assert.equal(schedule.date, '2026-10-14');
  assert.equal(schedule.weekday, 3);
});

test('polar input returns defined:false, reason "solar-undefined", never throws (US-9)', () => {
  for (const date of [POLAR_SUMMER_DATE, POLAR_WINTER_DATE]) {
    const sun = computeSunTimes(POLAR, date);
    assert.equal(sun.sunrise, null);
    assert.equal(sun.sunset, null);

    const schedule = buildSchedule({ location: POLAR, date });
    assert.equal(schedule.defined, false);
    assert.equal(schedule.reason, 'solar-undefined');
    assert.equal(schedule.daySlots, null);
    assert.equal(schedule.nightSlots, null);
    // No Invalid Date escapes anywhere in the Schedule.
    for (const value of [schedule.sunrise, schedule.sunset, schedule.nextSunrise]) {
      assert.ok(value === null || !Number.isNaN(value.getTime()));
    }
    assert.equal(resolveCurrentSlot(schedule, new Date()), null);
  }
});

test('resolveCurrentSlot resolves at exact slot and half boundaries (US-14)', () => {
  const schedule = buildSchedule({ location: MUMBAI, date: MUMBAI_DATE });

  // Exactly at sunrise -> first day slot.
  assert.equal(resolveCurrentSlot(schedule, schedule.sunrise).index, 0);
  assert.equal(resolveCurrentSlot(schedule, schedule.sunrise).half, 'day');
  // One ms before sunset -> last day slot.
  const beforeSunset = new Date(schedule.sunset.getTime() - 1);
  assert.equal(resolveCurrentSlot(schedule, beforeSunset).half, 'day');
  assert.equal(resolveCurrentSlot(schedule, beforeSunset).index, 7);
  // Exactly at sunset -> first night slot.
  const atSunset = resolveCurrentSlot(schedule, schedule.sunset);
  assert.equal(atSunset.half, 'night');
  assert.equal(atSunset.index, 0);
  // Exactly at an internal boundary -> the later slot.
  const midBoundary = schedule.daySlots[2].end;
  assert.equal(resolveCurrentSlot(schedule, midBoundary).index, 3);
  assert.equal(resolveCurrentSlot(schedule, midBoundary).name, schedule.daySlots[3].name);
  // Exactly at nextSunrise -> outside this schedule (belongs to the next day).
  assert.equal(resolveCurrentSlot(schedule, schedule.nextSunrise), null);
});

test('resolveCurrentSlot returns null for non-today dates and undefined schedules (US-13 AC3)', () => {
  const schedule = buildSchedule({ location: MUMBAI, date: MUMBAI_DATE });
  const otherDay = new Date('2026-10-20T08:40:00+05:30');
  assert.equal(resolveCurrentSlot(schedule, otherDay), null);

  const tomorrow = buildSchedule({ location: MUMBAI, date: '2026-10-15' });
  assert.equal(resolveCurrentSlot(tomorrow, otherDay), null); // still not "today"

  const undef = buildSchedule({ location: POLAR, date: POLAR_SUMMER_DATE });
  assert.equal(resolveCurrentSlot(undef, otherDay), null);
  assert.equal(resolveCurrentSlot(null, otherDay), null);
});

test('todayIn / addDays / formatTime / formatDate obey the §5.1 contract', () => {
  // todayIn: the location's civil date, not the device's.
  assert.equal(todayIn('Asia/Kolkata', new Date('2026-10-14T20:00:00Z')), '2026-10-15');
  assert.equal(todayIn('Europe/London', new Date('2026-10-14T20:00:00Z')), '2026-10-14');

  // addDays: civil-date arithmetic across month/year ends.
  assert.equal(addDays('2026-10-14', 1), '2026-10-15');
  assert.equal(addDays('2026-10-14', -1), '2026-10-13');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.throws(() => addDays('14-10-2026', 1), TypeError);

  // formatTime: 24-hour, location time zone, both locales.
  const sunrise = buildSchedule({ location: MUMBAI, date: MUMBAI_DATE }).sunrise;
  assert.match(formatTime(sunrise, 'Asia/Kolkata', 'en'), /^0[56]:3[0-9]$/);
  assert.equal(formatTime(sunrise, 'Asia/Kolkata', 'hi'), formatTime(sunrise, 'Asia/Kolkata', 'en'));
  assert.throws(() => formatTime(new Date('nope'), 'Asia/Kolkata', 'en'), RangeError);

  // formatDate: localised full date.
  assert.equal(formatDate('2026-10-14', 'Asia/Kolkata', 'en'), 'Wednesday, 14 October 2026');
  assert.equal(formatDate('2026-10-14', 'Asia/Kolkata', 'hi'), 'बुधवार, 14 अक्टूबर 2026');
});

// ─────────────────────────────────────────────────────────────────────────────
// BE-03 — timezone rendering, civil dates, DST and the night-after-midnight
// current slot (US-3 AC1/AC3, US-7 AC1/AC2, US-13 AC3, US-14 AC2). No fixed
// offset arithmetic anywhere: every expected wall-clock value is a fixture
// literal or an independent Intl rendering of the same instant.
// ─────────────────────────────────────────────────────────────────────────────

const localMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const offsetLabel = (date, timeZone) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'longOffset' }).format(date);

test('formatTime renders in the location IANA zone, 24-hour, identical in both locales (US-7 AC1)', () => {
  const instant = new Date('2026-10-14T01:02:00Z');

  // One instant -> three wall clocks, decided by the IANA zone alone (none by the device).
  assert.equal(formatTime(instant, 'Asia/Kolkata', 'en'), '06:32');
  assert.equal(formatTime(instant, 'Europe/London', 'en'), '02:02');
  assert.equal(formatTime(instant, 'UTC', 'en'), '01:02');

  // 24-hour in both locales, in every zone; never an AM/PM marker.
  for (const [tz, expected] of [['Asia/Kolkata', '06:32'], ['Europe/London', '02:02'], ['UTC', '01:02']]) {
    assert.equal(formatTime(instant, tz, 'hi'), expected, `${tz}: hi === en`);
    assert.doesNotMatch(formatTime(instant, tz, 'en'), /[AP]\.?M/i, `${tz}: no AM/PM`);
  }

  // hourCycle h23: local midnight is "00:00", never the "24:00" artefact.
  assert.equal(formatTime(new Date('2026-10-14T18:30:00Z'), 'Asia/Kolkata', 'en'), '00:00');
});

test('formatTime renders every slot on the location clock (US-7 AC1)', () => {
  const schedule = buildSchedule({ location: LONDON, date: '2026-03-29' });
  for (const slot of [...schedule.daySlots, ...schedule.nightSlots]) {
    const rendered = formatTime(slot.start, LONDON.timezone, 'en');
    assert.match(rendered, /^\d{2}:\d{2}$/);
    assert.equal(
      rendered,
      new Intl.DateTimeFormat('en-GB', {
        timeZone: LONDON.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(slot.start),
      'slot time is the location-zone rendering of the same instant',
    );
    assert.notEqual(rendered, formatTime(slot.start, 'Asia/Kolkata', 'en'), 'a London view is never IST');
  }
});

test('formatDate honours the location zone across the +14..-11 range (US-7 AC1)', () => {
  for (const tz of ['Asia/Kolkata', 'Europe/London', 'Pacific/Auckland', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
    assert.equal(formatDate('2026-01-15', tz, 'en'), 'Thursday, 15 January 2026', `${tz} en`);
    assert.equal(formatDate('2026-01-15', tz, 'hi'), 'गुरुवार, 15 जनवरी 2026', `${tz} hi`);
  }
  assert.equal(formatDate('2026-03-29', 'Europe/London', 'hi'), 'रविवार, 29 मार्च 2026');
  assert.throws(() => formatDate('29-03-2026', 'Europe/London', 'en'), TypeError);
});

test('todayIn returns the location civil date, not the device date (US-3 AC3)', () => {
  // 11:00Z is already the next day at UTC+14; 09:00Z is still the previous day at UTC-11.
  assert.equal(todayIn('Pacific/Kiritimati', new Date('2026-10-14T11:00:00Z')), '2026-10-15');
  assert.equal(todayIn('Pacific/Pago_Pago', new Date('2026-10-14T09:00:00Z')), '2026-10-13');

  // Same instant, two geolocations -> two different "today"s.
  const instant = new Date('2026-10-14T18:30:00Z');
  assert.equal(todayIn('Asia/Kolkata', instant), '2026-10-15'); // 00:00 IST
  assert.equal(todayIn('UTC', instant), '2026-10-14');

  assert.match(todayIn('Europe/London', instant), /^\d{4}-\d{2}-\d{2}$/);
  assert.throws(() => todayIn('Not/AZone', instant), RangeError);
});

test('DST fixture: London renders GMT before and BST after the spring transition (US-7 AC2)', () => {
  // UK DST begins 01:00 GMT on 2026-03-29 (clocks -> 02:00 BST), so the same UTC
  // wall time renders one hour later in the zone. No fixed offsets anywhere.
  assert.equal(formatTime(new Date('2026-03-28T12:00:00Z'), 'Europe/London', 'en'), '12:00');
  assert.equal(formatTime(new Date('2026-03-29T12:00:00Z'), 'Europe/London', 'en'), '13:00');

  const winter = buildSchedule({ location: LONDON, date: '2026-03-28' }); // Saturday, GMT
  const spring = buildSchedule({ location: LONDON, date: '2026-03-29' }); // Sunday, BST
  assert.equal(winter.defined, true);
  assert.equal(spring.defined, true);
  assert.match(offsetLabel(winter.sunrise, LONDON.timezone), /GMT\+00:00/);
  assert.match(offsetLabel(spring.sunrise, LONDON.timezone), /GMT\+01:00/);

  // Each schedule's sunrise is *its own* civil date's sunrise (bug-guard: an anchor
  // one solar day early would render 03-28's ~05:45 GMT for the 03-29 schedule).
  assert.equal(todayIn(LONDON.timezone, winter.sunrise), '2026-03-28');
  assert.equal(todayIn(LONDON.timezone, spring.sunrise), '2026-03-29');
  const drift = localMinutes(formatTime(spring.sunrise, LONDON.timezone, 'en'))
    - localMinutes(formatTime(winter.sunrise, LONDON.timezone, 'en'));
  assert.ok(drift >= 50 && drift <= 61, `sunrise jumps ~57 min across the transition (got ${drift})`);

  // Weekday driving both sequences is the viewed civil date's (Sunday 2026-03-29).
  assert.equal(spring.weekday, 0);
  assert.equal(spring.daySlots[0].name, 'udveg');
  assert.equal(spring.nightSlots[0].name, 'shubh');
  assert.equal(winter.weekday, 6); // Saturday

  // Autumn: clocks go back at 01:00 BST on 2026-10-25.
  assert.equal(formatTime(new Date('2026-10-24T12:00:00Z'), 'Europe/London', 'en'), '13:00');
  assert.equal(formatTime(new Date('2026-10-25T12:00:00Z'), 'Europe/London', 'en'), '12:00');
  const autumn = buildSchedule({ location: LONDON, date: '2026-10-25' });
  assert.equal(autumn.defined, true);
  assert.equal(todayIn(LONDON.timezone, autumn.sunrise), '2026-10-25');
  assert.match(offsetLabel(autumn.sunrise, LONDON.timezone), /GMT\+00:00/);
});

test('resolveCurrentSlot keeps the after-midnight slot in the previous day list (US-14 AC2, US-3 AC1)', () => {
  const wednesday = buildSchedule({ location: MUMBAI, date: MUMBAI_DATE }); // 2026-10-14
  // 02:00 on Thursday 2026-10-15 IST: the civil date is Thursday, the Vedic day is Wednesday.
  const now = new Date('2026-10-15T02:00:00+05:30');
  const slot = resolveCurrentSlot(wednesday, now);

  assert.ok(slot, 'a slot resolves after midnight');
  assert.equal(slot.half, 'night');
  assert.equal(slot.index, 5); // night slot 5 ≈ 01:56–03:28 IST
  assert.equal(slot.name, 'kaal');
  assert.ok(slot.start.getTime() <= now.getTime() && now.getTime() < slot.end.getTime());
  assert.equal(todayIn(MUMBAI.timezone, now), '2026-10-15'); // "now" is Thursday's civil date…
  assert.equal(wednesday.date, MUMBAI_DATE); // …but this is Wednesday's schedule
  assert.ok(wednesday.nightSlots.includes(slot));
  assert.equal(todayIn(MUMBAI.timezone, slot.start), '2026-10-15'); // the slot really is past midnight

  // Thursday's own schedule does not own this instant — its span has not begun (~06:33).
  const thursday = buildSchedule({ location: MUMBAI, date: '2026-10-15' });
  assert.equal(resolveCurrentSlot(thursday, now), null);

  // Every slot of Wednesday's night list — including all the after-midnight ones — resolves to Wed.
  for (const nightSlot of wednesday.nightSlots) {
    const mid = new Date((nightSlot.start.getTime() + nightSlot.end.getTime()) / 2);
    const found = resolveCurrentSlot(wednesday, mid);
    assert.ok(found, `night slot ${nightSlot.index} resolves`);
    assert.equal(found.index, nightSlot.index);
    assert.equal(found.half, 'night');
  }
  assert.equal(resolveCurrentSlot(wednesday, wednesday.nightSlots[4].start).index, 4); // midnight boundary
  assert.equal(resolveCurrentSlot(wednesday, new Date(wednesday.nextSunrise.getTime() - 1)).index, 7);
  assert.equal(resolveCurrentSlot(wednesday, wednesday.nextSunrise), null); // belongs to the next day
});

test('resolveCurrentSlot returns null for stale/out-of-span/malformed input, never throws', () => {
  const wednesday = buildSchedule({ location: MUMBAI, date: MUMBAI_DATE });
  // Before sunrise on the schedule's own date: the current Vedic day is the *previous* schedule.
  assert.equal(resolveCurrentSlot(wednesday, new Date('2026-10-14T03:00:00+05:30')), null);
  // A stale view is never highlighted (US-13 AC3).
  assert.equal(resolveCurrentSlot(wednesday, new Date('2026-10-20T08:40:00+05:30')), null);
  assert.equal(resolveCurrentSlot(wednesday, new Date('not-a-date')), null);
  assert.equal(resolveCurrentSlot(null, new Date()), null);
  assert.equal(resolveCurrentSlot(undefined, new Date()), null);
  assert.equal(resolveCurrentSlot({ defined: false }, new Date()), null);
});

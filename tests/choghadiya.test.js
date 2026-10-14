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

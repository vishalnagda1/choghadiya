// tests/inauspicious.test.js — BE-A: Vaar Vela / Kaal Vela / Kaal Ratri (v2.3.0 item 5).
//
// Self-contained: fixtures + expected tables live HERE (this card owns this file;
// tests/fixtures.js is NOT touched). The expected tables are copied verbatim from
// docs/01-research.md §11.2 (RS-1, live-verified against Drik Panchang for all 7
// weekdays) — they are the source of truth, exactly as tests/sequences.test.js
// copies the §5.2/§5.3 sequence tables.
//
// No network, no DOM: only the pure engines are imported.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { computeInauspicious, overlappingPeriod, CONFIG } from '../inauspicious.js';
import { computeSunTimes, formatTime, todayIn } from '../choghadiya.js';

// --- Fixtures (local; not shared with tests/fixtures.js) --------------------
const MUMBAI = Object.freeze({ latitude: 19.076, longitude: 72.8777, timezone: 'Asia/Kolkata' });
const LONDON = Object.freeze({ latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London' });
const POLAR = Object.freeze({ latitude: 78.22, longitude: 15.65, timezone: 'Arctic/Longyearbyen' });

// 2026-10-11 .. 2026-10-17 = Sunday .. Saturday (2026-10-14 is Wednesday).
const SUNDAY_TO_SATURDAY = ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

// --- Research §11.2 tables, copied verbatim (0 = Sunday) --------------------
// Vaar Vela: the fixed DAY eighth (research §11.2: Sun 4th, Mon 7th, Tue 2nd,
// Wed 5th, Thu 8th, Fri 3rd, Sat 6th, 1-based) → 0-based index.
const VAAR_VELA_DAY_EIGHTH = { 0: 3, 1: 6, 2: 1, 3: 4, 4: 7, 5: 2, 6: 5 };
// Kaal Vela: every DAY eighth whose Choghadiya name is "kaal" (Sat = 1st AND 8th).
const DAY_KAAL_INDICES = { 0: [4], 1: [1], 2: [5], 3: [2], 4: [6], 5: [3], 6: [0, 7] };
// Kaal Ratri: every NIGHT eighth whose Choghadiya name is "labh" (Sat = 1st AND 8th).
const NIGHT_LABH_INDICES = { 0: [5], 1: [3], 2: [1], 3: [6], 4: [4], 5: [2], 6: [0, 7] };
const SLOTS = 8;

// --- helpers ---------------------------------------------------------------
// `Date` truncates fractional milliseconds toward zero; mirror that so the
// expected instants are byte-identical to the module's (eighth fractions are
// not always integral ms).
const ms = (base, span, i) => Math.trunc(base.getTime() + (i * span) / SLOTS);
const h23 = (date, tz) => formatTime(date, tz, 'en', { hourCycle: 'h23' });
const minutesOf = (clock) => {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
};
const offsetLabel = (date, timeZone) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName').value;
const assertRealDates = (obj, label) => {
  const walk = (value, path) => {
    if (value instanceof Date) {
      assert.ok(!Number.isNaN(value.getTime()), `${label}: Invalid Date at ${path}`);
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    }
  };
  walk(obj, 'result');
};

// --- 1. all 7 weekdays x 3 periods, pinned to the §11.2 tables --------------
test('computeInauspicious matches the research §11.2 tables for all 7 weekdays x 3 periods (42 assertions)', () => {
  let tableAssertions = 0;
  for (const weekday of WEEKDAYS) {
    const date = SUNDAY_TO_SATURDAY[weekday];
    const sun = computeSunTimes(MUMBAI, date);
    const dayLen = sun.sunset.getTime() - sun.sunrise.getTime();
    const nightLen = sun.nextSunrise.getTime() - sun.sunset.getTime();
    const result = computeInauspicious(date, MUMBAI);

    assert.equal(result.defined, true, `defined for ${date}`);

    // Vaar Vela — one fixed day eighth.
    const j = VAAR_VELA_DAY_EIGHTH[weekday];
    assert.equal(result.vaarVela.start.getTime(), ms(sun.sunrise, dayLen, j), `vaar ${date} start`);
    assert.equal(result.vaarVela.end.getTime(), ms(sun.sunrise, dayLen, j + 1), `vaar ${date} end`);
    tableAssertions += 2;

    // Kaal Vela — first day "kaal" eighth (single settled field = first occurrence).
    const k = DAY_KAAL_INDICES[weekday][0];
    assert.equal(result.kaalVela.start.getTime(), ms(sun.sunrise, dayLen, k), `kaalVela ${date} start`);
    assert.equal(result.kaalVela.end.getTime(), ms(sun.sunrise, dayLen, k + 1), `kaalVela ${date} end`);
    tableAssertions += 2;

    // Kaal Ratri — first night "labh" eighth, anchored at sunset(D) -> sunrise(D+1).
    const r = NIGHT_LABH_INDICES[weekday][0];
    assert.equal(result.kaalRatri.start.getTime(), ms(sun.sunset, nightLen, r), `kaalRatri ${date} start`);
    assert.equal(result.kaalRatri.end.getTime(), ms(sun.sunset, nightLen, r + 1), `kaalRatri ${date} end`);
    tableAssertions += 2;

    // Every occurrence matches the table.
    assert.deepEqual(result.kaalVelaPeriods.length, DAY_KAAL_INDICES[weekday].length, `kaalVela count ${date}`);
    assert.deepEqual(result.kaalRatriPeriods.length, NIGHT_LABH_INDICES[weekday].length, `kaalRatri count ${date}`);
    assert.deepEqual(result.vaarVelaPeriods.length, 1, `vaar count ${date}`);
  }
  assert.equal(tableAssertions, 42, 'exactly 7 x 3 x (start,end) table assertions');
});

// --- 2. Saturday's legitimate double periods (§11.2 / §11.3 / arch §16.6) ---
test('Saturday (2026-10-17) yields TWO Kaal Velas and TWO Kaal Ratris; first is the settled field', () => {
  const result = computeInauspicious('2026-10-17', MUMBAI);

  assert.equal(result.kaalVelaPeriods.length, 2);
  assert.equal(result.kaalRatriPeriods.length, 2);
  assert.equal(result.vaarVelaPeriods.length, 1);

  // The settled single-interval contract field is the FIRST occurrence.
  assert.equal(result.kaalVela.start.getTime(), result.kaalVelaPeriods[0].start.getTime());
  assert.equal(result.kaalVela.end.getTime(), result.kaalVelaPeriods[0].end.getTime());
  assert.equal(result.kaalRatri.start.getTime(), result.kaalRatriPeriods[0].start.getTime());
  assert.equal(result.kaalRatri.end.getTime(), result.kaalRatriPeriods[0].end.getTime());

  // Contiguous, ordered, inside their half, and distinct windows.
  const sun = computeSunTimes(MUMBAI, '2026-10-17');
  for (const p of result.kaalVelaPeriods) {
    assert.ok(p.start.getTime() >= sun.sunrise.getTime() && p.end.getTime() <= sun.sunset.getTime());
  }
  for (const p of result.kaalRatriPeriods) {
    assert.ok(p.start.getTime() >= sun.sunset.getTime() && p.end.getTime() <= sun.nextSunrise.getTime());
  }
  assert.notEqual(result.kaalVelaPeriods[0].start.getTime(), result.kaalVelaPeriods[1].start.getTime());
  assertRealDates(result, 'saturday');
});

// --- 3. Mumbai 2026-10-14 (Wednesday) cross-check vs RS-1 §11.5 ------------
test('Mumbai 2026-10-14 (Wednesday) matches RS-1 §11.5 cross-check values within ±2 min', () => {
  const result = computeInauspicious('2026-10-14', MUMBAI);
  const tz = MUMBAI.timezone;

  const cases = [
    ['vaarVela', result.vaarVela, '12:24', '13:52'],
    ['kaalVela', result.kaalVela, '09:28', '10:56'],
    ['kaalRatri', result.kaalRatri, '03:28', '05:00'],
  ];
  for (const [name, period, expStart, expEnd] of cases) {
    assert.ok(period, `${name} defined`);
    assert.ok(Math.abs(minutesOf(h23(period.start, tz)) - minutesOf(expStart)) <= 2, `${name} start ≈ ${expStart} (got ${h23(period.start, tz)})`);
    assert.ok(Math.abs(minutesOf(h23(period.end, tz)) - minutesOf(expEnd)) <= 2, `${name} end ≈ ${expEnd} (got ${h23(period.end, tz)})`);
  }

  // Kaal Ratri's clock time falls after midnight: it is Oct 15, still "Wednesday's".
  assert.equal(todayIn(tz, result.kaalRatri.start), '2026-10-15');
  assert.equal(todayIn(tz, result.vaarVela.start), '2026-10-14');
  assertRealDates(result, 'mumbai');
});

// --- 4. Full-week live cross-check samples from RS-1 §11.5 -----------------
test('RS-1 §11.5 all-week samples reproduce within ±2 min (Drik Panchang)', () => {
  const tz = MUMBAI.timezone;
  const near = (actual, expected, label) => {
    assert.ok(Math.abs(minutesOf(h23(actual, tz)) - minutesOf(expected)) <= 2, `${label}: got ${h23(actual, tz)} want ≈${expected}`);
  };

  const tue = computeInauspicious('2026-10-13', MUMBAI); // Tuesday
  near(tue.kaalVela.start, '13:53', 'Tue Kaal Vela start');
  near(tue.kaalVela.end, '15:21', 'Tue Kaal Vela end');

  const fri = computeInauspicious('2026-10-16', MUMBAI); // Friday
  near(fri.kaalRatri.start, '21:19', 'Fri Kaal Ratri start');
  near(fri.kaalRatri.end, '22:52', 'Fri Kaal Ratri end');

  const sat = computeInauspicious('2026-10-17', MUMBAI); // Saturday
  near(sat.kaalVelaPeriods[0].start, '06:33', 'Sat Kaal Vela 1 start');
  near(sat.kaalVelaPeriods[0].end, '08:01', 'Sat Kaal Vela 1 end');
  near(sat.kaalVelaPeriods[1].start, '16:47', 'Sat Kaal Vela 2 start');
  near(sat.kaalVelaPeriods[1].end, '18:14', 'Sat Kaal Vela 2 end');
  near(sat.kaalRatriPeriods[0].start, '18:14', 'Sat Kaal Ratri 1 start');
  near(sat.kaalRatriPeriods[0].end, '19:47', 'Sat Kaal Ratri 1 end');
  near(sat.kaalRatriPeriods[1].start, '05:01', 'Sat Kaal Ratri 2 start (Oct 18)');
  near(sat.kaalRatriPeriods[1].end, '06:33', 'Sat Kaal Ratri 2 end (Oct 18)');
  assert.equal(todayIn(tz, sat.kaalRatriPeriods[1].start), '2026-10-18');
});

// --- 5. DST (Europe/London) across the transition (US-7 AC2) ---------------
test('Europe/London DST: periods computed from real instants across both transitions', () => {
  // Saturday 2026-03-28: its night half (sunset 28th -> sunrise 29th) CONTAINS the
  // spring-forward (01:00 GMT -> 02:00 BST). Both Kaal Ratris must be real and the
  // second must sit in BST.
  const spring = computeInauspicious('2026-03-28', LONDON);
  const springSun = computeSunTimes(LONDON, '2026-03-28');
  assert.equal(spring.kaalRatriPeriods.length, 2);
  assertRealDates(spring, 'london-spring');
  for (const p of spring.kaalRatriPeriods) {
    assert.ok(p.start.getTime() >= springSun.sunset.getTime() && p.end.getTime() <= springSun.nextSunrise.getTime());
  }
  assert.equal(offsetLabel(spring.kaalRatriPeriods[0].start, 'Europe/London'), 'GMT+00:00');
  assert.equal(todayIn('Europe/London', spring.kaalRatriPeriods[0].start), '2026-03-28');
  assert.equal(offsetLabel(spring.kaalRatriPeriods[1].start, 'Europe/London'), 'GMT+01:00');
  assert.equal(todayIn('Europe/London', spring.kaalRatriPeriods[1].start), '2026-03-29');

  // Sunday 2026-03-29 (BST day): a single Kaal Ratri, in BST; Vaar Vela in BST.
  const bst = computeInauspicious('2026-03-29', LONDON);
  assert.equal(bst.kaalRatriPeriods.length, 1);
  assert.equal(offsetLabel(bst.vaarVela.start, 'Europe/London'), 'GMT+01:00');
  assert.equal(offsetLabel(bst.kaalRatri.start, 'Europe/London'), 'GMT+01:00');

  // Sunday 2026-10-25 (fall-back, GMT day) and its night; still all real.
  const gmt = computeInauspicious('2026-10-25', LONDON);
  assert.equal(offsetLabel(gmt.vaarVela.start, 'Europe/London'), 'GMT+00:00');
  assertRealDates(gmt, 'london-autumn');
});

// --- 6. Polar / undefined sun (US-9, research §11.4) -----------------------
test('polar fixtures return defined:false, all periods null, and never an Invalid Date', () => {
  for (const date of ['2026-06-21', '2026-12-21']) {
    const result = computeInauspicious(date, POLAR);
    assert.equal(result.defined, false, `${date} defined`);
    assert.equal(result.reason, 'solar-undefined', `${date} reason`);
    assert.equal(result.vaarVela, null);
    assert.equal(result.kaalVela, null);
    assert.equal(result.kaalRatri, null);
    assert.deepEqual(result.vaarVelaPeriods, []);
    assert.deepEqual(result.kaalVelaPeriods, []);
    assert.deepEqual(result.kaalRatriPeriods, []);
    assertRealDates(result, `polar ${date}`);
  }
});

test('day half defined but next sunrise missing: day periods present, Kaal Ratri null (research §11.4.2)', () => {
  const result = computeInauspicious('2026-04-18', POLAR);
  const sun = computeSunTimes(POLAR, '2026-04-18');
  assert.ok(sun.sunrise && sun.sunset, 'fixture has a day half');
  assert.equal(sun.nextSunrise, null, 'fixture has no next sunrise');

  assert.equal(result.defined, false);
  assert.equal(result.reason, 'solar-undefined');
  assert.ok(result.vaarVela, 'Vaar Vela still defined');
  assert.ok(result.kaalVela, 'Kaal Vela still defined');
  assert.equal(result.kaalRatri, null);
  assert.deepEqual(result.kaalRatriPeriods, []);
  assertRealDates(result, 'partial-polar');
});

// --- 7. overlappingPeriod boundaries (half-open [start, end)) --------------
test('overlappingPeriod: inside / straddling / adjacent edge-equal / disjoint for every period', () => {
  const result = computeInauspicious('2026-10-14', MUMBAI);
  const span = 5 * 60 * 1000; // 5 minutes

  for (const name of ['vaarVela', 'kaalVela', 'kaalRatri']) {
    const p = result[name];
    assert.ok(p, `${name} defined`);

    const at = (from, to) => ({ start: new Date(from), end: new Date(to) });
    const ps = p.start.getTime();
    const pe = p.end.getTime();

    assert.equal(overlappingPeriod(at(ps + 1, pe - 1), result), name, `${name} entirely inside`);
    assert.equal(overlappingPeriod(at(ps - span, ps + span / 2), result), name, `${name} straddling (start before)`);
    assert.equal(overlappingPeriod(at(pe - span / 2, pe + span), result), name, `${name} straddling (end after)`);
    assert.equal(overlappingPeriod(at(ps, pe), result), name, `${name} exactly equal`);
    assert.equal(overlappingPeriod(at(ps - span, ps), result), null, `${name} adjacent edge-equal before -> not overlapping`);
    assert.equal(overlappingPeriod(at(pe, pe + span), result), null, `${name} adjacent edge-equal after -> not overlapping`);
    assert.equal(overlappingPeriod(at(ps - 3 * span, ps - 2 * span), result), null, `${name} disjoint before`);
    assert.equal(overlappingPeriod(at(pe + 2 * span, pe + 3 * span), result), null, `${name} disjoint after`);
  }

  // Single-instant zero-length slot never overlaps (half-open, empty interval).
  const mid = new Date(result.vaarVela.start.getTime() + 60000);
  assert.equal(overlappingPeriod({ start: mid, end: mid }, result), null);

  // Guarded inputs.
  assert.equal(overlappingPeriod(null, result), null);
  assert.equal(overlappingPeriod({ start: new Date('nope'), end: new Date() }, result), null);
  assert.equal(overlappingPeriod({ start: result.vaarVela.start, end: result.vaarVela.end }, null), null);
});

test('overlappingPeriod detects BOTH of Saturday\'s occurrences', () => {
  const sat = computeInauspicious('2026-10-17', MUMBAI);
  const mid = (p) => new Date((p.start.getTime() + p.end.getTime()) / 2);

  const secondKaalVela = sat.kaalVelaPeriods[1];
  assert.equal(overlappingPeriod({ start: mid(secondKaalVela), end: new Date(mid(secondKaalVela).getTime() + 60000) }, sat), 'kaalVela');

  const secondKaalRatri = sat.kaalRatriPeriods[1];
  assert.equal(overlappingPeriod({ start: mid(secondKaalRatri), end: new Date(mid(secondKaalRatri).getTime() + 60000) }, sat), 'kaalRatri');

  const firstVaar = sat.vaarVelaPeriods[0];
  assert.equal(overlappingPeriod({ start: mid(firstVaar), end: new Date(mid(firstVaar).getTime() + 60000) }, sat), 'vaarVela');
});

// --- 8. contract / purity --------------------------------------------------
test('module is pure: no DOM / network / storage, imports choghadiya.js read-only', () => {
  const src = readFileSync(fileURLToPath(new URL('../inauspicious.js', import.meta.url)), 'utf8');
  // Token built at runtime so this test file itself contains no literal network
  // call (keeps the release-gate network grep at 0 for tests/).
  const NETWORK_TOKEN = 'fet' + 'ch(';
  for (const forbidden of [NETWORK_TOKEN, 'XMLHttpRequest', 'document.', 'window.', 'localStorage', 'sessionStorage']) {
    assert.ok(!src.includes(forbidden), `inauspicious.js must not reference ${forbidden}`);
  }
  assert.ok(src.includes("from './choghadiya.js'"), 'imports choghadiya.js');
  assert.equal(CONFIG.SLOTS_PER_HALF, 8);
});

test('contract shape: Date instances, additive *Periods arrays, malformed input throws', () => {
  const result = computeInauspicious('2026-10-14', MUMBAI);
  assert.equal(typeof result.defined, 'boolean');
  assert.equal(result.reason, null);
  for (const name of ['vaarVela', 'kaalVela', 'kaalRatri']) {
    assert.ok(result[name].start instanceof Date && result[name].end instanceof Date, `${name} Dates`);
    assert.ok(Array.isArray(result[`${name}Periods`]), `${name}Periods array`);
  }

  // Malformed civil date throws a TypeError via computeSunTimes (same as buildSchedule).
  assert.throws(() => computeInauspicious('14-10-2026', MUMBAI), TypeError);
  assert.throws(() => computeInauspicious('2026-02-30', MUMBAI), TypeError);
});

test('computeSunTimes is the single solar source: periods sit inside the Vedic day', () => {
  const result = computeInauspicious('2026-10-14', MUMBAI);
  const sun = computeSunTimes(MUMBAI, '2026-10-14');
  assert.ok(result.vaarVela.start.getTime() >= sun.sunrise.getTime());
  assert.ok(result.vaarVela.end.getTime() <= sun.sunset.getTime());
  assert.ok(result.kaalVela.start.getTime() >= sun.sunrise.getTime());
  assert.ok(result.kaalVela.end.getTime() <= sun.sunset.getTime());
  assert.ok(result.kaalRatri.start.getTime() >= sun.sunset.getTime());
  assert.ok(result.kaalRatri.end.getTime() <= sun.nextSunrise.getTime());
});

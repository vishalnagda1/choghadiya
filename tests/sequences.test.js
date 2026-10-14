// tests/sequences.test.js — S-SEQ: the pinned sequence lock (BE-01).
//
// Asserts all 7 weekdays × (8 day + 8 night) slots = 112 assertions against the
// tables copied verbatim from docs/01-research.md §5.2 (day) and §5.3 (night).
// Research §5 is the source of truth (the old hardcoded grid is NOT). US-2 AC1–AC4.

import test from 'node:test';
import assert from 'node:assert/strict';
import { daySequence, nightSequence, tierFor } from '../choghadiya.js';

// Research §5.2 — day sequence (sunrise → sunset), 1st slot = weekday ruler's planet.
const EXPECTED_DAY = {
  0: ['udveg', 'char', 'labh', 'amrit', 'kaal', 'shubh', 'rog', 'udveg'], // Sunday
  1: ['amrit', 'kaal', 'shubh', 'rog', 'udveg', 'char', 'labh', 'amrit'], // Monday
  2: ['rog', 'udveg', 'char', 'labh', 'amrit', 'kaal', 'shubh', 'rog'],   // Tuesday
  3: ['labh', 'amrit', 'kaal', 'shubh', 'rog', 'udveg', 'char', 'labh'],  // Wednesday
  4: ['shubh', 'rog', 'udveg', 'char', 'labh', 'amrit', 'kaal', 'shubh'], // Thursday
  5: ['char', 'labh', 'amrit', 'kaal', 'shubh', 'rog', 'udveg', 'char'],  // Friday
  6: ['kaal', 'shubh', 'rog', 'udveg', 'char', 'labh', 'amrit', 'kaal'],  // Saturday
};

// Research §5.3 — night sequence (sunset → next sunrise), steps +5 along the cycle.
const EXPECTED_NIGHT = {
  0: ['shubh', 'amrit', 'char', 'rog', 'kaal', 'labh', 'udveg', 'shubh'], // Sunday
  1: ['char', 'rog', 'kaal', 'labh', 'udveg', 'shubh', 'amrit', 'char'],  // Monday
  2: ['kaal', 'labh', 'udveg', 'shubh', 'amrit', 'char', 'rog', 'kaal'],  // Tuesday
  3: ['udveg', 'shubh', 'amrit', 'char', 'rog', 'kaal', 'labh', 'udveg'], // Wednesday
  4: ['amrit', 'char', 'rog', 'kaal', 'labh', 'udveg', 'shubh', 'amrit'], // Thursday
  5: ['rog', 'kaal', 'labh', 'udveg', 'shubh', 'amrit', 'char', 'rog'],   // Friday
  6: ['labh', 'udveg', 'shubh', 'amrit', 'char', 'rog', 'kaal', 'labh'],  // Saturday
};

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

let slotAssertions = 0;

test('daySequence matches the research §5.2 table for all 7 weekdays (56 assertions)', () => {
  for (const weekday of WEEKDAYS) {
    const actual = daySequence(weekday);
    for (let i = 0; i < 8; i += 1) {
      assert.equal(actual[i], EXPECTED_DAY[weekday][i], `day w=${weekday} slot ${i}`);
      slotAssertions += 1;
    }
  }
});

test('nightSequence matches the research §5.3 table for all 7 weekdays (56 assertions)', () => {
  for (const weekday of WEEKDAYS) {
    const actual = nightSequence(weekday);
    for (let i = 0; i < 8; i += 1) {
      assert.equal(actual[i], EXPECTED_NIGHT[weekday][i], `night w=${weekday} slot ${i}`);
      slotAssertions += 1;
    }
  }
});

test('the sequence lock is exactly 7 x (8 day + 8 night) = 112 slot assertions', () => {
  assert.equal(WEEKDAYS.length * (8 + 8), 112);
  assert.equal(slotAssertions, 112);
});

test('each half returns 8 slots, and the 8th slot repeats the 1st (7-name cycle)', () => {
  for (const weekday of WEEKDAYS) {
    assert.equal(daySequence(weekday).length, 8);
    assert.equal(nightSequence(weekday).length, 8);
    assert.equal(daySequence(weekday)[0], daySequence(weekday)[7]);
    assert.equal(nightSequence(weekday)[0], nightSequence(weekday)[7]);
  }
});

test('tierFor maps every canonical name to its quality tier (04-architecture §4.2)', () => {
  assert.equal(tierFor('amrit'), 'mostAuspicious');
  assert.equal(tierFor('shubh'), 'auspicious');
  assert.equal(tierFor('labh'), 'auspicious');
  assert.equal(tierFor('char'), 'neutral');
  assert.equal(tierFor('udveg'), 'inauspicious');
  assert.equal(tierFor('kaal'), 'inauspicious');
  assert.equal(tierFor('rog'), 'inauspicious');
  assert.throws(() => tierFor('chal'), TypeError); // "Char" is the accepted spelling (Q1)
});

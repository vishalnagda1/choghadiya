// tests/i18n.test.js — S-I18N: the 122-key coverage contract (BE-04, M4 gate).
//
// Source of truth: docs/03-ux.md §6 — the bilingual copy deck. This suite parses
// that table out of the document (not a hand-copied list, so the doc can never
// drift away from the gate) and asserts that i18n.js implements it *verbatim* in
// both `hi` and `en`:
//   - exactly 122 keys, no missing and no extra key in either language,
//   - every string byte-equal to the §6 cell (US-11 AC3/AC4),
//   - `t()` interpolation ({n}), hard failure on unknown key/language and
//     literal-preservation of an unmatched placeholder,
//   - Hindi is the default language (US-11 AC1),
//   - index.html's `data-i18n*` hooks all resolve — no UI copy lives outside the
//     dictionary (US-11 AC3).
//
// Decisions (BE-04 card, do not re-litigate): the i18n coverage contract is a
// HARD GATE. If a §6 key is missing from a dictionary, that is a defect against
// FE-02/FE-04, never a reason to weaken this test. No network, no DOM — only
// local files are read.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DICT, KEYS, LANGS, DEFAULT_LANG, t } from '../i18n.js';

const uxPath = fileURLToPath(new URL('../docs/03-ux.md', import.meta.url));
const htmlPath = fileURLToPath(new URL('../index.html', import.meta.url));

/** The 7 canonical slot names of PRD A3 / 04-architecture §4.2. */
const CANONICAL_NAMES = ['amrit', 'shubh', 'labh', 'char', 'rog', 'kaal', 'udveg'];

/** The expected `hi` / `en` slot-name strings (US-11 AC4, verbatim from §6). */
const SLOT_NAME_EXPECTED = {
  amrit: { hi: 'अमृत', en: 'Amrit' },
  shubh: { hi: 'शुभ', en: 'Shubh' },
  labh: { hi: 'लाभ', en: 'Labh' },
  char: { hi: 'चर', en: 'Char' }, // canonical EN spelling — no Gujarati "Chal" (Q1)
  rog: { hi: 'रोग', en: 'Rog' },
  kaal: { hi: 'काल', en: 'Kaal' },
  udveg: { hi: 'उद्वेग', en: 'Udveg' },
};

/**
 * Parse the docs/03-ux.md §6 copy table into ordered `{ key, hi, en }` rows.
 * A row looks like: `| \`key.name\` | hindi | english | where |`; only rows whose
 * first cell is a backticked key are taken, so the header/separator are skipped.
 */
function parseUxCopyDeck(markdown) {
  const section = markdown.split('## 6. UX copy', 2)[1].split('\n## 7.', 2)[0];
  assert.ok(section, 'docs/03-ux.md §6 "UX copy" section not found');
  const rows = [];
  for (const rawLine of section.split('\n')) {
    if (!rawLine.trim().startsWith('|')) continue;
    // `| \`key\` | hindi | english | where |` -> ['', key, hindi, english, where, '']
    const cells = rawLine.split('|');
    if (cells.length < 5) continue;
    const keyCell = cells[1].trim();
    if (!/^`[^`]+`$/.test(keyCell)) continue; // skips the header and |---| separator
    rows.push({ key: keyCell.slice(1, -1), hi: cells[2].trim(), en: cells[3].trim() });
  }
  return rows;
}

const deck = parseUxCopyDeck(readFileSync(uxPath, 'utf8'));
const deckKeys = deck.map((row) => row.key);

test('03-ux §6 declares exactly 122 dictionary keys, and they are unique (M4 contract)', () => {
  assert.equal(deck.length, 122, `03-ux §6 must declare exactly 122 keys, found ${deck.length}`);
  assert.equal(new Set(deckKeys).size, 122, '03-ux §6 contains duplicate keys');
});

test('every 03-ux §6 key exists in both dictionaries (122 keys x 2 languages = 244 assertions)', () => {
  let assertions = 0;
  const missing = [];
  for (const { key } of deck) {
    for (const lang of LANGS) {
      if (!Object.prototype.hasOwnProperty.call(DICT[lang], key)) missing.push(`${lang}:${key}`);
      assertions += 1;
    }
  }
  assert.deepEqual(missing, [], `missing dictionary keys: ${missing.join(', ')}`);
  assert.equal(assertions, 244, '122 keys × 2 languages must be asserted');
});

test('DICT has no keys beyond 03-ux §6, and KEYS mirrors the §6 table order', () => {
  const extraHi = Object.keys(DICT.hi).filter((k) => !deckKeys.includes(k));
  const extraEn = Object.keys(DICT.en).filter((k) => !deckKeys.includes(k));
  assert.deepEqual(extraHi, [], `dictionary has keys absent from 03-ux §6 (hi): ${extraHi.join(', ')}`);
  assert.deepEqual(extraEn, [], `dictionary has keys absent from 03-ux §6 (en): ${extraEn.join(', ')}`);
  // Same key set in both languages (no half-translated dictionary).
  assert.deepEqual([...Object.keys(DICT.hi)].sort(), [...Object.keys(DICT.en)].sort());
  // The exported KEYS constant is the contract surface — same content, §6 order.
  assert.deepEqual([...KEYS], deckKeys);
  assert.equal(KEYS.length, 122);
});

test('every string matches the 03-ux §6 table verbatim in both languages', () => {
  const mismatches = [];
  for (const { key, hi, en } of deck) {
    if (DICT.hi[key] !== hi) mismatches.push(`hi:${key} expected ${JSON.stringify(hi)} got ${JSON.stringify(DICT.hi[key])}`);
    if (DICT.en[key] !== en) mismatches.push(`en:${key} expected ${JSON.stringify(en)} got ${JSON.stringify(DICT.en[key])}`);
  }
  assert.deepEqual(mismatches, [], `copy-deck mismatches:\n${mismatches.join('\n')}`);
});

test('lang.hi and lang.en are identical in both dictionaries (toggle stays readable)', () => {
  assert.equal(DICT.hi['lang.hi'], DICT.en['lang.hi']);
  assert.equal(DICT.hi['lang.en'], DICT.en['lang.en']);
  assert.equal(DICT.hi['lang.hi'], 'हिं');
  assert.equal(DICT.hi['lang.en'], 'EN');
});

test('Hindi is the default language and both languages are registered (US-11 AC1)', () => {
  assert.equal(DEFAULT_LANG, 'hi');
  assert.deepEqual([...LANGS], ['hi', 'en']);
});

test('t() interpolates {n} from vars in both languages (city.resultsCount)', () => {
  assert.equal(t('city.resultsCount', 'hi', { n: 3 }), '3 परिणाम मिले');
  assert.equal(t('city.resultsCount', 'en', { n: 3 }), '3 results found');
  // A placeholder with no matching var stays literal — visible, never blank.
  assert.equal(t('city.resultsCount', 'en'), '{n} results found');
  // Plain (placeholder-free) strings pass through unchanged.
  assert.equal(t('app.title', 'hi'), 'चौघड़िया');
  assert.equal(t('app.title', 'en'), 'Choghadiya');
});

test('t() fails loudly on an unknown key or language (a typo never renders blank)', () => {
  assert.throws(() => t('no.such.key', 'en'), TypeError);
  assert.throws(() => t('app.title', 'fr'), RangeError);
});

test('the 7 canonical slot names have quality.* keys with the exact §6 strings (US-11 AC4)', () => {
  for (const name of CANONICAL_NAMES) {
    assert.equal(t(`quality.${name}`, 'hi'), SLOT_NAME_EXPECTED[name].hi, `quality.${name} (hi)`);
    assert.equal(t(`quality.${name}`, 'en'), SLOT_NAME_EXPECTED[name].en, `quality.${name} (en)`);
  }
  // The canonical EN spelling is "Char" (PRD A3) — no Gujarati "Chal" variant.
  assert.equal(t('quality.char', 'en'), 'Char');
  assert.ok(!Object.prototype.hasOwnProperty.call(DICT.en, 'quality.chal'));
});

test('every slot name also has a meaning.* line in both languages (US-11 AC3)', () => {
  for (const name of CANONICAL_NAMES) {
    assert.ok(DICT.hi[`meaning.${name}`], `meaning.${name} missing in hi`);
    assert.ok(DICT.en[`meaning.${name}`], `meaning.${name} missing in en`);
  }
});

test('index.html data-i18n* hooks all resolve to a dictionary key (no copy outside the dictionary)', () => {
  const html = readFileSync(htmlPath, 'utf8');
  const refs = [...html.matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 0, 'index.html must expose at least one data-i18n hook');
  const unresolved = [...new Set(refs)].filter(
    (key) => !Object.prototype.hasOwnProperty.call(DICT.hi, key)
      || !Object.prototype.hasOwnProperty.call(DICT.en, key),
  );
  assert.deepEqual(unresolved, [], `index.html references unknown i18n keys: ${unresolved.join(', ')}`);
});

/**
 * The static fallback text inside a `data-i18n` node is what a JS-disabled visitor
 * (and the first paint, before app.js runs) actually reads, so it is shipped copy
 * and must be the `hi` value — not a leftover of a superseded wording. FE-4
 * (t_bf7bfef8, v2.3.0 items 3 + 7) replaced exactly such leftovers: the footer and
 * the city sheet still carried the v2.2.0 "A searched city name is sent to
 * Open-Meteo/GeoNames. Location is never stored." / "Geocoding by Open-Meteo /
 * GeoNames" text while the dictionary already held the new §6 strings. This lock
 * makes that class of drift a hard gate failure.
 */
test('every index.html data-i18n fallback text is the `hi` dictionary string (no stale shipped copy)', () => {
  const html = readFileSync(htmlPath, 'utf8');
  // Leaf elements only: a node with element children is filled by JS, not shipped copy.
  const nodes = [...html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>([^<]*)<\/\1>/gi)]
    .map((m) => ({ tag: m[1], key: m[2], text: m[3] }));
  assert.ok(nodes.length >= 20, `expected the footer/sheet/header copy nodes, matched ${nodes.length}`);
  const mismatches = nodes
    .filter((n) => n.text.trim() !== DICT.hi[n.key])
    .map((n) => `${n.tag}[data-i18n=${n.key}] expected ${JSON.stringify(DICT.hi[n.key])} got ${JSON.stringify(n.text.trim())}`);
  assert.deepEqual(mismatches, [], `index.html fallback copy drifted from the hi dictionary:\n${mismatches.join('\n')}`);
});

/**
 * v2.3.0 items 3 + 7: the two removed v2.2.0 strings must not survive in any shipped
 * file — not as a hook fallback, not in the dictionary, not in prose that would be
 * re-copied. RS-3 (docs/01 §13) is why: the credit line is rewritten (option B), not
 * deleted, and the privacy line is rewritten to the "no server storage; per-tab
 * local cache only" stance.
 */
test('the superseded v2.2.0 attribution/privacy strings are gone from index.html and i18n.js', () => {
  const stale = [
    'Location is never stored',
    'Geocoding by Open-Meteo',
    'Open-Meteo/GeoNames',
    'लोकेशन सेव नहीं होती',
    'शहर खोजने पर लिखा गया नाम',
  ];
  for (const rel of ['../index.html', '../i18n.js']) {
    const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    for (const s of stale) {
      assert.ok(!src.includes(s), `${rel} still contains the superseded string ${JSON.stringify(s)}`);
    }
  }
});

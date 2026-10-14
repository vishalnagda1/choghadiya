// app.js — application state, orchestration and rendering (FE-02, t_f0568729).
//
// Contract: docs/04-architecture.md §2.3 (module responsibilities), §4.1 (AppState),
// §8.1 (error taxonomy, "never NaN / Invalid Date / undefined in the DOM"),
// docs/03-ux.md §3 S1 (slot row anatomy), §6 (copy deck), §7 (a11y), §8 (fixture).
//
// ADR-002 review check: this module performs NO DOM access at module scope. Every
// `document`/`getElementById` touch lives inside init() or the render* functions it
// calls, and the auto-start is guarded, so importing app.js in Node cannot throw.
// State is centralised in `state` (lang, location, viewedDate, schedule) —
// FE-03/FE-04/FE-05 extend this file sequentially, they do not fork it.
//
// FE-02 scope (deliberate non-goals, owned by later cards):
//   - current-slot highlight, "अभी / Now" badge, ≤ 60 s poll, row disclosure → FE-05;
//   - geolocation, city search sheet wiring, chip affordances → FE-03;
//   - S3 polar / S5 denied / S6-S7 geocoder states → FE-04.
// FE-02 renders the walking skeleton: 8 day + 8 night rows for the FIXED Mumbai
// fixture, the bilingual dictionary wiring, and ‹ › date navigation.

import { addDays, buildSchedule, formatDate, formatTime, todayIn } from './choghadiya.js?v=2.1.0';
import { DEFAULT_LANG, t } from './i18n.js?v=2.1.0';

/**
 * The walking-skeleton location: Mumbai 19.076 N / 72.8777 E, Asia/Kolkata —
 * byte-for-byte the fixture of docs/03-ux.md §8 (== tests/fixtures.js MUMBAI) so
 * the rendered rows can be compared to the spec's worked example. FE-03 replaces
 * this with geolocation / geocoder results.
 */
export const FIXTURE_LOCATION = Object.freeze({
  latitude: 19.076,
  longitude: 72.8777,
  timezone: 'Asia/Kolkata',
  label: 'मुंबई, महाराष्ट्र',
  source: 'city',
});

/**
 * Quality glyph per Slot.tier (03-ux §4.1: ✓✓ / ✓ / ○ / ✕). Always paired with the
 * tier word in the chip so the tier is never carried by colour alone (US-15 AC1).
 */
const TIER_GLYPH = Object.freeze({
  mostAuspicious: '✓✓',
  auspicious: '✓',
  neutral: '○',
  inauspicious: '✕',
});

/** Centralised in-memory state (04-arch §4.1 AppState). Nothing is persisted (ADR-007). */
const state = {
  lang: DEFAULT_LANG, // "hi" — client default, 03-ux §2 F6
  location: FIXTURE_LOCATION,
  viewedDate: '', // "YYYY-MM-DD" at state.location.timezone
  schedule: null, // Schedule for viewedDate at state.location (04-arch §4.1)
};

/** Element cache; filled by init() only (keeps DOM access out of module scope). */
const dom = {};

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

function init() {
  dom.html = document.documentElement;
  dom.langGroup = document.querySelector('.lang-toggle');
  dom.bHi = document.getElementById('b-hi');
  dom.bEn = document.getElementById('b-en');
  dom.locChip = document.getElementById('loc-chip');
  dom.locName = dom.locChip.querySelector('.name');
  dom.dateLabel = document.getElementById('date-label');
  dom.prev = document.getElementById('prev-day');
  dom.next = document.getElementById('next-day');
  dom.todayPill = document.getElementById('today-pill');
  dom.live = document.getElementById('live');
  dom.dayList = document.getElementById('day-list');
  dom.nightList = document.getElementById('night-list');
  dom.dayEdge = document.getElementById('day-edge');
  dom.nightEdge = document.getElementById('night-edge');
  dom.daySmallprint = document.getElementById('day-smallprint');
  dom.nightSmallprint = document.getElementById('night-smallprint');
  dom.closeSheet = document.getElementById('close-sheet');

  // "today" is the VIEWED LOCATION's local date (client-accepted Q8, 04-arch §5.1).
  state.viewedDate = todayAtLocation();

  dom.bHi.addEventListener('click', () => setLang('hi'));
  dom.bEn.addEventListener('click', () => setLang('en'));
  dom.prev.addEventListener('click', () => stepDay(-1));
  dom.next.addEventListener('click', () => stepDay(1));
  dom.todayPill.addEventListener('click', goToToday);

  render();
}

/* ------------------------------------------------------------------ */
/* State transitions                                                   */
/* ------------------------------------------------------------------ */

/** US-11 AC1/AC2 — instant language switch, no reload (< 100 ms: render is synchronous). */
function setLang(lang) {
  if (lang === state.lang) return;
  state.lang = lang;
  render();
}

/** US-13 AC1/AC2 — step the viewed date by ±1 civil day and re-render both lists. */
function stepDay(delta) {
  state.viewedDate = addDays(state.viewedDate, delta);
  render();
}

/** The "आज / Today" reset pill (03-ux §3 S1 "Success (other date)"). */
function goToToday() {
  state.viewedDate = todayAtLocation();
  render();
}

function todayAtLocation() {
  return todayIn(state.location.timezone);
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

/** Single entry point: recompute the schedule for the viewed date, then paint. */
function render() {
  state.schedule = buildSchedule({ location: state.location, date: state.viewedDate });

  dom.html.lang = state.lang; // US-11 AC5 — <html lang> flips hi <-> en
  applyDictionary();
  renderChip();
  renderDateBar();
  renderSections();
}

/**
 * US-11 AC3 — every string on the page comes from i18n.js. `data-i18n` /
 * `data-i18n-ph` nodes are re-filled from the dictionary, plus the few shell
 * attributes FE-01 left as literals (the CSS/HTML surface has no dictionary hook),
 * and the <title>, composed from two existing keys (no new copy).
 */
function applyDictionary() {
  const { lang } = state;

  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.getAttribute('data-i18n'), lang);
  }
  for (const el of document.querySelectorAll('[data-i18n-ph]')) {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'), lang));
  }

  dom.langGroup.setAttribute('aria-label', t('lang.toggle.label', lang));
  dom.bHi.textContent = t('lang.hi', lang);
  dom.bEn.textContent = t('lang.en', lang);
  dom.bHi.setAttribute('aria-pressed', String(lang === 'hi'));
  dom.bEn.setAttribute('aria-pressed', String(lang === 'en'));
  dom.prev.setAttribute('aria-label', t('date.prev', lang));
  dom.next.setAttribute('aria-label', t('date.next', lang));
  dom.locChip.setAttribute('aria-label', t('loc.change', lang));
  dom.closeSheet.setAttribute('aria-label', t('city.close', lang));
  document.title = `${t('app.title', lang)} — ${t('app.subtitle', lang)}`;
}

/**
 * Location chip. The label is location data, not UI copy, so it goes in as
 * `textContent` — never through t() and never as HTML (NFR-S2, 04-arch §4.2).
 * FE-03 adds the ✕ / "My location" affordances and the sheet wiring.
 */
function renderChip() {
  dom.locName.textContent = state.location.label;
}

/** Date label + "आज / Today" reset pill (03-ux §3 S1 "Success (other date)"). */
function renderDateBar() {
  const label = formatDate(state.viewedDate, state.location.timezone, state.lang);
  dom.dateLabel.textContent = label;
  dom.todayPill.hidden = state.viewedDate === todayAtLocation();
  // The shell's #live region carried `loading.status` for S4; the 16 rows are local
  // math (NFR-P4) so S4 lasts ~0 ms and the polite status region is reused to
  // announce the viewed date on every date/language change (US-13, 03-ux §7.3).
  dom.live.textContent = label;
}

/** Both slot lists, their boundary prints, and the aria-busy transition out of S4. */
function renderSections() {
  const schedule = state.schedule;
  const ready = Boolean(schedule && schedule.defined);

  const daySlots = ready ? schedule.daySlots : [];
  const nightSlots = ready ? schedule.nightSlots : [];
  setRows(dom.dayList, daySlots);
  setRows(dom.nightList, nightSlots);

  if (!ready) {
    // S3's message block is FE-04's; FE-02 must not invent copy, so it simply emits
    // no row and no boundary text — never NaN / Invalid Date (US-9 AC2, 04-arch §8.1).
    for (const node of [dom.dayEdge, dom.nightEdge, dom.daySmallprint, dom.nightSmallprint]) {
      node.textContent = '';
    }
    return;
  }

  const { timezone } = state.location;
  const { lang } = state;
  // 03-ux §3 S1: heading edge = the half's own boundary, small print = the far edge.
  dom.dayEdge.textContent = boundary('section.rise', schedule.sunrise, timezone, lang);
  dom.daySmallprint.textContent = boundary('section.set', schedule.sunset, timezone, lang);
  dom.nightEdge.textContent = boundary('section.set', schedule.sunset, timezone, lang);
  dom.nightSmallprint.textContent = boundary('section.nextRise', schedule.nextSunrise, timezone, lang);
}

/** `"सूर्योदय 06:32"` — dictionary label + 24-hour time in the location's clock. */
function boundary(key, instant, timeZone, lang) {
  return `${t(key, lang)} ${formatTime(instant, timeZone, lang)}`;
}

/** Replace a list's 8 skeleton rows with real rows and leave the loading state. */
function setRows(list, slots) {
  list.replaceChildren(...slots.map((slot) => slotRow(slot)));
  list.setAttribute('aria-busy', 'false');
}

/**
 * One slot row: a single <button> (whole row is the tap/keyboard target, ≥ 56 px)
 * with the 03-ux §3 zones — name (both scripts in the active language), 24-hour
 * range, quality chip (tier word + glyph). Built with createElement/textContent
 * only (NFR-S2). FE-05 adds aria-expanded + the `.meaning` disclosure line and the
 * current-slot marker.
 */
function slotRow(slot) {
  const { timezone } = state.location;
  const { lang } = state;
  const from = formatTime(slot.start, timezone, lang);
  const to = formatTime(slot.end, timezone, lang);
  const latinName = t(`quality.${slot.name}`, 'en');
  const localName = t(`quality.${slot.name}`, lang);
  const tierWord = t(`tier.${slot.tier}`, lang);

  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'slot';

  // Zone 2 — "लाभ · Labh" when HI, "Labh" when EN (03-ux §3 zone 2).
  const name = document.createElement('span');
  name.className = 'slot-name';
  name.textContent = lang === 'hi' ? `${localName} · ${latinName}` : latinName;

  // Zone 3 — 24-hour range in the viewed location's timezone (03-ux §8 note).
  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = `${from} – ${to}`;

  // Zone 4 — chip: decorative glyph (aria-hidden) + the tier word that carries the
  // meaning, so colour is never the only signal (US-15 AC1, 03-ux §7.3).
  const meta = document.createElement('span');
  meta.className = 'slot-meta';
  const chip = document.createElement('span');
  chip.className = `quality ${slot.tier}`;
  const glyph = document.createElement('span');
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = TIER_GLYPH[slot.tier];
  const word = document.createElement('span');
  word.textContent = tierWord;
  chip.append(glyph, word);
  meta.append(chip);

  button.append(name, time, meta);
  // Accessible name reads name, time range, tier in that order (03-ux §7.3); the
  // glyph is excluded so no raw ✓/✕ character is ever announced.
  const spokenName = lang === 'hi' ? `${localName}, ${latinName}` : latinName;
  button.setAttribute('aria-label', `${spokenName}, ${from} – ${to}, ${tierWord}`);

  item.append(button);
  return item;
}

// Auto-start in a browser only; kept out of module scope's DOM surface per ADR-002.
if (typeof document !== 'undefined') init();

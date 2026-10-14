// app.js — application state, orchestration and rendering.
//
// FE-02 (t_f0568729): bilingual render, i18n wiring, ‹ › date navigation.
// FE-03 (t_9312a3f6): geolocation flow, city-search sheet, location chip — it
// EXTENDS this file; it does not fork it (file-ownership rule, docs/05-plan.md §3.2).
//
// Contract: docs/04-architecture.md §2.3 (module responsibilities), §4.1 (AppState),
// §5.1 (geocoder client), §8.1 (error taxonomy, "never NaN / Invalid Date /
// undefined in the DOM"), docs/03-ux.md §2 F1/F2/F3 (flows), §3 S1/S2/S4 (screens),
// §6 (copy deck), §7 (a11y), §8 (fixture).
//
// ADR-002 review check: this module performs NO DOM access at module scope. Every
// `document`/`getElementById` touch lives inside init() or the render* functions it
// calls, and the auto-start is guarded, so importing app.js in Node cannot throw.
// State is centralised in `state` (lang, location, viewedDate, schedule, ui) —
// FE-04/FE-05 extend this file sequentially, they do not fork it.
//
// Deliberate scope boundary (owned by later cards — see the completion summary):
//   - current-slot highlight, "अभी / Now" badge, ≤ 60 s poll, row disclosure → FE-05;
//   - S3 polar / S5 denied notice / S6 geocoder error+Retry / S7 / empty → FE-04.
// The failure paths below are deliberately routed through named hooks
// (`onGeoUnavailable`, `setSheetError`) instead of inline try/catch swallowing, so
// FE-04 can replace their bodies with the full S5/S6/S7 components.

import { addDays, buildSchedule, formatDate, formatTime, todayIn } from './choghadiya.js?v=2.1.0';
import { DEFAULT_LANG, t } from './i18n.js?v=2.1.0';
import { createGeocoder, isAbortError } from './geocoder.js?v=2.1.0';

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

/**
 * Geolocation options (03-ux §2 F1). `maximumAge` lets a recent fix short-circuit the
 * prompt-less path; `timeout` bounds the wait so a dead GPS can never hang the flow.
 * `enableHighAccuracy` is off deliberately: the solar calculation needs city-scale
 * precision, not GPS precision (NFR-P1, and it resolves faster / costs less battery).
 */
const GEOLOCATION_OPTIONS = Object.freeze({
  enableHighAccuracy: false,
  maximumAge: 60000,
  timeout: 10000,
});

/** Slots per half — mirrors choghadiya.js CONFIG.SLOT_COUNT for the skeleton rows. */
const SLOT_COUNT = 8;

/**
 * Centralised in-memory state (04-arch §4.1 AppState). Nothing is persisted (ADR-007).
 *
 * `location` starts null: the shell paints first and geolocation resolves after first
 * paint (US-4 AC1, 03-ux F1 step 3). `ui` mirrors 04-arch §4.1 exactly so FE-04/FE-05
 * can extend it without drifting; `ui.query` is added by FE-03 so a future Retry
 * (FE-04, S6) can re-submit the same query.
 */
const state = {
  lang: DEFAULT_LANG, // "hi" — client default, 03-ux §2 F6
  location: null, // Location | null — set by geolocation or a selected city (FE-03)
  viewedDate: null, // "YYYY-MM-DD" at state.location.timezone
  schedule: null, // Schedule for viewedDate at state.location (04-arch §4.1)
  ui: {
    sheetOpen: false,
    loading: true, // S4 — geolocation resolution in progress
    notice: null, // null | "geo-denied"        → FE-04 renders S5
    sheetError: null, // null | "query-required" | "geocode-empty" | "geocode-network" | "geocode-http" → FE-04 S6/S7
    query: '', // last submitted city query (FE-04 Retry re-submits it)
    expandedSlot: null, // FE-05
  },
};

/** Element cache; filled by init() only (keeps DOM access out of module scope). */
const dom = {};

/** Lazily-created rate-disciplined geocoder (BE-02); never constructed at import time. */
let geocoder = null;

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

function init() {
  dom.html = document.documentElement;
  dom.langGroup = document.querySelector('.lang-toggle');
  dom.bHi = document.getElementById('b-hi');
  dom.bEn = document.getElementById('b-en');
  dom.locChip = document.getElementById('loc-chip');
  dom.locName = document.getElementById('loc-name');
  dom.locClear = document.getElementById('loc-clear');
  dom.sheet = document.getElementById('sheet');
  dom.sheetForm = document.getElementById('city-form');
  dom.cityInput = document.getElementById('city');
  dom.sheetMsg = document.getElementById('sheet-msg');
  dom.sheetStatus = document.getElementById('sheet-status');
  dom.results = document.getElementById('results');
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

  dom.bHi.addEventListener('click', () => setLang('hi'));
  dom.bEn.addEventListener('click', () => setLang('en'));
  dom.prev.addEventListener('click', () => stepDay(-1));
  dom.next.addEventListener('click', () => stepDay(1));
  dom.todayPill.addEventListener('click', goToToday);

  // --- FE-03: location surfaces -------------------------------------------------
  dom.locChip.addEventListener('click', openSheet);
  dom.locClear.addEventListener('click', clearLocation);
  dom.closeSheet.addEventListener('click', () => dom.sheet.close());
  dom.sheetForm.addEventListener('submit', onSubmitCity);
  // Sheet close is the single place that returns focus to the chip (US-18 AC2,
  // 03-ux §7.2) — reached via the ✕ button, Esc, a selected result, or a backdrop
  // click. `<dialog>` gives containment/backdrop/Esc for free (03-ux S2).
  dom.sheet.addEventListener('close', onSheetClose);
  // Re-typing clears a stale inline message but NEVER issues a request: there is no
  // keystroke path to the geocoder here, so a request per keystroke is impossible
  // (US-5 AC4; only submit reaches BE-02's searchNow).
  dom.cityInput.addEventListener('input', () => {
    if (state.ui.sheetError) setSheetError(null);
  });

  render(); // S4: shell + skeleton lists, no location yet (never blocking)
  scheduleGeolocation(); // requested AFTER first paint (US-4 AC1)
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
  if (!state.location) return; // no location yet → date bar is disabled (S4)
  state.viewedDate = addDays(state.viewedDate, delta);
  render();
}

/** The "आज / Today" reset pill (03-ux §3 S1 "Success (other date)"). */
function goToToday() {
  if (!state.location) return;
  state.viewedDate = todayAtLocation();
  render();
}

/** The viewed location's civil date — "today" is always local to the location (Q8). */
function todayAtLocation() {
  return todayIn(state.location.timezone);
}

/* ------------------------------------------------------------------ */
/* Geolocation (US-4, 03-ux F1)                                        */
/* ------------------------------------------------------------------ */

/**
 * Request the device location AFTER the shell has painted, so the permission prompt
 * can never block first paint (US-4 AC1, NFR-P1).
 *
 * Uses a macrotask (`setTimeout 0`), NOT `requestAnimationFrame`: rAF callbacks are
 * throttled to nothing while a tab is backgrounded/occluded (verified over CDP —
 * rAF fired 0 times, the timer fired immediately), which would stall the whole
 * location flow until the user foregrounded the tab. The module script finishes
 * synchronously, so by the time this timer runs the shell has already rendered.
 */
function scheduleGeolocation() {
  if (typeof window === 'undefined') return;
  window.setTimeout(() => requestDeviceLocation(), 0);
}

function requestDeviceLocation() {
  const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
  // No geolocation at all (insecure context / unsupported browser) → S5 fallback,
  // never a throw (US-8 AC2). FE-04 renders the notice from state.ui.notice.
  if (!geo || typeof geo.getCurrentPosition !== 'function') {
    onGeoUnavailable('geo-unavailable');
    return;
  }
  geo.getCurrentPosition(onGeoSuccess, onGeoError, GEOLOCATION_OPTIONS);
}

/** Granted: slots render for the device coords with the device's IANA zone (US-4 AC1/AC3). */
function onGeoSuccess(position) {
  const { latitude, longitude } = position.coords;
  state.location = {
    latitude,
    longitude,
    timezone: deviceTimeZone(),
    // No third-party name for a device fix; the chip shows `loc.my` (03-ux F2 step 1).
    // Location.label stays a string per 04-arch §4.1 — empty for geolocation sources.
    label: '',
    source: 'geolocation',
  };
  state.ui.loading = false;
  state.ui.notice = null;
  state.viewedDate = todayAtLocation();
  render();
}

/** Denied / timed out / position unavailable → S5 hook (FE-04 owns the notice copy). */
function onGeoError(error) {
  void error; // the taxonomy has a single S5 state: geo-denied (04-arch §8.1)
  onGeoUnavailable('geo-denied');
}

/**
 * FE-04 HOOK — geolocation is unavailable. Sets the AppState fields its S5 banner and
 * empty state read, and re-renders so the shell leaves the S4 skeleton. FE-04 replaces
 * the body with the notice/S5 + empty message; FE-03 never swallows the failure.
 */
function onGeoUnavailable(reason) {
  state.ui.loading = false;
  state.ui.notice = reason === 'geo-unavailable' ? 'geo-denied' : reason;
  render();
}

/** The device's Intl-resolved IANA zone (US-7 AC3) — never a fixed offset (ADR-005). */
function deviceTimeZone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

/* ------------------------------------------------------------------ */
/* City search sheet (US-5, 03-ux S2 / F2)                             */
/* ------------------------------------------------------------------ */

function getGeocoder() {
  if (!geocoder) geocoder = createGeocoder({ lang: state.lang });
  return geocoder;
}

/** Chip click → modal `<dialog>`; focus lands in the city field (US-18 AC2, 03-ux S2). */
function openSheet() {
  state.ui.sheetOpen = true;
  setSheetError(null);
  dom.results.replaceChildren();
  announceSheet('');
  if (!dom.sheet.open) dom.sheet.showModal(); // focus containment + Esc for free
  dom.cityInput.focus(); // showModal autofocuses the close button; the spec wants the field
}

/** Focus returns to the location chip on EVERY close path (US-18 AC2, 03-ux §7.2). */
function onSheetClose() {
  state.ui.sheetOpen = false;
  if (geocoder) geocoder.cancel(); // abort any superseded in-flight request
  dom.results.replaceChildren();
  setSheetError(null);
  dom.locChip.focus();
}

/**
 * Explicit submit (Enter / the खोजें button) → exactly ONE Open-Meteo request through
 * BE-02's rate-disciplined `searchNow` (US-5 AC1/AC4). Keystrokes never reach here.
 */
async function onSubmitCity(event) {
  event.preventDefault();
  const query = dom.cityInput.value;
  state.ui.query = query;
  setSheetError(null);
  dom.results.replaceChildren();
  announceSheet('');
  try {
    const results = await getGeocoder().searchNow(query, { lang: state.lang });
    if (results === null) return; // superseded / sheet closed — not a failure
    if (results.length === 0) {
      setSheetError('geocode-empty'); // S7 (US-5 AC5) — FE-04 owns the final component
      return;
    }
    renderResults(results);
    announceSheet(t('city.resultsCount', state.lang, { n: results.length }));
  } catch (error) {
    onGeocodeError(error);
  }
}

/**
 * FE-04 HOOK — map BE-02's GeocoderError taxonomy (04-arch §8.1) to an AppState code.
 * Aborts are control flow (a newer request superseded this one), never a failure.
 */
function onGeocodeError(error) {
  if (isAbortError(error)) return;
  const code = error && error.code;
  if (code === 'bad-query') setSheetError('query-required'); // no request was sent
  else if (code === 'http') setSheetError('geocode-http');
  else setSheetError('geocode-network');
}

/**
 * FE-04 HOOK — the single seam for S6/S7/validation messages. FE-03 renders the
 * minimal inline line from the dictionary (never a silent failure); FE-04 upgrades it
 * to the S6 `role="alert"` + दोबारा/Retry component and the S7 field-keeps-value rule.
 */
function setSheetError(kind) {
  state.ui.sheetError = kind;
  if (!dom.sheetMsg) return;
  const key = SHEET_ERROR_KEY[kind];
  dom.sheetMsg.textContent = key ? t(key, state.lang) : '';
  dom.sheetMsg.hidden = !key;
  if (kind === 'query-required') dom.cityInput.focus(); // 03-ux S1 validation
}

/** AppState sheetError code → i18n key (03-ux §6). */
const SHEET_ERROR_KEY = Object.freeze({
  'query-required': 'city.required',
  'geocode-empty': 'city.noResults',
  'geocode-network': 'city.error',
  'geocode-http': 'city.error',
});

/** Polite live region for the result count (03-ux §6 city.resultsCount). */
function announceSheet(text) {
  if (dom.sheetStatus) dom.sheetStatus.textContent = text;
}

/**
 * Result rows (03-ux S2): `name`, `admin1`, `country` and the city's local time so a
 * user searching "London" can tell which London. Third-party text is inserted with
 * `textContent`/`createElement` ONLY (NFR-S2, 04-arch §4.2/§9.3) — never innerHTML.
 */
function renderResults(results) {
  const { lang } = state;
  const now = new Date();
  const rows = results.map((result) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';

    const name = document.createElement('span');
    name.className = 'r1';
    name.textContent = result.name || '';

    const place = document.createElement('span');
    place.className = 'r2';
    const region = [result.admin1, result.country].filter(Boolean).join(', ');
    const localTime = safeFormatTime(now, result.timezone, lang);
    place.textContent = [region, localTime].filter(Boolean).join(' · ');

    button.append(name, place);
    button.addEventListener('click', () => selectResult(result));
    item.append(button);
    return item;
  });
  dom.results.replaceChildren(...rows);
}

/** formatTime in a possibly-missing/unknown IANA zone — never NaN/Invalid (04-arch §8.1). */
function safeFormatTime(instant, timeZone, lang) {
  if (!timeZone) return '';
  try {
    return formatTime(instant, timeZone, lang);
  } catch {
    return '';
  }
}

/**
 * Selecting a result stores lat/lon/timezone/label, re-renders every time in the CITY's
 * clock, redefines "today" as the city's local date, and closes the sheet
 * (US-5 AC2/AC3, US-7 AC1/AC2, 03-ux F2 steps 5-7).
 */
function selectResult(result) {
  state.location = {
    latitude: result.latitude,
    longitude: result.longitude,
    // Fall back to the device zone only if the service omitted one (04-arch §5.2).
    timezone: result.timezone || deviceTimeZone(),
    label: labelFor(result),
    source: 'city',
  };
  state.ui.loading = false;
  state.ui.notice = null;
  dom.cityInput.value = '';
  state.viewedDate = todayAtLocation();
  render();
  dom.sheet.close(); // focus return happens in onSheetClose
}

/** The chip label for a city result: "name, admin1, country" (04-arch §4.1 example). */
function labelFor(result) {
  return [result.name, result.admin1, result.country].filter(Boolean).join(', ');
}

/**
 * ✕ clear (03-ux F2 step 7): drop the location and re-open the sheet so the user can
 * search again. The chip reverts to loc.choose and the lists leave the row state;
 * FE-04 supplies the S1-empty copy while no location is set.
 */
function clearLocation() {
  state.location = null;
  state.schedule = null;
  state.viewedDate = null;
  state.ui.loading = false;
  state.ui.notice = null;
  render();
  openSheet();
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

/** Single entry point: recompute the schedule (when a location exists), then paint. */
function render() {
  state.schedule = state.location
    ? buildSchedule({ location: state.location, date: state.viewedDate })
    : null;

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
  dom.locClear.setAttribute('aria-label', t('loc.clear', lang));
  dom.closeSheet.setAttribute('aria-label', t('city.close', lang));
  // A sheet message already on screen re-translates in place (03-ux F4 step 4).
  if (state.ui.sheetError) setSheetError(state.ui.sheetError);
  document.title = `${t('app.title', lang)} — ${t('app.subtitle', lang)}`;
}

/**
 * Location chip. The label is either dictionary copy (`loc.my` for a device fix,
 * `loc.choose` when there is no location) or third-party location data inserted as
 * `textContent` — never through t() and never as HTML (NFR-S2, 04-arch §4.2). The ✕
 * clear affordance is shown only when a location exists (US-5, 03-ux F2 step 7).
 */
function renderChip() {
  const { location, lang } = state;
  if (!location) dom.locName.textContent = t('loc.choose', lang);
  else if (location.source === 'geolocation') dom.locName.textContent = t('loc.my', lang);
  else dom.locName.textContent = location.label;
  dom.locClear.hidden = !location;
}

/** Date label + "आज / Today" reset pill (03-ux §3 S1 "Success (other date)"). */
function renderDateBar() {
  if (!state.location) {
    // S4 / no-location: the date bar can't format a date without a zone, so it stays
    // inert and the polite region announces the S4 status (03-ux §6 geo.loading).
    dom.dateLabel.textContent = '';
    dom.todayPill.hidden = true;
    dom.prev.disabled = true;
    dom.next.disabled = true;
    dom.live.textContent = state.ui.loading ? t('geo.loading', state.lang) : '';
    return;
  }

  dom.prev.disabled = false;
  dom.next.disabled = false;
  const label = formatDate(state.viewedDate, state.location.timezone, state.lang);
  dom.dateLabel.textContent = label;
  dom.todayPill.hidden = state.viewedDate === todayAtLocation();
  dom.live.textContent = label;
}

/** Both slot lists, their boundary prints, and the aria-busy transition out of S4. */
function renderSections() {
  if (!state.location) {
    // No location yet. While geolocation resolves we show S4 (skeleton, aria-busy);
    // once it has failed/been denied the lists go empty and FE-04 renders S5 + the
    // S1-empty message from state.ui.notice. Never a row, never NaN (US-9 AC2).
    for (const list of [dom.dayList, dom.nightList]) {
      if (state.ui.loading) showSkeleton(list);
      else clearList(list);
    }
    clearBoundaries();
    return;
  }

  const schedule = state.schedule;
  const ready = Boolean(schedule && schedule.defined);

  const daySlots = ready ? schedule.daySlots : [];
  const nightSlots = ready ? schedule.nightSlots : [];
  setRows(dom.dayList, daySlots);
  setRows(dom.nightList, nightSlots);

  if (!ready) {
    // S3's message block is FE-04's; FE-03 must not invent copy, so it simply emits
    // no row and no boundary text — never NaN / Invalid Date (US-9 AC2, 04-arch §8.1).
    clearBoundaries();
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

/** Clear the four boundary/small-print nodes (never leaves stale text behind). */
function clearBoundaries() {
  for (const node of [dom.dayEdge, dom.nightEdge, dom.daySmallprint, dom.nightSmallprint]) {
    node.textContent = '';
  }
}

/** `"सूर्योदय 06:32"` — dictionary label + 24-hour time in the location's clock. */
function boundary(key, instant, timeZone, lang) {
  return `${t(key, lang)} ${formatTime(instant, timeZone, lang)}`;
}

/** S4 — N skeleton rows with aria-busy (03-ux §3 S4, `.skeleton` in style.css). */
function showSkeleton(list) {
  const rows = Array.from({ length: SLOT_COUNT }, () => {
    const item = document.createElement('li');
    item.className = 'skeleton';
    item.setAttribute('aria-hidden', 'true');
    return item;
  });
  list.replaceChildren(...rows);
  list.setAttribute('aria-busy', 'true');
}

/** No rows and no busy state (the pre-FE-04 "no location" placeholder). */
function clearList(list) {
  list.replaceChildren();
  list.setAttribute('aria-busy', 'false');
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

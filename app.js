// app.js — application state, orchestration and rendering.
//
// FE-02 (t_f0568729): bilingual render, i18n wiring, ‹ › date navigation.
// FE-03 (t_9312a3f6): geolocation flow, city-search sheet, location chip — it
// EXTENDS this file; it does not fork it (file-ownership rule, docs/05-plan.md §3.2).
// FE-04 (t_d22cd295): the degradation states — S3 not-defined, S5 geolocation
// unavailable notice, S6 geocoder error + Retry, S7 no-results, and the S1 empty
// state. It replaces the FE-03 placeholder hooks (`onGeoUnavailable`, `setSheetError`)
// with the real components and adds the render guard that keeps NaN / Invalid Date /
// undefined / empty rows out of the DOM (US-9 AC2, 04-arch §8.1).
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
// FE-05 (t_fffccd6d): accessibility semantics, disclosure and the live highlight —
// `aria-current` + the "अभी / Now" badge, the ≤ 60 s visibility-aware current-slot
// poll, the `aria-expanded` meaning-line disclosure on every row, and the Alt+←/→
// date shortcuts. It extends render()/slotRow() only; no state or fetch path changes.
// The FE-03 failure seams (`onGeoUnavailable`, `setSheetError`) are now the real
// S5/S6/S7 components; every degradation keeps the date bar and the language
// toggle alive (03-ux §3 S3, §2 F3).

import { addDays, buildSchedule, formatDate, formatTime, resolveCurrentSlot, todayIn } from './choghadiya.js?v=2.2.0';
import { DEFAULT_LANG, t } from './i18n.js?v=2.2.0';
import { createGeocoder, isAbortError } from './geocoder.js?v=2.2.0';

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

/**
 * Hard ceiling on how long the S4 skeleton may wait for a geolocation callback.
 *
 * `GEOLOCATION_OPTIONS.timeout` asks the browser to call back within 10 s, but a
 * browser whose geolocation service is unavailable can ignore it and invoke NEITHER
 * callback (reproduced in headless Chrome over CDP: `getCurrentPosition` never settles,
 * so the app sat on the skeleton indefinitely). The watchdog guarantees the US-8
 * degradation is reached: after this bound the app shows the S5 notice and the empty
 * state instead of a permanent skeleton. A genuinely late success still wins — it
 * clears `notice` and re-renders (onGeoSuccess).
 */
const GEOLOCATION_WATCHDOG_MS = GEOLOCATION_OPTIONS.timeout + 2000;

/** Slots per half — mirrors choghadiya.js CONFIG.SLOT_COUNT for the skeleton rows. */
const SLOT_COUNT = 8;

/**
 * Current-slot poll interval (US-14 AC4, PRD Q2 default = auto-update). 60 s is the
 * spec ceiling ("≤ 60 s"); a tick is a pure re-evaluation of the visible schedule and
 * writes to the DOM only when the current slot actually changed.
 */
const SLOT_POLL_MS = 60000;

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

/** Pending geolocation watchdog timer id (see GEOLOCATION_WATCHDOG_MS). */
let geoWatchdog = null;

/** Current-slot poll timer id (see startSlotPoll). */
let slotPollTimer = null;

/**
 * The `half:index` key last written to the DOM as the current slot, so the poll can
 * tell a real boundary change from a no-op tick (`undefined` = never synced yet).
 */
let appliedCurrentKey;

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
  dom.sheetError = document.getElementById('sheet-error');
  dom.sheetErrorGlyph = document.getElementById('sheet-error-glyph');
  dom.sheetMsg = document.getElementById('sheet-msg');
  dom.retrySearch = document.getElementById('retry-search');
  dom.sheetStatus = document.getElementById('sheet-status');
  dom.results = document.getElementById('results');
  dom.dateLabel = document.getElementById('date-label');
  dom.prev = document.getElementById('prev-day');
  dom.next = document.getElementById('next-day');
  dom.todayPill = document.getElementById('today-pill');
  dom.live = document.getElementById('live');
  dom.geoNotice = document.getElementById('geo-notice');
  dom.geoNoticeAction = document.getElementById('geo-notice-action');
  dom.emptyState = document.getElementById('empty-state');
  dom.panes = document.getElementById('panes');
  dom.notDefined = document.getElementById('not-defined');
  dom.ndPrev = document.getElementById('nd-prev');
  dom.ndNext = document.getElementById('nd-next');
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

  // --- FE-04: degradation surfaces ----------------------------------------------
  // S5's action button opens the sheet, so the city field is directly reachable
  // without an error wall (03-ux §2 F3 step 3).
  dom.geoNoticeAction.addEventListener('click', openSheet);
  // S3's adjacent-date escape hatch (03-ux §3 S3) — the same date step as the
  // date bar, so a polar user can reach a date where the sun does rise.
  dom.ndPrev.addEventListener('click', () => stepDay(-1));
  dom.ndNext.addEventListener('click', () => stepDay(1));
  // S6's Retry re-submits the SAME query (US-10 AC1) — never a new fetch path.
  dom.retrySearch.addEventListener('click', retrySearch);

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

  // --- FE-05: keyboard shortcuts + the live current-slot poll --------------------
  // Alt+←/→ mirrors the ‹ / › buttons (03-ux §7.2); the poll keeps the highlight
  // honest while the page stays open (US-14 AC4).
  document.addEventListener('keydown', onDateShortcut);
  startSlotPoll();

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
  collapseSlots(); // a different date is a fresh view: close any open disclosure line
  render();
}

/** The "आज / Today" reset pill (03-ux §3 S1 "Success (other date)"). */
function goToToday() {
  if (!state.location) return;
  state.viewedDate = todayAtLocation();
  collapseSlots();
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
  // never a throw (US-8 AC2).
  if (!geo || typeof geo.getCurrentPosition !== 'function') {
    onGeoUnavailable('geo-unavailable');
    return;
  }
  armGeoWatchdog();
  geo.getCurrentPosition(onGeoSuccess, onGeoError, GEOLOCATION_OPTIONS);
}

/**
 * Guarantee the S4 skeleton is never permanent: if the browser invokes neither
 * callback (it can ignore our `timeout`), S5 + the empty state take over. The
 * condition also makes the timer a no-op when a location has already resolved.
 */
function armGeoWatchdog() {
  clearGeoWatchdog();
  if (typeof window === 'undefined') return;
  geoWatchdog = window.setTimeout(() => {
    geoWatchdog = null;
    if (!state.location && state.ui.loading) onGeoUnavailable('geo-unavailable');
  }, GEOLOCATION_WATCHDOG_MS);
}

function clearGeoWatchdog() {
  if (geoWatchdog !== null && typeof window !== 'undefined') window.clearTimeout(geoWatchdog);
  geoWatchdog = null;
}

/** Granted: slots render for the device coords with the device's IANA zone (US-4 AC1/AC3). */
function onGeoSuccess(position) {
  clearGeoWatchdog();
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
 * S5 — geolocation is denied, timed out, or unavailable (insecure context / no API).
 * Sets the AppState fields the S5 notice and the S1 empty state read, then re-renders:
 * the shell leaves the S4 skeleton, `renderNotice()` shows the `role="status"` banner
 * with its Choose-city button, and (with no location) `renderSections()` replaces the
 * lists with `empty.noLocation`. Never an error wall, never a dead end (US-8 AC1/AC2).
 */
function onGeoUnavailable(reason) {
  clearGeoWatchdog();
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

/**
 * Focus returns to the location chip on EVERY close path (US-18 AC2, 03-ux §7.2) —
 * reached via the ✕ button, Esc, a selected result or a backdrop click.
 *
 * Handover note (FE-04, verified to the limit of the harness): this handler hangs off
 * `<dialog>`'s `close` event, and the harness browser (HeadlessChrome/155 over CDP)
 * never dispatches that event — a same-task programmatic `close()` leaves `.open`
 * false, while a control click listener fires normally, so the miss is the browser's,
 * not the app's. `openSheet()` re-clears results and the inline message on every open,
 * so the user never sees stale output even if this teardown is skipped; the focus-return
 * half still needs a check in a real browser (tech-lead M2 review item).
 */
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
function onSubmitCity(event) {
  event.preventDefault();
  runSearch(dom.cityInput.value);
}

/** S6 — Retry re-submits the SAME query the user last sent (US-10 AC1). */
function retrySearch() {
  dom.cityInput.value = state.ui.query; // show what is being retried
  runSearch(state.ui.query);
}

/**
 * The single search path — shared by the submit handler and S6's Retry so both issue
 * exactly one request through BE-02 (no second fetch path, US-5 AC4, ADR-004).
 * The field's value is left untouched on every failure, so S7 "keeps its value" and
 * the sheet stays open and usable (US-5 AC5).
 */
async function runSearch(query) {
  state.ui.query = query;
  setSheetError(null);
  dom.results.replaceChildren();
  announceSheet('');
  try {
    const results = await getGeocoder().searchNow(query, { lang: state.lang });
    if (results === null) return; // superseded / sheet closed — not a failure
    if (results.length === 0) {
      setSheetError('geocode-empty'); // S7 (US-5 AC5)
      return;
    }
    renderResults(results);
    announceSheet(t('city.resultsCount', state.lang, { n: results.length }));
  } catch (error) {
    onGeocodeError(error);
  }
}

/**
 * Map BE-02's GeocoderError taxonomy (04-arch §8.1) to an AppState code.
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
 * The single seam for S6 / S7 / field-validation messages (04-arch §8.1):
 *   - `geocode-network` / `geocode-http` → S6: `role="alert"` + ⚠ glyph + Retry;
 *   - `geocode-empty` → S7: "No city found — check the spelling", sheet stays open;
 *   - `query-required` → inline `city.required`, focus returns to the field.
 * Every visible string is a dictionary key (03-ux §6) — no hardcoded copy anywhere.
 */
function setSheetError(kind) {
  state.ui.sheetError = kind;
  const key = SHEET_ERROR_KEY[kind];
  const retryable = RETRYABLE.has(kind);
  // Expose the role="alert" region BEFORE its text changes: a live region that is
  // display:none is not monitored, so unhiding first is what makes the announcement
  // reliable (03-ux §7.3 — S6 is the assertive half of the status/alert split).
  dom.sheetError.hidden = !key;
  dom.sheetMsg.textContent = key ? t(key, state.lang) : '';
  dom.sheetErrorGlyph.textContent = retryable ? '⚠' : '';
  dom.retrySearch.hidden = !retryable;
  if (kind === 'query-required') dom.cityInput.focus(); // 03-ux S1 validation
}

/** AppState sheetError code → i18n key (03-ux §6). */
const SHEET_ERROR_KEY = Object.freeze({
  'query-required': 'city.required',
  'geocode-empty': 'city.noResults',
  'geocode-network': 'city.error',
  'geocode-http': 'city.error',
});

/** S6 codes: the request failed, so Retry re-submits the same query (US-10 AC1). */
const RETRYABLE = Object.freeze(new Set(['geocode-network', 'geocode-http']));

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
  clearGeoWatchdog();
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
  collapseSlots();
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
  collapseSlots();
  render();
  openSheet();
}

/* ------------------------------------------------------------------ */
/* Accessibility — disclosure, current-slot highlight, keyboard        */
/* ------------------------------------------------------------------ */

/** Identity of a slot across re-renders: half + index (stable within a schedule). */
function slotKey(slot) {
  return `${slot.half}:${slot.index}`;
}

/** Drop any open disclosure line (a schedule change rebuilds the rows). */
function collapseSlots() {
  state.ui.expandedSlot = null;
}

/**
 * Disclosure (03-ux §4.5 row-click behaviour, §7.2): every row `<button>` carries
 * `aria-expanded` and an `aria-controls` reference to its inline `.meaning` line.
 *
 * The meaning line is a SIBLING of the button inside the same `<li>`, not a
 * descendant: a `<button>` flattens its descendants in the accessibility tree, so a
 * nested meaning line would be unreachable for a screen-reader user. Toggling mutates
 * in place — it never calls render() — so focus and the open row both survive
 * (03-ux §7.2: focus only moves on sheet open/close).
 */
function toggleMeaning(button, item, slot) {
  const next = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(next));
  const meaning = item.querySelector('.meaning');
  if (meaning) meaning.hidden = !next;
  state.ui.expandedSlot = next ? slotKey(slot) : null;
}

/**
 * Apply/remove the current-slot marker on ONE row (US-14 AC1, 03-ux §7.3):
 * `aria-current="true"`, the visible `.badge-now` (dictionary word + decorative
 * glyph — never colour alone), and the current state appended to the accessible
 * name, which reads name, time range, tier, current state in that order.
 */
function setCurrent(button, isCurrent) {
  const parts = [button.dataset.name, button.dataset.time, button.dataset.tier].filter(Boolean);

  if (isCurrent) {
    button.setAttribute('aria-current', 'true');
    ensureNowBadge(button);
    parts.push(t('slot.now', state.lang));
  } else {
    button.removeAttribute('aria-current');
    const badge = button.querySelector('.badge-now');
    if (badge) badge.remove();
  }

  button.setAttribute('aria-label', parts.join(', '));
}

/** The `.badge-now` pill (03-ux §4.5), created on demand inside the row's meta zone. */
function ensureNowBadge(button) {
  const meta = button.querySelector('.slot-meta');
  let badge = button.querySelector('.badge-now');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'badge-now';
    const glyph = document.createElement('span');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = '●';
    const word = document.createElement('span');
    word.textContent = t('slot.now', state.lang);
    badge.append(glyph, word);
    (meta || button).append(badge);
  }
  return badge;
}

/**
 * Reconcile the DOM's current-slot marker with `resolveCurrentSlot(schedule, now)`.
 *
 * `force` re-applies every row after render() has rebuilt the lists; an unforced call
 * (the poll) leaves the DOM untouched when the current slot has not changed, so a
 * screen reader is never re-announced on a no-op tick. `resolveCurrentSlot` returns
 * null whenever the viewed date is not the location's current Vedic day, so a past or
 * future date keeps NO highlight at all (US-14 AC3) — and the state is carried by
 * name + badge, never by colour.
 */
function syncCurrentSlot(force) {
  const current = resolveCurrentSlot(state.schedule, new Date());
  const key = current ? slotKey(current) : null;
  if (!force && key === appliedCurrentKey) return;
  appliedCurrentKey = key;

  for (const list of [dom.dayList, dom.nightList]) {
    if (!list) continue;
    for (const button of list.querySelectorAll('button.slot')) {
      setCurrent(button, key !== null && button.dataset.slot === key);
    }
  }
}

/**
 * ≤ 60 s, visibility-aware poll (US-14 AC4, PRD Q2): the highlight advances while the
 * page stays open, no work happens in a hidden tab, and returning to the tab catches
 * up immediately instead of waiting a full interval. A tick never re-renders the
 * lists, so an open disclosure and the focused row survive it.
 */
function startSlotPoll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (slotPollTimer === null) slotPollTimer = window.setInterval(refreshHighlight, SLOT_POLL_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function onVisibilityChange() {
  if (!document.hidden) refreshHighlight();
}

function refreshHighlight() {
  if (document.hidden) return; // visibility-aware: no polling work in a hidden tab
  syncCurrentSlot(false);
  syncTodayPill();
}

/**
 * Keep "today" honest across a midnight/sunrise boundary while the page is open: the
 * date label and the आज/Today reset pill follow the location's civil date. Only
 * writes when the value actually changed, so the polite live region is not
 * re-announced on a no-op tick.
 */
function syncTodayPill() {
  if (!state.location) return;
  const label = safeFormatDate(state.viewedDate, state.location.timezone, state.lang);
  if (dom.dateLabel.textContent !== label) {
    dom.dateLabel.textContent = label;
    dom.live.textContent = label;
  }
  const isToday = state.viewedDate === todayAtLocation();
  if (dom.todayPill.hidden !== isToday) dom.todayPill.hidden = isToday;
}

/**
 * Alt+← / Alt+→ date shortcuts (03-ux §7.2 — a documented convenience for the ‹ / ›
 * buttons). Ignored inside a text field and while the modal sheet is open, so it can
 * never fight a native caret or a focused sheet control. stepDay() rebuilds the date
 * bar and the rows, so an existing row focus is restored onto the same slot position
 * rather than dropped to <body> (focus only moves on sheet open/close, 03-ux §7.2).
 */
function onDateShortcut(event) {
  if (!event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const target = event.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  if (state.ui.sheetOpen || !state.location) return;

  event.preventDefault();
  const previous = focusedSlot();
  stepDay(event.key === 'ArrowLeft' ? -1 : 1);
  if (previous) {
    const next = document.querySelector(`button.slot[data-slot="${previous}"]`);
    if (next) next.focus();
  }
}

/** The `data-slot` key of the focused row, or null when focus is elsewhere. */
function focusedSlot() {
  const el = document.activeElement;
  return el && el.classList && el.classList.contains('slot') ? el.dataset.slot : null;
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
  renderNotDefined();
  renderChip();
  renderDateBar();
  renderNotice();
  renderSections();
  syncCurrentSlot(true); // rows are freshly built — (re)apply the current-slot marker
}

/**
 * S3's copy is the one place the app shows BOTH languages at once (03-ux §3 S3), so
 * these nodes are filled from the dictionary explicitly per `lang` attribute rather
 * than from the active language. Still no hardcoded copy (US-11 AC3).
 */
function renderNotDefined() {
  for (const el of dom.notDefined.querySelectorAll('[data-i18n-lang]')) {
    el.textContent = t(el.getAttribute('data-i18n-lang'), el.getAttribute('lang'));
  }
}

/**
 * S5 — the geolocation notice shows only while there is no location and the request
 * has settled (denied / timed out / insecure context). Being informative rather than
 * urgent it is `role="status"` (03-ux §7.3), and its copy is a `data-i18n` node so the
 * language toggle re-translates it in place (03-ux F4 step 4).
 */
function renderNotice() {
  const show = !state.location && Boolean(state.ui.notice);
  dom.geoNotice.hidden = !show;
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
    // inert and the polite region announces the S4 status, then the empty-state line
    // once geolocation has settled (03-ux §6 geo.loading / empty.noLocation). The bar
    // itself stays present in every degradation (03-ux §3 S1 "Empty").
    dom.dateLabel.textContent = '';
    dom.todayPill.hidden = true;
    dom.prev.disabled = true;
    dom.next.disabled = true;
    dom.live.textContent = state.ui.loading
      ? t('geo.loading', state.lang)
      : t('empty.noLocation', state.lang);
    return;
  }

  dom.prev.disabled = false;
  dom.next.disabled = false;
  const label = safeFormatDate(state.viewedDate, state.location.timezone, state.lang);
  dom.dateLabel.textContent = label;
  dom.todayPill.hidden = state.viewedDate === todayAtLocation();
  dom.live.textContent = label;
}

/**
 * S3-safe date formatting: a bad date or unknown zone yields no text at all rather
 * than an `Invalid Date` / `NaN` on screen (US-9 AC2, 04-arch §8.1).
 */
function safeFormatDate(dateISO, timeZone, lang) {
  try {
    return formatDate(dateISO, timeZone, lang);
  } catch {
    return '';
  }
}

/**
 * Both slot lists, their boundary prints, and the block-level degradation states:
 *   - no location + still resolving → S4 skeleton inside the panes;
 *   - no location + settled         → panes hidden, `empty.noLocation` shown (S1 empty);
 *   - location + `defined:false`    → panes hidden, S3 not-defined panel shown (US-9);
 *   - location + valid schedule     → the 16 rows and their boundary small print.
 * The date bar and the language toggle stay live in all four (03-ux §2 F4 step 4).
 */
function renderSections() {
  if (!state.location) {
    for (const list of [dom.dayList, dom.nightList]) {
      if (state.ui.loading) showSkeleton(list);
      else clearList(list);
    }
    clearBoundaries();
    dom.panes.hidden = !state.ui.loading; // skeleton needs the panes; empty state does not
    dom.emptyState.hidden = state.ui.loading;
    dom.notDefined.hidden = true;
    return;
  }

  dom.emptyState.hidden = true;
  const ready = isRenderableSchedule(state.schedule);

  if (!ready) {
    // S3: no row, no boundary text, never NaN / Invalid Date / undefined (US-9 AC2).
    clearList(dom.dayList);
    clearList(dom.nightList);
    clearBoundaries();
    dom.panes.hidden = true;
    dom.notDefined.hidden = false;
    return;
  }

  dom.panes.hidden = false;
  dom.notDefined.hidden = true;
  setRows(dom.dayList, state.schedule.daySlots);
  setRows(dom.nightList, state.schedule.nightSlots);

  const { timezone } = state.location;
  const { lang } = state;
  // 03-ux §3 S1: heading edge = the half's own boundary, small print = the far edge.
  dom.dayEdge.textContent = boundary('section.rise', state.schedule.sunrise, timezone, lang);
  dom.daySmallprint.textContent = boundary('section.set', state.schedule.sunset, timezone, lang);
  dom.nightEdge.textContent = boundary('section.set', state.schedule.sunset, timezone, lang);
  dom.nightSmallprint.textContent = boundary('section.nextRise', state.schedule.nextSunrise, timezone, lang);
}

/**
 * The render guard of 04-arch §8.1: only a schedule whose two halves are complete and
 * whose every instant is a real, finite `Date` may reach the DOM. `buildSchedule`
 * already returns `defined:false` for polar input; this is the belt-and-braces check
 * that makes an empty/partial slot row impossible even if a future edit regresses it.
 */
function isRenderableSchedule(schedule) {
  return Boolean(
    schedule
    && schedule.defined
    && Array.isArray(schedule.daySlots) && schedule.daySlots.length === SLOT_COUNT
    && Array.isArray(schedule.nightSlots) && schedule.nightSlots.length === SLOT_COUNT
    && schedule.daySlots.every(isCompleteSlot)
    && schedule.nightSlots.every(isCompleteSlot),
  );
}

/** A slot is renderable only when both ends are real instants (never NaN/Invalid Date). */
function isCompleteSlot(slot) {
  return Boolean(slot) && isRealInstant(slot.start) && isRealInstant(slot.end);
}

/** True for a usable `Date` (not null, not Invalid Date). */
function isRealInstant(value) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/** Clear the four boundary/small-print nodes (never leaves stale text behind). */
function clearBoundaries() {
  for (const node of [dom.dayEdge, dom.nightEdge, dom.daySmallprint, dom.nightSmallprint]) {
    node.textContent = '';
  }
}

/**
 * `"सूर्योदय 06:32"` — dictionary label + 24-hour time in the location's clock.
 * Returns '' (rather than `undefined`/`Invalid Date`) when the instant is unusable,
 * so a degraded schedule can never leak a broken time into the small print (US-9 AC2).
 */
function boundary(key, instant, timeZone, lang) {
  if (!isRealInstant(instant)) return '';
  const clock = safeFormatTime(instant, timeZone, lang);
  return clock ? `${t(key, lang)} ${clock}` : '';
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
 * range, quality chip (tier word + glyph) — plus the FE-05 disclosure line. Built
 * with createElement/textContent only (NFR-S2).
 *
 * The button carries `aria-expanded` + `aria-controls` for its `.meaning` line and
 * stages the accessible-name parts on `dataset`; `syncCurrentSlot()` completes the
 * label with the current state when the row is live (03-ux §7.3 — name, time range,
 * tier, current state, in that order).
 */
function slotRow(slot) {
  const { timezone } = state.location;
  const { lang } = state;
  const from = formatTime(slot.start, timezone, lang);
  const to = formatTime(slot.end, timezone, lang);
  const latinName = t(`quality.${slot.name}`, 'en');
  const localName = t(`quality.${slot.name}`, lang);
  const tierWord = t(`tier.${slot.tier}`, lang);
  const key = slotKey(slot);
  const expanded = state.ui.expandedSlot === key;
  const meaningId = `meaning-${slot.half}-${slot.index}`;

  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'slot';
  button.dataset.slot = key;
  // The accessible name is assembled from these parts (03-ux §7.3 order); the glyph
  // is excluded so no raw ✓/✕ character is ever announced.
  button.dataset.name = lang === 'hi' ? `${localName}, ${latinName}` : latinName;
  button.dataset.time = `${from} – ${to}`;
  button.dataset.tier = tierWord;
  button.setAttribute('aria-expanded', String(expanded));
  button.setAttribute('aria-controls', meaningId);

  // Zone 2 — "लाभ · Labh" when HI, "Labh" when EN (03-ux §3 zone 2).
  const name = document.createElement('span');
  name.className = 'slot-name';
  name.textContent = lang === 'hi' ? `${localName} · ${latinName}` : latinName;

  // Zone 3 — 24-hour range in the viewed location's timezone (03-ux §8 note).
  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = `${from} – ${to}`;

  // Zone 4 — chip: decorative glyph (aria-hidden) + the tier word that carries the
  // meaning, so colour is never the only signal (US-15 AC1, 03-ux §7.3). The
  // current-slot badge is appended here on demand by ensureNowBadge().
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
  button.addEventListener('click', () => toggleMeaning(button, item, slot));

  // Inline disclosure line: ONLY the already-known quality meaning, no new content
  // and no request (03-ux §4.5). A <span> because it sits inside the <li> as flow
  // content and is displayed as a block by `.meaning`.
  const meaning = document.createElement('span');
  meaning.className = 'meaning';
  meaning.id = meaningId;
  meaning.textContent = t(`meaning.${slot.name}`, lang);
  meaning.hidden = !expanded;

  item.append(button, meaning);
  return item;
}

// Auto-start in a browser only; kept out of module scope's DOM surface per ADR-002.
if (typeof document !== 'undefined') init();

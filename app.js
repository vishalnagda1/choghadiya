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
// poll and the Alt+←/→ date shortcuts. (The v1.0.1 `aria-expanded` meaning-line
// disclosure it introduced was superseded by FE-6's detail panel — see below.) It
// extends render()/slotRow() only; no state or fetch path changes.
// The FE-03 failure seams (`onGeoUnavailable`, `setSheetError`) are now the real
// S5/S6/S7 components; every degradation keeps the date bar and the language
// toggle alive (03-ux §3 S3, §2 F3).
//
// FE-1 (t_8d2651f9, v2.3.0 items 1 + 7a): the 12h/24h time-format toggle, the 12-hour
// default, and per-tab settings persistence. `state.hourCycle` ('h12' | 'h23') is
// threaded explicitly into EVERY formatTime call site (slot ranges, boundary small
// print, S2 result-row city times); the toggle re-renders in place like setLang, in
// well under the 100 ms target. The three client settings — timeFormat, lang and
// hydrate at init and write through session-store.js (the ONLY sanctioned storage
// access point; this file names no web-storage global).
// A stored location renders immediately and suppresses the auto geolocation prompt
// (03-ux F7/F2, adr/009); `viewedDate` is deliberately NOT persisted and still resets
// to today (CTO decision on the card).
//
// FE-3 (t_d7975f6c, v2.3.0 item 4 / CR4): the calendar date picker. The formatted date
// label in the date bar became the picker's trigger — a transparent native
// `<input type="date">` overlays it (03-ux §3.10c) — with `min`/`max` = the viewed
// location's civil date ∓10 days, recomputed on every render. ‹/› and the Alt+←/→
// shortcuts keep working and clamp to the SAME window through one shared code path
// (`setViewedDate`), and both nav buttons disable at the edges. No custom JS calendar,
// no new dependency; `i18n.js` already carries `date.picker.label`.
//
// v2.3.1 (item 8b) made the native picker open via showPicker(); v2.3.2 replaced the
// native control with a themed in-page popup (#calendar: page tokens, Hindi/English
// via Intl, keyboard grid) because the native popup opened off to one side and
// ignored the theme. Picks still go through `setViewedDate`; no new i18n keys.
//
// FE-6 (t_778b1ea0, v2.3.0 item 6 / CR6): the S9 choghadiya detail panel. A slot row is
// now a SELECTION control — `aria-pressed` + `aria-controls="choghadiya-panel"` — and
// the v1.0.1 inline `.meaning` disclosure line is removed, because the panel supersedes
// it (03-ux §3.9; showing the same copy twice on one screen is worse than one tap).
// The panel defaults to the LIVE current choghadiya on today's view (or the neutral
// `panel.selectPrompt` off-today), shows the slot name in both scripts, its range in
// the active 12h/24h format, meaning / good-for / bad-for / day-night nuance, and the
// contextual notes: the `overlappingPeriod` warning naming WHICH inauspicious period
// overlaps, and the "this is running now" / "tap again to return" hints. It re-renders
// on a language, time-format, date or location change; the selection is UI state only
// and is deliberately never persisted (adr/009 — a reload always returns to current).
// `aria-current` + the "अभी / Now" badge remain EXCLUSIVE to the live row (US-14).

import { addDays, buildSchedule, formatDate, formatTime, resolveCurrentSlot, todayIn } from './choghadiya.js?v=2.3.3';
import { computeInauspicious, overlappingPeriod } from './inauspicious.js?v=2.3.3';
import { DEFAULT_LANG, t } from './i18n.js?v=2.3.3';
import { createGeocoder, isAbortError } from './geocoder.js?v=2.3.3';
import { get as storeGet, remove as storeRemove, set as storeSet } from './session-store.js?v=2.3.3';

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
 * FE-6 (v2.3.0 CR6, 03-ux §3.9) — Slot.tier → the S9 tier-note key. The panel groups
 * Amrit (mostAuspicious) with Shubh/Labh as the ONE `panel.note.auspicious` string and
 * maps Char to `panel.note.neutral`, the three inauspicious names (Rog/Kaal/Udveg) to
 * `panel.note.inauspicious` — exactly the three words the copy deck provides (§6).
 */
const TIER_NOTE_KEY = Object.freeze({
  mostAuspicious: 'auspicious',
  auspicious: 'auspicious',
  neutral: 'neutral',
  inauspicious: 'inauspicious',
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
 * S8 (v2.3.0 CR5) — the three inauspicious periods in the engine's fixed reporting
 * order (04-arch §16.2 / inauspicious.js PERIOD_NAMES). One row per occurrence per
 * period; a period with no occurrence renders its `periods.notApplicable` state.
 * The keys double as dictionary key parts: `periods.<name>` and `periods.<name>.desc`.
 */
const PERIOD_ORDER = Object.freeze(['vaarVela', 'kaalVela', 'kaalRatri']);

/**
 * session-store.js keys for the three persisted settings (CTO decision, FE-1 card).
 * session-store's nsKey() is idempotent, so the fully-qualified `choghadiya.*` form is
 * used verbatim and is not double-prefixed.
 */
const SETTINGS_KEYS = Object.freeze({
  timeFormat: 'choghadiya.settings.timeFormat', // '12h' | '24h'
  lang: 'choghadiya.settings.lang', // 'hi' | 'en'
  location: 'choghadiya.settings.location', // { lat, lon, timezone, label }
});

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
  lang: DEFAULT_LANG, // "hi" — client default, 03-ux §2 F6; hydrated from session-store (FE-1)
  hourCycle: 'h12', // 'h12' | 'h23' — 12-hour default (v2.3.0 CR1); hydrated from session-store (FE-1)
  location: null, // Location | null — set by geolocation or a selected city (FE-03)
  viewedDate: null, // "YYYY-MM-DD" at state.location.timezone
  schedule: null, // Schedule for viewedDate at state.location (04-arch §4.1)
  // Inauspicious periods for viewedDate at state.location (04-arch §16.2), or null
  // when there is no location / the schedule is not defined. Exposed in app state so
  // FE-6's detail panel can call overlappingPeriod(slot, state.inauspicious) without
  // recomputing (03-ux §3.9). Never carries a NaN/Invalid Date (§16.2 contract).
  inauspicious: null,
  ui: {
    sheetOpen: false,
    loading: true, // S4 — geolocation resolution in progress
    notice: null, // null | "geo-denied"        → FE-04 renders S5
    sheetError: null, // null | "query-required" | "geocode-empty" | "geocode-network" | "geocode-http" → FE-04 S6/S7
    query: '', // last submitted city query (FE-04 Retry re-submits it)
    // FE-6 — the S9 detail-panel selection: the `half:index` slotKey of the slot the
    // user tapped, or null = "follow the live current slot" (today) / "show the
    // neutral prompt" (off-today). UI state ONLY: never persisted, so a reload always
    // returns to the current choghadiya (03-ux §3.9 selection model, adr/009).
    selectedSlot: null,
    locRequesting: false, // CR2 — a manual getCurrentPosition is in flight (button disabled)
    locDenied: false, // CR2 — show the sheet-local loc.denied line (F8 step 4)
  },
};

/** Element cache; filled by init() only (keeps DOM access out of module scope). */
const dom = {};

/** Lazily-created rate-disciplined geocoder (BE-02); never constructed at import time. */
let geocoder = null;

/** Pending geolocation watchdog timer id (see GEOLOCATION_WATCHDOG_MS). */
let geoWatchdog = null;

/**
 * CR2 — watchdog for the MANUAL "use my current location" request. Kept separate from
 * `geoWatchdog` because the two failure paths differ: the auto-prompt degrades to the
 * page-level S5 notice, the manual request degrades to the sheet-local `loc.denied`
 * line (03-ux F8 step 4). Same bound, so a browser that never settles can never leave
 * the button disabled forever.
 */
let locWatchdog = null;

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
  dom.langGroup = document.getElementById('lang-toggle');
  dom.bHi = document.getElementById('b-hi');
  dom.bEn = document.getElementById('b-en');
  dom.timeGroup = document.getElementById('time-toggle');
  dom.bH12 = document.getElementById('b-h12');
  dom.bH24 = document.getElementById('b-h24');
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
  dom.useCurrent = document.getElementById('use-current');
  dom.useCurrentLabel = document.getElementById('use-current-label');
  dom.sheetLocNote = document.getElementById('sheet-loc-note');
  dom.results = document.getElementById('results');
  dom.dateLabel = document.getElementById('date-label');
  dom.datePicker = document.getElementById('datepicker'); // the calendar's trigger button
  dom.calendar = document.getElementById('calendar');
  dom.calGrid = dom.calendar.querySelector('.cal-grid');
  dom.calTitle = document.getElementById('cal-title');
  dom.calWeekdays = document.getElementById('cal-weekdays');
  dom.calBody = document.getElementById('cal-body');
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
  dom.periods = document.getElementById('periods');
  dom.periodRows = document.getElementById('period-rows');
  dom.closeSheet = document.getElementById('close-sheet');
  // F8 (FE-FIX, t_7069b58a): the footer attribution credit. It is NOT filled by the
  // generic `[data-i18n]` loop like every other node — applyDictionary() routes it to
  // renderAttribution(), which rebuilds its three licence hyperlinks (03-ux §6.1e).
  dom.footerCredit = document.getElementById('footer-credit');

  // --- FE-6: the S9 choghadiya detail panel (v2.3.0 CR6, 03-ux §3.9) --------------
  // Every node here is filled by renderPanel() (values) or applyDictionary() (static
  // labels); the panel carries no interactive control of its own.
  dom.panel = document.getElementById('choghadiya-panel');
  dom.panelBadge = document.getElementById('panel-badge');
  dom.panelPrompt = document.getElementById('panel-prompt');
  dom.panelBody = document.getElementById('panel-body');
  dom.panelName = document.getElementById('panel-name');
  dom.panelRange = document.getElementById('panel-range');
  dom.panelWarn = document.getElementById('panel-warn');
  dom.panelWarnText = document.getElementById('panel-warn-text');
  dom.panelNote = document.getElementById('panel-note');
  dom.panelTierNote = document.getElementById('panel-tier-note');
  dom.panelMeaning = document.getElementById('panel-meaning');
  dom.panelGoodFor = document.getElementById('panel-goodfor');
  dom.panelBadFor = document.getElementById('panel-badfor');
  dom.panelNuance = document.getElementById('panel-nuance');
  dom.panelStatus = document.getElementById('panel-status');

  dom.bHi.addEventListener('click', () => setLang('hi'));
  dom.bEn.addEventListener('click', () => setLang('en'));
  // --- FE-1: 12h/24h toggle (v2.3.0 CR1) ---------------------------------------
  dom.bH12.addEventListener('click', () => setHourCycle('h12'));
  dom.bH24.addEventListener('click', () => setHourCycle('h23'));
  dom.prev.addEventListener('click', () => stepDay(-1));
  dom.next.addEventListener('click', () => stepDay(1));
  dom.todayPill.addEventListener('click', goToToday);
  // --- v2.3.2: the themed calendar popup drives `viewedDate` ----------------------
  dom.datePicker.addEventListener('click', toggleCalendar);
  dom.calBody.addEventListener('click', onCalendarClick);
  dom.calendar.addEventListener('keydown', onCalendarKey);
  // Light dismiss: a press outside the popup and its trigger, or focus leaving both.
  document.addEventListener('pointerdown', (event) => {
    if (!dom.calendar.hidden && !dom.calendar.contains(event.target)
        && !dom.datePicker.contains(event.target)) closeCalendar(false);
  });
  dom.calendar.addEventListener('focusout', (event) => {
    const to = event.relatedTarget;
    if (to && !dom.calendar.contains(to) && to !== dom.datePicker) closeCalendar(false);
  });

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
  // CR2 — the manual "use my current location" button (03-ux §3.10b / F8).
  dom.useCurrent.addEventListener('click', useCurrentLocation);
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

  hydrateSettings(); // FE-1: restore timeFormat / lang / location before the first render
  render(); // S4: shell + skeleton lists (or the hydrated location), never blocking
  // FE-1: only prompt for geolocation when no location was restored. A stored location
  // renders immediately above and skips the prompt (03-ux F7 step 1 / F2; the S5
  // notice's city button is the on-demand re-trigger).
  if (!state.location) scheduleGeolocation(); // requested AFTER first paint (US-4 AC1)
}

/* ------------------------------------------------------------------ */
/* State transitions                                                   */
/* ------------------------------------------------------------------ */

/** US-11 AC1/AC2 — instant language switch, no reload (< 100 ms: render is synchronous). */
function setLang(lang) {
  if (lang === state.lang) return;
  state.lang = lang;
  persistSettings.lang();
  render();
}

/**
 * v2.3.0 CR1 / 03-ux F7 — flip the 12h/24h display cycle and re-render every visible
 * time in one synchronous pass (both lists, the boundary small print, the S8/S9 ranges
 * when those render, and the S2 result rows). No reload and no re-computation of the
 * solar instants: only the display changes. Persisted per tab through session-store.
 */
function setHourCycle(hourCycle) {
  if (hourCycle === state.hourCycle) return;
  state.hourCycle = hourCycle;
  persistSettings.timeFormat();
  render();
}

/* ------------------------------------------------------------------ */
/* Settings persistence (FE-1, v2.3.0 item 7a)                         */
/* ------------------------------------------------------------------ */

/**
 * Restore the three persisted settings before the first render (CTO decisions on the
 * card): timeFormat ('12h' default), lang ('hi' default) and location (none default).
 * `viewedDate` is deliberately NOT persisted — it always resets to the location's today.
 * Every read goes through session-store.js, whose in-memory fallback keeps this working
 * in private mode / when storage is disabled.
 */
function hydrateSettings() {
  const storedLang = storeGet(SETTINGS_KEYS.lang);
  if (storedLang === 'hi' || storedLang === 'en') state.lang = storedLang;

  const storedFormat = storeGet(SETTINGS_KEYS.timeFormat);
  if (storedFormat === '12h' || storedFormat === '24h') {
    state.hourCycle = storedFormat === '24h' ? 'h23' : 'h12';
  }

  const location = normaliseStoredLocation(storeGet(SETTINGS_KEYS.location));
  if (location) {
    state.location = location;
    state.ui.loading = false;
    state.ui.notice = null;
    state.viewedDate = todayAtLocation(); // "today" is the restored location's civil date
  }
}

/**
 * Validate and adapt a stored `{ lat, lon, timezone, label }` record to an AppState
 * Location. Anything malformed (missing/invalid coords, a non-string or unknown IANA
 * zone) is rejected so a corrupt entry can never crash init or leak into buildSchedule.
 * `source` is derived: a non-empty label means a chosen city, an empty one a device fix
 * (matching onGeoSuccess/selectResult), so the chip re-renders correctly on reload.
 */
function normaliseStoredLocation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { lat, lon, timezone, label } = raw;
  if (typeof lat !== 'number' || !Number.isFinite(lat)) return null;
  if (typeof lon !== 'number' || !Number.isFinite(lon)) return null;
  if (typeof timezone !== 'string' || !isValidTimeZone(timezone)) return null;
  const cityLabel = typeof label === 'string' ? label : '';
  return {
    latitude: lat,
    longitude: lon,
    timezone,
    label: cityLabel,
    source: cityLabel ? 'city' : 'geolocation',
  };
}

/** True when `timeZone` is an IANA zone the host Intl accepts (never throws). */
function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The three settings writers — each the only place its key is written, so a change to
 * the persistence shape stays in one spot. session-store serialises and swallows any
 * storage failure (its in-memory fallback keeps the app running).
 */
const persistSettings = Object.freeze({
  timeFormat() {
    storeSet(SETTINGS_KEYS.timeFormat, state.hourCycle === 'h23' ? '24h' : '12h');
  },
  lang() {
    storeSet(SETTINGS_KEYS.lang, state.lang);
  },
  location() {
    if (!state.location) {
      storeRemove(SETTINGS_KEYS.location);
      return;
    }
    storeSet(SETTINGS_KEYS.location, {
      lat: state.location.latitude,
      lon: state.location.longitude,
      timezone: state.location.timezone,
      label: state.location.label,
    });
  },
});

/* ------------------------------------------------------------------ */
/* CR4 — calendar picker range (+/- DATE_RANGE_DAYS civil days)        */
/* ------------------------------------------------------------------ */

/**
 * The client asked for "roughly ±8–10 days"; the CTO fixed ±10 (03-ux §3.10c:
 * "min/max = the location civil date −10 / +10 days", 21 selectable days inclusive).
 */
const DATE_RANGE_DAYS = 10;

/**
 * The selectable window for the *viewed location*: its civil date ±10 days.
 * "Today" is the LOCATION's civil date (Q8, US-3 AC3/Va), never the device's, so a
 * city on the other side of the date line gets its own window. Returns `null` while
 * there is no location (S4) — the date bar is inert then.
 */
function dateRange() {
  if (!state.location) return null;
  const today = todayAtLocation();
  return { today, min: addDays(today, -DATE_RANGE_DAYS), max: addDays(today, DATE_RANGE_DAYS) };
}

/**
 * Clamp "YYYY-MM-DD" into [min, max]. Lexical comparison is exact for ISO civil
 * dates, so this needs no Date parsing and cannot produce NaN / Invalid Date.
 */
function clampToRange(dateISO, range) {
  if (dateISO < range.min) return range.min;
  if (dateISO > range.max) return range.max;
  return dateISO;
}

/**
 * Apply a newly viewed date from ANY navigation control (‹/›, Alt+←/→, the picker,
 * S3's adjacent-date escape hatch). One code path for all of them means one clamp
 * rule — no control can leave the ±10-day window (03-ux §3.10c "Edge clamping").
 * No-ops when the date is unchanged, so a clamped edge click does not re-render.
 */
function setViewedDate(dateISO) {
  if (!state.location || dateISO === state.viewedDate) return;
  state.viewedDate = dateISO;
  clearSlotSelection(); // a different date is a fresh view: drop the S9 selection
  render();
}

/** US-13 AC1/AC2 — step the viewed date by ±1 civil day and re-render both lists. */
function stepDay(delta) {
  if (!state.location) return; // no location yet → date bar is disabled (S4)
  const range = dateRange();
  const next = addDays(state.viewedDate, delta);
  if (next < range.min || next > range.max) return; // edge: the button is disabled anyway
  setViewedDate(next);
}

/* v2.3.2 — the themed calendar popup */

/** Intl locale for calendar labels — the same mapping formatDate()/formatTime() use. */
function calendarLocale(lang) {
  return lang === 'hi' ? 'hi-IN' : 'en-IN';
}

/** A civil "YYYY-MM-DD" as a UTC-noon Date — for Intl labels formatted in 'UTC' only. */
function civilNoonUTC(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** Day of week (0 = Sunday) of a civil date — pure arithmetic, no zone involved. */
function civilWeekday(dateISO) {
  return civilNoonUTC(dateISO).getUTCDay();
}

/**
 * Build the popup: whole Sunday-first weeks around the ±10-day window (out-of-window
 * days disabled). Viewed date = aria-pressed, today = aria-current; roving tabindex.
 */
function renderCalendar(focusDate) {
  const range = dateRange();
  if (!range) return;
  const locale = calendarLocale(state.lang);
  const fmt = (opts) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', numberingSystem: 'latn', ...opts });
  const active = focusDate || state.viewedDate;

  // "अक्टूबर 2026", or "अक्टूबर–नवंबर 2026" when the window spans two months.
  const monthYear = fmt({ month: 'long', year: 'numeric' });
  const from = civilNoonUTC(range.min);
  const to = civilNoonUTC(range.max);
  let title;
  try {
    title = range.min.slice(0, 7) === range.max.slice(0, 7)
      ? monthYear.format(from)
      : monthYear.formatRange(from, to);
  } catch {
    title = `${monthYear.format(from)} – ${monthYear.format(to)}`;
  }
  dom.calTitle.textContent = title;

  const gridStart = addDays(range.min, -civilWeekday(range.min));
  const gridEnd = addDays(range.max, 6 - civilWeekday(range.max));

  const weekdayShort = fmt({ weekday: 'short' });
  const weekdayLong = fmt({ weekday: 'long' });
  dom.calWeekdays.replaceChildren();
  for (let i = 0; i < 7; i += 1) {
    const day = civilNoonUTC(addDays(gridStart, i));
    const th = document.createElement('th');
    th.scope = 'col';
    th.abbr = weekdayLong.format(day);
    th.textContent = weekdayShort.format(day);
    dom.calWeekdays.append(th);
  }

  const monthShort = fmt({ month: 'short' });
  const rows = [];
  let row = null;
  for (let iso = gridStart; iso <= gridEnd; iso = addDays(iso, 1)) {
    if (civilWeekday(iso) === 0) {
      row = document.createElement('tr');
      rows.push(row);
    }
    const inRange = iso >= range.min && iso <= range.max;
    const td = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-day';
    btn.dataset.date = iso;
    btn.tabIndex = iso === active ? 0 : -1;
    btn.setAttribute('aria-label', safeFormatDate(iso, state.location.timezone, state.lang));
    btn.setAttribute('aria-pressed', String(iso === state.viewedDate));
    if (iso === range.today) btn.setAttribute('aria-current', 'date');
    if (!inRange) btn.disabled = true;
    const num = document.createElement('span');
    num.textContent = String(Number(iso.slice(8)));
    btn.append(num);
    // A month tag where the month changes, so a 2-month window is never ambiguous.
    if (inRange && (iso === range.min || iso.endsWith('-01'))) {
      const m = document.createElement('span');
      m.className = 'm';
      m.setAttribute('aria-hidden', 'true');
      m.textContent = monthShort.format(civilNoonUTC(iso));
      btn.append(m);
    }
    td.append(btn);
    row.append(td);
  }
  dom.calBody.replaceChildren(...rows);
}

function isCalendarOpen() {
  return Boolean(dom.calendar) && !dom.calendar.hidden;
}

/** The trigger (the date label button) toggles the popup. */
function toggleCalendar() {
  if (isCalendarOpen()) closeCalendar(true);
  else openCalendar();
}

function openCalendar() {
  if (!state.location || dom.datePicker.disabled) return; // no-location: picker inert
  renderCalendar();
  dom.calendar.hidden = false;
  dom.datePicker.setAttribute('aria-expanded', 'true');
  focusCalendarDay(state.viewedDate);
}

/** Close the popup; `restoreFocus` returns focus to the trigger (Esc / a pick). */
function closeCalendar(restoreFocus) {
  if (!isCalendarOpen()) return;
  dom.calendar.hidden = true;
  dom.datePicker.setAttribute('aria-expanded', 'false');
  if (restoreFocus) dom.datePicker.focus();
}

/** Move the roving tabindex to `dateISO` and focus it (in-window days only). */
function focusCalendarDay(dateISO) {
  const target = dom.calBody.querySelector(`.cal-day[data-date="${dateISO}"]:not(:disabled)`);
  if (!target) return;
  for (const btn of dom.calBody.querySelectorAll('.cal-day[tabindex="0"]')) btn.tabIndex = -1;
  target.tabIndex = 0;
  target.focus();
}

/** A day pick: close first (focus back on the trigger), then the one clamp path. */
function onCalendarClick(event) {
  const btn = event.target.closest('.cal-day');
  if (!btn || btn.disabled) return;
  closeCalendar(true);
  setViewedDate(btn.dataset.date);
}

/** Grid keys (WAI-ARIA date picker): arrows, Home/End, PageUp/Down (window ends), Esc; clamped. */
function onCalendarKey(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeCalendar(true);
    return;
  }
  const btn = event.target.closest && event.target.closest('.cal-day');
  const range = dateRange();
  if (!btn || !range || event.altKey || event.ctrlKey || event.metaKey) return;
  const from = btn.dataset.date;
  const weekday = civilWeekday(from);
  const moves = {
    ArrowLeft: addDays(from, -1),
    ArrowRight: addDays(from, 1),
    ArrowUp: addDays(from, -7),
    ArrowDown: addDays(from, 7),
    Home: addDays(from, -weekday),
    End: addDays(from, 6 - weekday),
    PageUp: range.min,
    PageDown: range.max,
  };
  if (!(event.key in moves)) return;
  event.preventDefault();
  focusCalendarDay(clampToRange(moves[event.key], range));
}

/** The "आज / Today" reset pill (03-ux §3 S1 "Success (other date)"). */
function goToToday() {
  if (!state.location) return;
  state.viewedDate = todayAtLocation();
  clearSlotSelection();
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
  applyDeviceLocation(position);
  render();
}

/**
 * The single writer for a granted DEVICE fix, shared by the startup auto-prompt
 * (onGeoSuccess) and the manual button (onManualGeoSuccess) so both produce an
 * identical Location: device coords + the device's Intl IANA zone, no third-party
 * name (the chip shows `loc.my`, 03-ux F2 step 1), `label` stays '' per 04-arch §4.1,
 * and the fix is persisted through session-store (FE-1) so a reload skips the prompt.
 */
function applyDeviceLocation(position) {
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
  clearSlotSelection(); // a new location is a fresh view (03-ux §3.9 selection model)
  persistSettings.location(); // FE-1: remember the device fix so a reload skips the prompt
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
/* Manual "use my current location" (v2.3.0 CR2, 03-ux §3.10b / F8)    */
/* ------------------------------------------------------------------ */

/**
 * The manual re-trigger path. A stored location suppresses the *auto*-prompt (FE-1)
 * but never this button — it is the ONLY way to re-request a device fix on demand, and
 * it works after a denied auto-prompt, an unavailable/insecure context, or a
 * stored-location load alike (03-ux F8 step 6).
 *
 * Idempotent while in flight: the `state.ui.locRequesting` guard (belt) plus the
 * disabled button (braces) mean repeated taps issue no second `getCurrentPosition`
 * call (F8 step 5). The permission flow is byte-identical to the auto-prompt — the same
 * GEOLOCATION_OPTIONS and the same granted writer (`applyDeviceLocation`).
 */
function useCurrentLocation() {
  if (state.ui.locRequesting) return; // no double-prompt while a fix is in flight
  const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
  // No geolocation at all (insecure context / unsupported browser) → the sheet-local
  // loc.denied line, never a throw and never the page-level banner (F8 step 4).
  if (!geo || typeof geo.getCurrentPosition !== 'function') {
    onManualGeoFailure();
    return;
  }
  state.ui.locRequesting = true;
  state.ui.locDenied = false; // clear any previous denial line for this attempt
  renderUseCurrent();
  armLocWatchdog();
  geo.getCurrentPosition(onManualGeoSuccess, onManualGeoFailure, GEOLOCATION_OPTIONS);
}

/**
 * Guarantee the requesting state is never permanent (a browser can ignore our
 * `timeout` and invoke NEITHER callback — reproduced over CDP). Same bound as the
 * auto-prompt's watchdog; a genuinely late success still wins (onManualGeoSuccess).
 */
function armLocWatchdog() {
  clearLocWatchdog();
  if (typeof window === 'undefined') return;
  locWatchdog = window.setTimeout(() => {
    locWatchdog = null;
    if (state.ui.locRequesting) onManualGeoFailure();
  }, GEOLOCATION_WATCHDOG_MS);
}

function clearLocWatchdog() {
  if (locWatchdog !== null && typeof window !== 'undefined') window.clearTimeout(locWatchdog);
  locWatchdog = null;
}

/**
 * Granted (F8 step 3): the fix overwrites any stored location, the sheet closes (focus
 * returns to the chip via onSheetClose), the chip relabels to `loc.my`, `loc.granted`
 * is announced in the polite status line, and both lists + boundaries re-render for the
 * device location.
 */
function onManualGeoSuccess(position) {
  clearLocWatchdog();
  state.ui.locRequesting = false;
  state.ui.locDenied = false;
  applyDeviceLocation(position);
  render();
  // Announce AFTER render (renderDateBar owns #live's steady state) so the granted
  // confirmation is the last thing the polite region reads (03-ux §7.3).
  dom.live.textContent = t('loc.granted', state.lang);
  if (dom.sheet.open) dom.sheet.close(); // focus return happens in onSheetClose
}

/**
 * Denied / timed out / unavailable / insecure context (F8 step 4): the button returns
 * to rest (still tappable — the user may have just fixed a permission) and the
 * sheet-local `loc.denied` line appears above the city field. The sheet stays open and
 * the typed-city path is untouched; the page-level `geo.denied` banner is NOT involved
 * (that belongs to the startup auto-prompt).
 */
function onManualGeoFailure() {
  clearLocWatchdog();
  state.ui.locRequesting = false;
  state.ui.locDenied = true;
  renderUseCurrent();
}

/**
 * Paint the manual button's state (03-ux §3.10b / §7.3): requesting → disabled +
 * `aria-busy="true"` + the `geo.loading` label; rest → the `loc.useCurrent` label. The
 * sheet-local denial line follows `state.ui.locDenied`. Called from render() (so a
 * language switch re-localises it) and from the request lifecycle above.
 */
function renderUseCurrent() {
  const requesting = state.ui.locRequesting;
  dom.useCurrent.disabled = requesting;
  dom.useCurrent.setAttribute('aria-busy', String(requesting));
  dom.useCurrentLabel.textContent = t(requesting ? 'geo.loading' : 'loc.useCurrent', state.lang);
  dom.sheetLocNote.hidden = !state.ui.locDenied;
}

/* ------------------------------------------------------------------ */
/* City search sheet (US-5, 03-ux S2 / F2)                             */
/* ------------------------------------------------------------------ */

function getGeocoder() {
  // v2.3.0 item 7b: hand the session store to the geocoder so the 24 h geocode
  // cache survives a page reload (docs/04-architecture.md §16.2/§16.3). The
  // geocoder only ever calls get/set/remove, so expose exactly those — `clear`
  // stays out of its reach — and keep every storage access behind
  // session-store.js (SEC-STORAGE gate).
  if (!geocoder) {
    geocoder = createGeocoder({
      lang: state.lang,
      cacheStore: { get: storeGet, set: storeSet, remove: storeRemove },
    });
  }
  return geocoder;
}

/** Chip click → modal `<dialog>`; focus lands in the city field (US-18 AC2, 03-ux S2). */
function openSheet() {
  state.ui.sheetOpen = true;
  setSheetError(null);
  // A fresh sheet session starts with no manual-denial line (03-ux F8 step 4).
  state.ui.locDenied = false;
  renderUseCurrent();
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
    const localTime = safeFormatTime(now, result.timezone, lang, state.hourCycle);
    place.textContent = [region, localTime].filter(Boolean).join(' · ');

    button.append(name, place);
    button.addEventListener('click', () => selectResult(result));
    item.append(button);
    return item;
  });
  dom.results.replaceChildren(...rows);
}

/** formatTime in a possibly-missing/unknown IANA zone — never NaN/Invalid (04-arch §8.1). */
function safeFormatTime(instant, timeZone, lang, hourCycle) {
  if (!timeZone) return '';
  try {
    return formatTime(instant, timeZone, lang, { hourCycle });
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
    // Fall back to the device zone only if the service omitted one (04-arch §5.2) —
    // and never let a non-string/unknown zone through: Intl.DateTimeFormat throws an
    // uncaught RangeError on it, which would blank the render (SEC F10). Defence in
    // depth behind geocoder.js's read-path validation, mirroring normaliseStoredLocation.
    timezone: isValidTimeZone(result.timezone) ? result.timezone : deviceTimeZone(),
    label: labelFor(result),
    source: 'city',
  };
  state.ui.loading = false;
  state.ui.notice = null;
  dom.cityInput.value = '';
  state.viewedDate = todayAtLocation();
  clearSlotSelection(); // a chosen city is a fresh view (03-ux §3.9)
  persistSettings.location(); // FE-1: a manual city choice overwrites the stored location
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
  clearSlotSelection(); // no location → no rows, so no selection either
  persistSettings.location(); // FE-1: forget the stored location (session-store remove)
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

/**
 * Drop the user's S9 selection (a date or location change is a fresh view: 03-ux
 * §3.9 — "selection does not survive a date change"). The row set is rebuilt by the
 * following render(), so no in-place ARIA repair is needed here.
 */
function clearSlotSelection() {
  state.ui.selectedSlot = null;
}

/**
 * FE-6 (v2.3.0 CR6, 03-ux §3.9) — a slot-row tap SELECTS that slot into the S9 panel
 * (and taps the same row again to deselect, returning the panel to the live current
 * choghadiya / the off-today prompt).
 *
 * Deliberately an in-place update, never render(): the row list is not rebuilt, so the
 * tapped button keeps focus and the user keeps their place in the list (§7.2 —
 * focus only moves on sheet open/close). `aria-current` + the "अभी / Now" badge are
 * NEVER touched here: they stay exclusive to the live row (US-14 AC1); the selection
 * is carried by `aria-pressed` alone.
 */
function selectSlot(slot) {
  const key = slotKey(slot);
  state.ui.selectedSlot = state.ui.selectedSlot === key ? null : key;
  applySelection();
  renderPanel();
  // One polite announcement per selection change — the panel itself is NOT a live
  // region (03-ux §3.9: a whole card re-announcing on every tap is noise).
  dom.panelStatus.textContent = t('panel.status.updated', state.lang);
}

/**
 * Reconcile every row's `aria-pressed` with `state.ui.selectedSlot`. Rows are replaced
 * wholesale by render(); this is the in-place counterpart used by selectSlot() and by
 * syncCurrentSlot() when a boundary crossing retires a "follow the live slot"
 * selection.
 */
function applySelection() {
  const selected = state.ui.selectedSlot;
  for (const list of [dom.dayList, dom.nightList]) {
    if (!list) continue;
    for (const button of list.querySelectorAll('button.slot')) {
      button.setAttribute('aria-pressed', String(selected !== null && button.dataset.slot === selected));
    }
  }
}

/** The schedule slot carrying `key`, day half first, or null when there is none. */
function findSlotByKey(key) {
  if (!state.schedule) return null;
  const slots = [...(state.schedule.daySlots || []), ...(state.schedule.nightSlots || [])];
  return slots.find((slot) => slotKey(slot) === key) || null;
}

/**
 * Blank every value node of S9 (used when the panel is hidden entirely or shows only
 * the neutral prompt). The panel never leaves stale slot text in the DOM behind a
 * hidden body.
 */
function clearPanelValues() {
  for (const node of [
    dom.panelName, dom.panelRange, dom.panelWarnText, dom.panelNote, dom.panelTierNote,
    dom.panelMeaning, dom.panelGoodFor, dom.panelBadFor, dom.panelNuance,
  ]) {
    node.textContent = '';
  }
  dom.panelWarn.hidden = true;
}

/**
 * S9 — the choghadiya detail panel (v2.3.0 CR6, 03-ux §3.9).
 *
 * What it shows, in the spec's own order of precedence:
 *   1. the user's explicit selection (`state.ui.selectedSlot`), else
 *   2. the LIVE current choghadiya when the viewed date is today at the viewed
 *      location (`resolveCurrentSlot` returns non-null only then — US-13 AC3), else
 *   3. the neutral `panel.selectPrompt` (off-today, nothing tapped).
 *
 * Hidden entirely while there is no location or the schedule is not defined — S3 owns
 * that screen and the row buttons do not exist there either (§3.9 states table).
 *
 * Contextual notes: the overlap warning is emitted exactly when `overlappingPeriod()`
 * returns a slug for the SHOWN slot, and its key is the slug's own concrete key
 * (`panel.note.overlay.<slug>` — three keys, no interpolation, §6.1 note 5), so the
 * sentence names WHICH period overlaps. The tier note is always present (current,
 * selected and off-today-selected alike); `panel.note.current` / `panel.note.tapAgain`
 * distinguish the live slot from a tapped one.
 *
 * Every value is written with textContent only (NFR-S2) and every string comes from the
 * dictionary in the ACTIVE language, so a language or time-format toggle re-renders it
 * correctly in the same pass (03-ux F7 step 2 / §3.9).
 */
function renderPanel() {
  const ready = Boolean(state.location) && isRenderableSchedule(state.schedule);
  if (!ready) {
    dom.panel.hidden = true;
    clearPanelValues();
    return;
  }
  dom.panel.hidden = false;

  const { lang } = state;
  const { timezone } = state.location;
  const current = resolveCurrentSlot(state.schedule, new Date());
  const currentKey = current ? slotKey(current) : null;
  const shown = state.ui.selectedSlot ? findSlotByKey(state.ui.selectedSlot) : current;

  if (!shown) {
    // Off-today, nothing selected: heading + the neutral prompt only — no badge, no
    // tier note, no content fields (§3.9 "Off-today, nothing selected"). The value
    // nodes are cleared too, so no stale slot text can linger in the DOM behind the
    // hidden body (and a screen-reader user can never reach a leftover sentence).
    dom.panelBody.hidden = true;
    dom.panelPrompt.hidden = false;
    dom.panelBadge.hidden = true;
    clearPanelValues();
    return;
  }

  dom.panelPrompt.hidden = true;
  dom.panelBody.hidden = false;

  const isLive = currentKey !== null && slotKey(shown) === currentKey;
  dom.panelBadge.hidden = !isLive;

  // Name in both scripts, matching the row's zone-2 convention: "अमृत · Amrit" (HI)
  // or "Amrit" (EN). The range uses the active 12h/24h format and the location's zone
  // through the same safe formatter as every other time on the page.
  const latin = t(`quality.${shown.name}`, 'en');
  const local = t(`quality.${shown.name}`, lang);
  dom.panelName.textContent = lang === 'hi' ? `${local} · ${latin}` : latin;

  const from = safeFormatTime(shown.start, timezone, lang, state.hourCycle);
  const to = safeFormatTime(shown.end, timezone, lang, state.hourCycle);
  dom.panelRange.textContent = from && to ? `${from} – ${to}` : '';

  const slug = state.inauspicious ? overlappingPeriod(shown, state.inauspicious) : null;
  if (slug) {
    dom.panelWarnText.textContent = t(`panel.note.overlay.${slug}`, lang);
    dom.panelWarn.hidden = false;
  } else {
    dom.panelWarnText.textContent = '';
    dom.panelWarn.hidden = true;
  }

  dom.panelNote.textContent = t(isLive ? 'panel.note.current' : 'panel.note.tapAgain', lang);
  dom.panelTierNote.textContent = t(`panel.note.${TIER_NOTE_KEY[shown.tier] || 'neutral'}`, lang);

  dom.panelMeaning.textContent = t(`panel.${shown.name}.meaning`, lang);
  dom.panelGoodFor.textContent = t(`panel.${shown.name}.goodFor`, lang);
  dom.panelBadFor.textContent = t(`panel.${shown.name}.badFor`, lang);
  dom.panelNuance.textContent = t(`panel.${shown.name}.nuance`, lang);
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
  const previousKey = appliedCurrentKey;
  appliedCurrentKey = key;

  // FE-6 (03-ux §3.9 "Slot boundary crossed while the page is open"): a selection that
  // IS the previously live slot (or the follow-the-live-slot default) keeps following
  // the new current slot; an explicit selection of a DIFFERENT slot is preserved — the
  // poll must never yank the panel away from a deliberate choice.
  if (key !== previousKey && (state.ui.selectedSlot === null || state.ui.selectedSlot === previousKey)) {
    state.ui.selectedSlot = null;
  }

  for (const list of [dom.dayList, dom.nightList]) {
    if (!list) continue;
    for (const button of list.querySelectorAll('button.slot')) {
      setCurrent(button, key !== null && button.dataset.slot === key);
    }
  }
  applySelection(); // rows may be freshly built (force) — the selection ring must survive
  renderPanel(); // …and S9 follows the live slot when the user has not selected one
}

/**
 * ≤ 60 s, visibility-aware poll (US-14 AC4, PRD Q2): the highlight advances while the
 * page stays open, no work happens in a hidden tab, and returning to the tab catches
 * up immediately instead of waiting a full interval. A tick never re-renders the
 * lists, so the S9 selection, the focused row and the scroll position all survive it
 * (syncCurrentSlot only repaints S9 when the live slot actually moved).
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
  const range = dateRange();
  // The window re-bases across the location's own midnight, so an OPEN calendar is
  // rebuilt too — a stale grid would offer a day outside the ±10 window. The focused
  // day is kept where it is (or clamped into the new window).
  if (isCalendarOpen()) {
    const focused = document.activeElement && document.activeElement.dataset
      ? document.activeElement.dataset.date : null;
    renderCalendar(focused ? clampToRange(focused, range) : null);
    if (focused) focusCalendarDay(clampToRange(focused, range));
  }
  // Midnight can also push the viewed date out of the new window; snap to the edge and
  // repaint (schedule included) rather than showing a date the picker can no longer
  // hold. render() does not call back into this function, so there is no loop.
  if (state.viewedDate < range.min || state.viewedDate > range.max) {
    state.viewedDate = clampToRange(state.viewedDate, range);
    render();
    return;
  }
  dom.prev.disabled = state.viewedDate <= range.min;
  dom.next.disabled = state.viewedDate >= range.max;
  dom.prev.setAttribute('aria-disabled', String(dom.prev.disabled));
  dom.next.setAttribute('aria-disabled', String(dom.next.disabled));

  const label = safeFormatDate(state.viewedDate, state.location.timezone, state.lang);
  if (dom.dateLabel.textContent !== label) {
    dom.dateLabel.textContent = label;
    dom.live.textContent = label;
  }
  const isToday = state.viewedDate === range.today;
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
  if (state.ui.sheetOpen || !state.location || isCalendarOpen()) return;

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
  // CR4: a location change re-bases the ±10-day window (03-ux §3.10c "Location
  // change"). If the viewed date now falls outside it, snap into range here — one
  // clamp for every future render path, so an out-of-range date can never be
  // scheduled, and the UI is never silently inconsistent with the picker's min/max.
  if (state.location) state.viewedDate = clampToRange(state.viewedDate, dateRange());

  state.schedule = state.location
    ? buildSchedule({ location: state.location, date: state.viewedDate })
    : null;

  // S8 — inauspicious periods for the SAME date + location (03-ux §3.8, 04-arch
  // §16.2). Computed here so `state.inauspicious` is always consistent with the
  // schedule the lists just rendered (FE-6 consumes it via overlappingPeriod()).
  // No location → null (the block is hidden anyway). A polar date returns
  // {defined:false} rather than throwing; a throw is contained by
  // safeInauspicious() so a bad solar input can never take the whole render down.
  state.inauspicious = state.location
    ? safeInauspicious(state.viewedDate, state.location)
    : null;

  dom.html.lang = state.lang; // US-11 AC5 — <html lang> flips hi <-> en
  applyDictionary();
  renderNotDefined();
  renderChip();
  renderUseCurrent(); // CR2 — the manual button's label/busy state + the denial line
  renderDateBar();
  renderNotice();
  renderSections();
  renderPeriods(); // CR5 — S8 renders from the *Periods arrays (all occurrences)
  syncCurrentSlot(true); // rows are freshly built — (re)apply the current-slot marker
  // syncCurrentSlot() ends by repainting S9 (FE-6): the panel shows the user's
  // selection, or follows the live slot when there is none, so a language /
  // time-format / date / location change re-renders its content in the same pass.
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
 * F8 (03-ux §6.1e) — the licence-mandatory attribution credit. The three provider /
 * licence words must be real hyperlinks (RS-3 §13.6 B1: Open-Meteo's terms require a
 * link next to displayed location data, CC BY 4.0 §3(a) requires the licence URI), but
 * SEC-05 bans every HTML sink and SEC-1 requires dictionary content to reach the DOM as
 * text only. So the visible string stays the single source of truth in i18n.js and the
 * node's children are built with DOM APIs: split the translated value on the three link
 * words IN ORDER, emit each intervening run as a text node and each link word as an
 * `<a>` whose textContent is that word. The three words are Latin in both dictionaries
 * (§6.1e), so one rule serves `hi` and `en`, and the node's concatenated textContent
 * stays byte-equal to `t('attribution.geocoding', lang)` — which is the regression the
 * smoke/S-I18N gates assert.
 */
const ATTRIBUTION_LINKS = Object.freeze([
  { text: 'Open-Meteo', href: 'https://open-meteo.com/' },
  { text: 'GeoNames', href: 'https://www.geonames.org/' },
  { text: 'CC BY 4.0', href: 'https://creativecommons.org/licenses/by/4.0/' },
]);

function renderAttribution(el, lang) {
  const s = t('attribution.geocoding', lang);
  const frag = document.createDocumentFragment();
  let cursor = 0;
  for (const { text, href } of ATTRIBUTION_LINKS) {
    const at = s.indexOf(text, cursor);
    if (at < 0) {
      // A dictionary edit that splits or renames a link word: fail loudly at the point
      // of use (same contract as t()) rather than render a credit with dead text.
      throw new TypeError(`attribution render: link word ${JSON.stringify(text)} missing from attribution.geocoding`);
    }
    if (at > cursor) frag.append(document.createTextNode(s.slice(cursor, at)));
    const a = document.createElement('a');
    a.textContent = text; // textContent, never innerHTML (SEC-05)
    a.setAttribute('href', href);
    a.setAttribute('rel', 'noopener noreferrer');
    a.setAttribute('target', '_blank');
    frag.append(a);
    cursor = at + text.length;
  }
  if (cursor < s.length) frag.append(document.createTextNode(s.slice(cursor)));
  el.replaceChildren(frag);
}

/**
 * US-11 AC3 — every string on the page comes from i18n.js. `data-i18n` /
 * `data-i18n-ph` nodes are re-filled from the dictionary, plus the few shell
 * attributes FE-01 left as literals (the CSS/HTML surface has no dictionary hook),
 * and the <title>, composed from two existing keys (no new copy).
 *
 * `attribution.geocoding` is the one exception: it carries three hyperlinks, so it
 * goes through renderAttribution() instead of the plain-text loop below (§6.1e).
 */
function applyDictionary() {
  const { lang } = state;

  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (key === 'attribution.geocoding') continue; // DOM-built links, see below
    el.textContent = t(key, lang);
  }
  renderAttribution(dom.footerCredit, lang);
  for (const el of document.querySelectorAll('[data-i18n-ph]')) {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'), lang));
  }

  dom.langGroup.setAttribute('aria-label', t('lang.toggle.label', lang));
  dom.bHi.textContent = t('lang.hi', lang);
  dom.bEn.textContent = t('lang.en', lang);
  dom.bHi.setAttribute('aria-pressed', String(lang === 'hi'));
  dom.bEn.setAttribute('aria-pressed', String(lang === 'en'));
  // --- FE-1: the 12h/24h segmented toggle (v2.3.0 CR1, 03-ux §3.10a) --------------
  // The visible "12h"/"24h" labels are byte-identical in HI and EN, so they never flip;
  // only the group aria-label and the two spoken option aria-labels are re-localised.
  dom.timeGroup.setAttribute('aria-label', t('time.toggle.label', lang));
  dom.bH12.textContent = t('time.h12', lang);
  dom.bH24.textContent = t('time.h24', lang);
  dom.bH12.setAttribute('aria-label', t('time.h12.a11y', lang));
  dom.bH24.setAttribute('aria-label', t('time.h24.a11y', lang));
  dom.bH12.setAttribute('aria-pressed', String(state.hourCycle === 'h12'));
  dom.bH24.setAttribute('aria-pressed', String(state.hourCycle === 'h23'));
  dom.prev.setAttribute('aria-label', t('date.prev', lang));
  dom.next.setAttribute('aria-label', t('date.next', lang));
  // CR4 — the picker's a11y name (03-ux §3.10c): a screen reader hears
  // "Choose a date, बुधवार, 14 अक्टूबर 2026" (aria-describedby → the visible label).
  // v2.3.2: the trigger is a button (aria-haspopup="dialog"); the popup and its grid
  // share the same name.
  dom.datePicker.setAttribute('aria-label', t('date.picker.label', lang));
  dom.calendar.setAttribute('aria-label', t('date.picker.label', lang));
  dom.calGrid.setAttribute('aria-label', t('date.picker.label', lang));
  dom.locChip.setAttribute('aria-label', t('loc.change', lang));
  dom.locClear.setAttribute('aria-label', t('loc.clear', lang));
  dom.closeSheet.setAttribute('aria-label', t('city.close', lang));
  // A sheet message already on screen re-translates in place (03-ux F4 step 4).
  if (state.ui.sheetError) setSheetError(state.ui.sheetError);
  // SEO: both app names in the title (v2.3.3).
  document.title = `${t('app.title', lang)} — ${t('app.subtitle', lang)} · ${t('app.title', lang === 'hi' ? 'en' : 'hi')}`;
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

/** Date label + picker + "आज / Today" reset pill (03-ux §3.10c, §3 S1). */
function renderDateBar() {
  const range = dateRange();
  if (!range) {
    // S4 / no-location: the date bar can't format a date without a zone, so it stays
    // inert (picker disabled, no value, no min/max) and the polite region announces the
    // S4 status, then the empty-state line once geolocation has settled (03-ux §6
    // geo.loading / empty.noLocation). The bar itself stays present in every
    // degradation (03-ux §3 S1 "Empty").
    dom.dateLabel.textContent = '';
    dom.todayPill.hidden = true;
    dom.prev.disabled = true;
    dom.next.disabled = true;
    dom.prev.setAttribute('aria-disabled', 'true');
    dom.next.setAttribute('aria-disabled', 'true');
    closeCalendar(false);
    dom.datePicker.disabled = true;
    dom.live.textContent = state.ui.loading
      ? t('geo.loading', state.lang)
      : t('empty.noLocation', state.lang);
    return;
  }

  // The calendar's window is always the LOCATION's civil date ∓10 (03-ux §3.10c) and
  // is rebuilt from dateRange() on every open, so a location change re-bases it; an
  // already-open popup (a language switch) is re-rendered in place.
  dom.datePicker.disabled = false;
  if (isCalendarOpen()) renderCalendar();

  // Edge clamping must be perceivable without trial: `disabled` + `aria-disabled`
  // + the muted dashed style (03-ux §3.10c "Edge clamping"; never colour-only).
  const atMin = state.viewedDate <= range.min;
  const atMax = state.viewedDate >= range.max;
  dom.prev.disabled = atMin;
  dom.next.disabled = atMax;
  dom.prev.setAttribute('aria-disabled', String(atMin));
  dom.next.setAttribute('aria-disabled', String(atMax));

  const label = safeFormatDate(state.viewedDate, state.location.timezone, state.lang);
  dom.dateLabel.textContent = label;
  dom.todayPill.hidden = state.viewedDate === range.today;
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

/* ------------------------------------------------------------------ */
/* S8 — inauspicious periods (v2.3.0 CR5, 03-ux §3.8)                  */
/* ------------------------------------------------------------------ */

/**
 * computeInauspicious for a render, contained: the engine already degrades to
 * `{defined:false}` for polar input and never leaks a NaN/Invalid Date, but a
 * malformed date or location would throw — return null then, so S8 hides instead of
 * taking the page down (US-9 AC2).
 */
function safeInauspicious(dateISO, location) {
  try {
    return computeInauspicious(dateISO, location);
  } catch {
    return null;
  }
}

/**
 * S8 block. Rendered only when there is a resolved location AND a defined schedule —
 * i.e. exactly when the day/night lists render (03-ux §3.8 "Not defined (polar)": the
 * whole block is not rendered, and the heading must never appear alone). Rows come
 * from the additive `*Periods` arrays (EVERY occurrence), so Saturday's two Kaal
 * Velas and two Kaal Ratris both render; a period with no occurrence renders
 * `periods.notApplicable` in the range's slot. Re-runs on every render(), so date
 * navigation/picker, location change, language toggle and time-format toggle all
 * repaint it with no reload.
 */
function renderPeriods() {
  const info = state.inauspicious;
  // Gated on the SCHEDULE being defined, not on Inauspicious.defined: 03-ux §3.8 gates
  // the block on Schedule.defined (the "Partial" state is exactly "Schedule.defined
  // === true but one period is null" → that row reads periods.notApplicable). Polar /
  // undefined sun makes the schedule undefined too, so the block hides with S3 — the
  // heading can never appear alone.
  const ready = Boolean(state.location)
    && isRenderableSchedule(state.schedule)
    && Boolean(info);

  if (!ready) {
    dom.periods.hidden = true;
    dom.periodRows.replaceChildren(); // never leave a stale row set behind the block
    return;
  }

  const rows = [];
  for (const name of PERIOD_ORDER) {
    const periods = info[`${name}Periods`];
    if (Array.isArray(periods) && periods.length > 0) {
      for (const period of periods) rows.push(periodRow(name, period));
    } else {
      rows.push(periodRow(name, null));
    }
  }
  dom.periodRows.replaceChildren(...rows);
  dom.periods.hidden = false;
}

/**
 * One S8 row (03-ux §3.8 row anatomy, §4.9 classes): period name + time range (the
 * active 12h/24h format, viewed location's zone) on line 1, the dictionary
 * explanation on line 2. A null/unusable period shows `periods.notApplicable` in the
 * range's slot instead of an empty range. Kaal Ratri can end on the next civil date
 * (the Vedic day is sunset→sunrise), so a `· <date>` suffix is added only then —
 * without it "03:28 am – 05:00 am" reads as the wrong night. createElement /
 * textContent only (NFR-S2); nothing here is tappable (§3.8).
 */
function periodRow(name, period) {
  const { timezone } = state.location;
  const { lang } = state;

  const row = document.createElement('div');
  row.className = 'period';

  const head = document.createElement('div');
  head.className = 'period__head';

  const nameEl = document.createElement('span');
  nameEl.className = 'period__name';
  nameEl.textContent = t(`periods.${name}`, lang);

  const from = period ? safeFormatTime(period.start, timezone, lang, state.hourCycle) : '';
  const to = period ? safeFormatTime(period.end, timezone, lang, state.hourCycle) : '';

  const range = document.createElement('span');
  if (from && to) {
    range.className = 'period__range';
    range.textContent = `${from} – ${to}`;
  } else {
    // No occurrence, or the instants were unusable — never an empty range, never NaN.
    range.className = 'period__na';
    range.textContent = t('periods.notApplicable', lang);
  }
  head.append(nameEl, range);
  row.append(head);

  // Civil-date suffix — only when the period ends on a LATER civil date than the one
  // on screen (docs/01 §11.3: only Kaal Ratri can). Same exported formatDate the rest
  // of the page uses, in --fs-xs after a `·`.
  if (from && to) {
    const endISO = safeCivilDate(timezone, period.end);
    const suffixLabel = endISO && endISO > state.viewedDate
      ? safeFormatDate(endISO, timezone, lang)
      : '';
    if (suffixLabel) {
      const suffix = document.createElement('p');
      suffix.className = 'period__date';
      suffix.textContent = `· ${suffixLabel}`;
      row.append(suffix);
    }
  }

  const desc = document.createElement('p');
  desc.className = 'period__desc';
  desc.textContent = t(`periods.${name}.desc`, lang);
  row.append(desc);

  return row;
}

/** Civil "YYYY-MM-DD" of an instant in a zone, or '' — never a NaN / Invalid Date. */
function safeCivilDate(timeZone, instant) {
  if (!timeZone || !isRealInstant(instant)) return '';
  try {
    return todayIn(timeZone, instant);
  } catch {
    return '';
  }
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
 * `"सूर्योदय 06:32 am"` — dictionary label + the active time format (12h default) in the
 * location's clock. Returns '' (rather than `undefined`/`Invalid Date`) when the instant
 * is unusable, so a degraded schedule can never leak a broken time into the small print
 * (US-9 AC2).
 */
function boundary(key, instant, timeZone, lang) {
  if (!isRealInstant(instant)) return '';
  const clock = safeFormatTime(instant, timeZone, lang, state.hourCycle);
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
 * with the 03-ux §3 zones — name (both scripts in the active language), time range in
 * the active format (12h default, v2.3.0 CR1), quality chip (tier word + glyph).
 * Built with createElement/textContent only (NFR-S2).
 *
 * FE-6 (v2.3.0 CR6, 03-ux §3.9): the row is a SELECTION control for the S9 panel —
 * `aria-pressed` mirrors `state.ui.selectedSlot` and `aria-controls="choghadiya-panel"`
 * names what it drives. The v1.0.1 inline `.meaning` disclosure line (and its
 * `aria-expanded`) is GONE: the panel now carries meaning / good-for / bad-for, and
 * printing the same copy twice on one screen is worse than one tap. `aria-current` +
 * the "अभी / Now" badge are applied separately by syncCurrentSlot() and stay EXCLUSIVE
 * to the live row (US-14 AC1) — the two ARIA states are never conflated.
 *
 * The accessible name parts are staged on `dataset`; syncCurrentSlot() completes the
 * label with the current state when the row is live (03-ux §7.3 — name, time range,
 * tier, current state, in that order).
 */
function slotRow(slot) {
  const { timezone } = state.location;
  const { lang, hourCycle } = state;
  const from = formatTime(slot.start, timezone, lang, { hourCycle });
  const to = formatTime(slot.end, timezone, lang, { hourCycle });
  const latinName = t(`quality.${slot.name}`, 'en');
  const localName = t(`quality.${slot.name}`, lang);
  const tierWord = t(`tier.${slot.tier}`, lang);
  const key = slotKey(slot);
  const selected = state.ui.selectedSlot === key;

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
  button.setAttribute('aria-pressed', String(selected));
  button.setAttribute('aria-controls', 'choghadiya-panel');

  // Zone 2 — "लाभ · Labh" when HI, "Labh" when EN (03-ux §3 zone 2).
  const name = document.createElement('span');
  name.className = 'slot-name';
  name.textContent = lang === 'hi' ? `${localName} · ${latinName}` : latinName;

  // Zone 3 — time range in the viewed location's timezone, active format (03-ux §8 note).
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
  // FE-6: a tap SELECTS (and a second tap deselects) this slot into the S9 panel. The
  // update is in place, so the button keeps focus and the list does not jump (§3.9).
  button.addEventListener('click', () => selectSlot(slot));

  // The v1.0.1 inline `.meaning` disclosure line is REMOVED here (03-ux §3.9): the S9
  // panel carries meaning / good-for / bad-for, so the row is once again just a row.
  // The `meaning.*` dictionary keys stay in §6/i18n.js (the i18n contract locks them).
  item.append(button);
  return item;
}

// Auto-start in a browser only; kept out of module scope's DOM surface per ADR-002.
if (typeof document !== 'undefined') init();

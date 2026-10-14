// geocoder.js — Open-Meteo geocoding client (BE-02).
//
// Contract: docs/04-architecture.md §5.1 (module interface), §5.2 (external API),
// §7 (constants DEBOUNCE_MS / GEOCODE_COUNT) and §8.1 (error taxonomy).
// Node-importable ESM: no DOM, no global state beyond an injectable `fetch`.
//
// This is the ONLY network call in v1 (ADR-004 — Nominatim is explicitly out of
// scope). No API key, no cookies, no identifiers: the trimmed typed city name
// plus the fixed `count`/`language` params are all that leave the device
// (§5.2 origin table, brief "Data & compliance").
//
// Entry points
//   geocodeCity(query, {fetchImpl, signal, lang, cache})  — exactly one request
//   createGeocoder({fetchImpl, debounceMs, lang, cache})  — rate-disciplined wrapper
//     .search(query)     debounced: one request per 400 ms quiet period (keystrokes)
//     .searchNow(query)  explicit submit: one request, aborts any in-flight request
//     .cancel()          abort the in-flight request / drop the pending debounce
//
// Error taxonomy (§8.1) is exact — FE-03/FE-04 map it straight to a UI state:
//   "bad-query"  validation failed, NO request sent (empty / < 2 / > 64 after trim)
//   "network"    fetch rejected, or the body was not JSON
//   "http"       response.ok === false (non-2xx)
// An empty or absent `results` array is NOT an error — it resolves [] (S7).
// A request cancelled by supersession rejects with the native AbortError (name
// "AbortError") so callers can tell "superseded" apart from "geocoder failed";
// the createGeocoder wrapper turns that into a quiet `null` resolution.

/** Design-time constants (docs/04-architecture.md §7). */
export const DEBOUNCE_MS = 400;
export const GEOCODE_COUNT = 8;
export const GEOCODE_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 64;

/** Frozen mirror of the §7 constants (same shape as choghadiya.js CONFIG). */
export const CONFIG = Object.freeze({
  DEBOUNCE_MS,
  GEOCODE_COUNT,
  MIN_QUERY_LENGTH,
  MAX_QUERY_LENGTH,
  ENDPOINT: GEOCODE_ENDPOINT,
});

/** The complete §8.1 geocoder error code set. Adding a code is a contract change. */
export const GEOCODER_ERROR_CODES = Object.freeze(['bad-query', 'network', 'http']);

/** Error raised by this module; `code` is one of GEOCODER_ERROR_CODES. */
export class GeocoderError extends Error {
  constructor(code, message, options) {
    super(message ?? `geocodeCity failed: ${code}`, options);
    this.name = 'GeocoderError';
    this.code = code;
  }
}

/**
 * True for a DOMException/Error produced by AbortController.abort(). Supersession
 * is a normal control-flow signal here, never a user-facing failure.
 */
export function isAbortError(error) {
  return Boolean(error) && error.name === 'AbortError';
}

function makeAbortError() {
  if (typeof DOMException === 'function') return new DOMException('The operation was aborted.', 'AbortError');
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) throw makeAbortError();
}

function badQuery(message) {
  return new GeocoderError('bad-query', message);
}

/**
 * Internal: trim + length-validate a query. Returns the trimmed query;
 * throws GeocoderError{code:"bad-query"} without any request.
 */
export function validateQuery(query) {
  if (typeof query !== 'string') {
    throw badQuery('geocodeCity: query must be a string');
  }
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) {
    throw badQuery(`geocodeCity: query must be at least ${MIN_QUERY_LENGTH} characters after trim`);
  }
  if (trimmed.length > MAX_QUERY_LENGTH) {
    throw badQuery(`geocodeCity: query must be at most ${MAX_QUERY_LENGTH} characters`);
  }
  return trimmed;
}

/** Internal: only "hi"/"en" are valid (§5.2 `language` param); default "en". */
function normalizeLanguage(lang) {
  return lang === 'hi' ? 'hi' : 'en';
}

/** Internal: the exact §5.2 request URL — encodeURIComponent, no hand-rolled escaping. */
export function buildGeocodeUrl(query, lang = 'en') {
  const name = encodeURIComponent(query);
  return `${GEOCODE_ENDPOINT}?name=${name}&count=${GEOCODE_COUNT}&language=${normalizeLanguage(lang)}`;
}

/** Internal: cache key — query matching is case- and whitespace-insensitive, per language. */
function cacheKey(query, lang) {
  return `${normalizeLanguage(lang)}\u0000${query.toLowerCase()}`;
}

/**
 * Internal: map one Open-Meteo record to the §5.1 GeocodeResult. Records without
 * finite coordinates are dropped (the schedule engine needs them; "no NaN ever",
 * §8.1) — everything else is normalised to null rather than left undefined.
 */
function mapResult(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    admin1: typeof raw.admin1 === 'string' ? raw.admin1 : null,
    country: typeof raw.country === 'string' ? raw.country : null,
    latitude,
    longitude,
    timezone: typeof raw.timezone === 'string' ? raw.timezone : null,
    population: raw.population == null || !Number.isFinite(Number(raw.population))
      ? null
      : Number(raw.population),
  };
}

/** Module-level default cache so the plain `geocodeCity` path caches too (§5.2). */
const defaultCache = new Map();

/** Empty the module-level cache (tests; also handy if the UI ever wants a reset). */
export function clearCache() {
  defaultCache.clear();
}

/** Resolve the fetch implementation: explicit injection wins, then the platform. */
function resolveFetch(fetchImpl) {
  const candidate = fetchImpl ?? globalThis.fetch;
  if (typeof candidate !== 'function') {
    throw new GeocoderError('network', 'geocodeCity: no fetch implementation available');
  }
  return candidate;
}

/**
 * One geocode request (docs/04-architecture.md §5.1).
 *
 * @param {string} query  City name; trimmed, 2..64 chars.
 * @param {object} [options]
 * @param {Function} [options.fetchImpl=fetch]  Injectable for tests (never networked in tests).
 * @param {AbortSignal} [options.signal]        Cancels the request (AbortError).
 * @param {"hi"|"en"} [options.lang="en"]       `language` param — matches the UI language.
 * @param {Map} [options.cache=defaultCache]    Per-query in-memory cache; pass a fresh
 *                                              Map for isolated state.
 * @returns {Promise<Array>} GeocodeResult[] — `[]` when the service has no match (§5.2).
 * @throws {GeocoderError} code "bad-query" (no request sent) | "network" | "http".
 * @throws {DOMException} name "AbortError" when `signal` aborts mid-flight.
 */
export async function geocodeCity(query, { fetchImpl, signal, lang = 'en', cache = defaultCache } = {}) {
  const trimmed = validateQuery(query);
  const language = normalizeLanguage(lang);
  const fetchFn = resolveFetch(fetchImpl);
  throwIfAborted(signal);

  const store = cache instanceof Map ? cache : null;
  const key = cacheKey(trimmed, language);
  if (store && store.has(key)) {
    // Cache hit: same result object graph as a fresh call, no request sent.
    return store.get(key).slice();
  }

  const url = buildGeocodeUrl(trimmed, language);

  let response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      // No cookies, no credentials cross-origin (privacy posture, NFR-PR1).
      credentials: 'omit',
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new GeocoderError('network', `geocodeCity: request failed (${error?.message ?? error})`, { cause: error });
  }

  if (!response || typeof response.ok !== 'boolean') {
    throw new GeocoderError('network', 'geocodeCity: fetch returned a malformed response');
  }
  if (!response.ok) {
    throw new GeocoderError('http', `geocodeCity: HTTP ${response.status}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new GeocoderError('network', 'geocodeCity: response body was not valid JSON', { cause: error });
  }

  // Absent/empty results is a normal, non-error outcome → S7 (§5.2, US-5 AC5).
  if (!payload || !Array.isArray(payload.results)) return [];
  const results = payload.results.map(mapResult).filter((r) => r !== null);
  if (store) store.set(key, results.slice());
  return results;
}

/**
 * Rate-disciplined wrapper enforcing the §5.2 rule: exactly one request per
 * explicit submit OR per 400 ms quiet period — never one per keystroke.
 * Superseded work (debounced call replaced, or in-flight request aborted by a
 * newer one) settles as `null`; geocoder failures still reject with GeocoderError.
 *
 * @param {object} [options]
 * @param {Function} [options.fetchImpl=fetch]
 * @param {number} [options.debounceMs=DEBOUNCE_MS]
 * @param {"hi"|"en"} [options.lang="en"]
 * @param {Map} [options.cache]  Isolated cache; defaults to a fresh Map per geocoder.
 */
export function createGeocoder({
  fetchImpl = globalThis.fetch,
  debounceMs = DEBOUNCE_MS,
  lang = 'en',
  cache = new Map(),
} = {}) {
  let timer = null;
  let controller = null;
  let pending = null; // { resolve, reject } for the scheduled debounced call

  function settlePending(value) {
    if (!pending) return;
    const { resolve } = pending;
    pending = null;
    resolve(value);
  }

  /** Abort an in-flight request (its promise settles as null via the abort path). */
  function abortInFlight() {
    if (controller) {
      const active = controller;
      controller = null;
      active.abort();
    }
  }

  /** Start one request, superseding any in-flight one. */
  function start(query, language) {
    abortInFlight();
    const own = new AbortController();
    controller = own;
    return geocodeCity(query, { fetchImpl, signal: own.signal, lang: language, cache }).then(
      (results) => {
        if (controller === own) controller = null;
        return results;
      },
      (error) => {
        if (controller === own) controller = null;
        if (isAbortError(error)) return null; // superseded — not a user-facing failure
        throw error;
      },
    );
  }

  /** Debounced keystroke path: one request per quiet period. */
  function search(query, { lang: langOverride } = {}) {
    const language = langOverride ?? lang;
    try {
      validateQuery(query);
    } catch (error) {
      // Immediate rejection: bad input must never wait for (or start) a request.
      return Promise.reject(error);
    }
    // A newer keystroke supersedes the scheduled one (never two requests).
    settlePending(null);
    if (timer) clearTimeout(timer);

    const promise = new Promise((resolve, reject) => {
      pending = { resolve, reject };
    });
    timer = setTimeout(() => {
      timer = null;
      const scheduled = pending;
      pending = null;
      if (!scheduled) return;
      try {
        start(query, language).then(scheduled.resolve, scheduled.reject);
      } catch (error) {
        scheduled.reject(error);
      }
    }, debounceMs);
    return promise;
  }

  /** Explicit submit path: one immediate request, superseding any in-flight one. */
  function searchNow(query, { lang: langOverride } = {}) {
    const language = langOverride ?? lang;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    settlePending(null);
    try {
      validateQuery(query);
    } catch (error) {
      return Promise.reject(error);
    }
    return start(query, language);
  }

  /** Cancel everything outstanding: pending debounce → null, in-flight → aborted/null. */
  function cancel() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    settlePending(null);
    abortInFlight();
  }

  return {
    search,
    searchNow,
    cancel,
    get cache() {
      return cache;
    },
    get inFlight() {
      return controller !== null;
    },
  };
}

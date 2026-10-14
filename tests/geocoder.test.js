// tests/geocoder.test.js — S-GEO: Open-Meteo client contract (BE-02).
//
// Covers the 04-architecture §5.1 contract of geocoder.js: request shaping
// (§5.2), query validation with no request, the 400 ms rate discipline
// (US-5 AC4, US-10 AC2), the per-query cache, AbortController supersession,
// response mapping and the exact error taxonomy (bad-query | network | http).
//
// NO TEST IN THIS FILE TOUCHES THE NETWORK: every call injects `fetchImpl`.
// The one test that must prove the default path is injectable replaces
// `globalThis.fetch` with a throwing stub for the duration of the assertions.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG,
  DEBOUNCE_MS,
  GEOCODE_COUNT,
  GEOCODE_ENDPOINT,
  GEOCODER_ERROR_CODES,
  GeocoderError,
  MAX_CACHE_ENTRIES,
  MAX_STRING_LENGTH,
  buildGeocodeUrl,
  clearCache,
  createGeocoder,
  geocodeCity,
  isAbortError,
  validateQuery,
} from '../geocoder.js';

// ---------------------------------------------------------------- helpers ---

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tick = () => new Promise((resolve) => setImmediate(resolve));

const ABORT_ERROR = () => Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });

/** A canned Open-Meteo response body (the §5.2 example, plus a second city). */
const MUMBAI_RAW = {
  id: 1275339,
  name: 'Mumbai',
  latitude: 19.076,
  longitude: 72.8777,
  country: 'India',
  admin1: 'Maharashtra',
  timezone: 'Asia/Kolkata',
  population: 12691836,
  feature_code: 'PPLC',
};
const PUNE_RAW = {
  id: 1259229,
  name: 'Pune',
  latitude: 18.5196,
  longitude: 73.8554,
  country: 'India',
  admin1: 'Maharashtra',
  timezone: 'Asia/Kolkata',
  population: 2935744,
};

const MUMBAI = {
  name: 'Mumbai',
  admin1: 'Maharashtra',
  country: 'India',
  latitude: 19.076,
  longitude: 72.8777,
  timezone: 'Asia/Kolkata',
  population: 12691836,
};

const PUNE = {
  name: 'Pune',
  admin1: 'Maharashtra',
  country: 'India',
  latitude: 18.5196,
  longitude: 73.8554,
  timezone: 'Asia/Kolkata',
  population: 2935744,
};

/** A fetch mock recording every call; resolves with a canned JSON response. */
function mockFetch(payload, { status = 200, ok } = {}) {
  const calls = [];
  const impl = (url, options) => {
    calls.push({ url, options });
    const isOk = ok ?? (status >= 200 && status < 300);
    return Promise.resolve({ ok: isOk, status, json: async () => payload });
  };
  return { impl, calls };
}

/** A fetch mock that never settles until its signal aborts (for supersession tests). */
function hangingFetch() {
  const calls = [];
  const impl = (url, options) => {
    calls.push({ url, options });
    return new Promise((resolve, reject) => {
      const { signal } = options;
      if (!signal) return;
      if (signal.aborted) {
        reject(ABORT_ERROR());
        return;
      }
      signal.addEventListener('abort', () => reject(ABORT_ERROR()), { once: true });
    });
  };
  return { impl, calls };
}

const results = (payload) => ({ results: payload });

// ------------------------------------------------------------- constants ---

test('§7 constants: 400 ms debounce, count=8, one endpoint', () => {
  assert.equal(DEBOUNCE_MS, 400);
  assert.equal(GEOCODE_COUNT, 8);
  assert.equal(GEOCODE_ENDPOINT, 'https://geocoding-api.open-meteo.com/v1/search');
  assert.deepEqual(CONFIG, {
    DEBOUNCE_MS: 400,
    GEOCODE_COUNT: 8,
    MIN_QUERY_LENGTH: 2,
    MAX_QUERY_LENGTH: 64,
    ENDPOINT: GEOCODE_ENDPOINT,
  });
  assert.deepEqual(GEOCODER_ERROR_CODES, ['bad-query', 'network', 'http']);
});

// -------------------------------------------------------- request shaping ---

test('request shape: exact §5.2 URL, count=8, language, JSON accept (US-5 AC1)', async () => {
  const { impl, calls } = mockFetch(results([MUMBAI_RAW]));
  const out = await geocodeCity('Mumbai', { fetchImpl: impl, cache: new Map() });

  assert.equal(calls.length, 1, 'exactly one request');
  const { url, options } = calls[0];
  assert.equal(
    url,
    'https://geocoding-api.open-meteo.com/v1/search?name=Mumbai&count=8&language=en',
  );
  assert.equal(options.method, 'GET');
  assert.equal(options.headers.Accept, 'application/json');
  assert.equal(options.credentials, 'omit');
  assert.deepEqual(out, [MUMBAI]);
});

test('request shape: encodeURIComponent for spaces, unicode and reserved chars', async () => {
  const { impl, calls } = mockFetch(results([]));
  const cache = new Map();

  await geocodeCity('  New York  ', { fetchImpl: impl, cache }); // trimmed
  await geocodeCity('मुंबई', { fetchImpl: impl, cache });
  await geocodeCity('São Paulo & Co', { fetchImpl: impl, cache });

  assert.equal(calls[0].url, `${GEOCODE_ENDPOINT}?name=New%20York&count=8&language=en`);
  assert.equal(calls[1].url, `${GEOCODE_ENDPOINT}?name=${encodeURIComponent('मुंबई')}&count=8&language=en`);
  assert.equal(
    calls[2].url,
    `${GEOCODE_ENDPOINT}?name=${encodeURIComponent('São Paulo & Co')}&count=8&language=en`,
  );
  assert.ok(calls[2].url.includes('%26'), '& in the query is percent-encoded, not a param separator');
  assert.equal(new URL(calls[2].url).searchParams.get('name'), 'São Paulo & Co');
});

test('language param follows the UI language; anything else falls back to "en"', async () => {
  const { impl, calls } = mockFetch(results([]));
  const cache = new Map();
  await geocodeCity('Mumbai', { fetchImpl: impl, cache, lang: 'hi' });
  await geocodeCity('Pune', { fetchImpl: impl, cache, lang: 'en' });
  await geocodeCity('Delhi', { fetchImpl: impl, cache, lang: 'fr' });

  assert.ok(calls[0].url.endsWith('&language=hi'));
  assert.ok(calls[1].url.endsWith('&language=en'));
  assert.ok(calls[2].url.endsWith('&language=en'), 'unsupported language falls back to en');
});

test('the default fetch can never be reached when fetchImpl is injected', async () => {
  const original = globalThis.fetch;
  const { impl, calls } = mockFetch(results([MUMBAI_RAW]));
  let defaultCalled = false;
  globalThis.fetch = () => {
    defaultCalled = true;
    throw new Error('test reached the network');
  };
  try {
    const out = await geocodeCity('Mumbai', { fetchImpl: impl, cache: new Map() });
    assert.deepEqual(out, [MUMBAI]);
    assert.equal(calls.length, 1);
    assert.equal(defaultCalled, false, 'globalThis.fetch must not be touched');
  } finally {
    globalThis.fetch = original;
  }
});

// ---------------------------------------------------- validation (no send) ---

test('bad-query: empty, whitespace, <2 chars, >64 chars, non-string — no request sent', async () => {
  const { impl, calls } = mockFetch(results([]));
  const tooLong = 'x'.repeat(65);

  for (const bad of ['', ' ', '\t\n', 'a', ' a ', tooLong, 42, null, undefined, {}]) {
    await assert.rejects(
      geocodeCity(bad, { fetchImpl: impl, cache: new Map() }),
      (error) => error instanceof GeocoderError && error.code === 'bad-query',
      `expected bad-query for ${JSON.stringify(bad)}`,
    );
  }
  assert.equal(calls.length, 0, 'validation failures never touch fetch');

  // Boundary: 2 and 64 characters are accepted.
  assert.equal(validateQuery('ab'), 'ab');
  assert.equal(validateQuery(`  ${'x'.repeat(64)}  `).length, 64);
  const ok = mockFetch(results([]));
  await geocodeCity('ab', { fetchImpl: ok.impl, cache: new Map() });
  assert.equal(ok.calls.length, 1);
});

// ------------------------------------------------------- response mapping ---

test('response mapping: §5.2 fields only, missing fields normalised to null', async () => {
  const { impl } = mockFetch(
    results([
      MUMBAI_RAW,
      { name: 'Nowhere', latitude: 1.5, longitude: 2.5 }, // no admin1/country/tz/population
      { name: 'Broken', latitude: 'not-a-number', longitude: 3 }, // dropped
      null, // dropped
    ]),
  );
  const out = await geocodeCity('Mumbai', { fetchImpl: impl, cache: new Map() });
  assert.equal(out.length, 2, 'records without finite coordinates are dropped');
  assert.deepEqual(out[0], MUMBAI);
  assert.deepEqual(out[1], {
    name: 'Nowhere',
    admin1: null,
    country: null,
    latitude: 1.5,
    longitude: 2.5,
    timezone: null,
    population: null,
  });
  assert.deepEqual(Object.keys(out[0]), [
    'name', 'admin1', 'country', 'latitude', 'longitude', 'timezone', 'population',
  ]);
});

test('empty or absent `results` resolves [] — never an error (US-5 AC5, S7)', async () => {
  const empty = mockFetch({ results: [] });
  const absent = mockFetch({ generationtime_ms: 0.1 });
  const notAnArray = mockFetch({ results: { nope: true } });

  assert.deepEqual(await geocodeCity('Atlantis', { fetchImpl: empty.impl, cache: new Map() }), []);
  assert.deepEqual(await geocodeCity('Atlantis', { fetchImpl: absent.impl, cache: new Map() }), []);
  assert.deepEqual(await geocodeCity('Atlantis', { fetchImpl: notAnArray.impl, cache: new Map() }), []);
});

// -------------------------------------------------------- error taxonomy ---

test('non-2xx maps to GeocoderError{code:"http"} (S6, US-10)', async () => {
  for (const status of [400, 404, 429, 500, 503]) {
    const { impl } = mockFetch({ error: true }, { status });
    await assert.rejects(
      geocodeCity('Mumbai', { fetchImpl: impl, cache: new Map() }),
      (error) => error instanceof GeocoderError && error.code === 'http' && error.message.includes(String(status)),
      `status ${status} → http`,
    );
  }
});

test('a rejected fetch maps to GeocoderError{code:"network"} and keeps the cause', async () => {
  const boom = new TypeError('Failed to fetch');
  const impl = () => Promise.reject(boom);
  await assert.rejects(
    geocodeCity('Mumbai', { fetchImpl: impl, cache: new Map() }),
    (error) => error instanceof GeocoderError && error.code === 'network' && error.cause === boom,
  );

  const noFetch = () => 'not-a-response';
  await assert.rejects(
    geocodeCity('Mumbai', { fetchImpl: noFetch, cache: new Map() }),
    (error) => error.code === 'network',
  );
});

test('a non-JSON body maps to GeocoderError{code:"network"}', async () => {
  const impl = () => Promise.resolve({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON');
    },
  });
  await assert.rejects(
    geocodeCity('Mumbai', { fetchImpl: impl, cache: new Map() }),
    (error) => error.code === 'network',
  );
});

test('errors are never cached, and a later retry can succeed', async () => {
  const cache = new Map();
  let attempt = 0;
  const impl = () => {
    attempt += 1;
    if (attempt === 1) return Promise.reject(new TypeError('offline'));
    return Promise.resolve({ ok: true, status: 200, json: async () => results([MUMBAI_RAW]) });
  };
  await assert.rejects(geocodeCity('Mumbai', { fetchImpl: impl, cache }), { code: 'network' });
  assert.deepEqual(await geocodeCity('Mumbai', { fetchImpl: impl, cache }), [MUMBAI]);
  assert.equal(attempt, 2, 'the failure was not cached');
});

// ----------------------------------------------------------------- cache ---

test('per-query cache: one request for repeats, case/whitespace-insensitive (US-10 AC1)', async () => {
  const { impl, calls } = mockFetch(results([MUMBAI_RAW]));
  const cache = new Map();

  const first = await geocodeCity('Mumbai', { fetchImpl: impl, cache });
  const second = await geocodeCity('  mumbai  ', { fetchImpl: impl, cache });
  const third = await geocodeCity('MUMBAI', { fetchImpl: impl, cache });

  assert.equal(calls.length, 1, 'cache hit for the same query');
  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
  assert.notEqual(second, first, 'cache hits return a fresh array, not shared state');
});

test('cache is keyed per language and can be shared via the default cache', async () => {
  const { impl, calls } = mockFetch(results([MUMBAI_RAW]));
  const cache = new Map();
  await geocodeCity('Mumbai', { fetchImpl: impl, cache, lang: 'en' });
  await geocodeCity('Mumbai', { fetchImpl: impl, cache, lang: 'hi' });
  assert.equal(calls.length, 2, 'en and hi are separate cache entries');

  clearCache();
  const shared = mockFetch(results([PUNE_RAW]));
  await geocodeCity('Pune', { fetchImpl: shared.impl }); // default module cache
  await geocodeCity('pune', { fetchImpl: shared.impl });
  assert.equal(shared.calls.length, 1, 'the module-level default cache works');
  clearCache();
});

// ----------------------------------------------- debounce / submit-only ---

test('debounce: N keystrokes → exactly one request per quiet period (US-5 AC4)', async () => {
  const { impl, calls } = mockFetch(results([PUNE_RAW]));
  const g = createGeocoder({ fetchImpl: impl, debounceMs: 40 });

  const p1 = g.search('Mu');
  const p2 = g.search('Mum');
  const p3 = g.search('Mumb');
  const p4 = g.search('Mumba');
  const p5 = g.search('Mumbai');

  // Superseded debounced calls settle immediately as null (never a request).
  assert.equal(await p1, null);
  assert.equal(await p2, null);
  assert.equal(await p3, null);
  assert.equal(await p4, null);

  assert.equal(calls.length, 0, 'nothing is sent while the user is still typing');
  const out = await p5;
  assert.equal(calls.length, 1, 'exactly one request after the quiet period');
  assert.deepEqual(out, [PUNE]);
  assert.ok(calls[0].url.includes('name=Mumbai'), 'the request carries the last keystroke only');

  // A later quiet period issues exactly one more request (no request storm).
  const p6 = g.search('Mumbai City');
  await p6;
  assert.equal(calls.length, 2, 'a new quiet period is a new single request');
});

test('searchNow: explicit submit sends immediately, bypassing the debounce', async () => {
  const { impl, calls } = mockFetch(results([MUMBAI_RAW]));
  const g = createGeocoder({ fetchImpl: impl, debounceMs: 5_000 });

  const out = await g.searchNow('Mumbai');
  assert.equal(calls.length, 1, 'no debounce wait for an explicit submit');
  assert.deepEqual(out, [MUMBAI]);
});

test('searchNow cancels a pending debounced call (submit wins, still one request)', async () => {
  const { impl, calls } = mockFetch(results([MUMBAI_RAW]));
  const g = createGeocoder({ fetchImpl: impl, debounceMs: 60 });

  const pendingTyping = g.search('Mum');
  const submitted = g.searchNow('Mumbai');
  assert.equal(await pendingTyping, null, 'the scheduled keystroke call is dropped');
  const out = await submitted;
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('name=Mumbai'));
  assert.deepEqual(out, [MUMBAI]);

  await sleep(120); // the cancelled timer must not fire a second request
  assert.equal(calls.length, 1);
});

test('bad queries reject immediately from both entry points, with no request (03-ux S1)', async () => {
  const { impl, calls } = mockFetch(results([]));
  const g = createGeocoder({ fetchImpl: impl, debounceMs: 60 });

  await assert.rejects(g.search('a'), { code: 'bad-query' });
  await assert.rejects(g.searchNow('   '), { code: 'bad-query' });
  await sleep(120);
  assert.equal(calls.length, 0, 'no request, and no debounce timer left behind');
});

test('a failing geocoded search rejects with the mapped code (S6 retry path)', async () => {
  const impl = () => Promise.reject(new TypeError('Failed to fetch'));
  const g = createGeocoder({ fetchImpl: impl, debounceMs: 10 });
  await assert.rejects(g.search('Mumbai'), { code: 'network' });
  await assert.rejects(g.searchNow('Mumbai'), { code: 'network' });
});

// ------------------------------------------------------- abort/supersede ---

test('supersede: a newer debounced search aborts the in-flight request (US-10 AC2)', async () => {
  const { impl, calls } = hangingFetch();
  const g = createGeocoder({ fetchImpl: impl, debounceMs: 20 });

  const first = g.search('Mumbai');
  await sleep(50);
  assert.equal(calls.length, 1, 'first request is in flight');
  assert.equal(calls[0].options.signal.aborted, false);
  assert.equal(g.inFlight, true);

  const second = g.search('Pune');
  const firstResult = await first;
  assert.equal(firstResult, null, 'the superseded search resolves null, not an error');
  assert.equal(calls[0].options.signal.aborted, true, 'the in-flight request was aborted');

  await sleep(50);
  assert.equal(calls.length, 2, 'the new query issued exactly one fresh request');
  assert.equal(calls[1].options.signal.aborted, false);
  assert.ok(calls[1].url.includes('name=Pune'));

  g.cancel();
  await tick();
  assert.equal(calls[1].options.signal.aborted, true, 'cancel() aborts the in-flight request');
  assert.equal(await second, null);
  assert.equal(g.inFlight, false);
});

test('supersede: a new explicit submit aborts the previous in-flight request', async () => {
  const { impl, calls } = hangingFetch();
  const g = createGeocoder({ fetchImpl: impl });

  const first = g.searchNow('Mumbai');
  await tick();
  const second = g.searchNow('Pune');
  await tick();

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.signal.aborted, true);
  assert.equal(await first, null);
  assert.equal(calls[1].options.signal.aborted, false);
  assert.ok(calls[1].url.includes('name=Pune'));

  g.cancel();
  assert.equal(await second, null);
});

test('a caller-supplied AbortSignal cancels geocodeCity and surfaces an AbortError', async () => {
  const { impl, calls } = hangingFetch();
  const controller = new AbortController();
  const promise = geocodeCity('Mumbai', { fetchImpl: impl, signal: controller.signal, cache: new Map() });
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.signal, controller.signal, 'the caller signal is passed to fetch');

  controller.abort();
  await assert.rejects(promise, (error) => isAbortError(error));

  // An already-aborted signal never starts a request at all.
  const dead = new AbortController();
  dead.abort();
  const before = calls.length;
  await assert.rejects(
    geocodeCity('Pune', { fetchImpl: impl, signal: dead.signal, cache: new Map() }),
    (error) => isAbortError(error),
  );
  assert.equal(calls.length, before, 'no request is sent for a pre-aborted signal');
});

test('an abort mid-body-read is not misreported as a network failure', async () => {
  const controller = new AbortController();
  const impl = () => Promise.resolve({
    ok: true,
    status: 200,
    json: async () => {
      controller.abort();
      throw ABORT_ERROR();
    },
  });
  await assert.rejects(
    geocodeCity('Mumbai', { fetchImpl: impl, signal: controller.signal, cache: new Map() }),
    (error) => isAbortError(error),
  );
});

// ------------------------------------------------------------- buildGeocodeUrl ---

test('buildGeocodeUrl is the single source of the request URL', () => {
  assert.equal(
    buildGeocodeUrl('Mumbai', 'en'),
    'https://geocoding-api.open-meteo.com/v1/search?name=Mumbai&count=8&language=en',
  );
  assert.equal(
    buildGeocodeUrl('New York', 'hi'),
    'https://geocoding-api.open-meteo.com/v1/search?name=New%20York&count=8&language=hi',
  );
  assert.equal(buildGeocodeUrl('Mumbai', 'xx'), buildGeocodeUrl('Mumbai', 'en'));
});

// ------------------------------------------- SEC-08/11/12 hardening (t_cc4f2f25) ---
// docs/06-threat-model.md §6.3: query control-char rejection (SEC-08), range/type
// + tz validity + string caps on third-party records (SEC-11), and a bounded FIFO
// cache (SEC-12). Every probe below is offline (injected fetchImpl).

test('SEC-11: out-of-range latitude/longitude drop the result; boundaries are kept', async () => {
  const rec = (over) => ({ name: 'X', latitude: 0, longitude: 0, timezone: 'Asia/Kolkata', ...over });
  const { impl } = mockFetch(
    results([
      rec({ name: 'LatHigh', latitude: 91 }),
      rec({ name: 'LatLow', latitude: -91 }),
      rec({ name: 'LonHigh', longitude: 181 }),
      rec({ name: 'LonLow', longitude: -181 }),
      rec({ name: 'LatNan', latitude: 'not-a-number' }),
      rec({ name: 'EdgeNE', latitude: 90, longitude: 180 }),
      rec({ name: 'EdgeSW', latitude: -90, longitude: -180 }),
    ]),
  );
  const out = await geocodeCity('Edges', { fetchImpl: impl, cache: new Map() });
  assert.deepEqual(
    out.map((r) => r.name),
    ['EdgeNE', 'EdgeSW'],
    'only in-range finite coords survive; ±90/±180 are valid',
  );
});

test('SEC-11: an invalid IANA timezone drops the whole result (RK9)', async () => {
  const rec = (name, timezone) => ({ name, latitude: 10, longitude: 20, timezone });
  const { impl } = mockFetch(
    results([
      rec('Evil', 'Evil/Zone'),
      rec('Garbage', 'not a time zone'),
      rec('Empty', ''),
      rec('Good', 'America/New_York'),
      { name: 'Absent', latitude: 5, longitude: 6 }, // no timezone field → kept, null
    ]),
  );
  const out = await geocodeCity('Tz', { fetchImpl: impl, cache: new Map() });
  assert.deepEqual(out.map((r) => r.name), ['Good', 'Absent']);
  assert.equal(out[0].timezone, 'America/New_York');
  assert.equal(out[1].timezone, null, 'absent tz normalises to null, result kept');

  // The exact downstream crash path (todayIn) can no longer be reached: any tz
  // that survives this map is a constructible Intl time zone.
  assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: out[0].timezone }));
});

test('SEC-11: name/admin1/country are length-capped to exactly 200 chars', async () => {
  const long = (c) => c.repeat(500);
  const { impl } = mockFetch(
    results([
      {
        name: long('n'),
        admin1: long('a'),
        country: long('c'),
        latitude: 1,
        longitude: 2,
        timezone: 'Asia/Kolkata',
      },
    ]),
  );
  const [out] = await geocodeCity('Long', { fetchImpl: impl, cache: new Map() });
  assert.equal(MAX_STRING_LENGTH, 200);
  assert.equal(out.name.length, 200);
  assert.equal(out.admin1.length, 200);
  assert.equal(out.country.length, 200);
  assert.equal(out.name, 'n'.repeat(200), 'truncated from the front, same content');
});

test('SEC-08: control characters in a query reject bad-query with zero requests', async () => {
  const { impl, calls } = mockFetch(results([]));
  const cache = new Map();
  for (const bad of ['a\u0000\u0007b', 'Mumbai\u007f', '\u0001\u0002', 'ok\u000e']) {
    await assert.rejects(
      geocodeCity(bad, { fetchImpl: impl, cache }),
      (error) => error instanceof GeocoderError && error.code === 'bad-query',
      `expected bad-query for ${JSON.stringify(bad)}`,
    );
  }
  assert.equal(calls.length, 0, 'validation failure never touches fetch');

  // Both createGeocoder entry points reject without a request or a stray timer.
  const g = createGeocoder({ fetchImpl: impl, debounceMs: 5 });
  await assert.rejects(g.search('a\u0000b'), { code: 'bad-query' });
  await assert.rejects(g.searchNow('x\u0007y'), { code: 'bad-query' });
  await sleep(30);
  assert.equal(calls.length, 0, 'no request from either entry point');

  assert.equal(validateQuery('Santa Fe'), 'Santa Fe', 'plain queries still pass');
});

test('SEC-12: caller-supplied cache is capped at 64 entries, FIFO eviction', async () => {
  assert.equal(MAX_CACHE_ENTRIES, 64);
  const { impl, calls } = mockFetch(results([MUMBAI_RAW]));
  const cache = new Map();
  const key = (q) => `en\u0000${q}`;

  for (let i = 0; i < 65; i += 1) {
    await geocodeCity(`city${i}`, { fetchImpl: impl, cache });
  }
  assert.equal(calls.length, 65, 'each distinct query is a fresh request');
  assert.equal(cache.size, 64, 'the cache never exceeds the 64-entry cap');
  assert.equal(cache.has(key('city0')), false, 'the oldest key was evicted first (FIFO)');
  assert.equal(cache.has(key('city1')), true, 'the second-oldest survived');
  assert.equal(cache.has(key('city64')), true, 'the newest key is kept');

  await geocodeCity('city64', { fetchImpl: impl, cache });
  assert.equal(calls.length, 65, 'a still-cached query is a hit (no request)');
  await geocodeCity('city0', { fetchImpl: impl, cache });
  assert.equal(calls.length, 66, 'the evicted key re-fetches (proves it was dropped)');
});

test('SEC-12: the module default cache shares the same capped write helper', async () => {
  clearCache();
  const { impl, calls } = mockFetch(results([MUMBAI_RAW]));
  for (let i = 0; i < 65; i += 1) {
    await geocodeCity(`dcity${i}`, { fetchImpl: impl }); // default module cache
  }
  const filled = calls.length;
  assert.equal(filled, 65);

  // Oldest evicted → a re-query is a miss and issues a request.
  await geocodeCity('dcity0', { fetchImpl: impl });
  assert.equal(calls.length, filled + 1, 'oldest default-cache key was evicted');
  // Newest still present → a re-query is a hit.
  await geocodeCity('dcity64', { fetchImpl: impl });
  assert.equal(calls.length, filled + 1, 'newest default-cache key is still cached');
  clearCache();
});

// tests/session-store.test.js — session-store.js contract (v2.3.0 item 7b).
//
// Covers the CTO-decided contract: JSON `{t,v}` envelopes, exact TTL expiry (±1 ms
// boundary), session-lifetime entries, corruption tolerance, the silent in-memory
// fallback when web storage is absent or throws, namespace isolation, and a
// persistence round-trip that simulates a page reload (a NEW backing store instance
// over the SAME raw map). No test touches the network, and none requires a real
// browser storage object.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get, set, remove, clear, STORAGE_SCOPE } from '../session-store.js';

const NAMESPACE = 'choghadiya.';

/** A minimal Web Storage stand-in backed by a Map, with optional fault injection. */
function fakeStorage(raw = new Map(), { throwOnGet = false, throwOnSet = false } = {}) {
  return {
    raw,
    get length() {
      return raw.size;
    },
    key(i) {
      return [...raw.keys()][i] ?? null;
    },
    getItem(k) {
      if (throwOnGet) throw new Error('getItem blocked');
      return raw.has(k) ? raw.get(k) : null;
    },
    setItem(k, v) {
      if (throwOnSet) throw new Error('setItem blocked');
      raw.set(k, String(v));
    },
    removeItem(k) {
      raw.delete(k);
    },
    clear() {
      raw.clear();
    },
  };
}

/** Install `store` as globalThis.sessionStorage; returns a restore function. */
function installStorage(store) {
  const original = globalThis.sessionStorage;
  globalThis.sessionStorage = store;
  return () => {
    globalThis.sessionStorage = original;
  };
}

/** Parse the stored envelope for a logical key. */
const envelope = (raw, key) => JSON.parse(raw.get(NAMESPACE + key));

test('STORAGE_SCOPE is "session" — the single one-line flip point', () => {
  assert.equal(STORAGE_SCOPE, 'session');
});

test('set/get/remove/clear round-trip; every key is namespaced choghadiya.*', () => {
  const raw = new Map();
  raw.set('someone-elses-key', 'keep-me');
  const restore = installStorage(fakeStorage(raw));
  try {
    clear();
    assert.equal(get('missing'), null, 'absent key → null');

    set('city', { name: 'Mumbai' });
    assert.deepEqual(get('city'), { name: 'Mumbai' });

    const physical = [...raw.keys()].filter((k) => k !== 'someone-elses-key');
    assert.ok(physical.length >= 1);
    assert.ok(physical.every((k) => k.startsWith(NAMESPACE)), 'every physical key is namespaced');
    assert.ok(raw.has(`${NAMESPACE}city`));

    remove('city');
    assert.equal(get('city'), null);
    assert.equal(raw.has(`${NAMESPACE}city`), false, 'remove deletes the physical key');

    set('a', 1);
    set('b', 2);
    clear();
    assert.equal(get('a'), null);
    assert.equal(get('b'), null);
    assert.equal(raw.get('someone-elses-key'), 'keep-me', 'clear() never touches foreign keys');
  } finally {
    restore();
  }
});

test('entries are stored as a {t,v} envelope; session-lifetime t is null', () => {
  const raw = new Map();
  const restore = installStorage(fakeStorage(raw));
  try {
    clear();
    set('session', 'forever');
    set('ttl', 'brief', { ttlMs: 1000 });
    assert.deepEqual(envelope(raw, 'session'), { t: null, v: 'forever' });
    const e = envelope(raw, 'ttl');
    assert.equal(typeof e.t, 'number', 'ttlMs entry carries an epoch-ms expiry');
    assert.equal(e.v, 'brief');
  } finally {
    restore();
  }
});

test('TTL expiry is exact at the boundary (±1 ms)', () => {
  const raw = new Map();
  const restore = installStorage(fakeStorage(raw));
  const realNow = Date.now;
  let clock = 1_000_000;
  Date.now = () => clock;
  try {
    clear();
    set('k', 'v', { ttlMs: 500 }); // expires at 1_000_500

    clock = 1_000_499;
    assert.equal(get('k'), 'v', '1 ms before expiry → still valid');

    clock = 1_000_500;
    assert.equal(get('k'), null, 'exactly at expiry → expired');
    assert.equal(raw.has(`${NAMESPACE}k`), false, 'the expired entry is deleted');
  } finally {
    Date.now = realNow;
    restore();
  }
});

test('session-lifetime entries (no ttlMs) never expire', () => {
  const raw = new Map();
  const restore = installStorage(fakeStorage(raw));
  const realNow = Date.now;
  let clock = 1_000_000;
  Date.now = () => clock;
  try {
    clear();
    set('lang', 'hi');
    clock += 1000 * 60 * 60 * 24 * 365 * 50; // +50 years
    assert.equal(get('lang'), 'hi', 'still present decades later');
  } finally {
    Date.now = realNow;
    restore();
  }
});

test('corrupt / wrong-shape / unparsable entries are deleted and read as null', () => {
  const raw = new Map();
  const restore = installStorage(fakeStorage(raw));
  try {
    clear();
    const cases = {
      bad1: 'not json{{', // unparsable
      bad2: '"just a string"', // JSON, wrong shape
      bad3: '[1,2,3]', // array, not an envelope
      bad4: '{"t":1}', // missing v
      bad5: '{"v":1}', // missing t
      bad6: '{"t":"soon","v":1}', // t is not a number/null
      bad7: 'null',
      bad8: '123',
    };
    for (const [k, v] of Object.entries(cases)) raw.set(NAMESPACE + k, v);

    for (const k of Object.keys(cases)) {
      assert.equal(get(k), null, `${k} → null`);
      assert.equal(raw.has(NAMESPACE + k), false, `${k} was deleted`);
    }
  } finally {
    restore();
  }
});

test('a storage read that throws falls back to memory and keeps the app working', () => {
  const raw = new Map();
  const restore = installStorage(fakeStorage(raw, { throwOnGet: true }));
  try {
    clear();
    assert.doesNotThrow(() => set('x', 42));
    assert.equal(get('x'), 42, 'write landed in the fallback Map; the read threw → Map served');
    assert.doesNotThrow(() => remove('x'));
    assert.equal(get('x'), null);
  } finally {
    restore();
  }
});

test('a storage write that throws falls back to memory and keeps the app working', () => {
  const raw = new Map();
  const restore = installStorage(fakeStorage(raw, { throwOnSet: true }));
  try {
    clear();
    assert.doesNotThrow(() => set('y', { a: 1 }));
    assert.equal(raw.has(NAMESPACE + 'y'), false, 'nothing landed in the throwing store');
    assert.deepEqual(get('y'), { a: 1 }, 'the fallback Map served the value');
  } finally {
    restore();
  }
});

test('a storage that throws on read AND write never throws at the call site', () => {
  const restore = installStorage(fakeStorage(new Map(), { throwOnGet: true, throwOnSet: true }));
  try {
    clear();
    assert.doesNotThrow(() => {
      set('z', 'ok');
      assert.equal(get('z'), 'ok');
      remove('z');
      assert.equal(get('z'), null);
    });
  } finally {
    restore();
  }
});

test('with no web storage available (Node default) the in-memory fallback is the store', () => {
  const original = globalThis.sessionStorage;
  delete globalThis.sessionStorage;
  try {
    clear();
    set('n', 7);
    assert.equal(get('n'), 7);
  } finally {
    globalThis.sessionStorage = original;
  }
});

test('persistence round-trip: a new backing instance over the same raw map serves the value (reload)', () => {
  const raw = new Map();
  const restore = installStorage(fakeStorage(raw));
  try {
    clear();
    set('settings', { lang: 'en', hourCycle: 'h12' }, { ttlMs: 60_000 });
    assert.ok(raw.has(`${NAMESPACE}settings`), 'the value was written to the backing store');

    // Simulated reload: a brand-new store instance over the SAME raw map — exactly
    // what a page reload does to sessionStorage — then a fresh read.
    installStorage(fakeStorage(raw));
    assert.deepEqual(get('settings'), { lang: 'en', hourCycle: 'h12' });
  } finally {
    restore();
  }
});

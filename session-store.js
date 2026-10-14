// session-store.js — namespaced, bounded, TTL-capable web-storage wrapper.
//
// v2.3.0 change request item 7 (docs/00-brief.md change log, 2026-10-14, client-
// confirmed): the storage substrate for item 7a (settings persistence) and item 7b
// (geocode cache). Supersedes ADR-007 (the "no web storage at all" stance is relaxed
// to "no SERVER storage; a local TTL-gated cache only" — the architect card records
// the ADR amendment).
//
// Contract (CTO decisions, implement exactly):
//   get(key)            -> value | null   (expired/malformed/unparsable/non-envelope
//                                           entries are DELETED and reported as null)
//   set(key, value, opts = { ttlMs })     ttlMs absent -> no expiry (persists indefinitely)
//   remove(key)         -> void
//   clear()             -> void           (only this module's `choghadiya.*` keys)
//   STORAGE_SCOPE       -> 'local'        (the storage mechanism: localStorage)
//
// Entry envelope: `{ t, v }` where `v` is the caller's value and `t` is the expiry
// instant in epoch ms, or `null` for a no-expiry entry that never expires.
// Everything is JSON-encoded; a value that is not a valid envelope is treated as
// corrupt and dropped on read.
//
// Robustness: EVERY storage access is wrapped in try/catch. If web storage is
// unavailable or throws (Safari private mode, disabled storage, quota exceeded),
// the module silently falls back to an in-memory Map so the app keeps working and
// nothing ever throws at the call site. The module is Node-importable ESM and
// touches no DOM global at import time (the backing store is resolved lazily, per
// call, inside a try/catch).
//
// SCOPE (v2.3.0 item 7, client-confirmed): localStorage — entries survive a full
// browser restart. Settings are written with no expiry (they persist indefinitely);
// geocache entries carry a bounded TTL and expire. The backing object is selected
// from the STORAGE_SCOPE constant below; `'session'` (sessionStorage, per-tab) is
// the alternate.
//
// CONSTRAINT (security audit greps over shipped files depend on this): the tokens
// `sessionStorage` and `localStorage` appear ONLY in this file. Every other shipped
// module talks to storage exclusively through this module's get/set/remove/clear.

/** Storage mechanism: `'local'` → localStorage (survives browser restarts), `'session'` → sessionStorage (per-tab). */
export const STORAGE_SCOPE = 'local';

/** Key namespace; every physical key this module writes is prefixed with this. */
const NAMESPACE = 'choghadiya.';

/**
 * In-memory fallback / write-through shadow. It is the sole store when web storage
 * is absent (Node, tests), and the safety net when a storage operation throws. It
 * is also written on every successful `set`, so a later read failure on a backend
 * that stored the value can still be served.
 */
const memory = new Map();

/**
 * Identity of the backing object whose access last threw. That specific object is
 * treated as unavailable from then on (so a broken/disabled storage does not make
 * every call pay a failed round-trip), while a *different* backing object — e.g. a
 * fresh fake installed by a test, or the real store after a reload — is re-probed.
 */
let failedBacking = null;

/** The global property name of the configured backing store. */
function backingName() {
  return STORAGE_SCOPE === 'local' ? 'localStorage' : 'sessionStorage';
}

/**
 * Resolve the backing store, or null when it is unavailable/known-broken. Never
 * throws: any access to `globalThis[...]` is guarded.
 */
function currentBacking() {
  try {
    const store = globalThis[backingName()];
    if (!store || typeof store.getItem !== 'function') return null;
    if (store === failedBacking) return null;
    return store;
  } catch {
    return null;
  }
}

/**
 * Physical key for a logical key. Idempotent: a key that already carries the
 * namespace (e.g. the CTO-decided settings keys `choghadiya.settings.timeFormat`)
 * is used verbatim, so callers may pass either `settings.timeFormat` or the fully
 * qualified form and get the same physical key.
 */
function nsKey(key) {
  const logical = String(key);
  return logical.startsWith(NAMESPACE) ? logical : `${NAMESPACE}${logical}`;
}

/** Read a raw (still-encoded) value: backing store first, then the memory shadow. */
function readRaw(physicalKey) {
  const store = currentBacking();
  if (store) {
    try {
      return store.getItem(physicalKey);
    } catch {
      failedBacking = store;
    }
  }
  return memory.has(physicalKey) ? memory.get(physicalKey) : null;
}

/** Write a raw value: memory shadow always, then the backing store if usable. */
function writeRaw(physicalKey, value) {
  memory.set(physicalKey, value);
  const store = currentBacking();
  if (store) {
    try {
      store.setItem(physicalKey, value);
    } catch {
      failedBacking = store;
    }
  }
}

/** Delete a raw value from both the memory shadow and the backing store. */
function deleteRaw(physicalKey) {
  memory.delete(physicalKey);
  const store = currentBacking();
  if (store) {
    try {
      store.removeItem(physicalKey);
    } catch {
      failedBacking = store;
    }
  }
}

/** True when `value` is a well-formed `{ t, v }` envelope. */
function isEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!Object.prototype.hasOwnProperty.call(value, 't')) return false;
  if (!Object.prototype.hasOwnProperty.call(value, 'v')) return false;
  // `t` is either null (never expires) or a finite epoch-ms number.
  if (value.t !== null && !(typeof value.t === 'number' && Number.isFinite(value.t))) return false;
  return true;
}

/**
 * Read a logical key. Returns the stored value, or null when the key is absent,
 * expired, or the stored data is not a valid envelope (in which case the corrupt
 * entry is deleted).
 *
 * @param {string} key
 * @returns {*} the stored value, or null
 */
export function get(key) {
  const raw = readRaw(nsKey(key));
  if (raw === null || raw === undefined) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    remove(key);
    return null;
  }

  if (!isEnvelope(parsed)) {
    remove(key);
    return null;
  }

  if (parsed.t !== null && Date.now() >= parsed.t) {
    remove(key);
    return null;
  }

  return parsed.v;
}

/**
 * Write a logical key.
 *
 * @param {string} key
 * @param {*} value  Any JSON-serialisable value.
 * @param {{ ttlMs?: number }} [opts]  `ttlMs` absent → no expiry (persists indefinitely).
 */
export function set(key, value, opts = {}) {
  const ttlMs = opts && typeof opts.ttlMs === 'number' && Number.isFinite(opts.ttlMs)
    ? opts.ttlMs
    : null;
  const t = ttlMs === null ? null : Date.now() + ttlMs;
  writeRaw(nsKey(key), JSON.stringify({ t, v: value }));
}

/**
 * Remove a logical key from storage.
 * @param {string} key
 */
export function remove(key) {
  deleteRaw(nsKey(key));
}

/**
 * Remove every key this module owns (`choghadiya.*`) from both the memory shadow
 * and the backing store. Keys outside the namespace are left untouched.
 */
export function clear() {
  for (const physicalKey of [...memory.keys()]) {
    if (physicalKey.startsWith(NAMESPACE)) memory.delete(physicalKey);
  }

  const store = currentBacking();
  if (!store) return;

  let keys = [];
  try {
    for (let i = 0; i < store.length; i += 1) {
      const physicalKey = store.key(i);
      if (typeof physicalKey === 'string') keys.push(physicalKey);
    }
  } catch {
    failedBacking = store;
    return;
  }

  for (const physicalKey of keys) {
    if (!physicalKey.startsWith(NAMESPACE)) continue;
    try {
      store.removeItem(physicalKey);
    } catch {
      failedBacking = store;
    }
  }
}

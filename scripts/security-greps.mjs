// scripts/security-greps.mjs — SEC-22 persistent source gate (audit F3, t_899c4547)
//
// Contract: docs/06-threat-model.md §6.8 SEC-22; docs/09-security-audit.md §3.1/§3.2/§3.3
//           (the greps the audit ran by hand) and §7 F3 (persist them as a failing gate).
//
// The pre-release audit (docs/09) verified SEC-03 / SEC-05 / SEC-14 with ad-hoc greps
// over the shipped files. Those checks were not persisted, so a future edit could
// reintroduce an HTML sink, an inline style/handler, or a non-allow-listed origin and
// still pass `make check`. This script makes them a failing gate.
//
// What it asserts over the SHIPPED files (docs/09 §1, extended by DO-1 t_ed1c4b8c with
// the two v2.3.0 modules — inauspicious.js, session-store.js — so the SEC-22 gate covers
// the whole shipped graph: index.html, style.css, app.js, choghadiya.js, i18n.js,
// geocoder.js, inauspicious.js, session-store.js, favicon.svg, vendor/suncalc-2.1.1.js):
//   (a) SEC-05 — no HTML sinks in code: innerHTML | outerHTML | insertAdjacentHTML |
//       document.write | eval( | new Function | javascript: | setAttribute('style'
//   (b) SEC-03 — no inline style attributes (`style="`) / <style> blocks / on*= HTML
//       handler attributes in code.
//   (c) SEC-14 — every http(s) origin in code is on the explicit allow-list below.
//       Three of those origins (the licence-credit hosts open-meteo.com /
//       www.geonames.org / creativecommons.org, added by DO-FIX t_aa4f3a28) are
//       LINK-ONLY: they may appear only as `href` values, never in a fetch/import/src.
//   (d) SEC-STORAGE (v2.3.0 item 7 / adr-009) — the web-storage tokens
//       `localStorage` / `sessionStorage` appear ONLY in session-store.js; every other
//       shipped module must go through that module's get/set/remove/clear. session-store.js
//       documents the constraint itself and is therefore the sole exempt file.
//
// Comment policy (important, and matches the audit's own reading): comments are STRIPPED
// before matching, because the shipped files legitimately contain PROSE *about* the
// banned constructs — e.g. app.js "never innerHTML" and style.css "no inline styles /
// <style> blocks". docs/09 §3 records those as "only prose in two comments … 0 hits".
// Stripping only comments — never strings, template literals or regex literals — keeps
// the gate honest: a real sink/handler/origin in executable code still fails the run.
//
// Exit codes are CI-honest, like scripts/smoke.mjs:
//   0 = every grep clean, 1 = at least one hit, 2 = the harness could not run
//   (a shipped file listed above is missing).
//
// Run: node scripts/security-greps.mjs [root]   (root defaults to the repo root;
//      the optional root is what the negative control uses — see docs/STATUS.md entry)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/** Shipped files: docs/09-security-audit.md §1 plus the two v2.3.0 modules (DO-1). */
export const SHIPPED_FILES = Object.freeze([
  'index.html',
  'about.html',
  'style.css',
  'app.js',
  'choghadiya.js',
  'i18n.js',
  'geocoder.js',
  'inauspicious.js',
  'session-store.js',
  'favicon.svg',
  'vendor/suncalc-2.1.1.js',
]);

/**
 * SEC-14 allow-list — the ONLY http(s) references permitted in shipped code.
 * Every entry is documented and deliberate; none is a network fetch.
 *
 *  - https://geocoding-api.open-meteo.com — the single optional geocode origin,
 *    also the only host in the CSP `connect-src` (index.html, geocoder.js).
 *  - http://www.w3.org/2000/svg — NOT a fetchable URL: it is the mandatory XML
 *    namespace *identifier* on <svg xmlns="…"> in favicon.svg (docs/09 §7 F5).
 *    The string is never dereferenced (CSP `default-src 'none'` would block it,
 *    and nothing requests it). Allow-listed explicitly, as the fix card requires,
 *    rather than special-cased by file name.
 *  - https://open-meteo.com — licence-credit hyperlink (Open-Meteo data
 *    attribution). Added by DO-FIX (t_aa4f3a28) for the v2.3.0 fix wave; the host
 *    is LINK-ONLY (see LINK_ONLY_ORIGINS), never fetched.
 *  - https://www.geonames.org — licence-credit hyperlink (GeoNames CC BY 4.0
 *    attribution). LINK-ONLY.
 *  - https://creativecommons.org — the CC BY 4.0 licence hyperlink
 *    (…/licenses/by/4.0/). LINK-ONLY.
 *
 * The three credit hosts are exactly those sanctioned by RS-3 §13.6 and SEC-1
 * (docs/09 §10.9 F8): the footer attribution rendered by app.js renderAttribution()
 * as three real <a> elements. Nothing else was added to this list.
 */
export const ALLOWED_ORIGINS = Object.freeze([
  // v2.3.3 SEO metadata — neither is ever fetched by the page:
  //  - the site's own canonical origin, in <link rel="canonical">, og:/twitter: tags
  //    and JSON-LD `url` fields (crawlers read them; the app makes no request to it);
  //  - the schema.org vocabulary IRI (`"@context"` of the JSON-LD data blocks).
  'https://time.gitick.com',
  'https://schema.org',
  'https://geocoding-api.open-meteo.com',
  'http://www.w3.org/2000/svg',
  'https://open-meteo.com',
  'https://www.geonames.org',
  'https://creativecommons.org',
]);

/**
 * The subset of ALLOWED_ORIGINS that may appear ONLY as hyperlink targets.
 *
 * These are licence/credit links: allowing the bare origin would otherwise let a
 * future edit turn one into a `fetch('https://open-meteo.com/…')` (or an
 * `import`/`new URL`/`src=`) and still pass SEC-14. So every occurrence of a
 * link-only origin must sit in an `href` context — `href="…"` (HTML) or
 * `href: '…'` / `href = "…"` (JS). A network/script use of any of these hosts is
 * a SEC-14 failure even though the origin is allow-listed.
 */
export const LINK_ONLY_ORIGINS = Object.freeze([
  'https://open-meteo.com',
  'https://www.geonames.org',
  'https://creativecommons.org',
]);

/**
 * An allow-list hit only counts when the matched URL's character *after* the
 * allow-listed prefix is not a hostname character — otherwise a look-alike host
 * such as `https://geocoding-api.open-meteo.com.evil.example/…` would pass by
 * prefix collision. `https://…com` (end, `/`, `?`, `#`, `"`, `'`, …) is allowed;
 * `https://…com.evil` is not.
 */
function isAllowedOrigin(url) {
  return ALLOWED_ORIGINS.some((allow) => {
    if (!url.startsWith(allow)) return false;
    const next = url[allow.length];
    return next === undefined || !/[A-Za-z0-9.-]/.test(next);
  });
}

/** True when `url` begins with one of the link-only (hyperlink-target) origins. */
function isLinkOnlyOrigin(url) {
  return LINK_ONLY_ORIGINS.some((allow) => url.startsWith(allow));
}

/**
 * True when the URL starting at `index` is the value of an `href` — i.e. the code
 * immediately before the URL's opening quote ends in `href:` (JS object/assignment)
 * or `href=` (HTML attribute / JS assignment). Link-only origins must appear nowhere
 * else, so a `fetch('https://open-meteo.com/…')` is correctly NOT an href context
 * and fails the gate.
 */
function isHrefValue(code, index) {
  const before = code.slice(Math.max(0, index - 64), index);
  return /(?:^|[^A-Za-z0-9_$])href\s*[:=]\s*['"]$/.test(before);
}

/* ------------------------------------------------------------------ */
/* Comment stripping (structure-preserving; strings/regexes untouched)  */
/* ------------------------------------------------------------------ */

/** HTML/SVG: drop <!-- … --> comments. */
function stripHtmlComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}

/** CSS: drop /* … *\/ block comments (CSS has no line comments). */
function stripCssComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * JS/ESM: drop // line comments and /* … *\/ block comments while respecting
 * string (' " `), template-literal and regex-literal contexts, so a `//` inside
 * "https://…" or a `/…/` regex is never mistaken for a comment.
 */
function stripJsComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let prevSig = ''; // last significant (non-whitespace) char emitted
  const REGEX_PRECEDERS = '(,=:[!&|?{};+-*%~^<>';
  const KEYWORDS = /\b(return|typeof|instanceof|case|in|of|do|else|void|delete|throw|new|yield|await)\s*$/;

  const trailingWord = () => (out.match(/[A-Za-z_$][\w$]*\s*$/) || [''])[0];

  while (i < n) {
    const c = src[i];

    // string / template literal (emit verbatim, honour escapes)
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < n) {
        const d = src[i];
        if (d === '\\') {
          out += d + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += d;
        i += 1;
        if (d === quote) break;
      }
      prevSig = quote;
      continue;
    }

    // line comment
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i += 1;
      out += ' ';
      continue;
    }

    // block comment
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      out += ' ';
      continue;
    }

    // regex literal: `/` is a regex start only after a punctuator or a keyword
    if (c === '/' && (REGEX_PRECEDERS.includes(prevSig) || KEYWORDS.test(trailingWord()))) {
      out += c;
      i += 1;
      while (i < n) {
        const d = src[i];
        if (d === '\\') {
          out += d + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += d;
        i += 1;
        if (d === '/') break;
        if (d === '\n') break; // unterminated; bail out of regex mode
      }
      while (i < n && /[a-z]/i.test(src[i])) {
        out += src[i];
        i += 1;
      }
      prevSig = '/';
      continue;
    }

    out += c;
    if (!/\s/.test(c)) prevSig = c;
    i += 1;
  }
  return out;
}

/** Pick the right comment stripper for a shipped file. */
export function stripComments(rel, src) {
  if (rel.endsWith('.html') || rel.endsWith('.svg')) return stripHtmlComments(src);
  if (rel.endsWith('.css')) return stripCssComments(src);
  return stripJsComments(src);
}

/* ------------------------------------------------------------------ */
/* The gates                                                           */
/* ------------------------------------------------------------------ */

export const GATES = Object.freeze([
  {
    id: 'SEC-05',
    name: 'no HTML sinks in shipped code',
    // (a) the exact pattern set from docs/09 §3.2
    re: /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|javascript:|setAttribute\(['"]style/g,
  },
  {
    id: 'SEC-03',
    name: 'no inline style attrs / <style> blocks / on*= handler attrs',
    // (b) inline style attribute, <style> block, or an HTML event-handler attribute.
    re: /\sstyle\s*=\s*["']|<style[\s>]|\son[a-z]+\s*=/g,
  },
  {
    id: 'SEC-14',
    name: 'no non-allow-listed http(s) origin',
    // (c) any absolute URL whose origin is not on ALLOWED_ORIGINS (checked below).
    re: /https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&()*+,;=%-]+/g,
    origins: true,
  },
  {
    id: 'SEC-STORAGE',
    name: 'web-storage tokens only in session-store.js',
    // (d) v2.3.0 item 7 / adr-009: `localStorage` / `sessionStorage` may be named ONLY
    // by the storage substrate itself. Every other shipped module reaches web storage
    // through session-store.js's get/set/remove/clear, so a stray token anywhere else
    // is a red flag (and a direct-storage bypass of the TTL/namespace/robustness rules).
    re: /\b(?:localStorage|sessionStorage)\b/g,
    exempt: ['session-store.js'],
  },
]);

/** 1-based line of an offset, plus the trimmed line text — for a legible failure. */
function locate(src, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (src[i] === '\n') line += 1;
  const start = src.lastIndexOf('\n', index) + 1;
  const end = src.indexOf('\n', index);
  const text = src.slice(start, end === -1 ? undefined : end).trim();
  return { line, text: text.slice(0, 160) };
}

/**
 * Run every gate over `root`. Returns { hits: [...], missing: [...] }.
 * A hit = { file, line, gate, match, text }.
 */
export function runGates(root = ROOT) {
  const hits = [];
  const missing = [];

  for (const rel of SHIPPED_FILES) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    const raw = fs.readFileSync(abs, 'utf8');
    const code = stripComments(rel, raw);

    for (const gate of GATES) {
      // A gate may exempt specific files (e.g. SEC-STORAGE and session-store.js).
      if (gate.exempt && gate.exempt.includes(rel)) continue;
      gate.re.lastIndex = 0;
      for (const m of code.matchAll(gate.re)) {
        const value = m[0];
        if (gate.origins && isAllowedOrigin(value)) {
          // Allowed origin. A link-only host is allowed ONLY as an href value; any
          // other use (fetch/import/src/new URL) falls through to a hit below.
          if (!isLinkOnlyOrigin(value) || isHrefValue(code, m.index)) continue;
        }
        const { line, text } = locate(code, m.index);
        hits.push({ file: rel, line, gate: gate.id, match: value.slice(0, 120), text });
      }
    }
  }
  return { hits, missing };
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

const C = process.stdout.isTTY
  ? { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', reset: '\x1b[0m' }
  : { red: '', green: '', dim: '', reset: '' };

async function main() {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : ROOT;
  const { hits, missing } = runGates(root);

  process.stdout.write(`\nSECURITY GREPS (SEC-22) — shipped files under ${root}\n`);
  process.stdout.write(
    `${C.dim}  shipped: ${SHIPPED_FILES.join(', ')}\n`
    + `  allow-listed origins: ${ALLOWED_ORIGINS.join(', ')}\n${C.reset}`,
  );

  if (missing.length) {
    process.stderr.write(
      `${C.red}SECURITY GREPS HARNESS ERROR:${C.reset} shipped file(s) not found under ${root}: `
      + `${missing.join(', ')} — the gate cannot run against an incomplete tree.\n`,
    );
    return 2;
  }

  for (const gate of GATES) {
    const gateHits = hits.filter((h) => h.gate === gate.id);
    const ok = gateHits.length === 0;
    process.stdout.write(`  ${ok ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`}  `
      + `${gate.id} — ${gate.name} (${gateHits.length} hit${gateHits.length === 1 ? '' : 's'})\n`);
    for (const h of gateHits.slice(0, 10)) {
      process.stdout.write(`          ${h.file}:${h.line}  /${h.match}/  … ${h.text}\n`);
    }
    if (gateHits.length > 10) process.stdout.write(`          … and ${gateHits.length - 10} more\n`);
  }

  const total = hits.length;
  process.stdout.write(`\nSECURITY GREPS RESULT: ${total === 0
    ? `PASS — 0 hits across ${GATES.length} gates`
    : `FAIL — ${total} hit(s)`}\n`);
  return total === 0 ? 0 : 1;
}

if (IS_MAIN) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`\nSECURITY GREPS HARNESS ERROR: ${err && err.message ? err.message : err}\n`);
      process.exit(2);
    });
}

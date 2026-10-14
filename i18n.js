// i18n.js — the single UI-copy dictionary (FE-02, t_f0568729).
//
// Contract: docs/04-architecture.md §5.1 (`DICT`, `t`) and docs/03-ux.md §6.
// The 58 keys below are the §6 copy deck VERBATIM for `hi` (default, 03-ux §2 F6)
// and `en`; the key order matches the §6 table so a reviewer can diff it line by
// line, and `tests/i18n.test.js` (BE-04, M4 gate) is the automated 100 % coverage
// check against that table.
//
// Rule (US-11 AC3, ADR-006): no user-facing UI copy exists anywhere else in the
// shipped surface. The only other user-visible strings are
//   - location labels / geocoder result fields — third-party data inserted with
//     `textContent` by app.js, never through `t()` (NFR-S2, 04-arch §4.2);
//   - locale-formatted dates and 24-hour times — `Intl` output from
//     choghadiya.js `formatDate`/`formatTime` (03-ux §7.3, §8).
// `lang.hi`/`lang.en` are intentionally identical in both dictionaries so the
// toggle can never relabel itself into an unreadable state (03-ux §6 note).

/** Supported UI languages; index 0 is the default (03-ux §2 F6 step 5: no persistence). */
export const LANGS = Object.freeze(['hi', 'en']);

/** Default language for every visit — Hindi (client Q default, 03-ux §2 F6). */
export const DEFAULT_LANG = 'hi';

/**
 * The dictionary: DICT[lang][key] -> string. Frozen so a render path can never
 * mutate copy at runtime; `{n}` placeholders are left literal for `t()` to fill.
 */
export const DICT = Object.freeze({
  hi: Object.freeze({
    'app.title': 'चौघड़िया',
    'app.subtitle': 'आज का शुभ मुहूर्त',
    'lang.toggle.label': 'भाषा',
    'lang.hi': 'हिं',
    'lang.en': 'EN',
    'loc.my': 'मेरी लोकेशन',
    'loc.choose': 'शहर चुनें',
    'loc.change': 'लोकेशन बदलें',
    'loc.clear': 'लोकेशन हटाएँ',
    'date.prev': 'पिछला दिन',
    'date.next': 'अगला दिन',
    'date.today': 'आज',
    'section.day': 'दिन',
    'section.night': 'रात',
    'section.rise': 'सूर्योदय',
    'section.set': 'सूर्यास्त',
    'section.nextRise': 'अगला सूर्योदय',
    'slot.now': 'अभी',
    'quality.amrit': 'अमृत',
    'quality.shubh': 'शुभ',
    'quality.labh': 'लाभ',
    'quality.char': 'चर',
    'quality.rog': 'रोग',
    'quality.kaal': 'काल',
    'quality.udveg': 'उद्वेग',
    'tier.auspicious': 'शुभ',
    'tier.mostAuspicious': 'सर्वश्रेष्ठ',
    'tier.neutral': 'सामान्य',
    'tier.inauspicious': 'अशुभ',
    'meaning.amrit': 'यात्रा, व्यापार, शुभ कार्य के लिए सर्वोत्तम',
    'meaning.shubh': 'पूजा, विवाह, धार्मिक कार्य के लिए शुभ',
    'meaning.labh': 'व्यापार, धन, अध्ययन के लिए शुभ',
    'meaning.char': 'यात्रा, दैनिक कार्य के लिए सामान्य',
    'meaning.rog': 'विवाद, बीमारी; नए काम से बचें',
    'meaning.kaal': 'हानि, देरी; नए काम से बचें',
    'meaning.udveg': 'चिंता; केवल सरकारी काम',
    'city.sheetTitle': 'शहर चुनें',
    'city.fieldLabel': 'शहर का नाम',
    'city.placeholder': 'जैसे: लंदन, जयपुर',
    'city.submit': 'खोजें',
    'city.retry': 'दोबारा',
    'city.close': 'बंद करें',
    'city.noResults': 'कोई शहर नहीं मिला — वर्तनी जाँचें',
    'city.error': 'खोज नहीं हो सकी। दोबारा कोशिश करें',
    'city.required': 'शहर का नाम लिखें',
    'city.resultsCount': '{n} परिणाम मिले',
    'geo.denied': 'लोकेशन उपलब्ध नहीं — शहर लिखें',
    'geo.loading': 'लोकेशन पता कर रहे हैं…',
    'empty.noLocation': 'आज का चौघड़िया देखने के लिए शहर चुनें',
    'undefined.polar': 'इस जगह और इस तारीख पर चौघड़िया उपलब्ध नहीं',
    'undefined.reason': 'यहाँ सूर्योदय/सूर्यास्त नहीं होता',
    'undefined.tryAdjacent': 'पिछला दिन',
    'loading.status': 'लोड हो रहा है',
    'privacy.line': 'शहर खोजने पर लिखा गया नाम Open-Meteo/GeoNames को भेजा जाता है। लोकेशन सेव नहीं होती।',
    'attribution.geocoding': 'Geocoding by Open-Meteo / GeoNames',
    'convention.note': 'सूर्योदय/सूर्यास्त की गणना में ±1–2 मिनट का अंतर संभव है',
    'footer.noTracking': 'कोई अकाउंट नहीं · कोई ट्रैकिंग नहीं · कोई बैकएंड नहीं',
    'noscript': 'इस ऐप को चलाने के लिए JavaScript चालू करें',
  }),
  en: Object.freeze({
    'app.title': 'Choghadiya',
    'app.subtitle': "Today's auspicious timings",
    'lang.toggle.label': 'Language',
    'lang.hi': 'हिं',
    'lang.en': 'EN',
    'loc.my': 'My location',
    'loc.choose': 'Choose city',
    'loc.change': 'Change location',
    'loc.clear': 'Clear location',
    'date.prev': 'Previous day',
    'date.next': 'Next day',
    'date.today': 'Today',
    'section.day': 'Day',
    'section.night': 'Night',
    'section.rise': 'Sunrise',
    'section.set': 'Sunset',
    'section.nextRise': 'Next sunrise',
    'slot.now': 'Now',
    'quality.amrit': 'Amrit',
    'quality.shubh': 'Shubh',
    'quality.labh': 'Labh',
    'quality.char': 'Char',
    'quality.rog': 'Rog',
    'quality.kaal': 'Kaal',
    'quality.udveg': 'Udveg',
    'tier.auspicious': 'Auspicious',
    'tier.mostAuspicious': 'Most auspicious',
    'tier.neutral': 'Neutral',
    'tier.inauspicious': 'Inauspicious',
    'meaning.amrit': 'Best for travel, business, auspicious work',
    'meaning.shubh': 'Good for worship, weddings, religious work',
    'meaning.labh': 'Good for business, trade, finance, learning',
    'meaning.char': 'Neutral — travel, routine work',
    'meaning.rog': "Avoid conflict, illness; don't start new work",
    'meaning.kaal': 'Loss, delay; avoid new starts',
    'meaning.udveg': 'Anxiety; only government work',
    'city.sheetTitle': 'Choose a city',
    'city.fieldLabel': 'City name',
    'city.placeholder': 'e.g. London, Jaipur',
    'city.submit': 'Search',
    'city.retry': 'Retry',
    'city.close': 'Close',
    'city.noResults': 'No city found — check the spelling',
    'city.error': 'Search failed. Try again',
    'city.required': 'Enter a city name',
    'city.resultsCount': '{n} results found',
    'geo.denied': 'Location unavailable — enter a city',
    'geo.loading': 'Finding your location…',
    'empty.noLocation': "Choose a city to see today's Choghadiya",
    'undefined.polar': 'Choghadiya is not defined at this location/date',
    'undefined.reason': 'no sunrise/sunset occurs here',
    'undefined.tryAdjacent': 'Previous day',
    'loading.status': 'Loading',
    'privacy.line': 'A searched city name is sent to Open-Meteo/GeoNames. Location is never stored.',
    'attribution.geocoding': 'Geocoding by Open-Meteo / GeoNames',
    'convention.note': 'Sunrise/sunset may differ by ±1–2 min from a printed panchang',
    'footer.noTracking': 'No account · no tracking · no backend',
    'noscript': 'Please enable JavaScript to use this app',
  }),
});

/** The 58 keys of 03-ux §6, in table order (the M4 coverage contract, BE-04). */
export const KEYS = Object.freeze(Object.keys(DICT.hi));

/**
 * Translate `key` into `lang`, interpolating `{name}` placeholders from `vars`.
 * Throws on an unknown language or key (04-arch §5.1: a typo must fail loudly at
 * the point of use rather than render a blank string); a placeholder with no
 * matching var is left literal so it is visible, not silently empty.
 *
 * @param {string} key   one of the 03-ux §6 keys
 * @param {'hi'|'en'} lang
 * @param {Record<string, string|number>} [vars] e.g. { n: 3 }
 * @returns {string}
 */
export function t(key, lang, vars = {}) {
  const table = DICT[lang];
  if (!table) throw new RangeError(`t: unknown language ${JSON.stringify(lang)}`);
  const template = table[key];
  if (template === undefined) throw new TypeError(`t: unknown i18n key ${JSON.stringify(key)}`);
  if (!template.includes('{')) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name) => (
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : placeholder
  ));
}

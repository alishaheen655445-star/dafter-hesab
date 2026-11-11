// -----------------------------------------------------------------------------
//  Phase 6 test: the whole i18n surface, with no server and no browser.
//
//  Three places hold text, and they have to stay in step:
//    · client/js/i18n.js                 — the ar + fa dictionaries
//    · client/js/*.js, client/*.html     — every t('a.b') and data-i18n="a.b"
//    · server/utils/i18nMessages.js      — the messages the API can answer with
//  A key that is used but not defined is a screen showing a raw dotted name to
//  the user; a key defined in one language only is a half-translated app. Both
//  are invisible until someone switches language, so they are worth a test.
//
//  Run with: node scripts/test-i18n.mjs
// -----------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from '../server/utils/i18nMessages.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
};

// --- 1. load the dictionaries --------------------------------------------------
// i18n.js is an IIFE that hangs I18n off `window`, so it runs in a sandbox with a
// fake window. Nothing else is needed: it touches document/Config only when the
// functions are called, and this test only reads the data it exports.
const ctx = vm.createContext({ window: {} });
vm.runInContext(read('client/js/i18n.js'), ctx);
const I18n = ctx.window.I18n;
check('i18n.js loads and exports DICT', !!I18n && !!I18n.DICT.ar && !!I18n.DICT.fa);

/** { a: { b: 'x' } } -> { 'a.b': 'x' } */
function flat(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flat(v, key, out);
    else out[key] = v;
  }
  return out;
}

const ar = flat(I18n.DICT.ar);
const fa = flat(I18n.DICT.fa);
const arKeys = Object.keys(ar);
const faKeys = Object.keys(fa);
const inFa = new Set(faKeys);
const inAr = new Set(arKeys);

check('arabic dictionary is populated', arKeys.length > 150, `${arKeys.length} keys`);
check('persian dictionary is populated', faKeys.length > 150, `${faKeys.length} keys`);

const missingInFa = arKeys.filter((k) => !inFa.has(k));
const missingInAr = faKeys.filter((k) => !inAr.has(k));
check('every arabic key exists in persian', missingInFa.length === 0, missingInFa.join(', '));
check('every persian key exists in arabic', missingInAr.length === 0, missingInAr.join(', '));

const blankAr = arKeys.filter((k) => typeof ar[k] !== 'string' || ar[k].trim() === '');
const blankFa = faKeys.filter((k) => typeof fa[k] !== 'string' || fa[k].trim() === '');
check('no empty arabic value', blankAr.length === 0, blankAr.join(', '));
check('no empty persian value', blankFa.length === 0, blankFa.join(', '));

// Both dictionaries are RTL, so a value that stayed Latin is a missed line.
const latinAr = arKeys.filter((k) => !/\p{sc=Arabic}/u.test(ar[k]));
check('arabic values are actually arabic', latinAr.length === 0, latinAr.join(', '));

// --- 2. every key the screens ask for -----------------------------------------
const files = [
  ...fs.readdirSync(path.join(ROOT, 'client')).filter((f) => f.endsWith('.html')).map((f) => `client/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'client/js')).filter((f) => f.endsWith('.js')).map((f) => `client/js/${f}`),
];

const used = new Set();       // t('a.b')
const prefixes = new Set();   // t('cur.' + c) and t('loan.st_' + s)
const attrs = new Set();      // data-i18n="a.b" and friends

for (const f of files) {
  const src = read(f);
  for (const m of src.matchAll(/\bt\(\s*['"]([a-z0-9_]+(?:\.[a-z0-9_]+)*)['"]/gi)) used.add(m[1]);
  for (const m of src.matchAll(/\bt\(\s*['"]([a-z0-9_]+[._])['"]\s*\+/gi)) prefixes.add(m[1]);
  for (const m of src.matchAll(/data-i18n(?:-(?:placeholder|title))?="([^"]+)"/g)) attrs.add(m[1]);
}

// A key that ends with '.' or '_' is the head of a built key (the status of a
// check, the name of a currency) — it has to lead somewhere real, not be read as
// a leaf itself.
for (const k of [...used]) if (/[._]$/.test(k)) { prefixes.add(k); used.delete(k); }

check('screens use a lot of keys', used.size + attrs.size > 100, `${used.size} calls + ${attrs.size} attributes`);

const notAr = [...used].filter((k) => !ar[k]).sort();
check('every t() call has an arabic string', notAr.length === 0, notAr.join(', '));
const notFa = [...used].filter((k) => !fa[k]).sort();
check('every t() call has a persian string', notFa.length === 0, notFa.join(', '));

const attrMiss = [...attrs].filter((k) => !ar[k] || !fa[k]).sort();
check('every data-i18n target is translated', attrMiss.length === 0, attrMiss.join(', '));

// A built key must at least point inside a namespace that exists in both
// languages, otherwise it can only ever fall back to the raw text.
const badPrefix = [...prefixes].filter((p) =>
  !arKeys.some((k) => k.startsWith(p)) || !faKeys.some((k) => k.startsWith(p))).sort();
check('dynamic key prefixes lead to real keys', badPrefix.length === 0, badPrefix.join(', '));

// --- 3. the server's reply table ----------------------------------------------
const entries = Object.entries(MESSAGES);
check('the api can answer in both languages', entries.length > 60, `${entries.length} messages`);

const shortEntry = entries.filter(([, v]) => !Array.isArray(v) || v.length !== 2 || v.some((s) => !String(s).trim()));
check('every api message has arabic + persian', shortEntry.length === 0, shortEntry.map(([k]) => k).join(', '));

// A copy-paste of the English would defeat the whole table.
const untranslated = entries.filter(([, v]) => v.some((s) => /^[a-z0-9 ().,:-]+$/i.test(s)));
check('no api message is left in english', untranslated.length === 0, untranslated.map(([k]) => k).join(', '));

// The client sends its language on every request; without that header the table
// is dead code, so the promise is checked where it is made.
check('the client sends X-App-Lang', /X-App-Lang/.test(read('client/js/api.js')));
check('the error middleware localizes', /localize\(/.test(read('server/middleware/errorHandler.js')));

// --- 4. the calendar contract --------------------------------------------------
// UI.formatDate only ever has one job: read the language and pick a calendar.
const ui = read('client/js/ui.js');
check('UI.formatDate follows the language', /Jalali\.format\(v, global\.I18n\.lang\(\)\)/.test(ui));
check('the tab title follows the screen', /setPageTitle\(o\.title/.test(ui));
check('settings is a live nav item', /key: 'settings'[^}]*ready: true/.test(ui));
const jalali = read('client/js/jalali.js');
check('jalali keeps the arabic side gregorian', /lang !== 'fa'/.test(jalali));

// Every native date picker must show its Jalali reading under it, or a Persian
// user picks dates by heart.
for (const f of ['client/js/txn-form.js', 'client/js/check-form.js', 'client/js/loan-form.js', 'client/js/rem-form.js', 'client/js/report.js']) {
  const src = read(f);
  const has = /formatDateLong\(|formatDateTime\(/.test(src);
  check(`${path.basename(f)} shows the date in the user's calendar`, has);
}

console.log(`\ni18n: ${pass}/${pass + fail} assertions`);
process.exit(fail ? 1 : 0);

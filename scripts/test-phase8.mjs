// -----------------------------------------------------------------------------
//  Phase 8 test: the visual redesign, checked without a server and without a
//  browser.
//
//  Phase 8 changed how every screen looks: a new palette, an icon sprite instead
//  of emoji, a 3-tab bottom bar, one field style instead of two, gradient summary
//  cards, and SVG empty-state art. Screens like this break quietly — a typo in a
//  data-ico leaves an empty square, a class that lost its CSS renders unstyled,
//  and half a screen still on the old field style only shows up when someone
//  opens that sheet. None of that is visible to a unit test on the API, so it is
//  asserted where it is written: on the source files.
//
//  Run with: node scripts/test-phase8.mjs
// -----------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
};

const HTML = fs.readdirSync(path.join(ROOT, 'client')).filter((f) => f.endsWith('.html')).map((f) => `client/${f}`);
const JS = fs.readdirSync(path.join(ROOT, 'client/js')).filter((f) => f.endsWith('.js')).map((f) => `client/js/${f}`);
const css = read('client/css/styles.css');

// --- 1. the palette the redesign is built on ----------------------------------
const TOKENS = {
  '--grad': 'linear-gradient',
  '--navy': '#0f3d63',
  '--indigo': '#5c6bc0',
  '--tab-off': '#7a7fa8',
  '--credit': '#2196f3',
  '--debit': '#e91e63',
  '--radius-lg': '26px',
  '--pill': '999px',
};
for (const [token, value] of Object.entries(TOKENS)) {
  const line = css.match(new RegExp(`${token}:\\s*([^;]+);`));
  check(`the palette defines ${token}`, !!line && line[1].includes(value), line ? line[1].trim() : 'missing');
}
// The redesign swapped teal for blue/pink on money: those two must stay distinct,
// or a credit looks like a debit.
check('credit and debit are not one colour', css.includes('--credit: #2196f3') && css.includes('--debit: #e91e63'));
check('teal is kept for confirmations only', css.includes('--teal: #10c690'));

// --- 2. the icon sprite is the only icon source -------------------------------
const iconsSrc = read('client/js/icons.js');
const spriteBlock = iconsSrc.slice(iconsSrc.indexOf('const P = {'), iconsSrc.indexOf('const NS ='));
const names = new Set([...spriteBlock.matchAll(/^\s*'?([a-z0-9-]+)'?\s*:\s*'/gm)].map((m) => m[1]));
check('the sprite carries a real icon set', names.size >= 40, `${names.size} icons`);
check('the sprite is built with createElementNS (no innerHTML)', /createElementNS\(NS, 'symbol'\)/.test(iconsSrc));
check('the sprite is installed once', /if \(document\.getElementById\('dh-sprite'\)\) return;/.test(iconsSrc));

// Static markup: <span class="ico-slot" data-ico="phone"> — filled by mountIcons.
const slotNames = new Set();
for (const f of [...HTML, ...JS]) {
  for (const m of read(f).matchAll(/data-ico="([a-z0-9-]+)"/g)) slotNames.add(m[1]);
}
const badSlots = [...slotNames].filter((n) => !names.has(n));
check('every data-ico slot has an icon', badSlots.length === 0, badSlots.join(', '));

// JS-built markup: UI.icon('trash').
const callNames = new Set();
for (const f of JS) {
  for (const m of read(f).matchAll(/\bicon\(\s*'([a-z0-9-]+)'/g)) callNames.add(m[1]);
}
const badCalls = [...callNames].filter((n) => !names.has(n));
check('every UI.icon() call has an icon', badCalls.length === 0, badCalls.join(', '));
check('the screens ask for a lot of icons', slotNames.size + callNames.size > 30,
  `${slotNames.size} static + ${callNames.size} called`);

// Slots are declarative, so somebody has to fill them on every repaint.
check('mountIcons fills slots after each i18n pass', /mountIcons\(/.test(read('client/js/i18n.js')));
check('ui.js exports mountIcons', /mountIcons,/.test(read('client/js/ui.js')));

// --- 3. the shell: three tabs, like the reference app -------------------------
const ui = read('client/js/ui.js');
const navBlock = ui.slice(ui.indexOf('const NAV = ['), ui.indexOf('function icon('));
const navKeys = [...navBlock.matchAll(/key: '([a-z0-9]+)'/g)].map((m) => m[1]);
check('the bottom bar has exactly three tabs', navKeys.length === 3, navKeys.join(', '));
check('the tabs are reminders, home, settings',
  navKeys.join(' ') === 'reminders home settings', navKeys.join(' '));
check('no tab is a placeholder', !/ready: false/.test(navBlock));
for (const k of navKeys) {
  check(`the ${k} tab points at a real screen`, exists(`client/${k}.html`));
}
// A second bar stacked under this one would be a fourth tab the app does not have.
check('the shell removes the old bar before repainting',
  /document\.querySelectorAll\('\.app-header, \.bottom-nav'\)\.forEach\(\(el\) => el\.remove\(\)\)/.test(ui));

// --- 4. one field style, no leftovers ----------------------------------------
// Phase 8 deleted .field and .tabs. A screen that still writes them renders flat.
const legacyField = HTML.concat(JS).filter((f) => /\bclass="field[" ]/.test(read(f)));
check('no screen uses the removed .field class', legacyField.length === 0, legacyField.join(', '));
const legacyTabs = HTML.concat(JS).filter((f) => /\bclass="tabs[" ]/.test(read(f)));
check('no screen uses the removed .tabs class', legacyTabs.length === 0, legacyTabs.join(', '));
check('the css dropped label.field', !/label\.field/.test(css));
check('the css dropped the old .tabs rule', !/^\.tabs\s*\{/m.test(css));
// What the new field needs to behave like Material: the label punched into the
// border, an error line that costs nothing while empty, and a red ring on demand.
for (const rule of ['.fld > .lbl', '.fld .err-text:empty', '[aria-invalid="true"]', '.fld.pair', '.fld > .suffix']) {
  check(`the field style has ${rule}`, css.includes(rule));
}
check('the label notches to white inside a card', /\.card \.fld > \.lbl, \.sec-body \.fld > \.lbl/.test(css));
check('showFieldErrors sets aria-invalid', /aria-invalid/.test(ui));

// --- the bottom of a long screen ---------------------------------------------
// The column is a phone screen with a FIXED nav painted over its last rows, and
// the only thing keeping «حفظ المعلومات» reachable is the body's own padding.
// That padding is a lie the moment the body is a fixed-height box: the content
// spills past the box and paints over the padding. Measured in the browser on
// party.html — with `height: 100%` the button sat 43px under the nav (covered),
// without it the same button clears the nav by 20px and is the element the click
// lands on.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const bodyRule = strip((css.match(/(^|\})\s*body\s*\{([^}]*)\}/m) || [, '', ''])[2]);
check('the body reserves the nav height under the page',
  /padding-bottom:\s*calc\(var\(--nav-h\)/.test(bodyRule));
check('the body is allowed to grow, never pinned to the viewport',
  !/height:\s*100%/.test(bodyRule) && /min-height:\s*100dvh/.test(bodyRule));
check('no rule pins html and body to the viewport height together',
  !/^html,\s*body\s*\{\s*height:\s*100%/m.test(css));
const navRule = strip((css.match(/\.bottom-nav\s*\{([^}]*)\}/m) || [, '', ''])[1]);
check('the nav is fixed and exactly as tall as that reserve',
  /position:\s*fixed/.test(navRule) && /height:\s*calc\(var\(--nav-h\)/.test(navRule));

// --- 5. the segmented control replaced the tab strips -------------------------
for (const rule of ['.seg {', '.seg.on-white', '.seg.money']) {
  check(`the segmented control has ${rule}`, css.includes(rule));
}
const segScreens = ['client/checks.html', 'client/loans.html', 'client/index.html', 'client/settings.html'];
for (const f of segScreens) check(`${path.basename(f)} uses .seg`, /\bclass="seg/.test(read(f)));

// --- 6. screens that got a new look -----------------------------------------
const home = read('client/home.html') + read('client/js/home.js');
check('home has the gradient hero', /\.hero\b/.test(css) && /class="hero/.test(home));
check('home has the donut', /donut|conic-gradient/.test(home + css));

const partyHtml = read('client/party.html');
check('party has the gradient identity card', /class="phead" id="phead"/.test(partyHtml));
check('party has the quick-action row', /class="qa-row" id="qa"/.test(partyHtml));
check('party has two money buttons', /id="btn-gave"/.test(partyHtml) && /id="btn-got"/.test(partyHtml));
check('party wires both money buttons', /btn-gave/.test(read('client/js/party.js')) && /btn-got/.test(read('client/js/party.js')));
check('party has no dead add-transaction button', !/btn-add-txn/.test(partyHtml + read('client/js/party.js')));
check('party adds notes through a wired button', /btn-add-note/.test(partyHtml) && /getElementById\('btn-add-note'\)/.test(read('client/js/party.js')));

const checks = read('client/checks.html');
const checksJs = read('client/js/checks.js');
check('checks has the gradient stats card', /class="scard" id="stats"/.test(checks));
check('checks has the month navigator inside one white panel',
  /class="month-nav in-panel"/.test(checks) && /<section class="panel">/.test(checks)
  && /getElementById\('m-prev'\)/.test(checksJs));
// The two segmented rows of the first build became the reference app's bar plus
// its two tiles: home and the two sides up top, archive and enquiry as buttons.
check('checks opens with the home-and-sides bar',
  /class="seg tabs" id="tabs"/.test(checks) && /href="home\.html"/.test(checks)
  && /data-type="received"/.test(checks) && /data-type="issued"/.test(checks));
check('checks gives the archive and the enquiry a tile each',
  /id="btn-archive"/.test(checks) && /id="btn-inquiry"/.test(checks)
  && /openInquiry/.test(checksJs));
// A serial can be typed in Arabic-indic, Persian or Latin digits; matching the
// typed ones against the stored ones without translating both is a silent «لا صك».
check('the enquiry translates every digit script',
  /\\u0660-\\u0669/.test(checksJs) && /\\u06f0-\\u06f9/.test(checksJs)
  && !/const AR_DIGITS = '[^']{1,9}';/.test(checksJs));
check('the summary rows filter, and say which one is on',
  /data-side="\$\{side\}"/.test(checksJs) && /class="srow\$\{/.test(checksJs)
  && /row\('received', t\('chk\.activeReceived'\)/.test(checksJs));
for (const rule of ['.seg.tabs {', '.scard .srow {', '.panel {', '.tiles button {', '.inq-card {']) {
  check(`the css has ${rule}`, css.includes(rule));
}
// A renamed id is a `null` at runtime and a screen that dies on the first tap —
// and nothing else would notice. Every id a screen's own script looks up has to
// be in that screen's markup.
for (const f of ['checks', 'party', 'loans', 'home', 'settings']) {
  const html = read(`client/${f}.html`);
  const js = read(`client/js/${f}.js`);
  const have = new Set((html.match(/id="([^"]+)"/g) || []).map((s) => s.slice(4, -1)));
  const want = [...new Set((js.match(/getElementById\('([^']+)'\)/g) || [])
    .map((s) => s.match(/'([^']+)'/)[1]))];
  const missing = want.filter((i) => !have.has(i));
  check(`${f}.js only asks for ids ${f}.html has`, missing.length === 0, missing.join(', '));
}
const loans = read('client/loans.html');
check('loans has its own stats card colour', /class="scard indigo" id="stats"/.test(loans));
check('loans has type and state segments', /id="seg-type"/.test(loans) && /id="seg-state"/.test(loans));
for (const f of ['client/checks.html', 'client/loans.html']) {
  const js = `client/js/${path.basename(f, '.html')}.js`;
  check(`${path.basename(f)} counts what it shows`, /getElementById\('count'\)/.test(read(js)));
  check(`${path.basename(f)} filters inside the page`, /function visible\(/.test(read(js)));
}

const settings = read('client/settings.html');
check('settings opens with the account card', /class="phead" id="me"/.test(settings));
check('settings lists destinations as icon rows', /class="irow" href="backup\.html"/.test(settings) && /class="irow" href="report\.html"/.test(settings));
check('settings signs out in red', /class="irow danger" id="btn-logout"/.test(settings));
check('settings groups under navy pills', (settings.match(/sec-pill/g) || []).length >= 5);
for (const rule of ['.irow {', '.irow .hint', '.irow .chev', '.irow.danger', '.ico-chip']) {
  check(`the css has ${rule}`, css.includes(rule));
}

// --- 7. floating buttons stay inside the reading column -----------------------
// The app is a 520px column centred on a wide screen; a fixed button using a bare
// `right: 14px` would sit at the edge of the monitor instead of the edge of the page.
const fabs = css.match(/\.pill-fab \{[^}]*\}/s)?.[0] || '';
check('the floating button hugs the column, not the viewport', /inset-inline-end: max\(14px, calc\(\(100vw - 520px\)/.test(fabs));
// Both languages of this app run right to left, so nothing may be pinned to a
// physical side — the logical properties are the only correct spelling here.
check('the whole stylesheet is direction-neutral', !/(^|[^-\w])(left|right)\s*:/m.test(css));
for (const cls of ['debit', 'teal', 'loans']) {
  check(`the floating button knows .${cls}`, css.includes(`.pill-fab.${cls}`));
}

// --- 8. empty states are drawn, not emoji -------------------------------------
const artFiles = ['empty-parties', 'empty-checks', 'empty-loans', 'empty-reminders'];
for (const a of artFiles) {
  const p = `client/img/${a}.svg`;
  const ok = exists(p) && /^<svg[^>]*viewBox="0 0 /.test(read(p));
  check(`${a}.svg is a real viewBox drawing`, ok);
  const usedIn = [...HTML, ...JS].some((f) => read(f).includes(`${a}.svg`));
  check(`${a}.svg is actually shown somewhere`, usedIn);
}
// An emoji looks different on every device and is missing on some — none may stay.
const emojiFiles = [...HTML, ...JS, 'client/css/styles.css'].filter((f) =>
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{27B0}-\u{27BF}\u{FE0F}]/u.test(read(f)));
check('no emoji left in the interface', emojiFiles.length === 0, emojiFiles.join(', '));

// --- 9. everything still works offline (the APK has no CDN) -------------------
// Anything the screen has to FETCH to look right would fail on a plane. Loading
// the app's own files and naming http:// in a hint are not that.
const remote = [...HTML, 'client/css/styles.css'].filter((f) =>
  /\b(?:src|href)="https?:|url\(\s*['"]?https?:|@import/.test(read(f)));
check('no screen reaches the network for looks', remote.length === 0, remote.join(', '));
const inline = [...HTML].filter((f) => /\son(click|error|load|change|input)=/.test(read(f)));
check('no inline handler (helmet CSP would drop it)', inline.length === 0, inline.join(', '));
// icons.js injects the sprite, so it has to be loaded before anything builds markup.
for (const f of HTML) {
  const src = read(f);
  const at = (s) => src.indexOf(s);
  if (at('js/ui.js') === -1) continue;
  check(`${path.basename(f)} loads the sprite before ui.js`, at('js/icons.js') !== -1 && at('js/icons.js') < at('js/ui.js'));
}

// --- 10. the redesign's own strings exist in both languages -------------------
const ctx = vm.createContext({ window: {} });
vm.runInContext(read('client/js/i18n.js'), ctx);
const flat = (o, p = '', out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    v && typeof v === 'object' ? flat(v, key, out) : (out[key] = v);
  }
  return out;
};
const ar = flat(ctx.window.I18n.DICT.ar);
const fa = flat(ctx.window.I18n.DICT.fa);
const PHASE8_KEYS = [
  'set.data', 'set.backupHint', 'set.reportHint', 'party.noteText',
  'chk.forMe', 'chk.fromMe', 'chk.live', 'chk.archive', 'chk.allMonths',
  'chk.overdueN', 'chk.soonN', 'loan.onMe', 'loan.toHim',
  'nav.reminders', 'nav.home', 'nav.settings',
];
for (const k of PHASE8_KEYS) {
  check(`${k} is translated in arabic`, typeof ar[k] === 'string' && ar[k].trim() !== '');
  check(`${k} is translated in persian`, typeof fa[k] === 'string' && fa[k].trim() !== '');
}
// A key the markup points at must exist, or the screen shows the dotted name.
const attrs = new Set();
for (const f of HTML) for (const m of read(f).matchAll(/data-i18n(?:-placeholder|-(?:hint|empty))?\s*=\s*"([^"]+)"/g)) attrs.add(m[1]);
const missAttr = [...attrs].filter((k) => !ar[k] || !fa[k]);
check('every static data-i18n target is translated', missAttr.length === 0, missAttr.join(', '));

// --- 11. the calendar promise the redesign keeps ------------------------------
// Persian years are never printed with a thousands separator, so they go through
// toFaDigits rather than UI.num. (checksJs was read up in section 6.)
check('the month navigator follows the reader calendar', /toJalaali\(/.test(checksJs) && /GREGORIAN_AR/.test(checksJs));
check('a persian year is not grouped', /toFaDigits\(month\.y\)/.test(checksJs) && !/UI\.num\(month\.y\)/.test(checksJs));
check('the navigator resets when the calendar changes', /monthLang !== global\.I18n\.lang\(\)/.test(checksJs));

console.log(`\nphase8: ${pass}/${pass + fail} assertions`);
process.exit(fail ? 1 : 0);

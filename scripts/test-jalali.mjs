// -----------------------------------------------------------------------------
//  jalali.js unit test — runs the browser file inside a Node VM (no DOM needed).
//  Run: node scripts/test-jalali.mjs
// -----------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const code = fs.readFileSync(path.join(__dirname, '..', 'client', 'js', 'jalali.js'), 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const J = sandbox.window.Jalali;

const results = [];
const check = (label, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
};

// Well-known Nowruz anchors (Gregorian 1st day of Farvardin).
const NOWRUZ = [
  [2024, 3, 20, 1403],
  [2025, 3, 21, 1404],
  [2026, 3, 21, 1405],
  [2027, 3, 21, 1406],
];
for (const [gy, gm, gd, jy] of NOWRUZ) {
  const j = J.toJalaali(gy, gm, gd);
  check(`${gy}-${gm}-${gd} is Nowruz ${jy}`, j.jy === jy && j.jm === 1 && j.jd === 1,
    `${j.jy}/${j.jm}/${j.jd}`);
}

// A fixed reference point: today in the dev environment.
const j = J.toJalaali(2026, 11, 2);
check('2026-11-02 -> 1405/08/11', j.jy === 1405 && j.jm === 8 && j.jd === 11,
  `${j.jy}/${j.jm}/${j.jd}`);

// Round-trip over ~6 years of consecutive days.
let days = 0;
let broken = 0;
let cursor = new Date(Date.UTC(2024, 0, 1));
for (let i = 0; i < 2200; i += 1) {
  const gy = cursor.getUTCFullYear();
  const gm = cursor.getUTCMonth() + 1;
  const gd = cursor.getUTCDate();
  const jj = J.toJalaali(gy, gm, gd);
  const back = J.toGregorian(jj.jy, jj.jm, jj.jd);
  days += 1;
  if (back.gy !== gy || back.gm !== gm || back.gd !== gd) broken += 1;
  cursor = new Date(cursor.getTime() + 86400000);
}
check(`round-trip ${days} days`, broken === 0, `mismatches=${broken}`);

// Leap-year / month length sanity: Esfand 1403 has 30 days (leap), 1405 has 29.
check('Esfand 1403 = 30 days', J.jalaaliMonthLength(1403, 12) === 30);
check('Esfand 1405 = 29 days', J.jalaaliMonthLength(1405, 12) === 29);
check('Shahrivar always 31', J.jalaaliMonthLength(1405, 6) === 31);

// Formatting helpers.
check('format fa uses Persian digits', J.format('2026-11-02T00:00:00', 'fa') === '۱۴۰۵/۰۸/۱۱',
  J.format('2026-11-02T00:00:00', 'fa'));
check('format ar keeps Latin digits', J.format('2026-11-02T00:00:00', 'ar') === '02/11/2026',
  J.format('2026-11-02T00:00:00', 'ar'));
check('accepts DB datetime string', J.format('2026-11-02 14:30:00', 'fa') === '۱۴۰۵/۰۸/۱۱');
check('long fa name', J.formatLong('2026-11-02', 'fa').includes('آبان'), J.formatLong('2026-11-02', 'fa'));

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exit(1);
console.log('=== JALALI TEST PASSED ===');

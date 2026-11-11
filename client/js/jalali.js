// -----------------------------------------------------------------------------
//  jalali.js — Gregorian <-> Jalali (Persian / Solar Hijri) conversion.
//  Port of the canonical jalaali-js algorithm (MIT). The fa UI shows Jalali
//  dates, the ar UI shows Gregorian — same behaviour as the reference app.
//
//  Exposed as window.Jalali:
//    toJalaali(gy, gm, gd)        -> { jy, jm, jd }
//    toGregorian(jy, jm, jd)      -> { gy, gm, gd }
//    formatJalali(dateLike)       -> "۱۴۰۵/۰۸/۱۱"  (Persian digits)
//    monthName(jm, lang)          -> "آبان" | "تشرين الثاني"
//    jalaaliMonthLength(jy, jm)   -> 29..31
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  const div = (a, b) => ~~(a / b);
  const mod = (a, b) => a - ~~(a / b) * b;

  // Leap-year pattern breaks: [leapJ offsets] — see jalaali-js.
  const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635,
    2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

  /** Core table lookup: leap info + Gregorian year + March date of 1 Farvardin. */
  function jalCal(jy) {
    const bl = BREAKS.length;
    const gy = jy + 621;
    let leapJ = -14;
    let jp = BREAKS[0];
    let jm, jump, leap, n;

    if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error('Invalid Jalali year ' + jy);

    for (let i = 1; i < bl; i += 1) {
      jm = BREAKS[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;

    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;

    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;

    return { leap, gy, march };
  }

  // Day numbers are plain UTC days since 1970-01-01 — JS Date already converts
  // the Gregorian calendar (incl. leap years) correctly, so we reuse it instead
  // of hand-rolled Julian-day formulas.
  const DAY_MS = 86400000;

  /** Gregorian -> day number. */
  function g2d(gy, gm, gd) {
    return Math.round(Date.UTC(gy, gm - 1, gd) / DAY_MS);
  }

  /** Day number -> Gregorian. */
  function d2g(dayNo) {
    const d = new Date(dayNo * DAY_MS);
    return { gy: d.getUTCFullYear(), gm: d.getUTCMonth() + 1, gd: d.getUTCDate() };
  }

  /** Jalali -> day number. */
  function j2d(jy, jm, jd) {
    const r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }

  /** Day number -> Jalali. */
  function d2j(dayNo) {
    const gy = d2g(dayNo).gy;
    let jy = gy - 621;
    // 1 Farvardin of that Jalali year, as a day number.
    let jdn1f = g2d(gy, 3, jalCal(jy).march);
    if (dayNo < jdn1f) {
      // Jan/Feb (and early March) still belong to the PREVIOUS Jalali year.
      jy -= 1;
      jdn1f = g2d(gy - 1, 3, jalCal(jy).march);
    }

    const k = dayNo - jdn1f; // days passed since 1 Farvardin, always >= 0
    if (k <= 185) {
      // First six months: 31 days each.
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    }
    // Remaining seven months: 30 days each (Esfand 29/30).
    const rest = k - 186;
    return { jy, jm: 7 + div(rest, 30), jd: mod(rest, 30) + 1 };
  }

  const isLeapJalaaliYear = (jy) => jalCal(jy).leap === 0;

  function jalaaliMonthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeapJalaaliYear(jy) ? 30 : 29;
  }

  const MONTHS_FA = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const MONTHS_AR = ['حمل', 'ثور', 'جوزاء', 'السرطان', 'أسد', 'سنبلة',
    'ميزان', 'عقرب', 'قوس', 'جدى', 'دلو', 'حوت'];
  // Gregorian month names used on the Arabic side.
  const GREGORIAN_AR = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
    'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

  const pad2 = (n) => String(n).padStart(2, '0');
  const toFaDigits = (s) => String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

  /** Accepts 'YYYY-MM-DD', 'YYYY-MM-DD HH:MM:SS', a Date, or Date parts. */
  function parts(input) {
    if (input instanceof Date) return { gy: input.getFullYear(), gm: input.getMonth() + 1, gd: input.getDate() };
    const m = String(input || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return { gy: +m[1], gm: +m[2], gd: +m[3] };
  }

  /** "1405/08/11" in Jalali digits (fa) or "2026-11-02" as-is (ar). */
  function format(input, lang = 'fa') {
    const p = parts(input);
    if (!p) return '';
    if (lang !== 'fa') return `${pad2(p.gd)}/${pad2(p.gm)}/${p.gy}`;
    const j = d2j(g2d(p.gy, p.gm, p.gd));
    return toFaDigits(`${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`);
  }

  /** Long, human-readable date: "۱۱ آبان ۱۴۰۵" / "11 تشرين الثاني 2026". */
  function formatLong(input, lang = 'fa') {
    const p = parts(input);
    if (!p) return '';
    if (lang === 'fa') {
      const j = d2j(g2d(p.gy, p.gm, p.gd));
      return toFaDigits(`${j.jd} ${MONTHS_FA[j.jm - 1]} ${j.jy}`);
    }
    return `${p.gd} ${GREGORIAN_AR[p.gm - 1]} ${p.gy}`;
  }

  function monthName(jm, lang = 'fa') {
    return (lang === 'fa' ? MONTHS_FA : MONTHS_AR)[jm - 1] || '';
  }

  global.Jalali = {
    toJalaali: (gy, gm, gd) => d2j(g2d(gy, gm, gd)),
    toGregorian: (jy, jm, jd) => d2g(j2d(jy, jm, jd)),
    jalaaliMonthLength,
    isLeapJalaaliYear,
    format,
    formatLong,
    monthName,
    MONTHS_FA,
    MONTHS_AR,
    GREGORIAN_AR,
    toFaDigits,
  };
})(window);

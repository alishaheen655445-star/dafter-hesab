// -----------------------------------------------------------------------------
//  checks.js — the صكوك screen, laid out the way the original screens it:
//  a bar (home | لي | عليّ), a four-row summary of the whole book, the two
//  tiles (الأرشيف / الاستعلام), then one white panel whose head is the month
//  navigator and whose body is the list.
//
//  The narrowing happens here rather than on the server: /checks already returns
//  every cheque of the book in one call, and every control is meant to react
//  instantly, without a round trip per tap. Only the status sheet writes.
//
//  «الاستعلام» is local on purpose: the original sells a live enquiry against
//  the interbank صیاد system, which is a paid third-party service. Here the same
//  tile searches the user's own book — every cheque, any state, any month —
//  without a network partner and without a price.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  if (!Auth.require()) return;

  const t = (k, v) => global.I18n.t(k, v);
  const J = global.Jalali;
  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const emptyTextEl = document.getElementById('empty-text');
  const statsEl = document.getElementById('stats');
  const countEl = document.getElementById('count');
  const monthLabelEl = document.getElementById('m-label');
  const monthAllEl = document.getElementById('m-all');
  const tabsEl = document.getElementById('tabs');
  const archiveBtn = document.getElementById('btn-archive');
  const archiveLabelEl = document.getElementById('archive-label');
  const inquiryBtn = document.getElementById('btn-inquiry');
  const bothBtn = document.getElementById('btn-both');

  let rows = [];               // every cheque of the book, as the server sent it
  let fType = 'received';      // '' | received | issued — '' is one tap away
  let fState = 'live';         // live | archive (the tile flips between them)
  let month = null;            // { y, m } in the calendar the reader uses, or null
  let monthLang = null;        // the calendar `month` is written in

  const PILL = { pending: 'info', cashed: 'ok', bounced: 'bad', cancelled: 'mute' };

  // Checks live behind the pink tile on home, not in the bottom bar — the tab
  // therefore stays on «home», exactly where the user came from.
  function shellBar() {
    UI.shell({ active: 'home', title: t('chk.title'), ico: 'checkbook' });
  }
  shellBar();

  // --- the month window --------------------------------------------------------

  const pad2 = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.gy}-${pad2(d.gm)}-${pad2(d.gd)}`;

  /** Today, as a month cursor in whichever calendar this language reads. */
  function thisMonth() {
    const now = new Date();
    if (global.I18n.lang() === 'fa') {
      const j = J.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
      return { y: j.jy, m: j.jm };
    }
    return { y: now.getFullYear(), m: now.getMonth() + 1 };
  }

  /**
   * The Gregorian span of the cursor's month. A Jalali month straddles two
   * Gregorian ones, so in fa the window is built from the calendar itself
   * instead of being read off the cursor's digits.
   */
  function monthWindow() {
    if (!month) return null;
    if (global.I18n.lang() === 'fa') {
      return {
        from: iso(J.toGregorian(month.y, month.m, 1)),
        to: iso(J.toGregorian(month.y, month.m, J.jalaaliMonthLength(month.y, month.m))),
      };
    }
    // Date.UTC(_, m, 0) is the last day of month m (m is 1-based here).
    const last = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
    return { from: `${month.y}-${pad2(month.m)}-01`, to: `${month.y}-${pad2(month.m)}-${pad2(last)}` };
  }

  /**
   * The cursor written the way the original writes it: year/month, in the digits
   * this language reads. A year is never grouped, so this is not UI.num().
   */
  function monthName() {
    if (!month) return t('chk.allMonths');
    const s = `${month.y}/${pad2(month.m)}`;
    return global.I18n.lang() === 'fa' ? J.toFaDigits(s) : s;
  }

  /** The same month spelled out — the accessibility name of that number. */
  function monthSpelled() {
    if (!month) return t('chk.allMonths');
    if (global.I18n.lang() === 'fa') return `${J.monthName(month.m, 'fa')} ${J.toFaDigits(month.y)}`;
    return `${J.GREGORIAN_AR[month.m - 1]} ${month.y}`;
  }

  function paintMonth() {
    monthLabelEl.textContent = monthName();
    monthLabelEl.title = monthSpelled();
    monthAllEl.hidden = !month;
  }

  function stepMonth(delta) {
    // From "all months", the first arrow lands on the current month.
    if (!month) { month = thisMonth(); monthLang = global.I18n.lang(); render(); return; }
    let m = month.m + delta;
    let y = month.y;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    month = { y, m };
    render();
  }

  // --- rendering -------------------------------------------------------------

  function daysText(c) {
    if (c.status !== 'pending') return '';
    if (c.days_left < 0) return t('chk.overdueBy', { n: UI.num(-c.days_left) });
    if (c.days_left === 0) return t('chk.dueToday');
    if (c.days_left <= 7) return t('chk.soon');
    return t('chk.daysLeft', { n: UI.num(c.days_left) });
  }

  function tone(c) {
    if (c.is_overdue) return 'warn';
    if (c.status !== 'pending') return 'done';
    return c.type === 'received' ? 'credit' : 'debit';
  }

  function rowHtml(c) {
    const bits = [UI.formatDate(c.due_date), c.check_number, c.bank_name].filter(Boolean);
    const when = daysText(c);
    return `
      <div class="item-row" data-tone="${tone(c)}" data-chk="${c.id}">
        <div class="item-main">
          <div class="item-title">${UI.escapeHtml(c.party_name || t('chk.noParty'))}</div>
          <div class="item-sub">${UI.escapeHtml(bits.join(' · '))}${c.image_url ? ` <span class="att-flag">${UI.icon('image', 'xs')}</span>` : ''}</div>
          ${c.note ? `<div class="item-sub">${UI.escapeHtml(c.note)}</div>` : ''}
        </div>
        ${Attach.thumbHtml(c.image_url, 'xs')}
        <div class="item-side">
          <div class="amount ${c.type === 'received' ? 'credit' : 'debit'}">${UI.money(c.amount_minor)}</div>
          <div style="margin-top:4px"><span class="pill ${PILL[c.status] || 'mute'}">${t('chk.st_' + c.status)}</span></div>
          ${when ? `<div class="item-sub" style="text-align:end">${when}</div>` : ''}
        </div>
      </div>`;
  }

  function visible() {
    const w = monthWindow();
    return rows.filter((c) => {
      if (fType && c.type !== fType) return false;
      if (fState === 'live' && c.status !== 'pending') return false;
      if (fState === 'archive' && c.status === 'pending') return false;
      if (w) {
        const d = String(c.due_date).slice(0, 10);
        if (d < w.from || d > w.to) return false;
      }
      return true;
    });
  }

  /**
   * The card always describes the WHOLE book, not the slice on screen: it answers
   * «where am I?», and that answer must not change when a filter is tapped. The
   * four rows are buttons all the same — each one is a shortcut to its side.
   */
  function renderStats() {
    const sum = (fn) => rows.filter(fn).reduce((s, c) => s + Number(c.amount_minor), 0);
    const count = (fn) => rows.filter(fn).length;
    const unit = t('cur.' + ((Auth.user() || {}).currency || 'toman'));
    const row = (side, label, value, withUnit) => `
      <button type="button" class="srow${fType === side && fState === 'live' ? ' on' : ''}" data-side="${side}">
        <span class="k">${UI.escapeHtml(label)}</span>
        <span class="v">${value}${withUnit ? ` <span class="u">${UI.escapeHtml(unit)}</span>` : ''}</span>
      </button>`;
    const overdue = count((c) => c.is_overdue);
    const soon = count((c) => c.is_due_soon);
    const chips = [
      overdue ? `<span class="chip warn">${t('chk.overdueN', { n: UI.num(overdue) })}</span>` : '',
      soon ? `<span class="chip">${t('chk.soonN', { n: UI.num(soon) })}</span>` : '',
    ].join('');
    statsEl.innerHTML = [
      row('received', t('chk.activeReceived'),
        UI.num(count((c) => c.status === 'pending' && c.type === 'received')), false),
      row('received', t('chk.totalReceived'),
        UI.money(sum((c) => c.status === 'pending' && c.type === 'received'), { withUnit: false }), true),
      row('issued', t('chk.activeIssued'),
        UI.num(count((c) => c.status === 'pending' && c.type === 'issued')), false),
      row('issued', t('chk.totalIssued'),
        UI.money(sum((c) => c.status === 'pending' && c.type === 'issued'), { withUnit: false }), true),
      chips ? `<div class="chips">${chips}</div>` : '',
    ].join('');
  }

  /** The blank screen explains itself: an empty book, an empty month, an empty side. */
  function emptyText() {
    if (!rows.length) return t('chk.empty');
    if (fState === 'archive') return t('chk.emptyArchive');
    if (month) return t('chk.emptyMonth');
    if (fType) return t('chk.emptySide');
    return t('chk.empty');
  }

  function render() {
    const shown = visible();
    listEl.innerHTML = shown.map(rowHtml).join('');
    emptyEl.hidden = shown.length > 0;
    emptyTextEl.textContent = emptyText();
    countEl.textContent = t('chk.countN', { n: UI.num(shown.length) });

    // The bar lights the side on screen, the tile says which half of the book it
    // is, and «الطرفين سوا» only exists while one side is hiding the other.
    tabsEl.querySelectorAll('[data-type]').forEach((b) => {
      b.classList.toggle('active', b.dataset.type === fType);
    });
    const archived = fState === 'archive';
    archiveBtn.classList.toggle('on', archived);
    archiveBtn.setAttribute('aria-pressed', String(archived));
    archiveLabelEl.textContent = t(archived ? 'chk.backLive' : 'chk.archiveTile');
    bothBtn.hidden = !fType;
    bothBtn.textContent = t('chk.bothSides');

    renderStats();
    shellBar();
    // Last, so the repaint of the static labels cannot undo the dynamic month.
    I18n.applyDocument();
    paintMonth();
  }

  // --- data ------------------------------------------------------------------

  async function load() {
    try {
      const res = await API.get('/checks');
      rows = res.data.checks || [];
      render();
    } catch (err) {
      UI.toast(err.message, 'bad');
    }
  }

  // --- actions ---------------------------------------------------------------

  async function setStatus(chk, status) {
    try {
      await API.put(`/checks/${chk.id}`, { status });
      UI.toast(t('common.saved'), 'ok');
      load();
    } catch (err) { UI.toast(err.message, 'bad'); }
  }

  function openSheet(chk) {
    const sheet = UI.modal(chk.party_name || t('chk.title'), `
      <div class="stack">
        <div class="muted">${t('chk.setStatus')}</div>
        <div class="row" style="flex-wrap:wrap;gap:6px">
          ${['pending', 'cashed', 'bounced', 'cancelled']
            .map((s) => `<button class="btn sm ${s === chk.status ? '' : 'secondary'}" data-st="${s}" type="button">${t('chk.st_' + s)}</button>`)
            .join('')}
        </div>
        ${chk.party_id ? `<a class="btn secondary" href="party.html?id=${chk.party_id}">${t('party.title')}</a>` : ''}
        ${chk.image_url ? `<button class="btn secondary" data-x="view" type="button">${t('att.view')}</button>` : ''}
        <button class="btn secondary" data-x="image" type="button">${chk.image_url ? t('att.imageEdit') : t('att.imageAdd')}</button>
        <button class="btn secondary" data-x="edit" type="button">${t('common.edit')}</button>
        <button class="btn danger" data-x="del" type="button">${t('common.delete')}</button>
        <button class="btn ghost" data-x="close" type="button">${t('common.close')}</button>
      </div>`);
    sheet.el.querySelector('[data-x="close"]').onclick = () => sheet.close();
    sheet.el.querySelectorAll('[data-st]').forEach((b) => {
      b.onclick = () => { sheet.close(); if (b.dataset.st !== chk.status) setStatus(chk, b.dataset.st); };
    });
    sheet.el.querySelector('[data-x="edit"]').onclick = async () => {
      sheet.close();
      const saved = await CheckForm.open(chk);
      if (saved) load();
    };
    sheet.el.querySelector('[data-x="image"]').onclick = async () => {
      sheet.close();
      if (await Attach.editCheckImage(chk)) load();
    };
    sheet.el.querySelector('[data-x="view"]')?.addEventListener('click', () => {
      sheet.close();
      Attach.view(chk.image_url);
    });
    sheet.el.querySelector('[data-x="del"]').onclick = async () => {
      sheet.close();
      if (!(await UI.confirmBox(t('common.delete'), t('chk.deleteConfirm')))) return;
      try {
        await API.del(`/checks/${chk.id}`);
        UI.toast(t('common.deleted'), 'ok');
        load();
      } catch (err) { UI.toast(err.message, 'bad'); }
    };
  }

  // --- the enquiry ------------------------------------------------------------

  // The two digit runs, taken from their code points and never typed out:
  // one dropped glyph inside those ten characters is a silent wrong answer
  // for one digit, and nobody would ever see it happen.
  const digitRun = (first) => String.fromCharCode(...[...Array(10).keys()].map((d) => first + d));
  const AR_DIGITS = digitRun(0x0660);
  const FA_DIGITS = digitRun(0x06f0);

  /**
   * Whatever was typed or pasted, reduced to the digits it means. A serial
   * read off a cheque arrives in the script of whoever typed it, in Arabic
   * indic, Persian or Latin digits, and none of those are the same string.
   */
  function digits(s) {
    return String(s || "")
      .replace(/[\u0660-\u0669]/g, (d) => String(AR_DIGITS.indexOf(d)))
      .replace(/[\u06f0-\u06f9]/g, (d) => String(FA_DIGITS.indexOf(d)))
      .replace(/\D/g, '');
  }

  /** The answer: the whole record of one match, nothing folded away. */
  function hitHtml(c) {
    const facts = [
      [t('chk.type'), t(c.type === 'received' ? 'chk.forMe' : 'chk.fromMe')],
      [t('chk.bank'), [c.bank_name, c.branch_name].filter(Boolean).join(' · ')],
      [t('chk.amount'), UI.money(c.amount_minor)],
      [t('chk.due'), `${UI.formatDate(c.due_date)}${daysText(c) ? ` · ${daysText(c)}` : ''}`],
      [t('chk.note'), c.note],
    ].filter(([, v]) => v);
    return `
      <div class="inq-card" data-tone="${tone(c)}">
        <div class="row between">
          <b>${UI.escapeHtml(c.party_name || t('chk.noParty'))}</b>
          <span class="pill ${PILL[c.status] || 'mute'}">${UI.escapeHtml(t('chk.st_' + c.status))}</span>
        </div>
        <div class="inq-num" dir="ltr">${UI.escapeHtml(c.check_number || '—')}</div>
        ${facts.map(([k, v]) => `<div class="inq-row"><span>${UI.escapeHtml(k)}</span>`
          + `<b>${UI.escapeHtml(String(v))}</b></div>`).join('')}
        ${c.party_id ? `<a class="btn secondary sm" href="party.html?id=${c.party_id}">${UI.escapeHtml(t('party.title'))}</a>` : ''}
        ${c.image_url ? `<button class="btn secondary sm" data-see="${c.id}" type="button">${UI.escapeHtml(t('att.view'))}</button>` : ''}
      </div>`;
  }

  function openInquiry() {
    const sheet = UI.modal(t('chk.inquiry'), `
      <div class="stack">
        <div class="muted" style="font-size:13px">${UI.escapeHtml(t('chk.inquiryHint'))}</div>
        <label class="fld">
          <span class="lbl">${UI.escapeHtml(t('chk.number'))}</span>
          <input id="q-num" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" dir="ltr" />
        </label>
        <button class="btn" id="q-go" type="button">${UI.escapeHtml(t('chk.inquiryBtn'))}</button>
        <div id="q-out"></div>
      </div>`);
    const input = sheet.el.querySelector('#q-num');
    const out = sheet.el.querySelector('#q-out');

    const ask = () => {
      const q = digits(input.value);
      if (!q) { out.innerHTML = ''; return; }
      // A part of the number is enough: nobody learns a serial off by heart.
      // The search ignores the filters on screen — an enquiry asks the book.
      const hits = rows.filter((c) => digits(c.check_number).includes(q));
      out.innerHTML = hits.length
        ? `<div class="muted" style="font-size:12px">${UI.escapeHtml(t('chk.inquiryFound', { n: UI.num(hits.length) }))}</div>`
          + hits.map(hitHtml).join('')
          + `<button class="btn secondary sm" data-x="copy" type="button">${UI.escapeHtml(t('chk.inquiryCopy'))}</button>`
        : `<div class="muted" style="font-size:13px">${UI.escapeHtml(t('chk.inquiryNone'))}</div>`;
      const copy = out.querySelector('[data-x="copy"]');
      if (copy) {
        copy.onclick = async () => {
          const ok = await UI.copyText(hits.map((c) => c.check_number).join('\n'));
          UI.toast(ok ? t('chk.inquiryCopied') : t('rep.copyFail'), ok ? 'ok' : 'bad');
        };
      }
      out.querySelectorAll('[data-see]').forEach((b) => {
        b.onclick = () => {
          const hit = hits.find((c) => String(c.id) === b.dataset.see);
          if (hit) Attach.view(hit.image_url);
        };
      });
    };

    input.addEventListener('input', ask);
    sheet.el.querySelector('#q-go').onclick = ask;
    input.focus();
  }

  listEl.addEventListener('click', (e) => {
    const thumb = e.target.closest('[data-view]');
    if (thumb) {
      e.stopPropagation();
      const host = thumb.closest('[data-chk]');
      const hit = host && rows.find((c) => c.id === Number(host.dataset.chk));
      if (hit) Attach.view(hit.image_url);
      return;
    }
    const el = e.target.closest('[data-chk]');
    if (!el) return;
    const chk = rows.find((c) => c.id === Number(el.dataset.chk));
    if (chk) openSheet(chk);
  });

  // The bar, the two tiles, the summary rows, the month arrows.
  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b) return;                       // «home» is a link, not a filter
    // Tapping the lit side again is the way back to the whole book.
    fType = fType === b.dataset.type ? '' : b.dataset.type;
    render();
  });
  archiveBtn.addEventListener('click', () => {
    fState = fState === 'archive' ? 'live' : 'archive';
    render();
  });
  inquiryBtn.addEventListener('click', openInquiry);
  bothBtn.addEventListener('click', () => { fType = ''; render(); });
  statsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-side]');
    if (!b) return;
    // The lit row lets go when pressed, so the card filters and never traps.
    fType = (fType === b.dataset.side && fState === 'live') ? '' : b.dataset.side;
    fState = 'live';
    render();
  });

  document.getElementById('m-prev').addEventListener('click', () => stepMonth(-1));
  document.getElementById('m-next').addEventListener('click', () => stepMonth(1));
  monthAllEl.addEventListener('click', () => { month = null; render(); });

  document.getElementById('fab').addEventListener('click', async () => {
    const saved = await CheckForm.open(null);
    if (saved) load();
  });

  // A language flip changes the calendar the cursor is written in, so the month
  // navigator starts over on today rather than showing a month that means
  // something else in the other calendar.
  global.addEventListener('dh:render', () => {
    if (monthLang && monthLang !== global.I18n.lang()) { month = null; monthLang = null; }
    if (month) monthLang = global.I18n.lang();
    render();
  });

  // Painted before the first answer arrives: the tile labels, the bar and the
  // blank screen are written by this file, so they must not wait for the server.
  render();
  load();
})(window);

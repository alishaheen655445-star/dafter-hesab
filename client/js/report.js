// -----------------------------------------------------------------------------
//  report.js — printable reports (Phase 5).
//  The server sends the NUMBERS (/api/reports/*), this screen lays them out as a
//  paper sheet, and the browser makes the PDF through Print -> Save as PDF.
//  That is on purpose: Arabic/Persian shaping and Jalali dates are already
//  perfect here, no PDF library, no embedded font, and it keeps working offline.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  if (!Auth.require()) return;

  const t = (k, v) => global.I18n.t(k, v);
  const esc = global.UI.escapeHtml;
  const money = (m, opt) => global.UI.money(m, opt);

  const sheetEl = document.getElementById('sheet');
  const kindBar = document.getElementById('kinds');
  const partySel = document.getElementById('party');
  const wrapParty = document.getElementById('wrap-party');
  const wrapRange = document.getElementById('wrap-range');
  const fromEl = document.getElementById('from');
  const toEl = document.getElementById('to');
  const printBar = document.getElementById('print-bar');
  const printBtn = document.getElementById('btn-print');
  const copyBtn = document.getElementById('btn-copy');
  const genAtEl = document.getElementById('gen-at');
  const hintEl = document.getElementById('pdf-hint');
  const runBtn = document.getElementById('btn-run');

  const params = new URLSearchParams(location.search);
  const wantedParty = Number(params.get('party_id') || 0);

  const state = {
    kind: wantedParty ? 'party' : 'book',
    report: null,
    parties: [],
  };

  function shellBar() {
    UI.shell({ active: 'home', title: t('rep.title'), ico: 'doc-edit', back: true });
  }
  shellBar();

  // --- little building blocks ------------------------------------------------

  const moneyFields = [
    ['bank_name', 'party.bankName'],
    ['card_number', 'party.card'],
    ['account_number', 'party.account'],
    ['iban', 'party.iban'],
    ['branch', 'party.branch'],
    ['account_holder', 'party.holder'],
  ];

  function headBlock(title, sub) {
    const u = (state.report && state.report.user) || {};
    return `
      <div class="rp-head">
        <div>
          <div class="rp-title">${esc(t('app.name'))}</div>
          <div class="rp-sub">${esc(title)}</div>
        </div>
        <div class="rp-who">
          <div>${esc(u.name || '')}${u.phone ? ' · ' + esc(u.phone) : ''}</div>
          <div>${esc(sub)}</div>
        </div>
      </div>`;
  }

  function footerBlock() {
    const u = (state.report && state.report.user) || {};
    return `
      <div class="rp-foot">
        ${u.footer_text ? `<div class="rp-note">${esc(u.footer_text)}</div>` : ''}
        <div class="rp-stamp">${esc(t('app.name'))} — ${esc(t('app.tagline'))}</div>
      </div>`;
  }

  const rangeText = (r) => {
    const from = r.range && r.range.from;
    const to = r.range && r.range.to;
    if (!from && !to) return t('rep.allRange');
    return `${from ? UI.formatDate(from) : '…'} — ${to ? UI.formatDate(to) : '…'}`;
  };

  // --- party statement -------------------------------------------------------

  function statementHtml(r) {
    const p = r.party || {};
    const rows = r.rows || [];
    const totals = r.totals || {};
    const bank = r.bank || {};
    const bankLine = moneyFields
      .map(([f, key]) => (bank[f] ? `<span>${esc(t(key))}: <b>${esc(bank[f])}</b></span>` : ''))
      .filter(Boolean)
      .join('');
    const notes = (r.notes || []).map((n) => `<li>${esc(n.note)}</li>`).join('');

    const body = rows.length
      ? rows.map((x) => `
        <tr>
          <td class="rp-date">${esc(UI.formatDate(x.txn_date))}</td>
          <td>${x.description ? esc(x.description) : '<span class="rp-dim">' + esc(t(x.type === 'credit' ? 'money.credit' : 'money.debit')) + '</span>'}${x.image_url ? ` <span class="rp-dim">${UI.icon('image', 'xs')}</span>` : ''}</td>
          <td class="rp-kind ${x.type}">${esc(t(x.type === 'credit' ? 'money.credit' : 'money.debit'))}</td>
          <td class="rp-num ${x.type}">${x.type === 'credit' ? '+' : '−'} ${esc(money(x.amount_minor, { withUnit: false }))}</td>
          <td class="rp-num">${esc(money(x.running_balance_minor, { signed: true, withUnit: false }))}</td>
        </tr>`).join('')
      : `<tr><td colspan="5" class="rp-dim center">${esc(t('rep.noRows'))}</td></tr>`;

    const windowed = !!(r.range && (r.range.from || r.range.to));

    return `
      <div class="report-sheet">
        ${headBlock(t('rep.partyReport'), `${t('rep.generated')}: ${esc(UI.formatDateTime(r.generated_at))}`)}

        <div class="rp-box">
          <div class="rp-party">${esc(p.name || '')}</div>
          <div class="rp-line">${p.phone ? esc(p.phone) + ' · ' : ''}${esc(t('txn.count', { n: UI.num(p.txn_count || 0) }))}</div>
          ${p.note ? `<div class="rp-line rp-dim">${esc(p.note)}</div>` : ''}
          <div class="rp-line"><b>${esc(t('money.balance'))}: ${esc(money(p.balance_minor, { signed: true }))}</b></div>
          ${bankLine ? `<div class="rp-bank">${bankLine}</div>` : ''}
        </div>

        ${notes ? `<div class="rp-box"><div class="rp-h">${esc(t('party.notes'))}</div><ul class="rp-ul">${notes}</ul></div>` : ''}

        <div class="rp-line rp-range">${esc(t('rep.range'))}: ${esc(rangeText(r))}</div>

        <table class="rp-table">
          <thead>
            <tr>
              <th>${esc(t('rep.date'))}</th>
              <th>${esc(t('rep.desc'))}</th>
              <th>${esc(t('txn.type'))}</th>
              <th>${esc(t('rep.amount'))}</th>
              <th>${esc(t('txn.running'))}</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>

        <div class="rp-totals">
          <div><span>${esc(t('money.totalCredit'))}</span><b>${esc(money(totals.credit_minor))}</b></div>
          <div><span>${esc(t('money.totalDebit'))}</span><b>${esc(money(totals.debit_minor))}</b></div>
          ${windowed ? `<div><span>${esc(t('txn.windowBalance'))}</span><b>${esc(money(totals.window_balance_minor, { signed: true }))}</b></div>` : ''}
          <div class="rp-final"><span>${esc(t('money.balance'))}</span><b>${esc(money(totals.balance_minor, { signed: true }))}</b></div>
        </div>

        ${footerBlock()}
      </div>`;
  }

  // --- whole book ------------------------------------------------------------

  function bookHtml(r) {
    const totals = r.totals || {};
    const parties = (r.parties || []).slice().sort((a, b) => Number(b.balance_minor) - Number(a.balance_minor));
    const rows = parties.length
      ? parties.map((p) => `
        <tr>
          <td>${esc(p.name)}</td>
          <td class="rp-dim">${esc(p.phone || '')}</td>
          <td class="rp-num">${esc(UI.num(p.txn_count))}</td>
          <td class="rp-num credit">${esc(money(p.credit_minor, { withUnit: false }))}</td>
          <td class="rp-num debit">${esc(money(p.debit_minor, { withUnit: false }))}</td>
          <td class="rp-num"><b>${esc(money(p.balance_minor, { signed: true, withUnit: false }))}</b></td>
        </tr>`).join('')
      : `<tr><td colspan="6" class="rp-dim center">${esc(t('party.empty'))}</td></tr>`;

    const tile = (key, value) => `
      <div class="rp-tile"><span>${esc(t(key))}</span><b>${esc(value)}</b></div>`;

    return `
      <div class="report-sheet">
        ${headBlock(t('rep.bookReport'), `${t('rep.generated')}: ${esc(UI.formatDateTime(r.generated_at))}`)}

        <div class="rp-tiles">
          ${tile('rep.partyCount', UI.num(totals.party_count))}
          ${tile('money.totalCredit', money(totals.credit_minor))}
          ${tile('money.totalDebit', money(totals.debit_minor))}
          ${tile('money.balance', money(totals.balance_minor, { signed: true }))}
          ${tile('rep.pendingChecks', `${money(totals.pending_checks_minor, { signed: true })} · ${UI.num(totals.pending_check_count)}`)}
          ${tile('rep.loansRemaining', `${money(totals.loans_remaining_minor, { signed: true })} · ${UI.num(totals.open_loan_count)}`)}
        </div>

        <table class="rp-table">
          <thead>
            <tr>
              <th>${esc(t('party.name'))}</th>
              <th>${esc(t('party.phone'))}</th>
              <th>${esc(t('party.txnCount'))}</th>
              <th>${esc(t('money.credit'))}</th>
              <th>${esc(t('money.debit'))}</th>
              <th>${esc(t('money.balance'))}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        ${footerBlock()}
      </div>`;
  }

  // --- rendering -------------------------------------------------------------

  function render() {
    if (!state.report) { sheetEl.innerHTML = ''; return; }
    sheetEl.innerHTML = state.report.kind === 'book_summary'
      ? bookHtml(state.report)
      : statementHtml(state.report);
    printBar.hidden = false;
    hintEl.hidden = false;
    // An Android WebView has no print dialog: window.print() would sit there doing
    // nothing. The packaged app therefore offers the sheet as text instead, and the
    // hint swaps to match. render() runs again on every language flip, so the
    // data-i18n attribute (not the text) is what gets changed here.
    const native = global.Config.isNative;
    printBtn.hidden = native;
    copyBtn.hidden = !native;
    hintEl.setAttribute('data-i18n', native ? 'rep.nativeHint' : 'rep.printHint');
    genAtEl.textContent = `${t('rep.generated')}: ${UI.formatDateTime(state.report.generated_at)}`;
  }

  function paintKind() {
    kindBar.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.kind === state.kind));
    wrapParty.hidden = state.kind !== 'party';
    wrapRange.hidden = state.kind !== 'party';
  }

  // --- data ------------------------------------------------------------------

  async function loadParties() {
    try {
      const res = await API.get('/parties');
      state.parties = res.data.parties || [];
      const chosen = wantedParty && state.parties.some((p) => p.id === wantedParty) ? wantedParty : '';
      partySel.innerHTML = state.parties.map((p) => (
        `<option value="${p.id}"${p.id === Number(chosen) ? ' selected' : ''}>${esc(p.name)}</option>`
      )).join('');
      if (!state.parties.length) {
        partySel.innerHTML = `<option value="">${esc(t('party.empty'))}</option>`;
      }
    } catch (err) {
      UI.toast(err.message, 'bad');
    }
  }

  async function run() {
    paintKind();
    if (state.kind === 'party' && !partySel.value) {
      partySel.focus();
      return UI.toast(t('rep.noPartyAtAll'), 'bad');
    }
    runBtn.disabled = true;
    try {
      let path = state.kind === 'party' ? `/reports/party/${Number(partySel.value)}` : '/reports/book';
      if (state.kind === 'party') {
        const q = [];
        if (fromEl.value) q.push(`from=${fromEl.value}`);
        if (toEl.value) q.push(`to=${toEl.value}`);
        if (q.length) path += `?${q.join('&')}`;
      }
      const res = await API.get(path);
      state.report = res.data.report;
      render();
      I18n.applyDocument();
    } catch (err) {
      UI.toast(err.message, 'bad');
    } finally {
      runBtn.disabled = false;
    }
  }

  // --- actions ---------------------------------------------------------------

  kindBar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    state.kind = b.dataset.kind;
    paintKind();
    if (state.report) run(); // the sheet is already open -> refresh it in place
  });

  partySel.addEventListener('change', () => { if (state.kind === 'party') run(); });
  fromEl.addEventListener('change', () => { paintRange(); if (state.report) run(); });
  toEl.addEventListener('change', () => { paintRange(); if (state.report) run(); });

  // The native pickers are Gregorian; the line under each one says the same day
  // the way this language reads it, so a Jalali user can filter by a date they
  // actually recognise.
  function paintRange() {
    wrapRange.querySelectorAll('.date-preview').forEach((p, i) => {
      const v = i === 0 ? fromEl.value : toEl.value;
      p.textContent = v ? UI.formatDateLong(v) : '';
    });
  }
  paintRange();

  document.getElementById('btn-clear-range').addEventListener('click', () => {
    fromEl.value = '';
    toEl.value = '';
    paintRange();
    if (state.report) run();
  });

  printBtn.addEventListener('click', () => window.print());

  /** Hand the whole sheet over as plain text (the APK has no printer). */
  copyBtn.addEventListener('click', async () => {
    const text = sheetEl.innerText || sheetEl.textContent || '';
    const ok = await UI.copyText(text);
    UI.toast(ok ? t('rep.copyOk') : t('rep.copyFail'), ok ? 'ok' : 'bad');
  });

  global.addEventListener('dh:render', () => {
    shellBar();
    paintKind();
    paintRange();
    render();
    I18n.applyDocument();
  });

  paintKind();
  // Opening the screen shows a report right away — a blank page prints nothing.
  // With a party in the URL that means its statement, otherwise the book.
  loadParties().then(run);
})(window);

// -----------------------------------------------------------------------------
//  party.js — one طرف حساب: balance, phone, the statement (transactions with a
//  running balance), notes and bank info.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  if (!Auth.require()) return;

  const t = (k, v) => global.I18n.t(k, v);
  const esc = global.UI.escapeHtml;
  const id = Number(new URLSearchParams(location.search).get('id') || 0);

  const pheadEl = document.getElementById('phead');
  const qaEl = document.getElementById('qa');
  const sumsEl = document.getElementById('sums');
  const notesEl = document.getElementById('notes');
  const bankForm = document.getElementById('bank-form');
  const txnCountEl = document.getElementById('txn-count');
  const txnHintEl = document.getElementById('txn-hint');
  const txnsEl = document.getElementById('txns');
  const txnFootEl = document.getElementById('txn-foot');
  const txnMoreEl = document.getElementById('btn-txn-more');
  const filtersEl = document.getElementById('txn-filters');
  // The filter bar is a plain <div>, not a <form>, so the inputs are taken by hand.
  const fFrom = filtersEl.querySelector('[name="from"]');
  const fTo = filtersEl.querySelector('[name="to"]');
  const fType = filtersEl.querySelector('[name="type"]');

  const LIMIT = 20;
  const state = { rows: [], meta: null, page: 1 };

  let data = null; // { party, bank, notes }

  if (!id) { location.replace('home.html'); return; }

  function shellBar() {
    UI.shell({
      active: 'home',
      title: data ? data.party.name : t('party.title'),
      ico: 'user-card',
      back: true,
      // The printed statement lives on its own screen, reachable from the header.
      actionsHtml: `<a class="icon-btn" href="report.html?party_id=${id}" title="${UI.escapeHtml(t('rep.partyReport'))}" aria-label="${UI.escapeHtml(t('rep.partyReport'))}">${UI.icon('doc-edit')}</a>`,
    });
  }

  // --- rendering -------------------------------------------------------------

  /** The gradient card: who this is, and what he is worth right now. */
  function renderHead() {
    const p = data.party;
    const b = UI.balance(p.balance_minor);
    pheadEl.innerHTML = `
      <div class="avatar">${esc(UI.initials(p.name))}</div>
      <div class="grow">
        <div class="nm">${esc(p.name)}</div>
        <div class="ph">${esc(p.phone || '—')}</div>
        ${p.note ? `<div class="nt">${esc(p.note)}</div>` : ''}
      </div>
      <div class="bal">
        <div class="k">${esc(b.label)}</div>
        <div class="v">${b.text}</div>
      </div>`;
  }

  /**
   * The eight one-tap actions under the name, in two rows of four. Call and
   * message are <a href> so the phone dials for real; with no number on the
   * party they dim instead of doing nothing silently.
   */
  function renderQa() {
    const p = data.party;
    const tel = p.phone ? esc(p.phone) : '';
    const tile = (key, ico, label, href = '') => (href
      ? `<a class="qa" href="${href}"><span class="icon-btn">${UI.icon(ico)}</span><span>${esc(label)}</span></a>`
      : `<button class="qa" type="button" data-qa="${key}"><span class="icon-btn">${UI.icon(ico)}</span><span>${esc(label)}</span></button>`);
    // With no number on the file there is nothing to dial, so the tile is dimmed
    // and made unclickable rather than being a button that does nothing.
    const flat = (key, ico, label) =>
      `<button class="qa" type="button" disabled><span class="icon-btn">${UI.icon(ico)}</span><span>${esc(label)}</span></button>`;
    qaEl.innerHTML = [
      p.phone ? tile('call', 'phone', t('party.call'), `tel:${tel}`) : flat('call', 'phone', t('party.call')),
      p.phone ? tile('sms', 'chat', t('ui.msg'), `sms:${tel}`) : flat('sms', 'chat', t('ui.msg')),
      tile('report', 'doc-edit', t('ui.report')),
      tile('remind', 'bell', t('ui.reminder')),
      tile('note', 'note', t('ui.note')),
      // «تسویه حساب» is the paid feature this app simply has.
      tile('settle', 'settle', t('party.settle')),
      tile('edit', 'edit', t('common.edit')),
      tile('del', 'trash', t('common.delete')),
    ].join('');
  }

  /** Gave / took — the two numbers the ledger is really about. */
  function renderSums() {
    const p = data.party;
    sumsEl.innerHTML = `
      <div class="tile credit">
        <div class="k">${esc(t('ui.gave'))}</div>
        <div class="v" style="color:var(--credit)">${UI.money(p.credit_minor, { withUnit: false })}</div>
        <div class="k">${esc(t('cur.' + ((Auth.user() || {}).currency || 'toman')))}</div>
      </div>
      <div class="tile debit">
        <div class="k">${esc(t('ui.got'))}</div>
        <div class="v" style="color:var(--debit)">${UI.money(p.debit_minor, { withUnit: false })}</div>
        <div class="k">${esc(t('cur.' + ((Auth.user() || {}).currency || 'toman')))}</div>
      </div>`;
    txnHintEl.textContent = Number(p.txn_count) === 0 ? t('party.noTxnYet') : '';
  }

  function renderNotes() {
    const notes = data.notes || [];
    notesEl.innerHTML = notes.length
      ? notes.map((n) => `
        <div class="note-item row between">
          <div class="grow">
            <div>${UI.escapeHtml(n.note)}</div>
            <div class="when">${UI.formatDateLong(n.created_at)}</div>
          </div>
          <button class="icon-btn ghost" type="button" data-del-note="${n.id}" aria-label="delete">${UI.icon('x', 'sm')}</button>
        </div>`).join('')
      : `<p class="muted">${t('party.noteEmpty')}</p>`;
  }

  function renderBank() {
    const b = data.bank || {};
    ['bank_name', 'card_number', 'account_number', 'iban', 'branch', 'account_holder']
      .forEach((f) => { bankForm.elements[f].value = b[f] || ''; });
  }

  // --- statement (transactions) ----------------------------------------------

  const filterOn = () => !!(fFrom.value || fTo.value || fType.value);

  function statementQuery() {
    const p = new URLSearchParams();
    if (fFrom.value) p.set('from', fFrom.value);
    if (fTo.value) p.set('to', fTo.value);
    if (fType.value) p.set('type', fType.value);
    p.set('page', state.page);
    p.set('limit', LIMIT);
    return p.toString();
  }

  function txnRowHtml(r) {
    const isCredit = r.type === 'credit';
    const desc = r.description
      ? UI.escapeHtml(r.description)
      : `<span class="muted">${t(isCredit ? 'money.credit' : 'money.debit')}</span>`;
    return `
      <div class="txn-row" data-type="${r.type}" data-txn="${r.id}">
        <div class="txn-main">
          <div class="txn-date">${UI.formatDate(r.txn_date)}${r.image_url ? ` <span class="att-flag">${UI.icon('image', 'xs')}</span>` : ''}</div>
          <div class="txn-desc">${desc}</div>
        </div>
        ${Attach.thumbHtml(r.image_url)}
        <div class="txn-side">
          <div class="amount ${r.type}">${isCredit ? '+' : '−'} ${UI.money(r.amount_minor, { withUnit: false })}</div>
          <div class="txn-bal">${t('txn.running')}: <b>${UI.money(r.running_balance_minor, { signed: true, withUnit: false })}</b></div>
        </div>
      </div>`;
  }

  function renderTxns() {
    const rows = state.rows;
    txnsEl.innerHTML = rows.length
      ? rows.map(txnRowHtml).join('')
      : `<p class="muted">${t('txn.empty')}</p>`;

    const total = state.meta ? Number(state.meta.count) : 0;
    txnCountEl.textContent = state.meta ? t('txn.count', { n: UI.num(total) }) : '';
    txnMoreEl.style.display = rows.length < total ? 'block' : 'none';
    txnMoreEl.textContent = t('txn.more');

    if (!state.meta) { txnFootEl.innerHTML = ''; return; }
    txnFootEl.innerHTML = `
      <span>${t('txn.count', { n: UI.num(total) })}</span>
      ${filterOn() ? `<span>${t('txn.windowBalance')}: <b>${UI.money(state.meta.window_balance_minor, { signed: true })}</b></span>` : ''}`;
  }

  async function loadTxns(reset = true) {
    if (reset) { state.page = 1; state.rows = []; }
    try {
      const res = await API.get(`/parties/${id}/transactions?${statementQuery()}`);
      state.meta = res.meta;
      state.rows = reset ? res.data.transactions : state.rows.concat(res.data.transactions);
      renderTxns();
    } catch (err) {
      state.meta = null;
      UI.toast(err.message, 'bad');
    }
  }

  /** Action sheet when a statement row is tapped. */
  function txnActions(txn) {
    return new Promise((resolve) => {
      const sheet = UI.modal(UI.escapeHtml(txn.description || t('txn.edit')), `
        <div style="display:grid;gap:8px">
          <button class="btn secondary" data-a="edit" type="button">${t('common.edit')}</button>
          ${txn.image_url
            ? `<button class="btn secondary" data-a="view" type="button">${t('att.view')}</button>`
            : ''}
          <button class="btn secondary" data-a="image" type="button">${txn.image_url ? t('att.imageEdit') : t('att.imageAdd')}</button>
          <button class="btn danger" data-a="del" type="button">${t('common.delete')}</button>
          <button class="btn ghost" data-a="x" type="button">${t('common.cancel')}</button>
        </div>`);
      sheet.el.querySelector('[data-a="x"]').onclick = () => { sheet.close(); resolve(null); };
      sheet.el.querySelector('[data-a="edit"]').onclick = () => { sheet.close(); resolve('edit'); };
      sheet.el.querySelector('[data-a="del"]').onclick = () => { sheet.close(); resolve('del'); };
      sheet.el.querySelector('[data-a="image"]').onclick = () => { sheet.close(); resolve('image'); };
      sheet.el.querySelector('[data-a="view"]')?.addEventListener('click', () => {
        sheet.close();
        Attach.view(txn.image_url);
      });
    });
  }

  /**
   * Close this account — the «تسویه حساب» the reference app sells, free here.
   *
   * One entry is added on the other side of the ledger and the balance reads
   * zero. Nothing is deleted and no total is edited behind the history, so the
   * statement still tells the whole story and the closing row can be undone like
   * any other حركة. The date is offered because a settlement is often back-dated
   * to the day the money actually changed hands.
   */
  async function settleSheet() {
    const p = data.party;
    const amount = Math.abs(Number(p.balance_minor));
    if (!amount) { UI.toast(t('party.settledAlready'), 'ok'); return; }

    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const sheet = UI.modal(t('party.settle'), `
      <p class="muted" style="margin:0 0 6px">${esc(t('party.settleBody', {
        side: UI.balance(p.balance_minor).label,
        amount: UI.money(amount),
      }))}</p>
      <p class="muted" style="margin:0 0 12px;font-size:12px">${esc(t('party.settleNote'))}</p>
      <label class="fld">
        <span class="lbl">${esc(t('txn.date'))}</span>
        <input type="date" name="txn_date" value="${today}" />
        <span class="date-preview"></span>
      </label>
      <div class="row">
        <button class="btn secondary" data-x="no" type="button">${esc(t('common.cancel'))}</button>
        <button class="btn" data-x="yes" type="button">${esc(t('party.settleBtn'))}</button>
      </div>`);

    const dateEl = sheet.el.querySelector('[name="txn_date"]');
    const preview = sheet.el.querySelector('.date-preview');
    const paintPreview = () => { preview.textContent = dateEl.value ? UI.formatDateLong(dateEl.value) : ''; };
    dateEl.addEventListener('change', paintPreview);
    paintPreview();

    sheet.el.querySelector('[data-x="no"]').onclick = () => sheet.close();
    sheet.el.querySelector('[data-x="yes"]').onclick = async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const res = await API.post(`/parties/${id}/settle`, {
          txn_date: dateEl.value || undefined,
          // The wording is chosen here, in the language the user is reading in —
          // the server only stores what it is given.
          description: t('party.settleDesc'),
        });
        sheet.close();
        UI.toast(t('party.settled', { amount: UI.money(Math.abs(Number(res.data.closed_minor || 0))) }), 'ok');
        refreshAfterTxn(res.data.party);
      } catch (err) {
        UI.toast(err.message, 'bad');
        btn.disabled = false;
      }
    };
  }

  /** After any ledger change: refresh the party totals and the statement. */
  function refreshAfterTxn(partyRow) {
    if (!partyRow) { load(); loadTxns(); return; }
    data.party = partyRow;
    render();
    loadTxns();
  }

  function render() {
    if (!data) return;
    renderHead();
    renderQa();
    renderSums();
    renderNotes();
    renderBank();
    renderTxns();
    shellBar();
    paintFilterToggle();
    I18n.applyDocument();
  }

  // --- data ------------------------------------------------------------------

  async function load() {
    try {
      const res = await API.get(`/parties/${id}`);
      data = res.data;
      render();
    } catch (err) {
      UI.toast(err.message, 'bad');
      if (err.status === 404) setTimeout(() => location.replace('home.html'), 900);
    }
  }

  load();
  loadTxns();

  // --- actions ---------------------------------------------------------------

  /** The quick-action row: everything except call/message, which are real links. */
  qaEl.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-qa]');
    if (!b) return;
    const act = b.dataset.qa;
    if (act === 'report') { location.href = `report.html?party_id=${id}`; return; }
    if (act === 'edit') {
      const saved = await PartyForm.open(data.party);
      if (saved) load();
      return;
    }
    if (act === 'note') { addNote(); return; }
    if (act === 'settle') { settleSheet(); return; }
    if (act === 'remind') {
      // A draft, not a row: the party is already picked for the user.
      const saved = await RemForm.open({ party_id: id });
      if (saved) UI.toast(t('common.saved'), 'ok');
      return;
    }
    if (act === 'del') {
      if (!(await UI.confirmBox(t('party.delete'), t('party.deleteConfirm')))) return;
      try {
        await API.del(`/parties/${id}`);
        UI.toast(t('common.deleted'), 'ok');
        location.replace('home.html');
      } catch (err) { UI.toast(err.message, 'bad'); }
    }
  });

  // The two FABs: one sheet, started on the right side.
  const addTxn = (type) => TxnForm.open(id, null, type).then((saved) => {
    if (saved) refreshAfterTxn(saved.party);
  });
  document.getElementById('btn-gave').addEventListener('click', () => addTxn('credit'));
  document.getElementById('btn-got').addEventListener('click', () => addTxn('debit'));

  function addNote() {
    const sheet = UI.modal(t('party.noteAdd'), `
      <form id="note-form">
        <div class="fld tall"><span class="lbl">${esc(t('party.noteText'))}</span>
          <textarea name="note" maxlength="5000" required></textarea>
          <em class="err-text" data-err-for="note"></em>
        </div>
        <div class="row">
          <button type="button" class="btn secondary" data-x="cancel">${t('common.cancel')}</button>
          <button type="submit" class="btn">${t('common.save')}</button>
        </div>
      </form>`, { onOpen: (el) => el.querySelector('textarea').focus() });

    const form = sheet.el.querySelector('#note-form');
    form.querySelector('[data-x="cancel"]').onclick = () => sheet.close();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const note = UI.value(form, 'note');
      if (!note) return UI.showFieldErrors(form, { note: t('common.required') });
      try {
        await API.post(`/parties/${id}/notes`, { note });
        sheet.close();
        UI.toast(t('common.saved'), 'ok');
        load();
      } catch (err) {
        UI.showFieldErrors(form, err.fields || {});
        UI.toast(err.message, 'bad');
      }
    });
  }

  // The note can be added from the quick-action row or from the section header.
  document.getElementById('btn-add-note').addEventListener('click', addNote);

  notesEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-del-note]');
    if (!btn) return;
    if (!(await UI.confirmBox(t('common.delete'), ''))) return;
    try {
      await API.del(`/parties/${id}/notes/${btn.dataset.delNote}`);
      UI.toast(t('common.deleted'), 'ok');
      load();
    } catch (err) { UI.toast(err.message, 'bad'); }
  });

  // --- statement actions -------------------------------------------------------

  txnsEl.addEventListener('click', async (e) => {
    // A thumbnail tap is "show me the picture", not "open the row".
    const thumb = e.target.closest('[data-view]');
    if (thumb) {
      e.stopPropagation();
      const rowImg = thumb.closest('[data-txn]');
      const hit = rowImg && state.rows.find((r) => String(r.id) === rowImg.dataset.txn);
      if (hit) Attach.view(hit.image_url);
      return;
    }
    const row = e.target.closest('[data-txn]');
    if (!row) return;
    const txn = state.rows.find((r) => String(r.id) === row.dataset.txn);
    if (!txn) return;
    const action = await txnActions(txn);
    if (action === 'edit') {
      const saved = await TxnForm.open(id, txn);
      if (saved) refreshAfterTxn(saved.party);
    } else if (action === 'image') {
      if (await Attach.editTxnImage(id, txn)) loadTxns();
    } else if (action === 'del') {
      if (!(await UI.confirmBox(t('common.delete'), t('txn.deleteConfirm')))) return;
      try {
        const res = await API.del(`/parties/${id}/transactions/${txn.id}`);
        UI.toast(t('common.deleted'), 'ok');
        refreshAfterTxn(res.data.party);
      } catch (err) { UI.toast(err.message, 'bad'); }
    }
  });

  // Filters are live: change -> refetch page 1 of the statement.
  filtersEl.addEventListener('change', () => loadTxns());

  // The bar is collapsed by default — the ledger gets the screen space.
  const filterToggle = document.getElementById('btn-txn-filter');
  function paintFilterToggle() {
    const open = filtersEl.classList.contains('open');
    filterToggle.className = `btn sm ${open ? 'secondary' : 'ghost'}`;
  }
  filterToggle.addEventListener('click', () => { filtersEl.classList.toggle('open'); paintFilterToggle(); });

  document.getElementById('btn-clear-filter').addEventListener('click', () => {
    fFrom.value = ''; fTo.value = ''; fType.value = '';
    loadTxns();
  });
  txnMoreEl.addEventListener('click', () => { state.page += 1; loadTxns(false); });

  bankForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {};
    ['bank_name', 'card_number', 'account_number', 'iban', 'branch', 'account_holder']
      .forEach((f) => { payload[f] = UI.value(bankForm, f); });
    try {
      const res = await API.put(`/parties/${id}/bank`, payload);
      data.bank = res.data.bank;
      UI.toast(t('common.saved'), 'ok');
    } catch (err) {
      UI.showFieldErrors(bankForm, err.fields || {});
      UI.toast(err.message, 'bad');
    }
  });

  global.addEventListener('dh:render', render);
})(window);

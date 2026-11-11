// -----------------------------------------------------------------------------
//  loans.js — the قروض/أقساط screen.
//  The list shows what is still owed on each loan; tapping one opens its full
//  installment schedule, where ticking a row marks that installment paid.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  if (!Auth.require()) return;

  const t = (k, v) => global.I18n.t(k, v);
  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const statsEl = document.getElementById('stats');
  const countEl = document.getElementById('count');
  const segType = document.getElementById('seg-type');
  const segState = document.getElementById('seg-state');

  let rows = [];               // every loan of the book, as the server sent it
  let fType = '';              // '' | received | given
  let fState = 'active';       // '' | active | completed | cancelled

  const PILL = { active: 'info', completed: 'ok', cancelled: 'mute' };

  // Same as checks: reached from the indigo tile, so the home tab stays lit.
  function shellBar() {
    UI.shell({ active: 'home', title: t('loan.title'), ico: 'wallet' });
  }
  shellBar();

  // --- rendering -------------------------------------------------------------

  // received = I took the money (a debt on me) · given = I lent it (a credit to me).
  function tone(l) {
    if (l.status !== 'active') return 'done';
    if (l.is_overdue) return 'warn';
    return l.type === 'received' ? 'debit' : 'credit';
  }

  function subText(l) {
    const bits = [UI.formatDate(l.start_date)];
    bits.push(t('loan.progress', { paid: UI.num(l.paid_installments), total: UI.num(l.total_installments) }));
    if (l.status === 'active' && l.next_due_date) {
      bits.push(`${t('loan.next')}: ${UI.formatDate(l.next_due_date)}${l.is_overdue ? ` · ${t('loan.overdue')}` : ''}`);
    }
    return bits.join(' · ');
  }

  function rowHtml(l) {
    return `
      <div class="item-row" data-tone="${tone(l)}" data-loan="${l.id}">
        <div class="item-main">
          <div class="item-title">${UI.escapeHtml(l.party_name || t('loan.noParty'))}</div>
          <div class="item-sub">${UI.escapeHtml(subText(l))}</div>
          <div class="progress"><i style="width:${l.progress_percent}%"></i></div>
        </div>
        <div class="item-side">
          <div class="amount ${l.type === 'received' ? 'debit' : 'credit'}">${UI.money(l.remaining_minor)}</div>
          <div class="item-sub">${t('loan.remaining')}</div>
          <div style="margin-top:4px"><span class="pill ${PILL[l.status] || 'mute'}">${t('loan.st_' + l.status)}</span></div>
        </div>
      </div>`;
  }

  function visible() {
    return rows.filter((l) => {
      if (fType && l.type !== fType) return false;
      if (fState && l.status !== fState) return false;
      return true;
    });
  }

  /**
   * The card describes the WHOLE book, not the slice on screen — the two numbers
   * a loan book is asked about are what is still owed in each direction.
   */
  function renderStats() {
    const sum = (fn) => rows.filter(fn).reduce((s, l) => s + Number(l.remaining_minor), 0);
    const overdue = rows.filter((l) => l.is_overdue).length;
    statsEl.innerHTML = `
      <div class="sgrid">
        <div>
          <div class="k">${t('loan.totalOnMe')}</div>
          <div class="v">${UI.money(sum((l) => l.status === 'active' && l.type === 'received'), { withUnit: false })}</div>
          <div class="k">${t('cur.' + ((Auth.user() || {}).currency || 'toman'))}</div>
        </div>
        <div>
          <div class="k">${t('loan.totalForMe')}</div>
          <div class="v">${UI.money(sum((l) => l.status === 'active' && l.type === 'given'), { withUnit: false })}</div>
          <div class="k">${t('cur.' + ((Auth.user() || {}).currency || 'toman'))}</div>
        </div>
      </div>
      ${overdue ? `<div class="chips"><span class="chip warn">${t('loan.overdue')} ${UI.num(overdue)}</span></div>` : ''}`;
  }

  function render() {
    const shown = visible();
    listEl.innerHTML = shown.map(rowHtml).join('');
    emptyEl.hidden = shown.length > 0;
    countEl.textContent = t('loan.countN', { n: UI.num(shown.length) });
    renderStats();
    shellBar();
    I18n.applyDocument();
  }

  // --- data ------------------------------------------------------------------

  async function load() {
    try {
      // One call for the whole book: the two segmented controls then react
      // without a round trip, and the summary above never changes under a tap.
      const res = await API.get('/loans');
      rows = res.data.loans || [];
      render();
    } catch (err) {
      UI.toast(err.message, 'bad');
    }
  }

  // --- the installment sheet --------------------------------------------------

  function instHtml(i) {
    const paid = Number(i.paid) === 1;
    const when = paid && i.paid_date
      ? `${t('loan.paidOn')} ${UI.formatDate(i.paid_date)}`
      : UI.formatDate(i.due_date);
    return `
      <label class="inst-row${paid ? ' is-paid' : ''}">
        <input type="checkbox" class="tick" data-inst="${i.id}"${paid ? ' checked' : ''} />
        <div class="grow">
          <div>${t('loan.instN', { n: UI.num(i.installment_number) })} — ${UI.money(i.amount_minor)}</div>
          <div class="inst-when">${UI.escapeHtml(when)}</div>
        </div>
      </label>`;
  }

  async function showLoan(loan) {
    let data;
    try {
      const res = await API.get(`/loans/${loan.id}`);
      data = res.data;
    } catch (err) {
      UI.toast(err.message, 'bad');
      return null;
    }
    const l = data.loan;
    const sheet = UI.modal(l.party_name || t('loan.title'), `
      <div class="stack">
        <dl class="kv">
          <dt>${t('loan.principal')}</dt><dd>${UI.money(l.principal_minor)}</dd>
          <dt>${t('loan.paid')}</dt><dd>${UI.money(l.paid_minor)}</dd>
          <dt>${t('loan.remaining')}</dt><dd><b>${UI.money(l.remaining_minor)}</b></dd>
          <dt>${t('loan.monthly')}</dt><dd>${UI.money(l.monthly_payment_minor)}</dd>
          <dt>${t('loan.status')}</dt><dd><span class="pill ${PILL[l.status] || 'mute'}">${t('loan.st_' + l.status)}</span></dd>
          ${l.note ? `<dt>${t('loan.note')}</dt><dd>${UI.escapeHtml(l.note)}</dd>` : ''}
        </dl>
        <div class="progress"><i style="width:${l.progress_percent}%"></i></div>
        <div class="section-title"><span>${t('loan.schedule')}</span></div>
        <div>${data.installments.map(instHtml).join('')}</div>
        ${l.party_id ? `<a class="btn secondary" href="party.html?id=${l.party_id}">${t('party.title')}</a>` : ''}
        <button class="btn secondary" data-x="edit" type="button">${t('common.edit')}</button>
        <button class="btn danger" data-x="del" type="button">${t('common.delete')}</button>
        <button class="btn ghost" data-x="close" type="button">${t('common.close')}</button>
      </div>`);

    sheet.el.querySelectorAll('[data-inst]').forEach((box) => {
      box.addEventListener('change', async () => {
        box.disabled = true;
        try {
          const res = await API.put(`/loans/${l.id}/installments/${box.dataset.inst}`, { paid: box.checked });
          UI.toast(box.checked ? t('loan.pay') : t('loan.unpay'), 'ok');
          data = res.data;
          sheet.close();
          await showLoan(data.loan);
          load();
        } catch (err) {
          UI.toast(err.message, 'bad');
          box.disabled = false;
        }
      });
    });

    sheet.el.querySelector('[data-x="close"]').onclick = () => sheet.close();
    sheet.el.querySelector('[data-x="edit"]').onclick = async () => {
      sheet.close();
      const saved = await LoanForm.open(l);
      if (saved) load();
    };
    sheet.el.querySelector('[data-x="del"]').onclick = async () => {
      sheet.close();
      if (!(await UI.confirmBox(t('common.delete'), t('loan.deleteConfirm')))) return;
      try {
        await API.del(`/loans/${l.id}`);
        UI.toast(t('common.deleted'), 'ok');
        load();
      } catch (err) { UI.toast(err.message, 'bad'); }
    };
    return sheet;
  }

  listEl.addEventListener('click', (e) => {
    const el = e.target.closest('[data-loan]');
    if (!el) return;
    const loan = rows.find((l) => l.id === Number(el.dataset.loan));
    if (loan) showLoan(loan);
  });

  document.getElementById('fab').addEventListener('click', async () => {
    const saved = await LoanForm.open(null);
    if (saved) load();
  });

  // The two segmented rows: side of the book, and state of the loan.
  function wireSeg(el, key, apply) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest(`[data-${key}]`);
      if (!b) return;
      el.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      apply(b.dataset[key]);
    });
  }
  wireSeg(segType, 'type', (v) => { fType = v; render(); });
  wireSeg(segState, 'state', (v) => { fState = v; render(); });

  global.addEventListener('dh:render', render);

  load();
})(window);

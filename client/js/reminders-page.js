// -----------------------------------------------------------------------------
//  reminders-page.js — the bell tab: what has to be remembered, and when.
//
//  The three segments are NOT three tables. «الأطراف» is the reminders the user
//  wrote by hand; «القروض» and «الصكوك» are due dates the ledger already knows
//  (the next unpaid installment of every running loan, the maturity of every
//  open check). Reading them from /loans and /checks means this screen can
//  never disagree with the screens it summarises.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  if (!Auth.require()) return;

  const t = (k, v) => global.I18n.t(k, v);
  const esc = UI.escapeHtml;
  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const emptyTextEl = document.getElementById('empty-text');
  const segEl = document.getElementById('seg');
  const fabEl = document.getElementById('fab');

  let seg = 'party';
  let rems = [];
  let loans = [];
  let checks = [];

  function shellBar() {
    UI.shell({ active: 'reminders', title: t('rem.title'), ico: 'bell' });
  }
  shellBar();

  // --- time helpers ----------------------------------------------------------

  /** 'YYYY-MM-DD HH:MM:SS' -> local Date, without the browser guessing a zone. */
  function toLocal(v) {
    const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!m) return new Date(v);
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  }

  /** Whole days from today to that stamp: 0 today, 1 tomorrow, -2 two days ago. */
  function dayGap(v) {
    const d = toLocal(v);
    const today = new Date();
    const strip = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    return Math.round((strip(d) - strip(today)) / 86400000);
  }

  function whenText(r) {
    if (Number(r.sent)) return t('rem.done');
    const gap = dayGap(r.remind_at);
    if (gap < 0 || r.is_due) return t('rem.dueNow');
    if (gap === 0) return t('rem.today');
    if (gap === 1) return t('rem.tomorrow');
    if (gap <= 30) return t('rem.inDays', { n: UI.num(gap) });
    return UI.formatDateTime(r.remind_at);
  }

  // --- rendering -------------------------------------------------------------

  function remHtml(r) {
    const tone = Number(r.sent) ? 'sent' : (r.is_due ? 'due' : 'next');
    return `
      <div class="rem-card" data-tone="${tone}" data-rem="${r.id}">
        <div class="ico-chip ${tone === 'sent' ? '' : 'blue'}">${UI.icon(tone === 'sent' ? 'badge-check' : 'bell')}</div>
        <div class="grow">
          <div class="rem-title">${esc(r.title)}</div>
          ${r.message ? `<div class="rem-msg">${esc(r.message)}</div>` : ''}
          <div class="rem-msg">${esc(r.party_name || t('rem.noParty'))} · ${esc(UI.formatDateTime(r.remind_at))}</div>
        </div>
        <div style="display:grid;justify-items:end;gap:4px">
          <div class="rem-when">${esc(whenText(r))}</div>
          <button class="icon-btn ghost" type="button" data-menu="${r.id}" aria-label="menu">${UI.icon('dots', 'sm')}</button>
        </div>
      </div>`;
  }

  /** One derived row: an entity that is due, with no reminder written for it. */
  function dueHtml({ href, tone, ico, title, sub, side }) {
    return `
      <a class="item-row" href="${href}" data-tone="${tone}" style="text-decoration:none;color:inherit">
        <div class="ico-chip ${tone === 'warn' ? '' : 'blue'}">${UI.icon(ico)}</div>
        <div class="item-main">
          <div class="item-title">${esc(title)}</div>
          <div class="item-sub">${esc(sub)}</div>
        </div>
        <div class="item-side" style="text-align:end">
          <div class="amount">${esc(side)}</div>
        </div>
      </a>`;
  }

  function loanHtml(l) {
    const gap = dayGap(l.next_due_date);
    const when = gap < 0 ? t('loan.overdue') : gap === 0 ? t('chk.dueToday')
      : gap <= 7 ? t('chk.soon') : t('chk.daysLeft', { n: UI.num(gap) });
    return dueHtml({
      href: `loans.html`,
      tone: l.is_overdue ? 'warn' : 'credit',
      ico: 'wallet',
      title: l.party_name || t('loan.noParty'),
      sub: `${t('loan.next')} · ${UI.formatDate(l.next_due_date)} · ${when}`,
      side: UI.money(l.monthly_payment_minor, { withUnit: false }),
    });
  }

  function checkHtml(c) {
    const gap = dayGap(c.due_date);
    const when = c.days_left < 0 ? t('chk.overdueBy', { n: UI.num(-c.days_left) })
      : c.days_left === 0 ? t('chk.dueToday')
      : gap <= 7 ? t('chk.soon') : t('chk.daysLeft', { n: UI.num(gap) });
    return dueHtml({
      href: 'checks.html',
      tone: c.type === 'received' ? 'credit' : 'debit',
      ico: 'checkbook',
      title: c.party_name || t('chk.noParty'),
      sub: [t('chk.due'), UI.formatDate(c.due_date), when, c.check_number].filter(Boolean).join(' · '),
      side: UI.money(c.amount_minor, { withUnit: false }),
    });
  }

  function render() {
    if (seg === 'party') {
      listEl.innerHTML = rems.map(remHtml).join('');
      emptyTextEl.textContent = t('ui.noRemParty');
    } else if (seg === 'loan') {
      listEl.innerHTML = loans.map(loanHtml).join('');
      emptyTextEl.textContent = t('ui.noRemLoan');
    } else {
      listEl.innerHTML = checks.map(checkHtml).join('');
      emptyTextEl.textContent = t('ui.noRemCheck');
    }
    emptyEl.hidden = listEl.children.length > 0;
    // A written reminder is the only thing you can add here; the other two
    // segments are computed from the ledger, so the + goes away with the tab.
    fabEl.hidden = seg !== 'party';
    I18n.applyDocument();
  }

  // --- data ------------------------------------------------------------------

  async function load() {
    try {
      const now = encodeURIComponent(global.Reminders.localNow());
      const [r, l, c] = await Promise.all([
        API.get(`/reminders?now=${now}`),
        API.get('/loans?status=active'),
        API.get('/checks?status=pending'),
      ]);
      rems = r.data.reminders || [];
      loans = (l.data.loans || []).filter((x) => x.next_due_date);
      checks = c.data.checks || [];
      render();
    } catch (err) {
      UI.toast(err.message, 'bad');
    }
  }

  // --- actions ---------------------------------------------------------------

  async function openMenu(id) {
    const r = rems.find((x) => x.id === id);
    if (!r) return;
    const sheet = UI.modal(r.title, `
      <div class="stack">
        <button class="btn secondary" data-x="ack" type="button">
          ${Number(r.sent) ? UI.icon('refresh', 'sm') + ' ' + esc(t('rem.undo')) : UI.icon('badge-check', 'sm') + ' ' + esc(t('rem.done'))}
        </button>
        <button class="btn secondary" data-x="edit" type="button">${esc(t('rem.edit'))}</button>
        <button class="btn danger" data-x="del" type="button">${esc(t('common.delete'))}</button>
        <button class="btn ghost" data-x="close" type="button">${esc(t('common.close'))}</button>
      </div>`);
    sheet.el.querySelector('[data-x="close"]').onclick = () => sheet.close();
    sheet.el.querySelector('[data-x="ack"]').onclick = async () => {
      sheet.close();
      try {
        await API.post(`/reminders/${r.id}/ack`, { sent: !Number(r.sent) });
        load();
      } catch (err) { UI.toast(err.message, 'bad'); }
    };
    sheet.el.querySelector('[data-x="edit"]').onclick = async () => {
      sheet.close();
      const saved = await RemForm.open(r);
      if (saved) load();
    };
    sheet.el.querySelector('[data-x="del"]').onclick = async () => {
      sheet.close();
      if (!(await UI.confirmBox(t('common.delete'), t('rem.deleteConfirm')))) return;
      try {
        await API.del(`/reminders/${r.id}`);
        UI.toast(t('common.deleted'), 'ok');
        load();
      } catch (err) { UI.toast(err.message, 'bad'); }
    };
  }

  listEl.addEventListener('click', (e) => {
    const menuBtn = e.target.closest('[data-menu]');
    if (menuBtn) {
      e.preventDefault();
      openMenu(Number(menuBtn.dataset.menu));
      return;
    }
    // One tap on a written reminder does the same thing the sheet's first row does.
    const card = e.target.closest('[data-rem]');
    if (card) openMenu(Number(card.dataset.rem));
  });

  segEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg]');
    if (!b || b.dataset.seg === seg) return;
    seg = b.dataset.seg;
    segEl.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    render();
  });

  fabEl.addEventListener('click', async () => {
    const saved = await RemForm.open(null);
    if (saved) load();
  });

  // The notification loop acks reminders by themselves — let the list follow.
  global.addEventListener('dh:reminders', load);
  global.addEventListener('dh:render', () => { shellBar(); render(); });

  load();
})(window);

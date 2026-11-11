// -----------------------------------------------------------------------------
//  home.js — the parties list: balance hero, tiles, search, sort, create/edit.
//  This is the screen the reference app opens first, so it stays one-tap simple.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  if (!Auth.require()) return;

  const t = (k, v) => global.I18n.t(k, v);
  const esc = UI.escapeHtml;
  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const heroEl = document.getElementById('hero');
  const searchEl = document.getElementById('search');
  const sortBtn = document.getElementById('btn-sort');

  const ORDERS = ['name', 'amount', 'recent'];
  let order = 'name';
  let parties = [];
  let meta = { count: 0, total_credit_minor: 0, total_debit_minor: 0 };

  function shellBar() {
    UI.shell({
      active: 'home',
      title: UI.formatDateLong(new Date()),
      ico: 'calendar',
      actionsHtml: `
        <a class="icon-btn" href="backup.html" title="${esc(t('ui.backup'))}" aria-label="${esc(t('ui.backup'))}">${UI.icon('cloud-check')}</a>
        <a class="icon-btn" href="reminders.html" title="${esc(t('nav.reminders'))}" aria-label="${esc(t('nav.reminders'))}">${UI.icon('bell')}</a>`,
    });
  }
  shellBar();

  // --- rendering -------------------------------------------------------------

  /**
   * The two-tone ring in the middle of the hero: money in vs money out, drawn
   * with stroke-dasharray on a circle. A chart library would have to be bundled
   * into the APK, and 251.2 is the only magic number this needs.
   */
  function donut(credit, debit) {
    const r = 40;
    const c = 2 * Math.PI * r;
    const total = credit + debit;
    const inArc = total ? (credit / total) * c : 0;
    return `
      <div class="donut" role="img" aria-label="${esc(t('ui.owedToMe'))} / ${esc(t('ui.owedByMe'))}">
        <svg viewBox="0 0 100 100">
          <circle class="ring out" cx="50" cy="50" r="${r}"></circle>
          ${total ? `<circle class="ring in" cx="50" cy="50" r="${r}"
              stroke-dasharray="${inArc.toFixed(2)} ${(c - inArc).toFixed(2)}"></circle>` : ''}
        </svg>
        <span class="hub">${UI.icon('trend-up', 'lg')}</span>
      </div>`;
  }

  function paintHero() {
    const credit = Number(meta.total_credit_minor || 0);
    const debit = Number(meta.total_debit_minor || 0);
    const net = credit - debit;
    const netLabel = net > 0 ? t('ui.netIn') : net < 0 ? t('ui.netOut') : t('ui.netZero');
    heroEl.innerHTML = `
      <div class="hero-grid">
        <div class="hero-side">
          <div class="m-chip ghost">${UI.icon('trend-up')}</div>
          <div class="k">${esc(t('ui.owedToMe'))}</div>
          <div class="v">${UI.money(credit, { withUnit: false })}</div>
          <div class="u">${esc(t('cur.' + ((Auth.user() || {}).currency || 'toman')))}</div>
        </div>
        ${donut(credit, debit)}
        <div class="hero-side">
          <div class="m-chip ghost debit">${UI.icon('trend-down')}</div>
          <div class="k">${esc(t('ui.owedByMe'))}</div>
          <div class="v">${UI.money(debit, { withUnit: false })}</div>
          <div class="u">${esc(t('cur.' + ((Auth.user() || {}).currency || 'toman')))}</div>
        </div>
      </div>
      <div class="hero-net">${esc(netLabel)} <b>${UI.money(Math.abs(net))}</b></div>`;
  }

  function rowHtml(p) {
    const b = UI.balance(p.balance_minor);
    // «الحركات: 3» and not «3 حركات»: Arabic counts change the noun's shape,
    // a label with a colon is correct for 0, 1 and 20 alike.
    const sub = [p.phone, `${t('ui.txns')}: ${UI.num(p.txn_count)}`].filter(Boolean).join(' · ');
    return `
      <a class="party-row" href="party.html?id=${p.id}" data-side="${b.side}" data-id="${p.id}">
        <div class="avatar">${esc(UI.initials(p.name))}</div>
        <div class="grow">
          <div class="party-name">${esc(p.name)}</div>
          <div class="party-sub">${esc(sub)}</div>
        </div>
        <div style="text-align:end">
          <div class="amount ${b.cls}">${b.text}</div>
          <div class="party-sub">${b.label}</div>
        </div>
        <div class="m-chip sm ${b.side === 'debit' ? 'debit' : ''}">${UI.icon(b.side === 'debit' ? 'trend-down' : 'trend-up')}</div>
        <button class="icon-btn ghost" type="button" data-menu="${p.id}" aria-label="menu">${UI.icon('dots', 'sm')}</button>
      </a>`;
  }

  /** The three orders the reference app's «مرتب‌سازی» button offers. */
  function sorted() {
    const arr = parties.slice();
    if (order === 'amount') arr.sort((a, b) => Math.abs(b.balance_minor) - Math.abs(a.balance_minor));
    else if (order === 'recent') arr.sort((a, b) => (b.id > a.id ? 1 : b.id < a.id ? -1 : 0));
    else arr.sort((a, b) => String(a.name).localeCompare(String(b.name), global.I18n.lang(), { sensitivity: 'base' }));
    return arr;
  }

  function render() {
    listEl.innerHTML = sorted().map(rowHtml).join('');
    emptyEl.hidden = parties.length > 0;
    paintHero();
    document.getElementById('sort-label').textContent = t(`ui.sort_${order}`);
    sortBtn.classList.toggle('on', order !== 'name');
    I18n.applyDocument();
  }

  // --- data ------------------------------------------------------------------

  async function load() {
    try {
      const q = searchEl.value.trim();
      const res = await API.get('/parties' + (q ? `?search=${encodeURIComponent(q)}` : ''));
      parties = res.data.parties || [];
      meta = res.meta || meta;
      render();
    } catch (err) {
      UI.toast(err.message, 'bad');
    }
  }

  // --- actions ---------------------------------------------------------------

  /** Small action sheet for one party (edit / delete). */
  async function openMenu(partyId) {
    const party = parties.find((p) => p.id === partyId);
    if (!party) return;
    const sheet = UI.modal(party.name, `
      <div class="stack">
        <a class="btn secondary" href="party.html?id=${party.id}">${t('party.title')}</a>
        <button class="btn secondary" data-x="edit" type="button">${t('party.edit')}</button>
        <button class="btn danger" data-x="del" type="button">${t('party.delete')}</button>
        <button class="btn ghost" data-x="close" type="button">${t('common.close')}</button>
      </div>`);
    sheet.el.querySelector('[data-x="close"]').onclick = () => sheet.close();
    sheet.el.querySelector('[data-x="edit"]').onclick = async () => {
      sheet.close();
      const saved = await PartyForm.open(party);
      if (saved) load();
    };
    sheet.el.querySelector('[data-x="del"]').onclick = async () => {
      sheet.close();
      if (!(await UI.confirmBox(t('party.delete'), t('party.deleteConfirm')))) return;
      try {
        await API.del(`/parties/${party.id}`);
        UI.toast(t('common.deleted'), 'ok');
        load();
      } catch (err) { UI.toast(err.message, 'bad'); }
    };
  }

  listEl.addEventListener('click', (e) => {
    const menuBtn = e.target.closest('[data-menu]');
    if (menuBtn) {
      e.preventDefault(); // do not follow the row link
      openMenu(Number(menuBtn.dataset.menu));
    }
  });

  sortBtn.addEventListener('click', () => {
    order = ORDERS[(ORDERS.indexOf(order) + 1) % ORDERS.length];
    render();
  });

  document.getElementById('fab').addEventListener('click', async () => {
    const saved = await PartyForm.open(null);
    if (saved) load();
  });

  let debounce;
  searchEl.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(load, 250);
  });

  // Language flipped in the header -> repaint everything from cached rows.
  global.addEventListener('dh:render', () => {
    shellBar();
    render();
  });

  load();
})(window);

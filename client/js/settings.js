// -----------------------------------------------------------------------------
//  settings.js — the account screen (Phase 6).
//  Everything here is a PREFERENCE, not book data: the owner's name, the money
//  unit, the language, the footer line printed under every report, and the
//  password. Those live on the user row (PUT /api/auth/me), so they follow the
//  account to any device. The API address is the one setting that stays on the
//  device (localStorage) — it describes THIS device, not the account.
//  Currency and language repaint the whole app on the spot: they are display
//  choices, and waiting for a save button would look like a broken screen.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  if (!Auth.require()) return;

  const t = (k, v) => global.I18n.t(k, v);
  const esc = global.UI.escapeHtml;

  // Mirrors the whitelist in server/services/authService.js — a unit outside this
  // list is refused with 422, so the two lists have to move together.
  const CURRENCIES = ['toman', 'rial', 'dinar', 'dollar', 'dirham', 'euro', 'afghani'];

  const curRow = document.getElementById('cur-row');
  const langRow = document.getElementById('lang-row');
  const formProfile = document.getElementById('form-profile');
  const formPass = document.getElementById('form-pass');
  const formBase = document.getElementById('form-base');
  const phoneEl = document.getElementById('acc-phone');
  const sinceEl = document.getElementById('acc-since');
  const countsEl = document.getElementById('acc-counts');
  const baseEl = document.getElementById('acc-base');
  const modeEl = document.getElementById('acc-mode');
  const connEl = document.getElementById('conn-state');
  const btnConn = document.getElementById('btn-conn');
  const meEl = document.getElementById('me');
  const benefitsEl = document.getElementById('benefits');
  const lockRow = document.getElementById('btn-lock-row');
  const lockStateEl = document.getElementById('lock-state');
  const abRow = document.getElementById('ab-row');
  const abLastEl = document.getElementById('ab-last');

  // The six words the support page lists as well — the card and the page read the
  // same keys, so the settings screen can never promise something the support
  // page does not know about. Each one names the screen that actually does it.
  const BENEFITS = [
    ['f1', 'cloud-up'], ['f2', 'lock'], ['f3', 'calculator'],
    ['f4', 'settle'], ['f5', 'print'], ['f6', 'image'],
  ];

  let user = global.Auth.user() || {};
  let stats = null; // the counts, kept so a language flip can re-word them

  // A root tab: no back arrow, the bottom bar is the way out.
  UI.shell({ active: 'settings', title: t('set.title'), ico: 'gear' });

  // --- painting ---------------------------------------------------------------

  /**
   * The gradient card at the top: the same identity block the party screen
   * uses, so "this is your account" looks like everything else in the app.
   * Only the name/phone side is painted here — the counts arrive later and
   * paintMe() would have to run again, so they live in their own element.
   */
  function paintMe() {
    meEl.innerHTML = `
      <div class="avatar">${esc(UI.initials(user.name || ''))}</div>
      <div class="grow">
        <div class="nm">${esc(user.name || t('set.account'))}</div>
        <div class="ph">${esc(user.phone || '—')}</div>
      </div>
      <div class="bal">
        <div class="k">${esc(t('set.book'))}</div>
        <div class="v" id="me-parties">—</div>
      </div>`;
  }

  /** Chips, language buttons and the read-only lines. Safe on every repaint. */
  function paint() {
    paintMe();
    curRow.innerHTML = CURRENCIES.map((c) => `
      <button type="button" class="opt${c === user.currency ? ' active' : ''}"
              data-cur="${c}" aria-pressed="${c === user.currency}">${esc(t('cur.' + c))}</button>`).join('');
    langRow.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.lang === global.I18n.lang());
    });
    phoneEl.textContent = user.phone || '—';
    sinceEl.textContent = user.created_at ? UI.formatDateLong(user.created_at) : '…';
    // Where the calls actually go. Inside the APK this is the difference between a
    // working app and a login screen that says "network error", so it is printed.
    baseEl.textContent = global.Config.apiBase;
    modeEl.textContent = t(global.Config.isNative ? 'set.modeNative' : 'set.modeWeb');
    paintBenefits();
    paintLock();
    paintAuto();
    paintCounts();
  }

  /** The premium list, ticked: everything on it is live in this build. */
  function paintBenefits() {
    benefitsEl.innerHTML = BENEFITS.map(([k, ico]) => `
      <div class="benefit">
        <span class="ico-chip">${UI.icon(ico)}</span>
        <span class="grow">${esc(t('sup.' + k))}</span>
        <span class="tick">${UI.icon('check')}</span>
      </div>`).join('');
  }

  /**
   * What the ACCOUNT holds, not what this device remembers: the code lives on the
   * server, so another phone switching it on has to show up here on the next
   * load (GET /auth/me answers has_pin, never the code itself).
   */
  function paintLock() {
    lockStateEl.className = `pill ${user.has_pin ? 'ok' : 'mute'}`;
    lockStateEl.textContent = t(user.has_pin ? 'set.lockOn' : 'set.lockOff');
  }

  /** The silent copier: where the switch stands, and when it last ran. */
  function paintAuto() {
    const ab = global.AutoBackup;
    const on = ab ? ab.enabled() : false;
    abRow.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', (b.dataset.ab === 'on') === on);
    });
    const ms = ab ? ab.lastAt() : 0;
    abLastEl.textContent = ms ? t('set.autoBLast', { at: stampText(ms) }) : t('set.autoBNever');
  }

  /** A localStorage stamp -> the string this language reads dates with. */
  function stampText(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return UI.formatDateTime(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`);
  }

  /** The counts are numbers, the sentence around them is a translation. */
  function paintCounts() {
    if (!stats) { countsEl.textContent = '…'; return; }
    countsEl.textContent = t('set.counts', {
      parties: UI.num(stats.parties),
      txns: UI.num(stats.transactions),
      checks: UI.num(stats.checks),
      loans: UI.num(stats.loans),
      reminders: UI.num(stats.reminders),
    });
    // The card repeats the one number that gives it context: how many people
    // are in the book. paintMe() rebuilds the element, so it is looked up here.
    const meN = document.getElementById('me-parties');
    if (meN) meN.textContent = UI.num(stats.parties);
  }

  /** Only after the account came back — never overwrites what is being typed. */
  function fillForm() {
    formProfile.elements.name.value = user.name || '';
    formProfile.elements.footer_text.value = user.footer_text || '';
    formBase.elements.apiBase.value = global.Config.apiBaseOverride || '';
  }

  /** One PUT /auth/me + a fresh cache + a repaint of the whole app. */
  async function saveProfile(patch, form) {
    try {
      const res = await API.put('/auth/me', patch);
      user = res.data.user;
      global.Config.user = user;
      UI.toast(t('set.saved'), 'ok');
      paint();
      // The money unit is printed on every list, so let the other screens know.
      global.dispatchEvent(new CustomEvent('dh:render'));
      return true;
    } catch (err) {
      if (form) UI.showFieldErrors(form, err.fields || {});
      UI.toast(err.message, 'bad');
      return false;
    }
  }

  // The counts are the ones the backup snapshot already reports, so the screen
  // asks for that instead of adding a fifth stats endpoint for one page.
  async function loadStats() {
    try {
      const res = await API.get('/backup/export');
      stats = res.meta || {};
    } catch (_e) {
      stats = null;
    }
    paintCounts();
  }

  async function load() {
    try {
      const res = await API.get('/auth/me');
      user = res.data.user;
      global.Config.user = user;
      // Chosen on another device? Follow it, and repaint this screen in it.
      if (user.lang && user.lang !== global.I18n.lang()) {
        global.I18n.setLang(user.lang);
        global.dispatchEvent(new CustomEvent('dh:render'));
      }
    } catch (_e) { /* the cached user is still good enough to show */ }
    paint();
    fillForm();
    loadStats();
  }

  // --- account (name + footer text) -------------------------------------------

  formProfile.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = UI.value(formProfile, 'name');
    if (!name) {
      UI.showFieldErrors(formProfile, { name: t('common.required') });
      return;
    }
    const footer = String(formProfile.elements.footer_text.value).trim();
    if (await saveProfile({ name, footer_text: footer }, formProfile)) {
      formProfile.elements.footer_text.value = user.footer_text || '';
    }
  });

  // --- money unit -------------------------------------------------------------

  curRow.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cur]');
    if (!b || b.classList.contains('active')) return;
    saveProfile({ currency: b.dataset.cur }, null);
  });

  // --- language ---------------------------------------------------------------

  langRow.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-lang]');
    if (!b || b.dataset.lang === global.I18n.lang()) return;
    global.I18n.setLang(b.dataset.lang); // device first: works with no network
    paint();
    try {
      const res = await API.put('/auth/me', { lang: b.dataset.lang });
      user = res.data.user;
      global.Config.user = user;
    } catch (_e) { /* offline: the choice still stands on this device */ }
    global.dispatchEvent(new CustomEvent('dh:render'));
  });

  // --- password ---------------------------------------------------------------

  formPass.addEventListener('submit', async (e) => {
    e.preventDefault();
    const current = UI.value(formPass, 'currentPassword');
    const next = UI.value(formPass, 'newPassword');
    const repeat = UI.value(formPass, 'repeat');
    const errs = {};
    if (!current) errs.currentPassword = t('common.required');
    if (next.length < 6) errs.newPassword = t('set.short');
    if (next !== repeat) errs.repeat = t('set.mismatch');
    UI.showFieldErrors(formPass, errs);
    if (Object.keys(errs).length) return;
    try {
      await API.put('/auth/password', { currentPassword: current, newPassword: next });
      formPass.reset();
      UI.toast(t('set.changed'), 'ok');
    } catch (err) {
      UI.showFieldErrors(formPass, err.fields || {});
      UI.toast(err.message, 'bad');
    }
  });

  // --- the app lock (Phase 9) ------------------------------------------------

  /**
   * Set, change or switch off the code the lock screen asks for.
   *
   * The account password is asked every single time, because it is the only
   * proof a request may touch the lock at all — and the only way back in if the
   * code is forgotten (the server keeps a bcrypt hash and answers only has_pin).
   * An empty code means «switch it off», which the same endpoint accepts.
   */
  function lockSheet() {
    const has = !!user.has_pin;
    const sheet = UI.modal(t('set.lockSheet'), `
      <form id="pin-form" novalidate autocomplete="off">
        <p class="muted" style="margin:0 0 12px;font-size:12.5px">${esc(t('set.lockPassHint'))}</p>
        <label class="fld">
          <span class="lbl">${esc(t('set.lockPass'))}</span>
          <input type="password" name="password" autocomplete="current-password" />
          <em class="err-text" data-err-for="password"></em>
        </label>
        ${has ? '' : `
        <label class="fld">
          <span class="lbl">${esc(t('set.lockCode'))}</span>
          <input type="password" name="pin" inputmode="numeric" maxlength="8" autocomplete="off" />
          <em class="err-text" data-err-for="pin"></em>
        </label>
        <label class="fld">
          <span class="lbl">${esc(t('set.lockRepeat'))}</span>
          <input type="password" name="repeat" inputmode="numeric" maxlength="8" autocomplete="off" />
          <em class="err-text" data-err-for="repeat"></em>
        </label>`}
        <div class="row" style="gap:8px;margin-top:4px">
          <button class="btn secondary" data-x="no" type="button">${esc(t('common.cancel'))}</button>
          ${has ? `<button class="btn danger" data-x="off" type="button">${esc(t('set.lockRemoveBtn'))}</button>`
          : `<button class="btn" data-x="save" type="submit">${esc(t('common.save'))}</button>`}
        </div>
      </form>`);

    const form = sheet.el.querySelector('#pin-form');
    const val = (n) => UI.value(form, n);
    /** Both branches end the same way: the server answers what the lock is now. */
    async function write(patch, btn, doneMsg) {
      if (btn) btn.disabled = true;
      try {
        const res = await API.put('/auth/pin', patch);
        user = { ...user, has_pin: res.data.has_pin };
        global.Config.user = user;
        // This tab is already open: it stays open. The code starts guarding the
        // next start of the app, which is what a lock is for.
        global.Auth.markUnlocked();
        sheet.close();
        UI.toast(t(doneMsg), 'ok');
        paint();
      } catch (err) {
        UI.showFieldErrors(form, err.fields || {});
        UI.toast(err.message, 'bad');
        if (btn) btn.disabled = false;
      }
    }

    sheet.el.querySelector('[data-x="no"]').onclick = () => sheet.close();

    // A form (not a bare button) so the validator messages land under the right
    // box and the keyboard's ↵ does what the save button does. Only when there is
    // a code to write: switching the lock off is the button's job alone.
    if (!has) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const password = val('password');
        const pin = val('pin');
        const errs = {};
        if (!password) errs.password = t('common.required');
        if (!/^\d{4,8}$/.test(pin)) errs.pin = t('set.lockShort');
        if (pin !== val('repeat')) errs.repeat = t('set.lockMismatch');
        UI.showFieldErrors(form, errs);
        if (Object.keys(errs).length) return;
        write({ password, pin }, form.querySelector('[data-x="save"]'), 'set.lockSaved');
      });
    }

    const offBtn = sheet.el.querySelector('[data-x="off"]');
    if (offBtn) offBtn.onclick = () => {
      const password = val('password');
      if (!password) {
        UI.showFieldErrors(form, { password: t('common.required') });
        return;
      }
      write({ password, pin: null }, offBtn, 'set.lockOffDone');
    };

    // The password is the one box both branches have, so it is the one to start on.
    const first = sheet.el.querySelector('[name="password"]');
    if (first) first.focus();
  }

  lockRow.addEventListener('click', lockSheet);

  // --- automatic backup (Phase 9) --------------------------------------------

  /**
   * The switch itself lives in js/autobackup.js and on this device: what it does
   * is ask the server for one silent copy, which is account data, but whether the
   * app should keep asking is a habit of the phone, not of the account.
   */
  abRow.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ab]');
    if (!b || !global.AutoBackup) return;
    const on = b.dataset.ab === 'on';
    if (on === global.AutoBackup.enabled()) return;
    global.AutoBackup.setEnabled(on);
    paintAuto();
    UI.toast(t(on ? 'set.autoBOn' : 'set.autoBOff'), on ? 'ok' : '');
  });

  // The copier says nothing on its own — the stamp on this screen is its only voice.
  global.addEventListener('dh:autobackup', () => paintAuto());

  // --- where the API lives (device only) --------------------------------------

  formBase.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = UI.value(formBase, 'apiBase');
    if (v && !/^https?:\/\//i.test(v)) {
      UI.showFieldErrors(formBase, { apiBase: t('set.apiBaseBad') });
      return;
    }
    UI.showFieldErrors(formBase, {});
    global.Config.apiBase = v; // an empty value clears it: same origin again
    UI.toast(v ? t('set.apiBaseSaved') : t('common.saved'), 'ok');
    paint();
  });

  document.getElementById('btn-base-reset').addEventListener('click', () => {
    global.Config.apiBase = '';
    formBase.elements.apiBase.value = '';
    UI.showFieldErrors(formBase, {});
    UI.toast(t('common.saved'), 'ok');
    paint();
  });

  /**
   * Ask the API something tiny and time it (/api/health answers without a token,
   * so this also works while logged out on another screen). The number is the
   * round trip as the device felt it, not the server's own timing.
   */
  btnConn.addEventListener('click', async () => {
    connEl.className = 'pill mute';
    connEl.textContent = '…';
    btnConn.disabled = true;
    const t0 = performance.now();
    try {
      await API.get('/health');
      const ms = Math.round(performance.now() - t0);
      connEl.className = 'pill ok';
      connEl.textContent = t('set.testOk', { ms: UI.num(ms) });
    } catch (_err) {
      connEl.className = 'pill bad';
      connEl.textContent = t('set.testFail');
    } finally {
      btnConn.disabled = false;
    }
  });

  // --- session ----------------------------------------------------------------

  document.getElementById('btn-logout').addEventListener('click', async () => {
    if (await UI.confirmBox(t('set.logout'), t('set.logoutHint'))) global.Auth.logout();
  });

  // --- language flip ----------------------------------------------------------

  global.addEventListener('dh:render', () => {
    UI.shell({ active: 'settings', title: t('set.title'), ico: 'gear' });
    paint();
    I18n.applyDocument();
  });

  paint();
  load();
})(window);

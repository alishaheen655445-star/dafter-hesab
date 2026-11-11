// -----------------------------------------------------------------------------
//  lock.js — the code pad (Phase 9).
//
//  The account has a bcrypt-hashed 4-8 digit code on the server (set from
//  Settings, where the account password is the proof). This screen asks for that
//  code and nothing else: it never reads the book, it only flips the "this tab
//  was let in" flag and hands the user back to where they were going.
//
//  A wrong code is a 422 (the session is still fine), and five of them in a row
//  buy a minute of cooldown on the server — so this screen has no "forget the
//  code" hatch: the way out is the account password in Settings on another
//  device, or logging out here and back in with it.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  const t = (k, v) => global.I18n.t(k, v);
  const dotsEl = document.getElementById('dots');
  const padEl = document.getElementById('keypad');
  const errEl = document.getElementById('pin-err');
  const langRow = document.getElementById('lang-row');

  const MIN = 4;
  const MAX = 8;
  let code = '';
  let waiting = false;

  // Only a page of this app, never an address someone typed into a link.
  const params = new URLSearchParams(global.location.search);
  const wanted = String(params.get('back') || '');
  const target = /^[a-z][a-z-]*\.html(\?.*)?$/i.test(wanted) && !/^lock\.html/i.test(wanted)
    ? wanted : 'home.html';

  if (!global.Auth.isLoggedIn()) { global.location.replace('index.html'); return; }

  // --- painting ---------------------------------------------------------------

  /** One dot per digit, with the minimum length always visible. */
  function paintDots() {
    const n = Math.max(MIN, code.length);
    dotsEl.innerHTML = Array.from({ length: n }, (_x, i) =>
      `<span class="dot${i < code.length ? ' on' : ''}"></span>`).join('');
  }

  /**
   * The keys are built here, not written in HTML: the digits have to read the
   * way this language reads them (٤ in Arabic, ۴ in Persian), and a flip has to
   * repaint them.
   */
  function paintPad() {
    const d = (n) => UI.num(n);
    // A digit key reads as its own digit, so it gets no aria-label; only the two
    // icon keys need naming, otherwise the reader app says "open" ten times.
    const key = (k, label, cls = '') => {
      const aria = k === 'del' ? t('lock.del') : (k === 'ok' ? t('lock.ok') : '');
      return `<button type="button" class="key ${cls}" data-k="${k}"${aria ? ` aria-label="${aria}"` : ''}>${label}</button>`;
    };
    padEl.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      .map((n) => key(n, d(n)))
      .concat([
        key('del', UI.icon('backspace'), 'fn'),
        key(0, d(0)),
        key('ok', UI.icon('check'), 'fn go'),
      ]).join('');
    padEl.setAttribute('aria-label', t('lock.enter'));
  }

  function paint() {
    paintDots();
    paintPad();
    langRow.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.lang === global.I18n.lang());
    });
    global.I18n.setPageTitle(t('lock.title'));
  }

  const showError = (msg) => { errEl.textContent = msg || ''; };

  // --- the code ---------------------------------------------------------------

  function press(k) {
    if (waiting) return;
    showError('');
    if (k === 'del') { code = code.slice(0, -1); paintDots(); return; }
    if (k === 'ok') { submit(); return; }
    const digit = String(k);
    if (!/^\d$/.test(digit) || code.length >= MAX) return;
    code += digit;
    paintDots();
    // No auto-submit at four digits: a six-digit code would be rejected halfway
    // through typing it. ↵ (or the ✓ key) is what asks the server.
  }

  async function submit() {
    if (waiting) return;
    if (code.length < MIN) { showError(t('lock.tooShort')); return; }
    waiting = true;
    const okBtn = padEl.querySelector('[data-k="ok"]');
    if (okBtn) okBtn.classList.add('busy');
    try {
      await API.post('/auth/pin/unlock', { pin: code });
      global.Auth.markUnlocked();
      global.location.replace(target);
    } catch (err) {
      // The server says what is wrong (wrong code / cool down) in this language.
      code = '';
      paintDots();
      showError(err.status === 0 ? t('common.networkError') : err.message);
    } finally {
      if (okBtn) okBtn.classList.remove('busy');
      waiting = false;
    }
  }

  // --- wiring -----------------------------------------------------------------

  padEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (b) press(b.dataset.k);
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    code = '';
    showError('');
    paintDots();
  });
  document.getElementById('btn-ok').addEventListener('click', submit);

  document.getElementById('btn-other').addEventListener('click', () => global.Auth.logout());

  langRow.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang]');
    if (!b || b.dataset.lang === global.I18n.lang()) return;
    // Local only: the pad does not write to the account it has not opened yet.
    global.I18n.setLang(b.dataset.lang);
    paint();
  });

  // A real keyboard works too — the pad is not the only way in, and on a desktop
  // (or in the dev tools) it is the faster one.
  global.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); } else if (e.key === 'Backspace') { e.preventDefault(); press('del'); } else if (e.key === 'Enter') { e.preventDefault(); submit(); } else if (e.key === 'Escape') { code = ''; paintDots(); }
  });

  global.addEventListener('dh:render', paint);

  // --- is the door actually shut? --------------------------------------------
  // The cached user may be a day old: the code could have been set or removed
  // from another device, so ask once and act on the answer.
  (async () => {
    paint();
    try {
      const res = await API.get('/auth/me');
      global.Config.user = res.data.user;
      if (!res.data.user.has_pin) {
        // No code any more — go straight in.
        global.Auth.markUnlocked();
        global.location.replace(target);
      }
      if (res.data.user.lang && res.data.user.lang !== global.I18n.lang()) {
        global.I18n.setLang(res.data.user.lang);
        paint();
      }
    } catch (_err) { /* the pad still works offline: the code lives on the server */ }
  })();
})(window);

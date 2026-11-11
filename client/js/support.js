// -----------------------------------------------------------------------------
//  support.js — about / guide / privacy / share (Phase 9).
//  The page itself is static text the browser can read without this file; the
//  three lines here are the things only the running app knows: which build this
//  is, where its API lives, and when the background copy last ran.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  if (!Auth.require()) return;

  const t = (k, v) => global.I18n.t(k, v);
  const esc = global.UI.escapeHtml;

  const freeEl = document.getElementById('sup-free');
  const modeEl = document.getElementById('sup-mode');
  const serverEl = document.getElementById('sup-server');
  const autoEl = document.getElementById('sup-auto');

  /** The unlocked premium list — the same six words the settings card shows. */
  const FEATURES = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'];

  const pad = (n) => String(n).padStart(2, '0');

  /** A localStorage stamp -> the string this language reads dates with. */
  function stampText(ms) {
    if (!ms) return t('sup.never');
    const d = new Date(ms);
    return UI.formatDateTime(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`);
  }

  function paint() {
    freeEl.innerHTML = FEATURES.map((k) =>
      `<span class="opt active">${UI.icon('check')} ${esc(t('sup.' + k))}</span>`).join('');
    modeEl.textContent = t(global.Config.isNative ? 'set.modeNative' : 'set.modeWeb');
    serverEl.textContent = global.Config.apiBase;
    autoEl.textContent = stampText(global.AutoBackup ? global.AutoBackup.lastAt() : 0);
    UI.shell({ active: 'settings', title: t('sup.title'), ico: 'headset', back: true });
    I18n.applyDocument();
  }

  /** One-line blurb, in the language the screen is being read in. */
  const shareText = () => `${t('app.name')} — ${t('app.tagline')}\n${t('sup.shareText')}`;

  document.getElementById('btn-copy').addEventListener('click', async () => {
    const ok = await UI.copyText(shareText());
    UI.toast(ok ? t('sup.copied') : t('sup.copyFail'), ok ? 'ok' : '');
  });

  /**
   * The OS share sheet when this browser has one (Android WebView usually does
   * not expose it to plain pages). Without it, the honest fallback is the same
   * copy button the rest of the app uses — never a silent "shared!".
   */
  document.getElementById('btn-share').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const nav = global.navigator;
    if (nav && typeof nav.share === 'function') {
      btn.disabled = true;
      try {
        await nav.share({ title: t('app.name'), text: shareText() });
        UI.toast(t('sup.shared'), 'ok');
      } catch (_err) { /* the user closed the sheet — that is not an error */ } finally {
        btn.disabled = false;
      }
      return;
    }
    const ok = await UI.copyText(shareText());
    UI.toast(ok ? t('sup.copyNoShare') : t('sup.copyFail'), ok ? '' : 'bad');
  });

  global.addEventListener('dh:render', paint);

  paint();
})(window);

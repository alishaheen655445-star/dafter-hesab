// -----------------------------------------------------------------------------
//  ui.js — shared building blocks: app shell, money/date formatting, toasts,
//  bottom-sheet modals, confirm. Every screen is a few lines because of this.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  const t = (key, vars) => global.I18n.t(key, vars);

  // --- app shell -------------------------------------------------------------
  // Three tabs, exactly as the reference app has them: the bell (reminders),
  // home, settings. Checks and loans are reached from the two big tiles on
  // home, backup and support from the rows inside settings — so nothing is
  // lost by shortening the bar, and the demo matches the original one-for-one.
  const NAV = [
    { key: 'reminders', href: 'reminders.html', ico: 'bell', label: 'nav.reminders', ready: true },
    { key: 'home', href: 'home.html', ico: 'home', label: 'nav.home', ready: true },
    { key: 'settings', href: 'settings.html', ico: 'gear', label: 'nav.settings', ready: true },
  ];

  /** An icon from the sprite injected by js/icons.js. */
  function icon(name, size) {
    return `<svg class="dh-i${size ? ' ' + size : ''}" aria-hidden="true"><use href="#dh-${name}"></use></svg>`;
  }

  /**
   * Turns every <span data-ico="phone"> written in a static HTML file into a
   * real <svg>. HTML cannot carry the sprite reference without repeating itself
   * on every screen, so the markup stays declarative and this fills it in.
   * Safe to call again after a repaint — a slot that already holds an icon is
   * skipped instead of stacked.
   */
  function mountIcons(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-ico]').forEach((el) => {
      if (el.firstElementChild) return;
      el.innerHTML = icon(el.dataset.ico, el.dataset.size);
    });
  }

  /**
   * Renders header + bottom nav into the page.
   * @param {object} o { active, title, sub, ico, back, tint, actionsHtml }
   */
  function shell(o = {}) {
    // Repainting on a language flip must NOT stack a second bar: drop the old
    // header/nav first, keep the toast host (in-flight messages stay visible).
    document.querySelectorAll('.app-header, .bottom-nav').forEach((el) => el.remove());

    const header = document.createElement('header');
    header.className = 'app-header' + (o.tint ? ` tint-${o.tint}` : '');
    const user = global.Auth.user() || {};

    header.innerHTML = `
      ${o.back ? `<button class="icon-btn ghost" id="btn-back" aria-label="back">${icon('chev-l', 'lg')}</button>` : ''}
      <h1>${o.ico ? icon(o.ico, 'sm') : ''}
        <span class="grow">${escapeHtml(o.title || t('app.name'))}
          ${o.sub ? `<div class="sub">${escapeHtml(o.sub)}</div>` : ''}
        </span>
      </h1>
      <div class="lang-switch" id="lang-switch">
        <button data-lang="ar">ع</button>
        <button data-lang="fa">فا</button>
      </div>
      ${o.actionsHtml || ''}
    `;
    document.body.prepend(header);
    // The tab follows the screen: "الصكوك — دفتر حساب", or the party name on its
    // own page. Empty title (login screen) keeps the app name + tagline.
    global.I18n.setPageTitle(o.title || '');

    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.innerHTML = NAV.map((n) => (n.ready
      ? `<a href="${n.href}" class="${n.key === o.active ? 'active' : ''}">
           <span class="ico">${icon(n.ico)}</span><span>${t(n.label)}</span></a>`
      : `<span class="disabled" title="${t('nav.soon')}">
           <span class="ico">${icon(n.ico)}</span><span>${t(n.label)}</span>
           <span class="badge">${t('nav.soon')}</span></span>`)).join('');
    document.body.appendChild(nav);

    const host = document.querySelector('.toast-host') || document.createElement('div');
    if (!host.classList.contains('toast-host')) {
      host.className = 'toast-host';
      document.body.appendChild(host);
    }

    header.querySelector('#btn-back')?.addEventListener('click', () => global.history.back());
    const switchEl = header.querySelector('#lang-switch');
    switchEl.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.lang === global.I18n.lang());
      b.addEventListener('click', async () => {
        global.I18n.setLang(b.dataset.lang);
        // Language is a user preference -> keep it on the server too.
        try { await global.API.put('/auth/me', { lang: global.I18n.lang() }); } catch (_e) { /* offline is fine */ }
        switchEl.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        global.dispatchEvent(new CustomEvent('dh:render'));
      });
    });

    if (user.name) header.querySelector('h1').dataset.user = user.name;
    return { header, nav };
  }

  // --- formatting ------------------------------------------------------------

  /** Minor units (int cents) -> grouped string, decimals shown only if needed. */
  function money(minor, { withUnit = true, signed = false } = {}) {
    const value = Number(minor || 0) / 100;
    const abs = Math.abs(value);
    const hasCents = Math.round(abs * 100) % 100 !== 0;
    const str = new Intl.NumberFormat(global.I18n.numberLocale(), {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(abs);
    const unit = withUnit
      ? ` ${t('cur.' + ((global.Auth.user() || {}).currency || 'toman'))}` : '';
    const sign = signed && value < 0 ? '−' : '';
    return `${sign}${str}${unit}`;
  }

  /** Plain integer, grouped for the active locale (counts, not money). */
  const num = (n) => new Intl.NumberFormat(global.I18n.numberLocale()).format(Number(n || 0));

  /** Signed money with the credit/debit word, for list rows. */
  function balance(minor) {
    const v = Number(minor || 0);
    if (v > 0) return { text: money(v), cls: 'credit', side: 'credit', label: t('money.credit') };
    if (v < 0) return { text: money(-v), cls: 'debit', side: 'debit', label: t('money.debit') };
    return { text: money(0), cls: 'zero', side: 'zero', label: t('money.settled') };
  }

  const formatDate = (v) => global.Jalali.format(v, global.I18n.lang());
  const formatDateLong = (v) => global.Jalali.formatLong(v, global.I18n.lang());

  /** "2026-11-02 14:30:00" -> date + HH:MM, both calendars safe. */
  function formatDateTime(v) {
    const time = String(v || '').match(/(\d{2}):(\d{2})/);
    return formatDate(v) + (time ? ` ${time[1]}:${time[2]}` : '');
  }

  /**
   * Up to two letters for the avatar circle, works with Arabic/Persian names.
   * The definite article is skipped: «متجر التجربة» is «مت», not «ما» — taking
   * the raw first character of the second word lands on the ا of ال- every time.
   */
  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '؟';
    // «ال» + three more letters is an article with a real stem behind it; a two
    // or three letter word starting ا+ل («كل», «حل») is not worth stripping.
    const letter = (w) => (w.length > 4 && w.startsWith('ال') ? w[2] : w[0]) || '؟';
    if (parts.length === 1) return parts[0].slice(0, 2);
    return `${letter(parts[0])}${letter(parts[1])}`;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // --- toast ---------------------------------------------------------------
  function toast(message, kind = '') {
    const host = document.querySelector('.toast-host');
    if (!host) return;
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .2s'; }, 2200);
    setTimeout(() => el.remove(), 2500);
  }

  // --- bottom-sheet modal ---------------------------------------------------
  let openSheet = null;

  /** Removes whatever sheet is currently open. */
  function closeModal() {
    if (openSheet) { openSheet.remove(); openSheet = null; document.body.style.overflow = ''; }
  }

  /**
   * Shows a bottom sheet. `innerHtml` is markup written by THIS file (never raw
   * user input — anything user-supplied goes through escapeHtml first).
   * @returns {{ el: HTMLElement, close: Function }}
   */
  function modal(title, innerHtml, { onOpen } = {}) {
    closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop open';
    backdrop.innerHTML = `<div class="modal"><h3>${escapeHtml(title)}</h3>${innerHtml}</div>`;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
    document.body.appendChild(backdrop);
    openSheet = backdrop;
    document.body.style.overflow = 'hidden';
    if (onOpen) onOpen(backdrop.querySelector('.modal'));
    return {
      el: backdrop.querySelector('.modal'),
      close: closeModal,
    };
  }

  /** Promise-based confirm built on the same sheet. */
  function confirmBox(title, message, { danger = true } = {}) {
    return new Promise((resolve) => {
      const m = modal(title, `
        ${message ? `<p class="muted" style="margin:0 0 16px">${escapeHtml(message)}</p>` : ''}
        <div class="row">
          <button class="btn secondary" data-x="no">${t('common.cancel')}</button>
          <button class="btn ${danger ? 'danger' : ''}" data-x="yes">${t('common.yes')}</button>
        </div>`);
      m.el.querySelector('[data-x="no"]').onclick = () => { m.close(); resolve(false); };
      m.el.querySelector('[data-x="yes"]').onclick = () => { m.close(); resolve(true); };
    });
  }

  /** Prints each validator message under its input (name -> .err-text). */
  function showFieldErrors(form, fields = {}) {
    form.querySelectorAll('.err-text').forEach((e) => { e.textContent = ''; });
    // The outlined field also turns its border red, which is what a validator
    // message is supposed to point at. Marking aria-invalid rather than a class
    // keeps the styling in CSS and the accessibility signal for the reader app.
    form.querySelectorAll('input, select, textarea').forEach((el) => el.removeAttribute('aria-invalid'));
    Object.entries(fields).forEach(([name, msg]) => {
      const el = form.querySelector(`[data-err-for="${name}"]`);
      if (el) el.textContent = msg;
      const input = form.elements[name];
      // A radio/text group comes back as a RadioNodeList, which has no attributes.
      if (input && /^(INPUT|SELECT|TEXTAREA)$/.test(input.tagName)) {
        input.setAttribute('aria-invalid', 'true');
      }
    });
  }

  const value = (form, name) => {
    const el = form.elements[name];
    return el ? String(el.value).trim() : '';
  };

  /**
   * Put text on the clipboard, whichever way this browser allows it: the async API
   * when it is available, and a real selection + execCommand for everything else
   * (an embedded WebView often refuses the first). Resolves false only when both
   * were refused — the caller then says "select it yourself" instead of lying.
   */
  async function copyText(text) {
    const nav = global.navigator;
    if (nav && nav.clipboard && nav.clipboard.writeText) {
      try { await nav.clipboard.writeText(text); return true; } catch (_e) { /* refused: fall through */ }
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.insetInlineStart = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_e) { ok = false; }
    ta.remove();
    return ok;
  }

  global.UI = {
    NAV, shell, icon, mountIcons, money, num, balance, formatDate, formatDateLong, formatDateTime,
    initials, escapeHtml, toast, modal, close: closeModal, confirmBox, showFieldErrors, value, copyText,
  };
})(window);

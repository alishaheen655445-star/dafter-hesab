// -----------------------------------------------------------------------------
//  attach.js — the one image per حركة / صك (Phase 5).
//  Three jobs: a thumbnail for lists, a full-screen viewer, and the sheet that
//  uploads / replaces / removes the file through the /image endpoints.
//  The server already checks the mime AND the real bytes, so a wrong pick simply
//  comes back as a 422 message we show as a toast.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  const t = (k, v) => global.I18n.t(k, v);
  const esc = global.UI.escapeHtml;

  /**
   * The API returns "/uploads/x.png". On the web that is same-origin, but in a
   * packaged WebView (capacitor://) the pictures live on the server, so the URL
   * has to be rebuilt against the API origin.
   */
  function assetUrl(url) {
    if (!url) return '';
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    const base = global.Config.apiBase || '/api';
    if (/^https?:\/\//i.test(base)) {
      try {
        const o = new URL(base, global.location.href);
        return `${o.origin}${url}`;
      } catch (_e) { /* fall through */ }
    }
    return url;
  }

  /** Small square picture used inside a row. */
  function thumbHtml(url, cls = '') {
    if (!url) return '';
    return `<img class="thumb ${cls}" src="${esc(assetUrl(url))}" alt="${esc(t('att.photo'))}" data-view="1" loading="lazy">`;
  }

  /** Little corner badge for lists that only say "this row has a picture". */
  const hasBadge = (url) => (url ? `<span class="att-flag">${global.UI.icon('image', 'xs')}</span>` : '');

  /** Full-screen preview. No library, no CSP surprises — plain DOM. */
  function view(url) {
    if (!url) return;
    const box = document.createElement('div');
    box.className = 'lightbox open';
    box.innerHTML = `
      <img src="${esc(assetUrl(url))}" alt="${esc(t('att.photo'))}" />
      <button class="icon-btn lb-close" type="button" aria-label="close">${global.UI.icon('x')}</button>`;
    const close = () => {
      box.remove();
      global.document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    box.addEventListener('click', close);
    global.document.addEventListener('keydown', onKey);
    global.document.body.appendChild(box);
  }

  /** Click handler helper: any [data-view] inside a container opens the viewer. */
  function wireViewer(container, getUrl) {
    container.addEventListener('click', (e) => {
      const img = e.target.closest('[data-view]');
      if (!img) return;
      e.stopPropagation(); // the row itself is tappable — do not open its sheet
      e.preventDefault();
      const url = getUrl(img);
      if (url) view(url);
    });
  }

  /**
   * The image sheet.
   * @param {object} o { path, imageUrl, title, subtitle }
   *   `path` is the /image endpoint (POST to upload, DELETE to remove).
   * @returns {Promise<boolean>} true when something changed and the caller must reload
   */
  function open(o) {
    return new Promise((resolve) => {
      let picked = null;   // File chosen locally, not uploaded yet
      let preview = '';    // data: URL of that file (dies with the sheet)
      let changed = false;
      let armed = false;   // first tap on "remove" only arms the button
      let current = o.imageUrl || '';

      const finish = () => resolve(changed);

      const sheet = global.UI.modal(o.title || t('att.image'), `
        <div class="stack">
          <div class="att-preview" id="att-preview"></div>
          ${o.subtitle ? `<p class="muted" style="margin:0">${esc(o.subtitle)}</p>` : ''}

          <label class="btn secondary" id="att-pick-label">
            <span>${t('att.pick')}</span>
            <input type="file" id="att-file" accept="image/png,image/jpeg,image/webp" hidden />
          </label>

          <button class="btn" data-x="upload" type="button" disabled>${t('att.upload')}</button>
          <button class="btn danger" data-x="remove" type="button" ${current ? '' : 'hidden'}>${t('att.remove')}</button>
          <button class="btn ghost" data-x="close" type="button">${t('common.close')}</button>

          <p class="muted" id="att-hint" style="margin:0">${t('att.hint')}</p>
          <em class="err-text" data-err-for="image"></em>
        </div>`);

      const el = sheet.el;
      const previewBox = el.querySelector('#att-preview');
      const fileInput = el.querySelector('#att-file');
      const btnUpload = el.querySelector('[data-x="upload"]');
      const btnRemove = el.querySelector('[data-x="remove"]');
      const hint = el.querySelector('#att-hint');

      const paint = () => {
        const src = preview || assetUrl(current);
        previewBox.innerHTML = src
          ? `<img src="${esc(src)}" alt="${esc(t('att.photo'))}">`
          : `<div class="att-empty">${t('att.none')}</div>`;
        btnUpload.disabled = !picked;
        btnUpload.textContent = current ? t('att.replace') : t('att.upload');
        btnRemove.hidden = !current;
        // A fresh pick cancels a pending removal, and removing cannot be armed
        // without a picture to remove.
        armed = false;
        btnRemove.textContent = t('att.remove');
      };

      // Client-side guard before the request: 5 MB is the server limit too.
      const MAX_BYTES = 5 * 1024 * 1024;
      fileInput.addEventListener('change', () => {
        const f = fileInput.files && fileInput.files[0];
        if (!f) { picked = null; return paint(); }
        if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
          hint.textContent = t('att.notImage');
          picked = null;
          return paint();
        }
        if (f.size > MAX_BYTES) {
          hint.textContent = t('att.tooBig');
          picked = null;
          return paint();
        }
        picked = f;
        hint.textContent = f.name;
        // data: URL keeps the preview inside the sheet — no blob to revoke by hand.
        const reader = new FileReader();
        reader.onload = () => { preview = String(reader.result); paint(); };
        reader.readAsDataURL(f);
        paint();
      });

      btnUpload.onclick = async () => {
        if (!picked) return;
        btnUpload.disabled = true;
        try {
          const res = await global.API.upload(o.path, picked);
          current = (res.data && res.data.transaction && res.data.transaction.image_url)
            || (res.data && res.data.check && res.data.check.image_url)
            || '';
          preview = '';
          picked = null;
          fileInput.value = '';
          changed = true;
          global.UI.toast(t('att.attached'), 'ok');
          paint();
        } catch (err) {
          global.UI.toast(err.message, 'bad');
          btnUpload.disabled = false;
        }
      };

      // Two taps instead of a nested sheet: UI.modal replaces whatever sheet is
      // open, so a confirm box here would destroy this one.
      btnRemove.onclick = async () => {
        if (!current) return;
        if (!armed) {
          armed = true;
          btnRemove.textContent = t('att.confirmRemove');
          return;
        }
        btnRemove.disabled = true;
        try {
          await global.API.del(o.path);
          current = '';
          changed = true;
          global.UI.toast(t('att.removed'), 'ok');
          sheet.close();
          finish();
        } catch (err) {
          btnRemove.disabled = false;
          global.UI.toast(err.message, 'bad');
        }
      };

      el.querySelector('[data-x="close"]').onclick = () => { sheet.close(); finish(); };
      // Tapping the backdrop is the other way out — UI.modal removes the sheet
      // from inside its own click handler, so listening on it is enough.
      el.parentElement.addEventListener('click', (e) => { if (e.target === el.parentElement) finish(); });

      paint();
    });
  }

  // --- the two targets the API knows ----------------------------------------

  const txnPath = (partyId, txnId) => `/parties/${partyId}/transactions/${txnId}/image`;
  const checkPath = (checkId) => `/checks/${checkId}/image`;

  /** @returns {Promise<boolean>} true if the picture changed */
  const editTxnImage = (partyId, txn) => open({
    title: txn.description || t('att.image'),
    path: txnPath(partyId, txn.id),
    imageUrl: txn.image_url,
  });

  const editCheckImage = (chk) => open({
    title: chk.check_number || t('att.image'),
    path: checkPath(chk.id),
    imageUrl: chk.image_url,
    subtitle: chk.party_name,
  });

  global.Attach = {
    assetUrl, thumbHtml, hasBadge, view, wireViewer, open,
    txnPath, checkPath, editTxnImage, editCheckImage,
  };
})(window);

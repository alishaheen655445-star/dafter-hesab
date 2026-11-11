// -----------------------------------------------------------------------------
//  backup.js — online + offline backup (Phase 5).
//  OFFLINE: the snapshot is a plain JSON file the user keeps on the phone or a
//  stick; restoring reads that file back and POSTs it. No server storage needed.
//  ONLINE: the same snapshot is kept by the server (outside the web root) and is
//  only reachable through authenticated routes — last 10 copies, newest first.
//  A restore is destructive, so "replace" always needs the tick box (the server
//  demands confirm=true too — the UI cannot skip it by accident).
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  if (!Auth.require()) return;

  const t = (k, v) => global.I18n.t(k, v);
  const esc = global.UI.escapeHtml;

  const fileNameEl = document.getElementById('file-name');
  const importBox = document.getElementById('import-box');
  const importErr = document.getElementById('import-err');
  const onlineList = document.getElementById('online-list');
  const onlineEmpty = document.getElementById('online-empty');
  const fileInput = document.getElementById('bak-file');

  const APP_TAG = 'daftar-hesab';

  let pickedSnapshot = null; // parsed file, waiting for a mode + confirm
  let copies = [];

  // Backup belongs to the settings tab now — that is where the row lives.
  UI.shell({ active: 'settings', title: t('bak.title'), ico: 'cloud-up', back: true });

  // --- helpers ---------------------------------------------------------------

  const stamp = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  };

  const sizeKb = (bytes) => `${UI.num(Math.max(1, Math.round(Number(bytes || 0) / 1024)))} KB`;

  function saveBlob(blob, name) {
    // A WebView has no download manager: an <a download> click gets handed to the
    // native side, which cannot open a blob: URL. So inside the app the snapshot is
    // shown as text to copy, and the server copies stay the real mobile path.
    if (global.Config.isNative) {
      blob.text().then((text) => showNativeSnapshot(text, name));
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /** The mobile stand-in for a file download: the JSON, selectable and copyable. */
  function showNativeSnapshot(text, name) {
    const sheet = UI.modal(name, `
      <div class="stack">
        <p class="muted" style="margin:0" data-i18n="bak.nativeHint">${esc(t('bak.nativeHint'))}</p>
        <textarea class="code-box" rows="10" readonly spellcheck="false">${esc(text)}</textarea>
        <button class="btn" data-x="copy" type="button">${esc(t('bak.copyBtn'))}</button>
        <button class="btn ghost" data-x="close" type="button">${esc(t('common.close'))}</button>
      </div>`);
    sheet.el.querySelector('[data-x="close"]').onclick = () => sheet.close();
    sheet.el.querySelector('[data-x="copy"]').onclick = async () => {
      const box = sheet.el.querySelector('textarea');
      const ok = await UI.copyText(box.value);
      // Refused? At least leave the text highlighted so a long press can copy it.
      if (!ok) box.select();
      UI.toast(ok ? t('bak.copied') : t('rep.copyFail'), ok ? 'ok' : 'bad');
    };
  }

  function readFile(f) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        try { resolve(JSON.parse(String(r.result))); } catch (_e) { reject(new Error(t('bak.badFile'))); }
      };
      r.onerror = () => reject(new Error(t('bak.badFile')));
      r.readAsText(f);
    });
  }

  /** Same wording for the file and the server copy: is this OUR snapshot? */
  function looksLikeBackup(snap) {
    return !!(snap && snap.app === APP_TAG && snap.data && typeof snap.data === 'object');
  }

  const countsLine = (c) => (c ? [
    `${t('bak.nParties')}: ${UI.num(c.parties)}`,
    `${t('bak.nTxn')}: ${UI.num(c.transactions)}`,
    `${t('bak.nChecks')}: ${UI.num(c.checks)}`,
    `${t('bak.nLoans')}: ${UI.num(c.loans)}`,
    `${t('bak.nReminders')}: ${UI.num(c.reminders)}`,
  ].join(' · ') : '');

  /** Result of a restore, spelled out — the user must see what came back. */
  function showRestored(data) {
    const r = data.restored || {};
    const sheet = UI.modal(t('bak.restoredOk'), `
      <div class="stack">
        <p class="muted" style="margin:0">${esc(data.mode === 'merge' ? t('bak.merge') : t('bak.replace'))}</p>
        <div class="rp-tiles">
          <div class="rp-tile"><span>${esc(t('bak.addedParties'))}</span><b>${esc(UI.num(r.parties))}</b></div>
          <div class="rp-tile"><span>${esc(t('bak.addedTxn'))}</span><b>${esc(UI.num(r.transactions))}</b></div>
          <div class="rp-tile"><span>${esc(t('bak.addedChecks'))}</span><b>${esc(UI.num(r.checks))}</b></div>
          <div class="rp-tile"><span>${esc(t('bak.addedLoans'))}</span><b>${esc(UI.num(r.loans))}</b></div>
          <div class="rp-tile"><span>${esc(t('bak.addedReminders'))}</span><b>${esc(UI.num(r.reminders))}</b></div>
          <div class="rp-tile"><span>${esc(t('bak.skipped'))}</span><b>${esc(UI.num(r.skipped))}</b></div>
        </div>
        <a class="btn" href="home.html">${esc(t('bak.goBook'))}</a>
        <button class="btn ghost" data-x="stay" type="button">${esc(t('common.close'))}</button>
      </div>`);
    sheet.el.querySelector('[data-x="stay"]').onclick = () => sheet.close();
  }

  /** Mode picker used by the online restore sheet (radios need a unique name). */
  function modeHtml(name) {
    return `
      <label class="radio-row">
        <input type="radio" name="${name}" value="merge" checked />
        <span><b>${esc(t('bak.merge'))}</b><br><em class="muted">${esc(t('bak.mergeHint'))}</em></span>
      </label>
      <label class="radio-row">
        <input type="radio" name="${name}" value="replace" />
        <span><b>${esc(t('bak.replace'))}</b><br><em class="muted">${esc(t('bak.replaceHint'))}</em></span>
      </label>
      <label class="check-row">
        <input type="checkbox" class="bak-confirm tick" />
        <span>${esc(t('bak.confirm'))}</span>
      </label>
      <em class="err-text bak-err"></em>`;
  }

  /** Reads a mode box and refuses an unconfirmed replace. */
  function readMode(root) {
    const checked = root.querySelector('input[type="radio"]:checked');
    const mode = checked ? checked.value : 'merge';
    const confirmEl = root.querySelector('.bak-confirm');
    const errEl = root.querySelector('.bak-err');
    if (errEl) errEl.textContent = '';
    if (mode === 'replace' && !(confirmEl && confirmEl.checked)) {
      if (errEl) errEl.textContent = t('bak.needConfirm');
      return null;
    }
    return { mode, confirm: !!confirmEl && confirmEl.checked };
  }

  // --- OFFLINE: download / restore a file -----------------------------------

  async function exportFile() {
    const btn = document.getElementById('btn-export');
    btn.disabled = true;
    try {
      const res = await API.get('/backup/export');
      const snap = res.data.snapshot;
      const json = JSON.stringify(snap, null, 2);
      saveBlob(new Blob([json], { type: 'application/json' }), `daftar-hesab-${stamp()}.json`);
      UI.toast(`${t('bak.exportedOk')} — ${countsLine(snap.counts)}`, 'ok');
    } catch (err) {
      UI.toast(err.message, 'bad');
    } finally {
      btn.disabled = false;
    }
  }

  async function importFile() {
    if (!pickedSnapshot) return;
    importErr.textContent = '';
    const mode = readMode(importBox);
    if (!mode) return; // "replace" without the tick — readMode already said why

    if (mode.mode === 'replace' && !(await UI.confirmBox(t('bak.replace'), t('bak.replaceConfirm')))) return;

    const btn = document.getElementById('btn-import');
    btn.disabled = true;
    try {
      const res = await API.post('/backup/import', { snapshot: pickedSnapshot, mode: mode.mode, confirm: true });
      global.PartySelect && global.PartySelect.refresh();
      showRestored(res.data);
    } catch (err) {
      importErr.textContent = err.details && err.details.length
        ? `${err.message} — ${err.details[0].field}: ${err.details[0].message}`
        : err.message;
      UI.toast(err.message, 'bad');
    } finally {
      btn.disabled = false;
    }
  }

  // --- ONLINE: server copies --------------------------------------------------

  async function loadOnline() {
    try {
      const res = await API.get('/backup/online');
      copies = res.data.backups || [];
      renderOnline();
    } catch (err) {
      UI.toast(err.message, 'bad');
    }
  }

  function renderOnline() {
    onlineEmpty.hidden = copies.length > 0;
    onlineList.innerHTML = copies.map((c) => `
      <div class="item-row" data-tone="done" data-copy="${c.id}">
        <div class="item-main">
          <div class="item-title">${esc(c.name)}</div>
          <div class="item-sub">
            ${c.kind === 'auto' ? `<span class="pill mute">${esc(t('bak.auto'))}</span> ` : ''}
            ${esc(UI.formatDateTime(c.created_at))} · ${esc(sizeKb(c.size_bytes))}
          </div>
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn sm ghost" data-x="dl" type="button">${esc(t('bak.download'))}</button>
          <button class="btn sm secondary" data-x="restore" type="button">${esc(t('bak.restore'))}</button>
          <button class="btn sm danger" data-x="del" type="button">${esc(t('common.delete'))}</button>
        </div>
      </div>`).join('');
  }

  async function saveOnline() {
    const btn = document.getElementById('btn-save-online');
    btn.disabled = true;
    try {
      const res = await API.post('/backup/online', {});
      UI.toast(`${t('bak.savedOk')} — ${countsLine(res.data.counts)}`, 'ok');
      await loadOnline();
    } catch (err) {
      UI.toast(err.message, 'bad');
    } finally {
      btn.disabled = false;
    }
  }

  async function downloadCopy(row) {
    try {
      const blob = await API.getBlob(`/backup/online/${row.id}/download`);
      saveBlob(blob, row.name);
    } catch (err) {
      UI.toast(err.message, 'bad');
    }
  }

  /** Restore a server copy: same mode box as the file import, inside a sheet. */
  function restoreCopy(row) {
    const sheet = UI.modal(t('bak.restore'), `
      <div class="stack">
        <p class="muted" style="margin:0">${esc(row.name)} · ${esc(UI.formatDateTime(row.created_at))}</p>
        ${modeHtml('omode')}
        <button class="btn danger" data-x="go" type="button">${esc(t('bak.importBtn'))}</button>
        <button class="btn ghost" data-x="close" type="button">${esc(t('common.cancel'))}</button>
      </div>`);
    sheet.el.querySelector('[data-x="close"]').onclick = () => sheet.close();
    sheet.el.querySelector('[data-x="go"]').onclick = async () => {
      const mode = readMode(sheet.el);
      if (!mode) return;
      const btn = sheet.el.querySelector('[data-x="go"]');
      btn.disabled = true;
      try {
        const res = await API.post(`/backup/online/${row.id}/restore`, { mode: mode.mode, confirm: true });
        sheet.close();
        global.PartySelect && global.PartySelect.refresh();
        showRestored(res.data);
      } catch (err) {
        const errEl = sheet.el.querySelector('.bak-err');
        if (errEl) errEl.textContent = err.message;
        btn.disabled = false;
      }
    };
  }

  async function deleteCopy(row) {
    if (!(await UI.confirmBox(t('bak.del'), t('bak.deleteConfirm')))) return;
    try {
      await API.del(`/backup/online/${row.id}`);
      UI.toast(t('common.deleted'), 'ok');
      loadOnline();
    } catch (err) {
      UI.toast(err.message, 'bad');
    }
  }

  // --- wiring ----------------------------------------------------------------

  document.getElementById('btn-export').addEventListener('click', exportFile);
  document.getElementById('btn-pick-file').addEventListener('click', () => fileInput.click());
  document.getElementById('btn-import').addEventListener('click', importFile);
  document.getElementById('btn-save-online').addEventListener('click', saveOnline);

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files && fileInput.files[0];
    pickedSnapshot = null;
    importBox.hidden = true;
    importErr.textContent = '';
    if (!f) { fileNameEl.textContent = ''; return; }
    try {
      const snap = await readFile(f);
      if (!looksLikeBackup(snap)) throw new Error(t('bak.badFile'));
      pickedSnapshot = snap;
      fileNameEl.textContent = `${f.name} — ${countsLine(snap.counts)}`;
      importBox.hidden = false;
    } catch (err) {
      fileNameEl.textContent = '';
      UI.toast(err.message || t('bak.badFile'), 'bad');
      fileInput.value = '';
    }
  });

  // The tick box only matters for "replace" — say so instead of failing silently.
  importBox.addEventListener('change', (e) => {
    if (e.target.matches('.bak-confirm') || e.target.name === 'mode') importErr.textContent = '';
  });

  onlineList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-x]');
    if (!btn) return;
    const host = btn.closest('[data-copy]');
    const row = copies.find((c) => String(c.id) === (host && host.dataset.copy));
    if (!row) return;
    if (btn.dataset.x === 'dl') downloadCopy(row);
    if (btn.dataset.x === 'restore') restoreCopy(row);
    if (btn.dataset.x === 'del') deleteCopy(row);
  });

  global.addEventListener('dh:render', () => {
    UI.shell({ active: 'settings', title: t('bak.title'), ico: 'cloud-up', back: true });
    renderOnline();
    I18n.applyDocument();
  });

  loadOnline();
})(window);

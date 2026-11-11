// -----------------------------------------------------------------------------
//  txn-form.js — the add/edit bottom sheet for ONE ledger entry (حركة).
//  credit = they owe me (طلب) · debit = I owe them (بدهي).
//  Money is typed in major units ("50000.50"); the server stores minor units.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const shiftDay = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  /**
   * @param {number} partyId
   * @param {object|null} txn  existing row to edit, or null to create
   * @param {string} presetType 'credit' | 'debit' when opened from the party
   *        screen's two FABs — the sheet then starts on the right side
   * @returns {Promise<object|null>} { transaction, party } or null if cancelled
   */
  function openTxnForm(partyId, txn = null, presetType = '') {
    const isEdit = !!txn;
    const t = (k, v) => global.I18n.t(k, v);
    let type = isEdit ? txn.type : (presetType === 'debit' ? 'debit' : 'credit');
    const segOn = (k) => (type === k ? ' class="active"' : '');
    // Editing keeps the exact decimal the user typed: 43000050 -> "430000.5"
    const amountValue = isEdit ? String(Number(txn.amount_minor) / 100) : '';
    const dateValue = isEdit ? String(txn.txn_date).slice(0, 10) : localToday();
    // The unit the user reads is the one his account is set to — it goes inside
    // the amount box instead of being repeated under every number in the ledger.
    const unit = t('cur.' + ((global.Auth.user() || {}).currency || 'toman'));

    return new Promise((resolve) => {
      const sheet = global.UI.modal(
        isEdit ? t('txn.edit') : t('txn.new'),
        `
        <form id="txn-form" novalidate>
          <div class="seg money" id="txn-types">
            <button type="button" data-type="credit"${segOn('credit')}>${t('money.credit')}</button>
            <button type="button" data-type="debit"${segOn('debit')}>${t('money.debit')}</button>
          </div>
          <label class="fld">
            <span class="lbl">${t('txn.amount')}</span>
            <input type="text" name="amount" inputmode="decimal" required
                   placeholder="0" value="${global.UI.escapeHtml(amountValue)}" />
            <span class="suffix">${unit}</span>
            <em class="err-text" data-err-for="amount"></em>
          </label>
          <label class="fld">
            <span class="lbl">${t('txn.date')}</span>
            <input type="date" name="txn_date" required value="${dateValue}" />
            <em class="err-text" data-err-for="txn_date"></em>
          </label>
          <div class="row" style="gap:8px;margin:-6px 0 8px">
            <button type="button" class="btn sm secondary" data-day="0">${t('txn.today')}</button>
            <button type="button" class="btn sm ghost" data-day="-1">${t('txn.yesterday')}</button>
          </div>
          <span class="date-preview" id="txn-preview"></span>
          <label class="fld">
            <span class="lbl">${t('txn.desc')}</span>
            <input type="text" name="description" maxlength="500"
                   value="${global.UI.escapeHtml(txn?.description || '')}" />
            <em class="err-text" data-err-for="description"></em>
          </label>
          <div class="photo-pick">
            <button type="button" class="btn sm ghost" id="txn-photo-btn">${global.UI.icon('image-add', 'sm')} <span>${t('att.pick')}</span></button>
            <img class="thumb" id="txn-photo-prev" alt="" hidden />
            <span class="muted grow" id="txn-photo-name" style="font-size:12px;text-align:end">${t('att.optional')}</span>
            <input type="file" id="txn-photo" accept="image/png,image/jpeg,image/webp" hidden />
          </div>
          <div class="row">
            <button type="button" class="btn secondary" data-x="cancel">${t('common.cancel')}</button>
            <button type="submit" class="btn">${t('common.save')}</button>
          </div>
        </form>`,
        { onOpen: (el) => el.querySelector('input[name="amount"]').focus() }
      );

      const form = sheet.el.querySelector('#txn-form');
      const dateInput = form.elements.txn_date;
      const preview = sheet.el.querySelector('#txn-preview');

      // Segmented credit/debit picker — the one thing a ledger entry needs right.
      const seg = sheet.el.querySelector('#txn-types');
      seg.querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', () => {
          type = b.dataset.type;
          seg.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        });
      });

      // Show the date the way the user reads it (Jalali in fa, Gregorian in ar).
      const paintPreview = () => {
        preview.textContent = dateInput.value ? global.UI.formatDateLong(dateInput.value) : '';
      };
      dateInput.addEventListener('change', paintPreview);
      sheet.el.querySelectorAll('[data-day]').forEach((b) => {
        b.addEventListener('click', () => { dateInput.value = shiftDay(Number(b.dataset.day)); paintPreview(); });
      });
      paintPreview();

      form.querySelector('[data-x="cancel"]').onclick = () => { sheet.close(); resolve(null); };

      // --- optional picture ---------------------------------------------------
      // The file is uploaded AFTER the row is saved, because a new حركة has no id
      // to attach it to yet. A failed upload must not lose the entry itself.
      const photoInput = form.querySelector('#txn-photo');
      const photoPrev = form.querySelector('#txn-photo-prev');
      const photoName = form.querySelector('#txn-photo-name');
      form.querySelector('#txn-photo-btn').onclick = () => photoInput.click();
      photoInput.addEventListener('change', () => {
        const f = photoInput.files && photoInput.files[0];
        if (!f) { photoName.textContent = t('att.optional'); photoPrev.hidden = true; return; }
        if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
          photoInput.value = '';
          photoName.textContent = t('att.notImage');
          photoPrev.hidden = true;
          return;
        }
        if (f.size > 5 * 1024 * 1024) {
          photoInput.value = '';
          photoName.textContent = t('att.tooBig');
          photoPrev.hidden = true;
          return;
        }
        photoName.textContent = f.name;
        // A data: URL instead of a blob: one — nothing to revoke by hand, and the
        // preview disappears with the sheet.
        const reader = new FileReader();
        reader.onload = () => {
          photoPrev.src = String(reader.result);
          photoPrev.hidden = false;
        };
        reader.readAsDataURL(f);
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const amount = global.UI.value(form, 'amount').replace(/\s/g, '');
        const errors = {};
        if (!amount) errors.amount = t('common.required');
        else if (!(Number(amount.replace(/,/g, '')) > 0)) errors.amount = t('txn.badAmount');
        if (!dateInput.value) errors.txn_date = t('common.required');
        if (Object.keys(errors).length) return global.UI.showFieldErrors(form, errors);

        const payload = {
          type,
          amount,
          txn_date: dateInput.value,
          description: global.UI.value(form, 'description'),
        };
        btn.disabled = true;
        try {
          const res = isEdit
            ? await global.API.put(`/parties/${partyId}/transactions/${txn.id}`, payload)
            : await global.API.post(`/parties/${partyId}/transactions`, payload);

          // The row exists now, so the picture has something to hang on. The
          // statement is re-read by the caller, so the fresh URL needs no refetch.
          const newId = res.data?.transaction?.id;
          const file = photoInput.files && photoInput.files[0];
          if (newId && file) {
            try {
              await global.API.upload(`/parties/${partyId}/transactions/${newId}/image`, file);
            } catch (upErr) {
              global.UI.toast(upErr.message, 'bad'); // saved, only the picture failed
            }
          }
          sheet.close();
          global.UI.toast(t('common.saved'), 'ok');
          resolve(res.data);
        } catch (err) {
          global.UI.showFieldErrors(form, err.fields || {});
          global.UI.toast(err.message, 'bad');
          btn.disabled = false;
        }
      });
    });
  }

  global.TxnForm = { open: openTxnForm };
})(window);
